import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ProviderIdSchema,
  type Capabilities,
  type DomainEvent,
  type McpServer,
  type McpServerConfig,
  type ProviderId,
} from '@harness/contracts'
import type { AgentSession, ProviderRuntime, StartOptions } from './adapters.js'
import { AGENT_TOOLS_SERVER_ID } from './agent-tools-mcp.js'
import {
  writeDefaultSkillPackFixture,
  writeDefaultSkillsFixture,
} from './default-skills.test-support.js'
import { McpConfigStore } from './mcp-config.js'
import { AFTER_EFFECTS_SERVER_ID, type AfterEffectsSource } from './motion-after-effects.js'
import { AFTER_EFFECTS_SENTENCES } from './motion-session.js'
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

const EXECUTABLE = 'C:\\Program Files\\Adobe\\Adobe After Effects 2026\\Support Files\\AfterFX.exe'
const ENTRY = 'D:\\ae-mcp\\dist\\index.js'
const RUNNER = 'C:\\Users\\someone\\AppData\\Local\\Programs\\TUIFT Code\\TUIFT Code.exe'

class FakeSession implements AgentSession {
  readonly capabilities = CAPABILITIES
  disposed = false
  reloaded: McpServerConfig[][] = []
  async sendTurn(): Promise<string> {
    return 'turn'
  }
  async interrupt(): Promise<void> {}
  respondToApproval(): void {}
  async reloadMcpServers(_threadId: string, servers: McpServerConfig[]): Promise<void> {
    this.reloaded.push(servers)
  }
  dispose(): void {
    this.disposed = true
  }
  on(_event: 'event' | 'log', _listener: (value: never) => void): void {}
}

/** What Codex's control process answers about MCP servers; nothing else is asked of it here. */
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

const personsServer = (id: string): McpServer => ({
  id,
  scope: 'global',
  enabled: true,
  auth: { status: 'not_required' },
  startup: { state: 'ready' },
  tools: [],
  resources: [],
  resourceTemplates: [],
})

