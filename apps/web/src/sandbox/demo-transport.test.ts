import type { DataOf, DomainEvent } from '@harness/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DemoTransport } from './demo-transport.js'
import { afterEffectsFromSearch, motionSceneFromSearch } from './demo-server.js'

const TIMING = { stepMs: 10, wordMs: 5, thinkingWordMs: 2, toolMs: 20 }

let transport: DemoTransport
let events: Array<DataOf<'thread.event'>>
let queues: Array<DataOf<'thread.queue'>>

beforeEach(async () => {
  vi.useFakeTimers()
  transport = new DemoTransport({ latencyMs: 1, timing: TIMING, platform: 'linux' })
  events = []
  queues = []
  transport.on('thread.event', (data) => events.push(data))
  transport.on('thread.queue', (data) => queues.push(data))
  transport.connect()
  await vi.advanceTimersByTimeAsync(1)
})

afterEach(() => {
  transport.close()
  transport.server.dispose()
  vi.useRealTimers()
})

/** Resolves a request while the fake clock runs, the way a socket reply arrives. */
async function call<T>(request: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(2)
  return request
}

async function newChat(provider: 'claude-code' | 'grok' = 'claude-code'): Promise<string> {
  const { projects } = await call(transport.request('projects.list', {}))
  const { threadId } = await call(
    transport.request('thread.start', { provider, workspacePath: projects[0]!.path }),
  )
  return threadId
}

function typesFor(threadId: string): string[] {
  return events
    .filter((entry) => entry.threadId === threadId)
    .map((entry) => entry.event.type)
    .filter((type) => type !== 'item.delta')
}

function completedTurn(threadId: string): Extract<DomainEvent, { type: 'turn.completed' }>[] {
  return events.flatMap((entry) =>
    entry.threadId === threadId && entry.event.type === 'turn.completed' ? [entry.event] : [],
  )
}

