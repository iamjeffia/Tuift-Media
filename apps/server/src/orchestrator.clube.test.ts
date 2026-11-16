import { EventEmitter } from 'node:events'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ProviderIdSchema,
  type Capabilities,
  type DomainEvent,
  type McpServer,
  type ProviderId,
} from '@harness/contracts'
import type { AgentSession, ProviderRuntime, StartOptions } from './adapters.js'
import { ClubeAccount } from './clube-account.js'
import { FakeClube, MemoryClubeStore } from './clube-fake.test-support.js'
import { CLUBE_SERVER_ID } from './clube-mcp.js'
import { McpConfigStore } from './mcp-config.js'
import { Orchestrator } from './orchestrator.js'
import { PROVIDER_CAPABILITIES } from './provider-capabilities.js'
import { Store } from './store.js'

const CAPABILITIES: Capabilities = {
  steer: false,
  fork: false,
  interrupt: true,
  reasoningItems: false,
  approvals: false,
  images: false,
}

class FakeSession implements AgentSession {
  readonly capabilities = CAPABILITIES
  async sendTurn(): Promise<string> {
    return 'turn'
  }
  async interrupt(): Promise<void> {}
  respondToApproval(): void {}
  dispose(): void {}
  on(_event: 'event' | 'log', _listener: (value: never) => void): void {}
}

class FakeCodexControl extends EventEmitter {
  servers: McpServer[] = []
  async start(): Promise<void> {}
  async dispose(): Promise<void> {}
  onUsageChanged(): void {}
  async listMcpServers(): Promise<McpServer[]> {
    return this.servers
  }
  isMcpLoading(): boolean {
    return false
  }
  async whenMcpServersListed(): Promise<boolean> {
    return true
  }
}

const cleanups: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

const personsServer = (id: string, displayName?: string): McpServer => ({
  id,
  ...(displayName ? { displayName } : {}),
  scope: 'global',
  enabled: true,
  auth: { status: 'not_required' },
  startup: { state: 'ready' },
  tools: [],
  resources: [],
  resourceTemplates: [],
})

const INVENTORY_CAPABILITIES = {
  inventory: true,
  add: true,
  update: true,
  remove: true,
  reload: false,
  startOAuth: false,
  cancelOAuth: false,
  hideInherited: false,
}

async function harness(
  options: {
    linked?: boolean
    plan?: FakeClube['plan']
    inventory?: () => McpServer[]
    codexServers?: McpServer[]
  } = {},
) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'tc-clube-'))
  const databaseFile = path.join(directory, 'store.db')
  const store = new Store(databaseFile)
  const fake = new FakeClube()
  await fake.start()
  fake.plan = options.plan ?? 'mensal'
  const credentials = new MemoryClubeStore()
  const logs: string[] = []
  const clube = new ClubeAccount({
    origin: fake.origin,
    store: credentials,
    log: (line) => logs.push(line),
  })
  if (options.linked !== false) {
    const { authUrl } = await clube.connect()
    await fake.browse(authUrl)
    await vi.waitFor(async () => expect((await clube.status()).state).toBe('connected'))
  }
  const started: StartOptions[] = []
  const codex = new FakeCodexControl()
  codex.servers = options.codexServers ?? []
  const runtimeFor = (provider: ProviderId): ProviderRuntime => ({
    async start(workspacePath, startOptions) {
      started.push(startOptions)
      return {
        thread: { id: `thread-${started.length}`, provider, workspacePath, createdAt: Date.now() },
        session: new FakeSession(),
      }
    },
  })
  const mcpConfig = new McpConfigStore(path.join(directory, 'mcp.json'))
  const orchestrator = new Orchestrator(store, {
    onEvent: (_threadId: string, _event: DomainEvent) => {},
    agentTools: true,
    clube,
    onLog: () => {},
    onLogin: () => {},
    mcpConfig,
    readCredential: (reference) => `secret:${reference}`,
    runtimeFor,
    createCodex: () => codex as never,
    providerServices: Object.fromEntries(
      (['claude-code', 'grok', 'opencode'] as const).map((provider) => [
        provider,
        {
          listMcpServers: async () => ({
            capabilities: INVENTORY_CAPABILITIES,
            servers: provider === 'claude-code' && options.inventory ? options.inventory() : [],
          }),
        },
      ]),
    ),
  })
  cleanups.push(async () => {
    await orchestrator.disposeAll()
    store.close()
    await fake.stop()
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 })
  })
  return {
    store,
    orchestrator,
    started,
    mcpConfig,
    directory,
    databaseFile,
    fake,
    clube,
    logs,
    credentials,
  }
}