const personsConfig = (id: string): McpServerConfig => ({
  id,
  enabled: true,
  transport: { type: 'stdio', command: 'node', args: ['C:\\mine\\ae.js'] },
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

type Source = { executable: string | undefined; entry: string | undefined }

async function harness(
  options: {
    source?: Source | false
    /** What the provider's inventory answers on each ask. */
    inventory?: () => { servers: McpServer[]; loading?: boolean }
    codexServers?: McpServer[]
  } = {},
) {
  const store = new Store(':memory:')
  const directory = mkdtempSync(path.join(os.tmpdir(), 'tc-motion-ae-'))
  cleanups.push(() => rmSync(directory, { recursive: true, force: true, maxRetries: 3 }))
  const root = await writeDefaultSkillsFixture(directory)
  await writeDefaultSkillPackFixture(root, 'motion', [['hyperframes', 'video made of HTML']])
  // What the machine has, changed by a test while the app "runs".
  const machine: Source =
    options.source === false || options.source === undefined
      ? { executable: EXECUTABLE, entry: ENTRY }
      : options.source
  const source: AfterEffectsSource = {
    executable: () => machine.executable,
    entry: () => machine.entry,
    runner: RUNNER,
  }
  const started: StartOptions[] = []
  const resumed: StartOptions[] = []
  const sessions: FakeSession[] = []
  const announced: string[] = []
  const codex = new FakeCodexControl()
  codex.servers = options.codexServers ?? []
  const runtimeFor = (provider: ProviderId): ProviderRuntime => ({
    async start(workspacePath, startOptions) {
      started.push(startOptions)
      const session = new FakeSession()
      sessions.push(session)
      return {
        thread: { id: `thread-${sessions.length}`, provider, workspacePath, createdAt: Date.now() },
        session,
      }
    },
    ...(provider === 'codex'
      ? {
          async resume(threadId: string, workspacePath: string, startOptions: StartOptions) {
            resumed.push(startOptions)
            const session = new FakeSession()
            sessions.push(session)
            return {
              thread: { id: threadId, provider, workspacePath, createdAt: Date.now() },
              session,
            }
          },
        }
      : {}),
  })
  const mcpConfig = new McpConfigStore(path.join(directory, 'mcp.json'))
  const orchestrator = new Orchestrator(store, {
    onEvent: (_threadId: string, _event: DomainEvent) => {},
    agentTools: true,
    onThreadSettings: (threadId) => announced.push(threadId),
    onLog: () => {},
    onLogin: () => {},
    mcpConfig,
    readCredential: (reference) => `secret:${reference}`,
    defaultSkillsRoot: root,
    runtimeFor,
    createCodex: () => codex as never,
    // Every provider that lists MCP servers answers from here, so no test starts a real CLI.
    providerServices: Object.fromEntries(
      (['claude-code', 'grok', 'opencode'] as const).map((provider) => [
        provider,
        {
          listMcpServers: async () => ({
            capabilities: INVENTORY_CAPABILITIES,
            ...(provider === 'claude-code' && options.inventory
              ? options.inventory()
              : { servers: [] }),
          }),
        },
      ]),
    ),
    ...(options.source === false ? {} : { afterEffects: source }),
  })
  cleanups.push(() => orchestrator.disposeAll())
  return {
    store,
    orchestrator,
    started,
    resumed,
    sessions,
    announced,
    machine,
    mcpConfig,
    directory,
  }
}

const attached = (start: StartOptions) =>
  start.mcpServers?.find((server) => server.id === AFTER_EFFECTS_SERVER_ID)

/** Starts a Motion chat the way the server does: the mode is stored once the chat exists. */
async function motionChat(
  { orchestrator, store, directory }: Awaited<ReturnType<typeof harness>>,
  provider: ProviderId = 'codex',
) {
  const thread = await orchestrator.startThread(provider, directory, { mode: 'motion' })
  store.setThreadMode(thread.id, 'motion')
  return thread.id
}

describe('the After Effects server on a Motion chat', { timeout: 30_000 }, () => {
  it.each(ProviderIdSchema.options)(
    'attaches it on %s only where the provider takes a per-chat server',
    async (provider) => {
      const h = await harness()
      const id = await motionChat(h, provider)
      const takes = PROVIDER_CAPABILITIES[provider].managedMcp

      const server = attached(h.started[0]!)
      expect(server !== undefined).toBe(takes)
      expect(h.orchestrator.afterEffectsState(id)).toBe(takes ? 'ready' : 'unavailable')
      expect(h.started[0]!.instructions).toContain(
        takes ? AFTER_EFFECTS_SENTENCES.ready : AFTER_EFFECTS_SENTENCES.unavailable,
      )
      if (server?.enabled) {
        // The app's own executable in Node mode, so no system node is needed.
        expect(server.transport).toMatchObject({
          type: 'stdio',
          command: RUNNER,
          args: [ENTRY],
          environment: {
            ELECTRON_RUN_AS_NODE: { source: 'literal', value: '1' },
            AE_MCP_EXE: { source: 'literal', value: EXECUTABLE },
          },
        })
      }
    },
  )

  it('gives a chat with no mode exactly what it gets without the feature, and no other chat the server', async () => {
    const withFeature = await harness()
    const without = await harness({ source: false })
    await motionChat(withFeature)
    const plain = await withFeature.orchestrator.startThread('codex', withFeature.directory)
    const reference = await without.orchestrator.startThread('codex', without.directory)

    const ids = (start: StartOptions) => (start.mcpServers ?? []).map((server) => server.id)
    expect(ids(withFeature.started[0]!)).toEqual([AFTER_EFFECTS_SERVER_ID, AGENT_TOOLS_SERVER_ID])
    expect(ids(withFeature.started[1]!)).toEqual(ids(without.started[0]!))
    expect(ids(without.started[0]!)).toEqual([AGENT_TOOLS_SERVER_ID])
    // The folders differ per harness; the text must not.
    const text = (h: typeof withFeature, start: StartOptions) =>
      start.instructions!.replaceAll(h.directory, '<dir>')
    expect(text(withFeature, withFeature.started[1]!)).toBe(text(without, without.started[0]!))
    expect(withFeature.started[1]!.instructions).not.toContain('After Effects')
    expect(withFeature.orchestrator.afterEffectsState(plain.id)).toBeUndefined()
    expect(without.orchestrator.afterEffectsState(reference.id)).toBeUndefined()
  })

  it('says nothing about After Effects when the server was built without it, even in Motion', async () => {
    const h = await harness({ source: false })
    const id = await motionChat(h)
    expect(attached(h.started[0]!)).toBeUndefined()
    expect(h.started[0]!.instructions).toContain('This chat is in Motion mode.')
    expect(h.started[0]!.instructions).not.toContain('After Effects')
    expect(h.orchestrator.afterEffectsState(id)).toBeUndefined()
  })

  it('has the field only while the chat is in Motion', async () => {
    const h = await harness()
    const id = await motionChat(h)
    expect(h.orchestrator.afterEffectsState(id)).toBe('ready')
    h.store.setThreadMode(id, null)
    expect(h.orchestrator.afterEffectsState(id)).toBeUndefined()
    h.store.setThreadMode(id, 'motion')
    expect(h.orchestrator.afterEffectsState(id)).toBe('ready')
  })

  it("lets the project's own after-effects server win, and treats it as available", async () => {
    const h = await harness({ source: { executable: undefined, entry: undefined } })
    h.mcpConfig.add('codex', h.directory, personsConfig('after-effects'))
    const id = await motionChat(h)

    const servers = h.started[0]!.mcpServers!.filter((server) => server.id === 'after-effects')
    expect(servers).toEqual([personsConfig('after-effects')])
    expect(h.orchestrator.afterEffectsState(id)).toBe('ready')
    expect(h.started[0]!.instructions).toContain(AFTER_EFFECTS_SENTENCES.ready)
  })

  it('does the same for a server named After Effects that has another id', async () => {
    const h = await harness()
    h.mcpConfig.add('codex', h.directory, {
      ...personsConfig('ae-bridge'),
      displayName: 'After Effects',
    })
    const id = await motionChat(h)
    expect(attached(h.started[0]!)).toBeUndefined()
    expect(h.orchestrator.afterEffectsState(id)).toBe('ready')
  })

  it("lets the provider's own server win when its inventory shows one", async () => {
    const h = await harness({ inventory: () => ({ servers: [personsServer('after-effects')] }) })
    const id = await motionChat(h, 'claude-code')
    expect(attached(h.started[0]!)).toBeUndefined()
    expect(h.orchestrator.afterEffectsState(id)).toBe('ready')
    expect(h.started[0]!.instructions).toContain(AFTER_EFFECTS_SENTENCES.ready)

    // Another server of theirs is not After Effects.
    const other = await harness({ inventory: () => ({ servers: [personsServer('figma')] }) })
    await motionChat(other, 'claude-code')
    expect(attached(other.started[0]!)).toBeDefined()
  })

  it("reads Codex's own servers through its control process, by name", async () => {
    const h = await harness({ codexServers: [personsServer('After Effects')] })
    const id = await motionChat(h)
    expect(attached(h.started[0]!)).toBeUndefined()
    expect(h.orchestrator.afterEffectsState(id)).toBe('ready')
  })

  it('asks again while the provider inventory is still loading', async () => {
    let asked = 0
    const h = await harness({
      inventory: () =>
        ++asked < 3
          ? { servers: [], loading: true }
          : { servers: [personsServer('after-effects')] },
    })
    const id = await motionChat(h, 'claude-code')
    expect(asked).toBe(3)
    expect(attached(h.started[0]!)).toBeUndefined()
    expect(h.orchestrator.afterEffectsState(id)).toBe('ready')
  })

  it('attaches nothing when the person hid the server', async () => {
    const h = await harness()
    h.mcpConfig.add('codex', h.directory, { id: 'after-effects', enabled: false })
    const id = await motionChat(h)
    // Only the person's own entry, which hides the server.
    expect(h.started[0]!.mcpServers!.filter((server) => server.id === 'after-effects')).toEqual([
      { id: 'after-effects', enabled: false },
    ])
    expect(h.orchestrator.afterEffectsState(id)).toBe('unavailable')
    expect(h.started[0]!.instructions).toContain(AFTER_EFFECTS_SENTENCES.unavailable)
  })

  it('says not-installed when After Effects is missing, and tells the agent to use HyperFrames', async () => {
    const h = await harness({ source: { executable: undefined, entry: ENTRY } })
    const id = await motionChat(h)
    expect(attached(h.started[0]!)).toBeUndefined()
    expect(h.orchestrator.afterEffectsState(id)).toBe('not-installed')
    expect(h.started[0]!.instructions).toContain(AFTER_EFFECTS_SENTENCES.unavailable)
    expect(h.started[0]!.instructions).not.toContain(AFTER_EFFECTS_SENTENCES.ready)
  })

  it('says unavailable when After Effects is installed but there is no server', async () => {
    const h = await harness({ source: { executable: EXECUTABLE, entry: undefined } })
    const id = await motionChat(h)
    expect(attached(h.started[0]!)).toBeUndefined()
    expect(h.orchestrator.afterEffectsState(id)).toBe('unavailable')
    expect(h.started[0]!.instructions).toContain(AFTER_EFFECTS_SENTENCES.unavailable)
  })

  it('reads the machine again: installed later, the session that started without it still has none', async () => {
    const h = await harness({ source: { executable: undefined, entry: ENTRY } })
    const id = await motionChat(h)
    expect(h.orchestrator.afterEffectsState(id)).toBe('not-installed')
    h.machine.executable = EXECUTABLE
    expect(h.orchestrator.afterEffectsState(id)).toBe('unavailable')
    // A new chat sees the new state at once.
    const next = await motionChat(h)
    expect(h.orchestrator.afterEffectsState(next)).toBe('ready')
    expect(attached(h.started[1]!)).toBeDefined()
  })
})

describe('the After Effects server when a session starts again', { timeout: 30_000 }, () => {
  it('attaches it when Motion is turned on mid-chat, and takes it away when Motion is turned off', async () => {
    const h = await harness()
    const thread = await h.orchestrator.startThread('codex', h.directory)
    expect(attached(h.started[0]!)).toBeUndefined()

    h.store.setThreadMode(thread.id, 'motion')
    await h.orchestrator.modeChanged(thread.id)
    await h.orchestrator.submitTurn(thread.id, 'with Motion')
    expect(attached(h.resumed[0]!)).toBeDefined()
    expect(h.resumed[0]!.instructions).toContain(AFTER_EFFECTS_SENTENCES.ready)
    expect(h.orchestrator.afterEffectsState(thread.id)).toBe('ready')

    h.store.setThreadMode(thread.id, null)
    await h.orchestrator.modeChanged(thread.id)
    await h.orchestrator.submitTurn(thread.id, 'without Motion')
    expect(attached(h.resumed[1]!)).toBeUndefined()
    expect(h.resumed[1]!.instructions).not.toContain('After Effects')
    expect(h.orchestrator.afterEffectsState(thread.id)).toBeUndefined()
  })

  it('tells the clients when the session found what the screen did not expect', async () => {
    // After Effects is missing here, but the provider shows an After Effects server of the person.
    const h = await harness({
      source: { executable: undefined, entry: ENTRY },
      codexServers: [personsServer('after-effects')],
    })
    const thread = await h.orchestrator.startThread('codex', h.directory)
    h.store.setThreadMode(thread.id, 'motion')
    expect(h.orchestrator.afterEffectsState(thread.id)).toBe('not-installed')

    await h.orchestrator.modeChanged(thread.id)
    await h.orchestrator.submitTurn(thread.id, 'go')
    expect(h.orchestrator.afterEffectsState(thread.id)).toBe('ready')
    expect(h.announced).toEqual([thread.id])
  })

  it('keeps the server when the saved servers of the project are reloaded, unless the person adds theirs', async () => {
    const h = await harness()
    await motionChat(h)

    await h.orchestrator.reloadMcpServers('codex', h.directory)
    const reloaded = h.sessions[0]!.reloaded[0]!
    expect(reloaded.map((server) => server.id)).toContain(AFTER_EFFECTS_SERVER_ID)

    h.mcpConfig.add('codex', h.directory, personsConfig('after-effects'))
    await h.orchestrator.reloadMcpServers('codex', h.directory)
    const later = h.sessions[0]!.reloaded[1]!.filter((server) => server.id === 'after-effects')
    expect(later).toEqual([personsConfig('after-effects')])
  })
})