describe('DemoTransport', () => {
  it('streams a sent prompt word by word through the normal turn events', async () => {
    const threadId = await newChat()
    const sent = await call(
      transport.request('thread.sendTurn', {
        threadId,
        text: 'Make the sidebar quieter',
        clientSubmissionId: 'local:prompt-1',
      }),
    )
    expect(sent).toMatchObject({ queued: false })
    await vi.advanceTimersByTimeAsync(10_000)

    const types = typesFor(threadId)
    expect(types[0]).toBe('turn.started')
    expect(types.at(-1)).toBe('turn.completed')
    expect(types).toContain('item.started')
    expect(completedTurn(threadId).map((event) => event.status)).toEqual(['completed'])

    const items = events.flatMap((entry) =>
      entry.event.type === 'item.completed' && entry.threadId === threadId
        ? [entry.event.item]
        : [],
    )
    expect(items[0]).toMatchObject({ id: 'local:prompt-1', role: 'user' })
    expect(items.some((item) => item.type === 'tool_call')).toBe(true)
    const answer = items.find((item) => item.role === 'assistant')!
    expect(answer.phase).toBe('final_answer')
    const deltas = events.flatMap((entry) =>
      entry.event.type === 'item.delta' && entry.event.itemId === answer.id
        ? [entry.event.textDelta]
        : [],
    )
    expect(deltas.length).toBeGreaterThan(20)
    expect(deltas.join('')).toBe(answer.text)
    expect(answer.text).toContain('Make the sidebar quieter')

    // Every push carries the next position in the chat's log, as history replays it.
    const seqs = events.filter((entry) => entry.threadId === threadId).map((entry) => entry.seq)
    expect(seqs).toEqual(seqs.map((_, index) => index + 1))
    const history = await call(transport.request('thread.history', { threadId }))
    expect(history.running).toBe(false)
    expect(history.events.length).toBe(seqs.length)
  })

  it('stops a streaming turn and keeps what arrived so far', async () => {
    const threadId = await newChat()
    await call(transport.request('thread.sendTurn', { threadId, text: 'Write a long answer' }))
    await vi.advanceTimersByTimeAsync(400)
    expect(transport.server.isRunning(threadId)).toBe(true)

    await call(transport.request('thread.interrupt', { threadId }))
    expect(transport.server.isRunning(threadId)).toBe(false)
    expect(completedTurn(threadId).map((event) => event.status)).toEqual(['interrupted'])
    const count = events.length
    await vi.advanceTimersByTimeAsync(10_000)
    expect(events.length).toBe(count)

    const started = events.flatMap((entry) =>
      entry.event.type === 'item.started' && entry.threadId === threadId
        ? [entry.event.item.id]
        : [],
    )
    const completed = new Set(
      events.flatMap((entry) =>
        entry.event.type === 'item.completed' && entry.threadId === threadId
          ? [entry.event.item.id]
          : [],
      ),
    )
    expect(started.every((id) => completed.has(id))).toBe(true)
  })

  it('queues a prompt sent during a turn and starts it after that turn', async () => {
    const threadId = await newChat('grok')
    await call(transport.request('thread.sendTurn', { threadId, text: 'First' }))
    const queued = await call(
      transport.request('thread.sendTurn', { threadId, text: 'Second', clientSubmissionId: 'q-2' }),
    )
    expect(queued).toMatchObject({ queued: true, queuedTurn: { id: 'q-2', text: 'Second' } })
    expect(queues.at(-1)).toMatchObject({ threadId, items: [{ id: 'q-2' }], canSteer: false })

    await vi.advanceTimersByTimeAsync(20_000)
    expect(completedTurn(threadId).map((event) => event.status)).toEqual(['completed', 'completed'])
    expect(queues.at(-1)).toMatchObject({ threadId, items: [] })
  })

  it('steers a queued prompt into the running turn', async () => {
    const threadId = await newChat('claude-code')
    await call(transport.request('thread.sendTurn', { threadId, text: 'First' }))
    await call(
      transport.request('thread.sendTurn', {
        threadId,
        text: 'Use tokens',
        clientSubmissionId: 's-1',
      }),
    )
    await call(transport.request('thread.steerQueuedTurn', { threadId, queuedTurnId: 's-1' }))
    expect(queues.at(-1)).toMatchObject({ threadId, items: [], canSteer: true })

    await vi.advanceTimersByTimeAsync(20_000)
    const turns = completedTurn(threadId)
    expect(turns).toHaveLength(1)
    const steered = events.find(
      (entry) => entry.event.type === 'item.completed' && entry.event.item.id === 's-1',
    )
    expect(steered?.event).toMatchObject({ item: { role: 'user', turnId: turns[0]!.turnId } })
  })

  it('answers every startup read with data the protocol accepts', async () => {
    const { projects } = await call(transport.request('projects.list', {}))
    expect(projects.length).toBeGreaterThan(1)
    const { providers } = await call(transport.request('providers.list', {}))
    expect(providers.map((status) => status.id)).toEqual(['claude-code', 'codex', 'grok'])
    for (const { id } of providers) {
      const { models } = await call(transport.request('models.list', { provider: id }))
      expect(models.some((model) => model.isDefault)).toBe(true)
      await expect(call(transport.request('auth.status', { provider: id }))).resolves.toMatchObject(
        { signedIn: true },
      )
      await call(transport.request('usage.summary', { provider: id }))
      await call(
        transport.request('commands.list', { provider: id, projectPath: projects[0]!.path }),
      )
      await call(transport.request('skills.list', { provider: id, projectPath: projects[0]!.path }))
      await call(transport.request('mcp.list', { provider: id, projectPath: projects[0]!.path }))
    }
    for (const session of projects.flatMap((project) => project.sessions)) {
      const history = await call(transport.request('thread.history', { threadId: session.id }))
      expect(history.events.at(-1)?.event.type).toBe('turn.completed')
    }
    await call(transport.request('usage.history', { range: '30d' }))
    await call(transport.request('backgroundModel.settings', {}))
    await call(transport.request('accounts.list', {}))
    await call(transport.request('workspace.listDirectory', { projectPath: projects[0]!.path }))
    // A method the sandbox does not model answers when its reply is empty.
    await expect(
      call(transport.request('thread.close', { threadId: projects[0]!.sessions[0]!.id })),
    ).resolves.toEqual({})
  })

  it('reports After Effects on a Motion chat only when the sandbox is told to, and never stores it', async () => {
    transport.close()
    transport.server.dispose()
    transport = new DemoTransport({
      latencyMs: 1,
      timing: TIMING,
      platform: 'linux',
      afterEffects: 'not-installed',
    })
    const pushed: Array<DataOf<'thread.settings'>> = []
    transport.on('thread.settings', (data) => pushed.push(data))
    transport.connect()
    await vi.advanceTimersByTimeAsync(1)
    const threadId = await newChat()

    // A plain chat has no field.
    expect(await call(transport.request('thread.settings', { threadId }))).not.toHaveProperty(
      'afterEffects',
    )
    expect(
      await call(transport.request('thread.setMode', { threadId, mode: 'motion' })),
    ).toMatchObject({ mode: 'motion', afterEffects: 'not-installed' })
    expect(await call(transport.request('thread.settings', { threadId }))).toMatchObject({
      afterEffects: 'not-installed',
    })
    expect(pushed.at(-1)?.settings.afterEffects).toBe('not-installed')
    // A setup change keeps it, and turning Motion off takes it away.
    expect(
      await call(transport.request('thread.setSettings', { threadId, model: 'sonnet' })),
    ).toMatchObject({ afterEffects: 'not-installed' })
    expect(
      await call(transport.request('thread.setMode', { threadId, mode: null })),
    ).not.toHaveProperty('afterEffects')
  })

  it('reads the state from the sandbox URL, and ignores a value that is not one', () => {
    expect(afterEffectsFromSearch('?afterEffects=ready')).toBe('ready')
    expect(afterEffectsFromSearch('?chat=x&afterEffects=unavailable')).toBe('unavailable')
    expect(afterEffectsFromSearch('?afterEffects=maybe')).toBeUndefined()
    expect(afterEffectsFromSearch('')).toBeUndefined()
  })

  it('reads a Motion scene from the sandbox URL: whether it waits, and the helper names', () => {
    expect(motionSceneFromSearch('?motionScene=waiting')).toEqual({ waiting: true, helpers: [] })
    expect(motionSceneFromSearch('?motionScene=Moss,Pip')).toEqual({
      waiting: false,
      helpers: ['Moss', 'Pip'],
    })
    expect(motionSceneFromSearch('?chat=x&motionScene=Waiting, Explorer')).toEqual({
      waiting: true,
      helpers: ['Explorer'],
    })
    expect(motionSceneFromSearch('')).toBeUndefined()
  })

  describe('a Motion scene', () => {
    async function sceneChat(scene: { waiting: boolean; helpers: string[] }) {
      transport.close()
      transport.server.dispose()
      transport = new DemoTransport({
        latencyMs: 1,
        timing: TIMING,
        platform: 'linux',
        motionScene: scene,
      })
      events = []
      transport.on('thread.event', (data) => events.push(data))
      transport.connect()
      await vi.advanceTimersByTimeAsync(1)
      const threadId = await newChat()
      await call(transport.request('thread.setMode', { threadId, mode: 'motion' }))
      await call(transport.request('thread.sendTurn', { threadId, text: 'Make the video' }))
      await vi.advanceTimersByTimeAsync(200)
      return threadId
    }
    const statusOf = async (threadId: string) =>
      (await call(transport.request('projects.list', {}))).projects
        .flatMap((project) => project.sessions)
        .find((session) => session.id === threadId)?.status
    const helperStates = () =>
      events.flatMap(({ event }) =>
        (event.type === 'item.started' || event.type === 'item.completed') && event.item.subagent
          ? [`${event.item.subagent.name}:${event.item.subagent.state}`]
          : [],
      )

    it('starts the named helpers and keeps them running, and a chat without Motion is left alone', async () => {
      const threadId = await sceneChat({ waiting: false, helpers: ['Moss', 'Pip'] })
      expect(helperStates()).toEqual(['Moss:running', 'Pip:running'])
      expect(await statusOf(threadId)).toBe('working')
      expect(completedTurn(threadId)).toHaveLength(0)
      await call(transport.request('thread.interrupt', { threadId }))
      // A helper cut off with its turn is settled, so it stops lighting a character.
      expect(helperStates().slice(2)).toEqual(['Moss:interrupted', 'Pip:interrupted'])
      expect(completedTurn(threadId)).toHaveLength(1)

      const plain = await newChat()
      await call(transport.request('thread.sendTurn', { threadId: plain, text: 'Hello' }))
      await vi.advanceTimersByTimeAsync(2000)
      expect(typesFor(plain)).not.toContain('approval.requested')
      expect(helperStates()).toHaveLength(4)
    })

    it('waits on an approval, shows it in the sidebar status, and goes on when it is answered', async () => {
      const threadId = await sceneChat({ waiting: true, helpers: ['Moss'] })
      expect(typesFor(threadId)).toContain('approval.requested')
      expect(await statusOf(threadId)).toBe('approval')
      const request = events.find(({ event }) => event.type === 'approval.requested')?.event
      if (request?.type !== 'approval.requested') throw new Error('no approval was requested')

      await call(
        transport.request('thread.respondToApproval', {
          threadId,
          approvalId: request.request.id,
          decision: 'approve',
        }),
      )
      expect(typesFor(threadId)).toContain('approval.resolved')
      await vi.advanceTimersByTimeAsync(5000)
      expect(helperStates()).toEqual(['Moss:running', 'Moss:completed'])
      expect(completedTurn(threadId)).toHaveLength(1)
      expect(await statusOf(threadId)).toBe('idle')
    })
  })

  it('keeps a chat mode and Motion stage, refuses a change mid-turn, and pushes each change', async () => {
    const threadId = await newChat()
    const pushed: Array<DataOf<'thread.settings'>> = []
    transport.on('thread.settings', (data) => pushed.push(data))

    expect(await call(transport.request('thread.setMode', { threadId, mode: 'motion' }))).toEqual({
      approval: 'auto',
      mode: 'motion',
      motionStage: 'idea',
    })
    // The stage is kept when the mode goes off, and a setup change leaves both alone.
    await call(
      transport.request('thread.setMode', { threadId, mode: 'motion', motionStage: 'script' }),
    )
    expect(await call(transport.request('thread.setMode', { threadId, mode: null }))).toEqual({
      approval: 'auto',
      motionStage: 'script',
    })
    await call(transport.request('thread.setMode', { threadId, mode: 'motion' }))
    expect(
      await call(transport.request('thread.setSettings', { threadId, model: 'sonnet' })),
    ).toMatchObject({ model: 'sonnet', mode: 'motion', motionStage: 'script' })
    expect(pushed.length).toBe(5)
    expect(pushed.at(-1)?.settings).toMatchObject({ mode: 'motion', motionStage: 'script' })

    await call(transport.request('thread.sendTurn', { threadId, text: 'Go' }))
    const refused = expect(
      transport.request('thread.setMode', { threadId, mode: null }),
    ).rejects.toThrow('Wait for the current turn')
    await vi.advanceTimersByTimeAsync(2)
    await refused
  })

  it('fails requests still waiting when it closes, like the socket transport', async () => {
    const pending = transport.request('providers.list', {})
    transport.close()
    await expect(pending).rejects.toThrow('closed')
    await expect(transport.request('providers.list', {})).rejects.toThrow('closed')
  })
})
