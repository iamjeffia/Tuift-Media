import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { ClaudeCodeAdapter } from '@harness/adapter-claude-code'
import type { DomainEvent, ProviderId } from '@harness/contracts'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSession, ProviderRuntime } from './adapters.js'
import { McpConfigStore } from './mcp-config.js'
import { Orchestrator } from './orchestrator.js'
import { Store } from './store.js'
import { realSqliteError } from './write-failure.test-support.js'

const root = mkdtempSync(path.join(os.tmpdir(), 'harness-write-safety-'))
afterAll(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))

function repository(): string {
  const repo = mkdtempSync(path.join(root, 'repo-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' })
  git('init', '--initial-branch=main')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
  writeFileSync(path.join(repo, 'a.txt'), 'a\n')
  git('add', 'a.txt')
  git('commit', '-m', 'initial')
  return repo
}

type FakeSession = AgentSession & {
  emit(event: DomainEvent): void
  disposed: number
  sends: number
  turnId: string | undefined
}

function setup() {
  const store = new Store(':memory:')
  const sessions: FakeSession[] = []
  const events: Array<{ event: DomainEvent; seq: number | undefined }> = []
  const logs: string[] = []
  const open = (provider: ProviderId): FakeSession => {
    const listeners: Array<(event: DomainEvent) => void> = []
    const session: FakeSession = {
      emit: (event) => {
        for (const listener of listeners) listener(event)
      },
      disposed: 0,
      sends: 0,
      turnId: undefined,
      capabilities: {
        steer: false,
        fork: false,
        interrupt: true,
        reasoningItems: false,
        approvals: false,
        images: false,
      },
      sendTurn: async (threadId) => {
        session.sends += 1
        const turnId = `${provider}-turn-${session.sends}`
        session.turnId = turnId
        setImmediate(() =>
          session.emit({
            type: 'turn.started',
            turn: { id: turnId, threadId, status: 'running', createdAt: Date.now() },
          }),
        )
        return turnId
      },
      interrupt: async () => {},
      respondToApproval: () => {},
      dispose: () => {
        session.disposed += 1
      },
      on: (event: 'event' | 'log', listener: (value: never) => void) => {
        if (event === 'event') listeners.push(listener as (event: DomainEvent) => void)
      },
    }
    sessions.push(session)
    return session
  }
  const runtimeFor = (provider: ProviderId): ProviderRuntime => ({
    async start(workspacePath) {
      return {
        thread: {
          id: `${provider}-native-${sessions.length + 1}`,
          provider,
          workspacePath,
          createdAt: Date.now(),
        },
        session: open(provider),
      }
    },
    async resume(threadId, workspacePath) {
      return {
        thread: { id: threadId, provider, workspacePath, createdAt: Date.now() },
        session: open(provider),
      }
    },
    async listModels() {
      return []
    },
  })
  const orchestrator = new Orchestrator(store, {
    onEvent: (_threadId, event, seq) => events.push({ event, seq }),
    onLog: (line) => logs.push(line),
    runtimeFor,
    mcpConfig: new McpConfigStore(path.join(root, 'mcp.json')),
    worktreeRoot: path.join(root, 'trees'),
  })
  return { orchestrator, store, sessions, events, logs }
}

const send = (orchestrator: Orchestrator, threadId: string, text: string) =>
  orchestrator.submitTurn(threadId, text, [], {}, crypto.randomUUID())

const settle = () => new Promise((resolve) => setImmediate(resolve))

const assistantText = (id: string, text: string) => ({
  type: 'item.completed' as const,
  item: {
    id,
    turnId: 'turn',
    type: 'message' as const,
    role: 'assistant' as const,
    status: 'completed' as const,
    text,
    createdAt: Date.now(),
  },
})

/** Makes every write of this kind of event fail, the way a full disk or a held lock does. */
function failWrites(
  store: Store,
  error: Error,
  when: (event: DomainEvent) => boolean,
  times = Infinity,
) {
  const original = store.appendWithSerializedEvent.bind(store)
  let left = times
  vi.spyOn(store, 'appendWithSerializedEvent').mockImplementation((threadId, event) => {
    if (left > 0 && when(event)) {
      left -= 1
      throw error
    }
    return original(threadId, event)
  })
}

const historyOf = (store: Store, threadId: string) =>
  store.history(threadId).map(({ event }) => event)

