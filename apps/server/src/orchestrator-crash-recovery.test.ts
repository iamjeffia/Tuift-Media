import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { DomainEvent, ProviderId } from '@harness/contracts'
import { afterAll, describe, expect, it, vi } from 'vitest'
import type { AgentSession, ProviderRuntime } from './adapters.js'
import { McpConfigStore } from './mcp-config.js'
import { Orchestrator } from './orchestrator.js'
import { Store } from './store.js'

const root = mkdtempSync(path.join(os.tmpdir(), 'harness-crash-recovery-'))
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
  interrupts: number
  sends: number
  turnId: string | undefined
}

function setup(options: { lowMemory?: boolean; interruptEndsTurn?: boolean } = {}) {
  const store = new Store(':memory:')
  const sessions: FakeSession[] = []
  const events: DomainEvent[] = []
  const open = (provider: ProviderId): FakeSession => {
    const listeners: Array<(event: DomainEvent) => void> = []
    const emit = (event: DomainEvent) => {
      for (const listener of listeners) listener(event)
    }
    const session: FakeSession = {
      emit,
      interrupts: 0,
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
      sendTurn: async (threadId, _text) => {
        session.sends += 1
        const turnId = `${provider}-turn-${Math.random().toString(36).slice(2)}`
        session.turnId = turnId
        setImmediate(() =>
          emit({
            type: 'turn.started',
            turn: { id: turnId, threadId, status: 'running', createdAt: Date.now() },
          }),
        )
        return turnId
      },
      interrupt: async () => {
        session.interrupts += 1
        if (options.interruptEndsTurn !== false && session.turnId)
          emit({ type: 'turn.completed', turnId: session.turnId, status: 'interrupted' })
      },
      respondToApproval: () => {},
      dispose: () => {},
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
    onEvent: (_threadId, event) => events.push(event),
    onLog: () => {},
    runtimeFor,
    mcpConfig: new McpConfigStore(path.join(root, 'mcp.json')),
    worktreeRoot: path.join(root, 'trees'),
    memory: { setActiveTurns: () => {}, lowRecently: () => options.lowMemory === true },
  })
  return { orchestrator, store, sessions, events }
}

const send = (orchestrator: Orchestrator, threadId: string, text: string) =>
  orchestrator.submitTurn(threadId, text, [], {}, crypto.randomUUID())

const settle = () => new Promise((resolve) => setImmediate(resolve))

/** What an adapter does when its provider's process dies mid-turn. */
function processDies(session: FakeSession, threadId: string, message: string) {
  session.emit({ type: 'thread.error', threadId, message })
  session.emit({ type: 'turn.completed', turnId: session.turnId!, status: 'failed' })
}

function errors(store: Store, threadId: string) {
  return store
    .history(threadId)
    .map(({ event }) => event)
    .filter((event) => event.type === 'thread.error')
}

describe('a provider process that dies', () => {
  it('is explained as lack of memory when the system was low, and the turn closes cleanly', async () => {
    const { orchestrator, store, sessions } = setup({ lowMemory: true })
    const chat = await orchestrator.startThread('claude-code', repository(), { approval: 'auto' })
    await send(orchestrator, chat.id, 'Render the reel')
    await settle()
    // A prompt queued behind the running turn.
    await send(orchestrator, chat.id, 'Then export it')
    expect(store.queuedThreadIds().has(chat.id)).toBe(true)

    processDies(sessions[0]!, chat.id, 'Claude Code process exited with code 3221226505')
    await settle()

    const [error] = errors(store, chat.id)
    expect(error).toMatchObject({
      type: 'thread.error',
      reason: { code: 'process_memory', certainty: 'likely', exitCode: 3221226505 },
    })
    expect((error as { message: string }).message).toContain('0xC0000409')
    expect((error as { message: string }).message).toContain('most likely')
    expect(store.history(chat.id).at(-1)?.event).toMatchObject({
      type: 'turn.completed',
      status: 'failed',
    })
    expect(orchestrator.isTurnRunning(chat.id)).toBe(false)
    // The queued prompt stays queued; nothing goes out on its own after the process died.
    expect(store.queuedThreadIds().has(chat.id)).toBe(true)
    expect(sessions[0]!.sends).toBe(1)
    await orchestrator.disposeAll()
  })

  it('stays unknown, with the exit code, when the system was not low', async () => {
    const { orchestrator, store, sessions } = setup({ lowMemory: false })
    const chat = await orchestrator.startThread('claude-code', repository(), { approval: 'auto' })
    await send(orchestrator, chat.id, 'Render the reel')
    await settle()

    processDies(sessions[0]!, chat.id, 'Claude Code process exited with code 3221226505')

    const [error] = errors(store, chat.id)
    expect(error).toMatchObject({ reason: { code: 'process_unknown', exitCode: 3221226505 } })
    expect((error as { message: string }).message).toBe(
      'Claude Code process exited with code 3221226505 (0xC0000409)',
    )
    await orchestrator.disposeAll()
  })

  it('keeps the provider own words when it ended with an error result', async () => {
    const { orchestrator, store, sessions } = setup()
    const chat = await orchestrator.startThread('claude-code', repository(), { approval: 'auto' })
    await send(orchestrator, chat.id, 'Do it')
    await settle()

    processDies(
      sessions[0]!,
      chat.id,
      'Claude Code returned an error result: credit balance is too low',
    )

    const [error] = errors(store, chat.id)
    expect(error).toMatchObject({
      reason: { code: 'process_provider_error', message: 'credit balance is too low' },
    })
    await orchestrator.disposeAll()
  })

  it('leaves an error the provider worded itself without a reason', async () => {
    const { orchestrator, store, sessions } = setup()
    const chat = await orchestrator.startThread('claude-code', repository(), { approval: 'auto' })
    await send(orchestrator, chat.id, 'Do it')
    await settle()

    sessions[0]!.emit({ type: 'thread.error', threadId: chat.id, message: 'Rate limited.' })

    expect(errors(store, chat.id)[0]).toEqual({
      type: 'thread.error',
      threadId: chat.id,
      message: 'Rate limited.',
    })
    await orchestrator.disposeAll()
  })
})

