import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ProviderIdSchema,
  type Capabilities,
  type DomainEvent,
  type ProviderId,
} from '@harness/contracts'
import type { AgentSession, ProviderRuntime, StartOptions } from './adapters.js'
import { AGENT_TOOLS_SERVER_ID } from './agent-tools-mcp.js'
import {
  writeDefaultSkillPackFixture,
  writeDefaultSkillsFixture,
} from './default-skills.test-support.js'
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
  disposed = false
  async sendTurn(): Promise<string> {
    return 'turn'
  }
  async interrupt(): Promise<void> {}
  respondToApproval(): void {}
  dispose(): void {
    this.disposed = true
  }
  on(_event: 'event' | 'log', _listener: (value: never) => void): void {}
}

const cleanups: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

type Rpc = { result: { tools?: Array<{ name: string }>; content?: Array<{ text: string }> } }

/** Talks to the agent tools over real HTTP, the way an engine does, with one chat's token. */
async function rpc(options: StartOptions, method: string, params?: unknown): Promise<Rpc> {
  const server = options.mcpServers?.find((entry) => entry.id === AGENT_TOOLS_SERVER_ID)
  if (!server || server.transport.type !== 'http') throw new Error('no agent tools')
  const header = server.transport.headers?.['Authorization']
  if (!header || typeof header === 'string' || header.source !== 'credential') {
    throw new Error('no credential header')
  }
  const response = await fetch(server.transport.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: options.mcpCredentials?.[header.credentialRef] ?? '',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  return (await response.json()) as Rpc
}

const toolNames = async (options: StartOptions) =>
  (await rpc(options, 'tools/list')).result.tools!.map((tool) => tool.name)

async function callStage(options: StartOptions, args: Record<string, unknown> = {}) {
  const { result } = (await rpc(options, 'tools/call', {
    name: 'motion_stage',
    arguments: args,
  })) as Rpc & { result: { isError?: boolean } }
  const text = result.content![0]!.text
  return result.isError ? { error: text } : (JSON.parse(text) as Record<string, unknown>)
}

async function harness() {
  const store = new Store(':memory:')
  const directory = mkdtempSync(path.join(os.tmpdir(), 'tc-motion-stage-'))
  cleanups.push(() => rmSync(directory, { recursive: true, force: true, maxRetries: 3 }))
  const root = await writeDefaultSkillsFixture(directory)
  // hyperframes-audio is declared by the real pack but missing from this install.
  await writeDefaultSkillPackFixture(
    root,
    'motion',
    [
      ['composicao-trilha', 'soundtrack'],
      ['hyperframes-audio', 'voiceover and audio'],
    ],
    ['composicao-trilha'],
  )
  const sessions: FakeSession[] = []
  const started: StartOptions[] = []
  const listedWhileStarting: string[][] = []
  const announced: string[] = []
  const runtimeFor = (provider: ProviderId): ProviderRuntime => ({
    async start(workspacePath, options) {
      started.push(options)
      // A new chat asks for its tools before it exists as far as the app is concerned.
      if (options.mcpServers?.some((entry) => entry.id === AGENT_TOOLS_SERVER_ID)) {
        listedWhileStarting.push(await toolNames(options))
      }
      const session = new FakeSession()
      sessions.push(session)
      return {
        thread: { id: `thread-${sessions.length}`, provider, workspacePath, createdAt: Date.now() },
        session,
      }
    },
  })
  const orchestrator = new Orchestrator(store, {
    onEvent: (_threadId: string, _event: DomainEvent) => {},
    agentTools: true,
    onThreadSettings: (threadId) => announced.push(threadId),
    onLog: () => {},
    onLogin: () => {},
    mcpConfig: new McpConfigStore(path.join(directory, 'mcp.json')),
    readCredential: (reference) => `secret:${reference}`,
    defaultSkillsRoot: root,
    runtimeFor,
  })
  cleanups.push(() => orchestrator.disposeAll())
  return { store, orchestrator, sessions, started, listedWhileStarting, announced, root, directory }
}

// Each test talks to the agent tools over real HTTP; a busy machine needs more than 5 s.
describe('motion_stage on the app tool channel', { timeout: 30_000 }, () => {
  it.each(ProviderIdSchema.options)(
    'tells a Motion chat on %s to call the tool only where the provider reaches it',
    async (provider) => {
      const { orchestrator, started, directory } = await harness()
      await orchestrator.startThread(provider, directory, { mode: 'motion' })
      await orchestrator.startThread(provider, directory)

      const reaches = PROVIDER_CAPABILITIES[provider].agentTools
      expect(started[0]!.instructions?.includes('motion_stage')).toBe(reaches)
      expect(started[1]!.instructions).not.toContain('motion_stage')
    },
  )

  it('offers the tool to a Motion chat and to no other, and a chat with no mode sees today list', async () => {
    const { orchestrator, store, started, directory } = await harness()
    const motion = await orchestrator.startThread('codex', directory, { mode: 'motion' })
    store.setThreadMode(motion.id, 'motion')
    const plain = await orchestrator.startThread('codex', directory)

    expect(await toolNames(started[0]!)).toEqual([
      'list_agent_models',
      'start_agent',
      'wait_for_agents',
      'stop_agent',
      'motion_stage',
    ])
    expect(await toolNames(started[1]!)).toEqual([
      'list_agent_models',
      'start_agent',
      'wait_for_agents',
      'stop_agent',
    ])
    expect(await callStage(started[1]!, { stage: 'review' })).toEqual({
      error: 'motion_stage is only available in Motion chats, and this chat is not in Motion mode.',
    })
    expect(store.threadSettings(plain.id).motionStage).toBeUndefined()

    // Turning Motion off takes the tool away from the same chat.
    store.setThreadMode(motion.id, null)
    expect(await toolNames(started[0]!)).not.toContain('motion_stage')
  })

  it('offers the tool to a new Motion chat while it is still starting', async () => {
    const { orchestrator, listedWhileStarting, directory } = await harness()
    await orchestrator.startThread('codex', directory, { mode: 'motion' })
    await orchestrator.startThread('codex', directory)

    expect(listedWhileStarting[0]).toContain('motion_stage')
    expect(listedWhileStarting[1]).not.toContain('motion_stage')
  })

  it('stores the stage, announces it, keeps the session and accepts any stage from any stage', async () => {
    const { orchestrator, store, sessions, started, announced, root, directory } = await harness()
    const chat = await orchestrator.startThread('codex', directory, { mode: 'motion' })
    store.setThreadMode(chat.id, 'motion')
    expect(store.threadSettings(chat.id).motionStage).toBe('idea')

    const set = await callStage(started[0]!, { stage: 'soundtrack' })
    expect(set).toMatchObject({ stage: 'soundtrack', owner: 'cloud', next: 'motion' })
    // Only the skills of this install: the pack lacks hyperframes-audio, so it is not pointed at.
    expect(set['skills']).toEqual([
      {
        name: 'composicao-trilha',
        path: path.join(root, 'packs', 'motion', 'skills', 'composicao-trilha', 'SKILL.md'),
      },
    ])
    expect(store.threadSettings(chat.id)).toMatchObject({
      mode: 'motion',
      motionStage: 'soundtrack',
    })
    expect(announced).toEqual([chat.id])

    // Backwards, and straight to the end.
    expect(await callStage(started[0]!, { stage: 'idea' })).toMatchObject({ stage: 'idea' })
    expect(await callStage(started[0]!, { stage: 'delivery' })).toMatchObject({
      stage: 'delivery',
      next: null,
    })
    expect(announced).toEqual([chat.id, chat.id, chat.id])

    // A stage change never restarts the provider session.
    expect(sessions).toHaveLength(1)
    expect(sessions[0]!.disposed).toBe(false)
    expect(started).toHaveLength(1)
  })

  it('answers the current stage without changing anything, and refuses an id that is not a stage', async () => {
    const { orchestrator, store, started, announced, directory } = await harness()
    const chat = await orchestrator.startThread('codex', directory, { mode: 'motion' })
    store.setThreadMode(chat.id, 'motion', 'references')

    const current = await callStage(started[0]!)
    expect(current).toMatchObject({ stage: 'references', owner: 'moss', next: 'identity' })
    expect(current['stages']).toHaveLength(10)

    const refused = await callStage(started[0]!, { stage: 'colorGrade' })
    expect(refused).toEqual({
      error: expect.stringContaining('idea, script, narration, audioApproval, references'),
    })
    expect(store.threadSettings(chat.id).motionStage).toBe('references')
    expect(announced).toEqual([])
  })

  it('acts on the chat the token names, never on one an argument names', async () => {
    const { orchestrator, store, started, directory } = await harness()
    const first = await orchestrator.startThread('codex', directory, { mode: 'motion' })
    store.setThreadMode(first.id, 'motion')
    const second = await orchestrator.startThread('codex', directory, { mode: 'motion' })
    store.setThreadMode(second.id, 'motion')

    expect(await callStage(started[1]!, { stage: 'review', threadId: first.id })).toEqual({
      error: expect.stringContaining('Invalid arguments'),
    })
    await callStage(started[1]!, { stage: 'review' })
    expect(store.threadSettings(first.id).motionStage).toBe('idea')
    expect(store.threadSettings(second.id).motionStage).toBe('review')
  })
})