const clubeOf = (start: StartOptions) =>
  start.mcpServers?.find((server) => server.id === CLUBE_SERVER_ID)

describe('the Clube’s MCP server on a chat', { timeout: 30_000 }, () => {
  it.each(ProviderIdSchema.options)(
    'comes with a chat on %s exactly where the app’s endpoint is offered',
    async (provider) => {
      const h = await harness()
      await h.orchestrator.startThread(provider, h.directory)
      expect(clubeOf(h.started[0]!) !== undefined).toBe(PROVIDER_CAPABILITIES[provider].agentTools)
    },
  )

  it('reaches the Clube through the app with the chat’s credential, never the account’s token', async () => {
    const h = await harness()
    await h.orchestrator.startThread('codex', h.directory)
    const start = h.started[0]!
    const server = clubeOf(start)
    if (!server?.enabled || server.transport.type !== 'http') throw new Error('not attached')
    expect(server.transport.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/agents\/[0-9a-f]{32}\/clube$/)
    const header = server.transport.headers?.['Authorization']
    if (header?.source !== 'credential') throw new Error('no credential header')

    // What the provider process is given: the chat's credential, nothing of the account's.
    const everything = JSON.stringify(start)
    const tokens = [h.credentials.read('clube.access')!, h.credentials.read('clube.refresh')!]
    for (const token of tokens) expect(everything).not.toContain(token)
    const authorization = start.mcpCredentials![header.credentialRef]!
    expect(authorization).toMatch(/^Bearer /)
    expect(tokens.some((token) => authorization.includes(token))).toBe(false)

    // And it works: with that credential the call arrives at the Clube with the account's token.
    const reply = await fetch(server.transport.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    expect(((await reply.json()) as { result: { tools: unknown[] } }).result.tools).toHaveLength(2)
    expect(h.fake.seen.at(-1)!.authorization).toBe(`Bearer ${tokens[0]}`)
  })

  it('leaves the account’s tokens out of the chat database, the MCP file and the logs', async () => {
    const h = await harness()
    await h.orchestrator.startThread('codex', h.directory)
    await h.orchestrator.listMcpServers('codex', h.directory)
    const tokens = [h.credentials.read('clube.access')!, h.credentials.read('clube.refresh')!]
    const files = readdirSync(h.directory).map((name) => readFileSync(path.join(h.directory, name)))
    expect(files.length).toBeGreaterThan(0)
    for (const token of tokens) {
      for (const bytes of files) expect(bytes.includes(token)).toBe(false)
      expect(h.logs.join('\n')).not.toContain(token)
    }
  })

  it.each([
    ['nothing is linked', { linked: false }],
    ['the account is free', { plan: 'grátis' as const }],
  ])('is absent when %s', async (_name, options) => {
    const h = await harness(options)
    await h.orchestrator.startThread('codex', h.directory)
    expect(clubeOf(h.started[0]!)).toBeUndefined()
    const listed = await h.orchestrator.listMcpServers('codex', h.directory)
    expect(listed.servers.some((server) => server.providedBy === 'clube')).toBe(false)
  })

  it('follows the link: gone once the account is disconnected', async () => {
    const h = await harness()
    await h.orchestrator.startThread('codex', h.directory)
    expect(clubeOf(h.started[0]!)).toBeDefined()
    await h.clube.disconnect()
    await h.orchestrator.startThread('codex', h.directory)
    expect(clubeOf(h.started[1]!)).toBeUndefined()
  })

  it('lets the person’s own server win: saved for the project, by name or by address', async () => {
    const saved = await harness()
    saved.mcpConfig.add('codex', saved.directory, {
      id: 'clube-do-motion',
      enabled: true,
      transport: { type: 'http', url: 'https://clubedomotion.com/mcp' },
    })
    await saved.orchestrator.startThread('codex', saved.directory)
    expect(clubeOf(saved.started[0]!)).toBeUndefined()
    // Theirs is what the provider is given.
    expect(saved.started[0]!.mcpServers!.some((server) => server.id === 'clube-do-motion')).toBe(
      true,
    )

    const named = await harness()
    named.mcpConfig.add('codex', named.directory, {
      id: 'mine',
      displayName: 'Clube do Motion',
      enabled: true,
      transport: { type: 'stdio', command: 'node', args: ['x.js'] },
    })
    await named.orchestrator.startThread('codex', named.directory)
    expect(clubeOf(named.started[0]!)).toBeUndefined()

    const byAddress = await harness()
    byAddress.mcpConfig.add('codex', byAddress.directory, {
      id: 'conta-do-clube',
      enabled: true,
      transport: { type: 'http', url: 'https://clubedomotion.com/mcp' },
    })
    await byAddress.orchestrator.startThread('codex', byAddress.directory)
    expect(clubeOf(byAddress.started[0]!)).toBeUndefined()
  })

  it('lets the person’s own server win when the provider loads it, and when they hid it', async () => {
    const provider = await harness({
      inventory: () => [personsServer('clube', 'Clube do Motion')],
    })
    await provider.orchestrator.startThread('claude-code', provider.directory)
    expect(clubeOf(provider.started[0]!)).toBeUndefined()

    const codex = await harness({ codexServers: [personsServer('clubedomotion')] })
    await codex.orchestrator.startThread('codex', codex.directory)
    expect(clubeOf(codex.started[0]!)).toBeUndefined()

    const hidden = await harness()
    hidden.mcpConfig.add('codex', hidden.directory, { id: 'clube', enabled: false })
    await hidden.orchestrator.startThread('codex', hidden.directory)
    expect(clubeOf(hidden.started[0]!)).toBeUndefined()

    // Another server of theirs is not the Clube.
    const other = await harness({ inventory: () => [personsServer('figma')] })
    await other.orchestrator.startThread('claude-code', other.directory)
    expect(clubeOf(other.started[0]!)).toBeDefined()
  })

  it('shows on the MCP page as provided by the link, and not when the person has their own', async () => {
    const h = await harness()
    const listed = await h.orchestrator.listMcpServers('codex', h.directory)
    const row = listed.servers.find((server) => server.id === CLUBE_SERVER_ID)
    expect(row).toMatchObject({
      providedBy: 'clube',
      displayName: 'Clube do Motion',
      transport: { type: 'http', url: `${h.fake.origin}/mcp` },
    })
    // The page asks for a provider that does not get the endpoint: nothing is promised there.
    expect(
      (await h.orchestrator.listMcpServers('grok', h.directory)).servers.some(
        (server) => server.providedBy === 'clube',
      ),
    ).toBe(false)

    h.mcpConfig.add('codex', h.directory, {
      id: 'clube',
      enabled: true,
      transport: { type: 'http', url: 'https://clubedomotion.com/mcp' },
    })
    const own = await h.orchestrator.listMcpServers('codex', h.directory)
    expect(own.servers.some((server) => server.providedBy === 'clube')).toBe(false)
    expect(own.servers.some((server) => server.id === 'clube')).toBe(true)
  })
})