describe('a write that fails in the middle of a turn', () => {
  const unhandled: unknown[] = []
  const onUnhandled = (reason: unknown) => unhandled.push(reason)
  beforeEach(() => {
    unhandled.length = 0
    process.on('unhandledRejection', onUnhandled)
  })
  afterEach(() => {
    process.off('unhandledRejection', onUnhandled)
    vi.restoreAllMocks()
  })

  it.each([
    ['only the log of events fails', (event: DomainEvent) => event.type === 'item.completed'],
    ['every write fails, as on a really full disk', () => true],
  ])(
    'does not become an unhandled rejection with the real Claude adapter (%s)',
    async (_name, failing) => {
      const store = new Store(':memory:')
      const logs: string[] = []
      const events: DomainEvent[] = []
      const messages: SDKMessage[] = []
      let wake: (() => void) | undefined
      let closed = false
      const query = {
        close: () => {
          closed = true
          wake?.()
        },
        interrupt: async () => undefined,
        setModel: async () => {},
        setPermissionMode: async () => {},
        supportedModels: async () => [],
        mcpServerStatus: async () => [],
        setMcpServers: async () => ({ added: [], removed: [], errors: {} }),
        supportedCommands: async () => [],
        initializationResult: async () => ({
          commands: [],
          agents: [],
          output_style: 'default',
          available_output_styles: [],
          models: [],
          account: {},
        }),
        [Symbol.asyncIterator]: () => ({
          next: async (): Promise<IteratorResult<SDKMessage>> => {
            for (;;) {
              const message = messages.shift()
              if (message) return { value: message, done: false }
              if (closed) return { value: undefined, done: true }
              await new Promise<void>((resolve) => (wake = resolve))
            }
          },
        }),
      }
      let adapter: ClaudeCodeAdapter | undefined
      const runtimeFor = (): ProviderRuntime => ({
        async start(workspacePath) {
          adapter = new ClaudeCodeAdapter({ createQuery: () => query as never })
          const thread = await adapter.startThread(workspacePath, {})
          const session: AgentSession = {
            capabilities: adapter.capabilities,
            sendTurn: (threadId, text, attachments, options) =>
              adapter!.sendTurn(threadId, text, attachments, options),
            interrupt: () => adapter!.interrupt(),
            respondToApproval: (id, decision) => adapter!.respondToApproval(id, decision),
            dispose: () => adapter!.dispose(),
            on: ((event: 'event' | 'log', listener: (value: never) => void) =>
              adapter!.on(event, listener as never)) as AgentSession['on'],
          }
          return { thread, session }
        },
        async resume() {
          throw new Error('not used')
        },
        async listModels() {
          return []
        },
      })
      const orchestrator = new Orchestrator(store, {
        onEvent: (_threadId, event) => events.push(event),
        onLog: (line) => logs.push(line),
        runtimeFor,
        mcpConfig: new McpConfigStore(path.join(root, 'mcp.json')),
        worktreeRoot: path.join(root, 'trees'),
      })
      const chat = await orchestrator.startThread('claude-code', repository(), { approval: 'auto' })
      await send(orchestrator, chat.id, 'Write the report')
      await settle()
      expect(orchestrator.isTurnRunning(chat.id)).toBe(true)

      failWrites(store, realSqliteError('full'), failing)
      messages.push({
        type: 'assistant',
        message: {
          id: 'msg-1',
          role: 'assistant',
          model: 'claude',
          content: [{ type: 'text', text: 'Here is the report.' }],
        },
        parent_tool_use_id: null,
        session_id: 'session-1',
        uuid: crypto.randomUUID(),
      } as unknown as SDKMessage)
      wake?.()
      await new Promise((resolve) => setTimeout(resolve, 60))

      // The process kept running, the turn ended with a reason, and the agent's process stopped.
      expect(unhandled).toEqual([])
      expect(events.filter((event) => event.type === 'thread.error')).toMatchObject([
        { reason: { code: 'save_disk_full' } },
      ])
      expect(orchestrator.isTurnRunning(chat.id)).toBe(false)
      expect(closed).toBe(true)
      // The server still answers.
      expect(orchestrator.history(chat.id)).resolves.toBeDefined()
      await orchestrator.disposeAll()
    },
  )

  it.each([
    ['full', 'save_disk_full'],
    ['locked', 'save_locked'],
  ] as const)('a %s database ends the turn with %s and keeps the queue', async (kind, code) => {
    const { orchestrator, store, sessions, logs } = setup()
    const chat = await orchestrator.startThread('claude-code', repository(), { approval: 'auto' })
    await send(orchestrator, chat.id, 'First')
    await settle()
    await send(orchestrator, chat.id, 'Second, queued')
    expect(store.queuedThreadIds().has(chat.id)).toBe(true)

    failWrites(store, realSqliteError(kind), (event) => event.type === 'item.completed')
    expect(() => sessions[0]!.emit(assistantText('a1', 'secret conversation text'))).not.toThrow()

    const history = historyOf(store, chat.id)
    expect(history.filter((event) => event.type === 'thread.error')).toMatchObject([
      { reason: { code } },
    ])
    expect(history.at(-1)).toMatchObject({ type: 'turn.completed', status: 'failed' })
    expect(orchestrator.isTurnRunning(chat.id)).toBe(false)
    // The agent was stopped, and the queued prompt waits for the person.
    await settle()
    expect(sessions[0]!.disposed).toBeGreaterThan(0)
    expect(store.queuedThreadIds().has(chat.id)).toBe(true)
    expect(sessions[0]!.sends).toBe(1)
    // The log says what failed, never what the conversation said.
    expect(logs.join('\n')).toContain('could not record an event')
    expect(logs.join('\n')).not.toContain('secret conversation text')
    await orchestrator.disposeAll()
  })

  it('shows the notice live when even the notice cannot be saved', async () => {
    const { orchestrator, store, sessions, events } = setup()
    const chat = await orchestrator.startThread('claude-code', repository(), { approval: 'auto' })
    await send(orchestrator, chat.id, 'First')
    await settle()

    failWrites(store, realSqliteError('full'), () => true)
    sessions[0]!.emit(assistantText('a1', 'x'))

    const live = events.filter(({ event }) => event.type === 'thread.error')
    expect(live).toMatchObject([{ seq: undefined, event: { reason: { code: 'save_disk_full' } } }])
    expect(events.at(-1)?.event).toMatchObject({ type: 'turn.completed', status: 'failed' })
    expect(orchestrator.isTurnRunning(chat.id)).toBe(false)
    await orchestrator.disposeAll()
  })

  it('retries a lock that lets go within a fraction of a second, and goes on', async () => {
    const { orchestrator, store, sessions } = setup()
    const chat = await orchestrator.startThread('claude-code', repository(), { approval: 'auto' })
    await send(orchestrator, chat.id, 'First')
    await settle()

    failWrites(store, realSqliteError('locked'), (event) => event.type === 'item.completed', 2)
    sessions[0]!.emit(assistantText('a1', 'Done.'))

    const history = historyOf(store, chat.id)
    expect(history.some((event) => event.type === 'thread.error')).toBe(false)
    expect(history.at(-1)).toMatchObject({ type: 'item.completed' })
    expect(orchestrator.isTurnRunning(chat.id)).toBe(true)
    await orchestrator.disposeAll()
  })

  it('ends the turn when streamed text cannot be saved, after the lock outlasts its retries', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const { orchestrator, store, sessions } = setup()
      const chat = await orchestrator.startThread('claude-code', repository(), { approval: 'auto' })
      await send(orchestrator, chat.id, 'First')
      await vi.advanceTimersByTimeAsync(0)
      await settle()
      const turnId = sessions[0]!.turnId!
      failWrites(store, realSqliteError('locked'), (event) => event.type === 'item.delta')

      sessions[0]!.emit({ type: 'item.delta', turnId, itemId: 'm1', textDelta: 'streaming' })
      // Four tries a second apart: the first and three retries, none of which stalls the events.
      await vi.advanceTimersByTimeAsync(4_100)

      expect(
        historyOf(store, chat.id).filter((event) => event.type === 'thread.error'),
      ).toMatchObject([{ reason: { code: 'save_locked' } }])
      expect(orchestrator.isTurnRunning(chat.id)).toBe(false)
      await orchestrator.disposeAll()
    } finally {
      vi.useRealTimers()
    }
  })

  it('ends the turn at once when streamed text meets a full disk', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const { orchestrator, store, sessions } = setup()
      const chat = await orchestrator.startThread('claude-code', repository(), { approval: 'auto' })
      await send(orchestrator, chat.id, 'First')
      await vi.advanceTimersByTimeAsync(0)
      await settle()
      failWrites(store, realSqliteError('full'), (event) => event.type === 'item.delta')

      sessions[0]!.emit({
        type: 'item.delta',
        turnId: sessions[0]!.turnId!,
        itemId: 'm1',
        textDelta: 'streaming',
      })
      await vi.advanceTimersByTimeAsync(10)

      expect(
        historyOf(store, chat.id).filter((event) => event.type === 'thread.error'),
      ).toMatchObject([{ reason: { code: 'save_disk_full' } }])
      expect(sessions[0]!.disposed).toBeGreaterThan(0)
      await orchestrator.disposeAll()
    } finally {
      vi.useRealTimers()
    }
  })

  it('ends a different chat only once, and leaves the others working', async () => {
    const { orchestrator, store, sessions } = setup()
    const repo = repository()
    const failing = await orchestrator.startThread('claude-code', repo, { approval: 'auto' })
    const other = await orchestrator.startThread('claude-code', repo, { approval: 'auto' })
    await send(orchestrator, failing.id, 'First')
    await send(orchestrator, other.id, 'Other')
    await settle()

    const original = store.appendWithSerializedEvent.bind(store)
    vi.spyOn(store, 'appendWithSerializedEvent').mockImplementation((threadId, event) => {
      if (threadId === failing.id && event.type === 'item.completed') throw realSqliteError('full')
      return original(threadId, event)
    })
    sessions[0]!.emit(assistantText('a1', 'x'))
    sessions[1]!.emit(assistantText('b1', 'fine'))

    expect(
      historyOf(store, failing.id).filter((event) => event.type === 'thread.error'),
    ).toHaveLength(1)
    expect(orchestrator.isTurnRunning(failing.id)).toBe(false)
    expect(orchestrator.isTurnRunning(other.id)).toBe(true)
    expect(historyOf(store, other.id).at(-1)).toMatchObject({ type: 'item.completed' })
    await orchestrator.disposeAll()
  })
})