describe('closing the app while chats work', () => {
  it('stops each running turn like a Stop, marks it, and keeps the queue', async () => {
    const { orchestrator, store, sessions } = setup()
    const repo = repository()
    const working = await orchestrator.startThread('claude-code', repo, { approval: 'auto' })
    const idle = await orchestrator.startThread('claude-code', repo, { approval: 'auto' })
    await send(orchestrator, working.id, 'Long task')
    await settle()
    await send(orchestrator, working.id, 'Next')
    expect(store.queuedThreadIds().has(working.id)).toBe(true)

    const marked = await orchestrator.stopTurnsForShutdown()

    expect(marked).toEqual([working.id])
    expect(sessions[0]!.interrupts).toBe(1)
    expect(sessions[1]!.interrupts).toBe(0)
    const history = store.history(working.id).map(({ event }) => event)
    expect(
      history.some((event) => event.type === 'turn.completed' && event.status === 'interrupted'),
    ).toBe(true)
    expect(history.at(-1)).toMatchObject({
      type: 'thread.error',
      reason: { code: 'app_closed' },
    })
    expect(errors(store, idle.id)).toEqual([])
    expect(orchestrator.isTurnRunning(working.id)).toBe(false)
    // Still queued, and not sent after the Stop.
    expect(store.queuedThreadIds().has(working.id)).toBe(true)
    expect(sessions[0]!.sends).toBe(1)
    await orchestrator.disposeAll()
  })

  it('does not wait for a provider that never confirms its Stop', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const { orchestrator, store, sessions } = setup({ interruptEndsTurn: false })
      const chat = await orchestrator.startThread('claude-code', repository(), { approval: 'auto' })
      await send(orchestrator, chat.id, 'Long task')
      await vi.advanceTimersByTimeAsync(0)
      await new Promise((resolve) => setImmediate(resolve))
      sessions[0]!.interrupt = () => new Promise(() => {})

      const stopping = orchestrator.stopTurnsForShutdown(1_500)
      await vi.advanceTimersByTimeAsync(1_500)

      expect(await stopping).toEqual([chat.id])
      expect(errors(store, chat.id)[0]).toMatchObject({ reason: { code: 'app_closed' } })
      await orchestrator.disposeAll()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('after a restart', () => {
  it('finds a chat whose turn started and never ended, and offers to continue', () => {
    const store = new Store(':memory:')
    const thread = store.addThread({
      id: 'chat-1',
      projectPath: root,
      provider: 'claude-code',
      title: 'Chat',
    })
    store.append(thread.id, {
      type: 'turn.started',
      turn: { id: 't1', threadId: thread.id, status: 'running', createdAt: 1 },
    })

    expect(store.recoverInterruptedThreads()).toEqual([thread.id])

    const last = store.history(thread.id).at(-1)?.event
    expect(last).toMatchObject({ type: 'thread.error', reason: { code: 'app_closed' } })
  })

  it('leaves a chat whose turn ended alone', () => {
    const store = new Store(':memory:')
    const thread = store.addThread({
      id: 'chat-2',
      projectPath: root,
      provider: 'claude-code',
      title: 'Chat',
    })
    store.append(thread.id, {
      type: 'turn.started',
      turn: { id: 't1', threadId: thread.id, status: 'running', createdAt: 1 },
    })
    store.append(thread.id, { type: 'turn.completed', turnId: 't1', status: 'completed' })

    expect(store.recoverInterruptedThreads()).toEqual([])
  })
})
