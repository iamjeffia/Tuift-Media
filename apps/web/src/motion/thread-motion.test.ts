// @vitest-environment happy-dom
import type { MotionStage, ThreadSettings } from '@harness/contracts'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DemoTransport } from '../sandbox/demo-transport.js'
import {
  ThreadMotionStore,
  useChatMotion,
  useThreadMotion,
  type LegacyMotionFlag,
} from './thread-motion.js'

/** Local flags by chat, standing in for the saved selections of this window. */
function legacyFlags(ids: string[] = []): LegacyMotionFlag & { ids: Set<string> } {
  const flags = new Set(ids)
  return {
    ids: flags,
    has: (id) => flags.has(id),
    clear: (id) => void flags.delete(id),
  }
}

function makeStore(options: {
  legacy?: ReturnType<typeof legacyFlags>
  setMode?: (params: {
    threadId: string
    mode: 'motion' | 'design' | null
    motionStage?: MotionStage
  }) => Promise<ThreadSettings>
}) {
  const legacy = options.legacy ?? legacyFlags()
  const setMode = vi.fn(
    options.setMode ??
      (async ({
        mode,
        motionStage,
      }: {
        threadId: string
        mode: 'motion' | 'design' | null
        motionStage?: MotionStage
      }) =>
        mode
          ? { mode, motionStage: motionStage ?? ('idea' as const) }
          : { motionStage: motionStage ?? ('idea' as const) }),
  )
  const onError = vi.fn()
  const store = new ThreadMotionStore({ setMode, legacy, onError })
  return { store, setMode, onError, legacy }
}

const entry = (store: ThreadMotionStore, id: string) => store.snapshot().get(id)

describe('ThreadMotionStore', () => {
  it('adopts the mode and stage a chat has on the server, and a push that changes them', () => {
    const { store } = makeStore({})
    expect(entry(store, 'a')).toBeUndefined()
    store.adopt('a', { model: 'm', mode: 'motion', motionStage: 'soundtrack' })
    expect(entry(store, 'a')).toEqual({ mode: 'motion', stage: 'soundtrack' })
    store.adopt('a', { model: 'm', mode: 'motion', motionStage: 'review' })
    expect(entry(store, 'a')).toEqual({ mode: 'motion', stage: 'review' })
    store.adopt('a', { model: 'm', motionStage: 'review' })
    expect(entry(store, 'a')).toEqual({ mode: undefined, stage: 'review' })
  })

  it('keeps the same snapshot when the settings say nothing new', () => {
    const { store } = makeStore({})
    store.adopt('a', { mode: 'motion', motionStage: 'idea' })
    const before = store.snapshot()
    store.adopt('a', { model: 'other', mode: 'motion', motionStage: 'idea' })
    expect(store.snapshot()).toBe(before)
  })

  it('shows the same view until the server says something about Motion', () => {
    const { store } = makeStore({})
    expect(store.view('a')).toBe('|')
    store.adopt('a', { model: 'm' })
    expect(store.view('a')).toBe('|')
    store.adopt('a', { mode: 'motion', motionStage: 'motion' })
    expect(store.view('a')).toBe('motion|motion')
    expect(store.view(undefined)).toBe('|')
  })

  it('asks the server to turn Motion on and off, and shows what the server answers', async () => {
    const { store, setMode } = makeStore({})
    store.adopt('a', { model: 'm' })
    await store.set('a', true)
    expect(setMode).toHaveBeenLastCalledWith({ threadId: 'a', mode: 'motion' })
    expect(entry(store, 'a')).toEqual({ mode: 'motion', stage: 'idea' })
    await store.set('a', false)
    expect(setMode).toHaveBeenLastCalledWith({ threadId: 'a', mode: null })
    // Off keeps the stage the server keeps.
    expect(entry(store, 'a')).toEqual({ mode: undefined, stage: 'idea' })
  })

  it('asks nothing when the chat already is as asked', async () => {
    const { store, setMode } = makeStore({})
    store.adopt('a', { model: 'm' })
    await store.set('a', false)
    store.adopt('b', { mode: 'motion' })
    await store.set('b', true)
    expect(setMode).not.toHaveBeenCalled()
  })

  it('does not ask while a turn of the chat runs, and never lies about it', async () => {
    const { store, setMode } = makeStore({})
    store.adopt('a', { mode: 'motion', motionStage: 'script' })
    store.watch('a', true)
    await store.set('a', false)
    expect(setMode).not.toHaveBeenCalled()
    expect(entry(store, 'a')).toEqual({ mode: 'motion', stage: 'script' })
  })

  it('goes back to what the server said, and says why, when the server refuses', async () => {
    const { store, onError } = makeStore({
      setMode: async () => {
        throw new Error('Wait for the current turn to finish, or stop it, before the mode changes.')
      },
    })
    store.adopt('a', { mode: 'motion', motionStage: 'script' })
    await store.set('a', false)
    expect(entry(store, 'a')).toEqual({ mode: 'motion', stage: 'script' })
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('Wait for the current turn'))
  })

  it('keeps a push that arrives while its own change is on the way', async () => {
    let answer: (settings: ThreadSettings) => void = () => undefined
    const { store } = makeStore({ setMode: () => new Promise((resolve) => (answer = resolve)) })
    store.adopt('a', { mode: 'motion', motionStage: 'idea' })
    const change = store.set('a', false)
    store.adopt('a', { mode: 'motion', motionStage: 'review' })
    answer({ mode: 'motion', motionStage: 'review' })
    await change
    expect(entry(store, 'a')).toEqual({ mode: 'motion', stage: 'review' })
  })

  describe('moving a Motion chat to another stage', () => {
    it('asks for the stage with the mode on, and shows what the server answers', async () => {
      const { store, setMode } = makeStore({})
      store.adopt('a', { mode: 'motion', motionStage: 'idea' })
      await store.setStage('a', 'soundtrack')
      expect(setMode).toHaveBeenCalledTimes(1)
      expect(setMode).toHaveBeenLastCalledWith({
        threadId: 'a',
        mode: 'motion',
        motionStage: 'soundtrack',
      })
      expect(entry(store, 'a')).toEqual({ mode: 'motion', stage: 'soundtrack' })
    })

    it('shows the server word, not its own, when the two differ', async () => {
      const { store } = makeStore({
        setMode: async () => ({ mode: 'motion', motionStage: 'review' }),
      })
      store.adopt('a', { mode: 'motion', motionStage: 'idea' })
      await store.setStage('a', 'soundtrack')
      expect(entry(store, 'a')).toEqual({ mode: 'motion', stage: 'review' })
    })

    it('asks nothing for the stage the chat is at', async () => {
      const { store, setMode } = makeStore({})
      store.adopt('a', { mode: 'motion', motionStage: 'script' })
      await store.setStage('a', 'script')
      expect(setMode).not.toHaveBeenCalled()
    })

    it('does not ask while a turn of the chat runs, and never lies about it', async () => {
      const { store, setMode } = makeStore({})
      store.adopt('a', { mode: 'motion', motionStage: 'script' })
      store.watch('a', true)
      await store.setStage('a', 'review')
      expect(setMode).not.toHaveBeenCalled()
      expect(entry(store, 'a')).toEqual({ mode: 'motion', stage: 'script' })
    })

    it('goes back to what the server said, and says why, when the server refuses', async () => {
      let refuse: (error: Error) => void = () => undefined
      const { store, onError } = makeStore({
        setMode: () => new Promise((_resolve, reject) => (refuse = reject)),
      })
      store.adopt('a', { mode: 'motion', motionStage: 'script' })
      const change = store.setStage('a', 'review')
      expect(entry(store, 'a')).toEqual({ mode: 'motion', stage: 'review' })
      refuse(new Error('Wait for the current turn to finish, or stop it, before the mode changes.'))
      await change
      expect(entry(store, 'a')).toEqual({ mode: 'motion', stage: 'script' })
      expect(onError).toHaveBeenCalledWith(expect.stringContaining('Wait for the current turn'))
    })

    it('keeps a push that arrives while its own change is on the way', async () => {
      let refuse: (error: Error) => void = () => undefined
      const { store } = makeStore({
        setMode: () => new Promise((_resolve, reject) => (refuse = reject)),
      })
      store.adopt('a', { mode: 'motion', motionStage: 'idea' })
      const change = store.setStage('a', 'review')
      store.adopt('a', { mode: 'motion', motionStage: 'delivery' })
      refuse(new Error('late'))
      await change
      expect(entry(store, 'a')).toEqual({ mode: 'motion', stage: 'delivery' })
    })

    it('hands a local Motion flag over with the choice', async () => {
      const legacy = legacyFlags(['a'])
      const { store, setMode } = makeStore({ legacy })
      store.watch('a', false)
      store.adopt('a', { model: 'm' })
      await store.setStage('a', 'narration')
      expect(setMode).toHaveBeenCalledWith({
        threadId: 'a',
        mode: 'motion',
        motionStage: 'narration',
      })
      expect(legacy.ids.has('a')).toBe(false)
    })
  })

  describe('handing a local flag to the server', () => {
    it('does it once, when the chat is open, known and idle, then drops the flag', async () => {
      const legacy = legacyFlags(['a'])
      const { store, setMode } = makeStore({ legacy })
      store.watch('a', false)
      store.adopt('a', { model: 'm' })
      await vi.waitFor(() => expect(legacy.ids.has('a')).toBe(false))
      expect(setMode).toHaveBeenCalledTimes(1)
      expect(setMode).toHaveBeenCalledWith({ threadId: 'a', mode: 'motion' })
      expect(entry(store, 'a')).toEqual({ mode: 'motion', stage: 'idea' })
      // Opened again later: nothing left to hand over.
      store.adopt('a', { model: 'm', mode: 'motion', motionStage: 'idea' })
      store.watch('a', false)
      expect(setMode).toHaveBeenCalledTimes(1)
    })

    it('waits for the turn to end', async () => {
      const legacy = legacyFlags(['a'])
      const { store, setMode } = makeStore({ legacy })
      store.watch('a', true)
      store.adopt('a', { model: 'm' })
      expect(setMode).not.toHaveBeenCalled()
      store.watch('a', false)
      await vi.waitFor(() => expect(legacy.ids.has('a')).toBe(false))
      expect(setMode).toHaveBeenCalledTimes(1)
    })

    it('waits until the chat is the one on screen', () => {
      const legacy = legacyFlags(['a'])
      const { store, setMode } = makeStore({ legacy })
      store.watch('b', false)
      store.adopt('a', { model: 'm' })
      expect(setMode).not.toHaveBeenCalled()
      expect(legacy.ids.has('a')).toBe(true)
    })

    it('lets the server win and drops the flag when the chat has a mode', () => {
      const legacy = legacyFlags(['a', 'c'])
      const { store, setMode } = makeStore({ legacy })
      store.watch('a', false)
      store.adopt('a', { model: 'm', mode: 'design' })
      expect(setMode).not.toHaveBeenCalled()
      expect(legacy.ids.has('a')).toBe(false)
      expect(entry(store, 'a')?.mode).toBe('design')
    })

    it('keeps the flag for the next opening when the server fails, and does not run twice at once', async () => {
      const legacy = legacyFlags(['a'])
      let fail = true
      const { store, setMode } = makeStore({
        legacy,
        setMode: async ({ mode }) => {
          if (fail) throw new Error('offline')
          return { mode: mode ?? undefined, motionStage: 'idea' }
        },
      })
      store.watch('a', false)
      store.adopt('a', { model: 'm' })
      store.adopt('a', { model: 'm' })
      await vi.waitFor(() => expect(setMode).toHaveBeenCalledTimes(1))
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(legacy.ids.has('a')).toBe(true)
      fail = false
      store.adopt('a', { model: 'm' })
      await vi.waitFor(() => expect(legacy.ids.has('a')).toBe(false))
      expect(setMode).toHaveBeenCalledTimes(2)
    })

    it('never asks for a chat the server was never read for', () => {
      const legacy = legacyFlags(['a'])
      const { store, setMode } = makeStore({ legacy })
      store.watch('a', false)
      expect(setMode).not.toHaveBeenCalled()
    })
  })
})

describe('Motion state against the demo server', () => {
  let transport: DemoTransport
  beforeEach(async () => {
    vi.useFakeTimers()
    transport = new DemoTransport({ latencyMs: 1 })
    transport.connect()
    await vi.advanceTimersByTimeAsync(1)
  })
  afterEach(() => {
    transport.close()
    transport.server.dispose()
    vi.useRealTimers()
  })

  const call = async <T>(request: Promise<T>): Promise<T> => {
    await vi.advanceTimersByTimeAsync(5)
    return request
  }
  const newStore = () =>
    new ThreadMotionStore({
      setMode: (params) => transport.request('thread.setMode', params),
      legacy: legacyFlags(),
      onError: () => undefined,
    })

  it('is still Motion, at its stage, for a renderer built from scratch', async () => {
    const { projects } = await call(transport.request('projects.list', {}))
    const { threadId } = await call(
      transport.request('thread.start', {
        provider: 'claude-code',
        workspacePath: projects[0]!.path,
      }),
    )
    const first = newStore()
    first.adopt(threadId, await call(transport.request('thread.settings', { threadId })))
    const turnOn = first.set(threadId, true)
    await call(turnOn)
    await call(
      transport.request('thread.setMode', { threadId, mode: 'motion', motionStage: 'soundtrack' }),
    )

    // The first renderer is gone; the server is the same.
    const restarted = newStore()
    expect(restarted.snapshot().get(threadId)).toBeUndefined()
    restarted.adopt(threadId, await call(transport.request('thread.settings', { threadId })))
    expect(restarted.snapshot().get(threadId)).toEqual({ mode: 'motion', stage: 'soundtrack' })
  })

  it('keeps the stage the person chose on the server', async () => {
    const { projects } = await call(transport.request('projects.list', {}))
    const { threadId } = await call(
      transport.request('thread.start', {
        provider: 'claude-code',
        workspacePath: projects[0]!.path,
        mode: 'motion',
      }),
    )
    const store = newStore()
    transport.on('thread.settings', (push) => store.adopt(push.threadId, push.settings))
    store.adopt(threadId, await call(transport.request('thread.settings', { threadId })))
    await call(store.setStage(threadId, 'identity'))
    expect(store.snapshot().get(threadId)).toEqual({ mode: 'motion', stage: 'identity' })
    const kept = await call(transport.request('thread.settings', { threadId }))
    expect(kept.motionStage).toBe('identity')
  })

  it('follows a change made by another client through the settings push', async () => {
    const { projects } = await call(transport.request('projects.list', {}))
    const { threadId } = await call(
      transport.request('thread.start', {
        provider: 'claude-code',
        workspacePath: projects[0]!.path,
      }),
    )
    const store = newStore()
    transport.on('thread.settings', (push) => store.adopt(push.threadId, push.settings))
    await call(transport.request('thread.setMode', { threadId, mode: 'motion' }))
    expect(store.snapshot().get(threadId)).toEqual({ mode: 'motion', stage: 'idea' })
  })
})

describe('useThreadMotion', () => {
  afterEach(cleanup)
  const request = vi.fn()
  const transport = { request } as never
  const settings = (mode?: 'motion') => ({
    model: 'm',
    ...(mode ? { mode, motionStage: 'idea' as const } : {}),
  })

  beforeEach(() => {
    request.mockReset()
    request.mockImplementation(async (_method: string, params: { mode: string | null }) =>
      settings(params.mode === 'motion' ? 'motion' : undefined),
    )
  })

  function mount(activeId: string | undefined, running = false, legacy = legacyFlags()) {
    return renderHook(
      (props: { activeId: string | undefined; running: boolean }) =>
        useThreadMotion({ transport, legacy, onError: vi.fn(), ...props }),
      { initialProps: { activeId, running } },
    )
  }

  it('keeps the toggle of a new chat in the draft, with nothing sent to the server', () => {
    const view = mount(undefined)
    expect(view.result.current.motionMode).toBe(false)
    act(() => view.result.current.setThreadMotionMode(undefined, true))
    expect(view.result.current.motionMode).toBe(true)
    expect(request).not.toHaveBeenCalled()
  })

  it('shows the mode of an existing chat from the server, and locks the toggle while it runs', () => {
    const view = mount('a')
    expect(view.result.current.motionMode).toBe(false)
    act(() => view.result.current.adoptMotion('a', { mode: 'motion', motionStage: 'review' }))
    expect(view.result.current.motionMode).toBe(true)
    expect(view.result.current.motionStage).toBe('review')
    expect(view.result.current.motionLocked).toBe(false)
    view.rerender({ activeId: 'a', running: true })
    expect(view.result.current.motionLocked).toBe(true)
  })

  it('shows a chat this window knew as Motion until the server answers', () => {
    const view = mount('a', false, legacyFlags(['a']))
    expect(view.result.current.motionMode).toBe(true)
  })

  it('turns Motion on through thread.setMode', async () => {
    const view = mount('a')
    act(() => view.result.current.adoptMotion('a', settings()))
    await act(async () => view.result.current.setThreadMotionMode('a', true))
    expect(request).toHaveBeenCalledWith('thread.setMode', { threadId: 'a', mode: 'motion' })
    expect(view.result.current.motionMode).toBe(true)
  })

  it('offers no stage change for the draft of a new chat, and one for a chat that exists', () => {
    const draft = mount(undefined)
    expect(draft.result.current.setMotionStage).toBeUndefined()
    const chat = mount('a')
    expect(chat.result.current.setMotionStage).toBeTypeOf('function')
    chat.rerender({ activeId: undefined, running: false })
    expect(chat.result.current.setMotionStage).toBeUndefined()
  })

  it('moves the chat on screen to a stage through thread.setMode, and shows the answer', async () => {
    request.mockImplementation(
      async (_method: string, params: { mode: string | null; motionStage?: MotionStage }) => ({
        model: 'm',
        mode: 'motion' as const,
        motionStage: params.motionStage ?? ('idea' as const),
      }),
    )
    const view = mount('a')
    act(() => view.result.current.adoptMotion('a', { mode: 'motion', motionStage: 'idea' }))
    const before = view.result.current.setMotionStage
    await act(async () => view.result.current.setMotionStage?.('review'))
    expect(request).toHaveBeenCalledWith('thread.setMode', {
      threadId: 'a',
      mode: 'motion',
      motionStage: 'review',
    })
    expect(view.result.current.motionStage).toBe('review')
    // A streaming reply re-renders the thread, not the scene: the callback stays the same.
    view.rerender({ activeId: 'a', running: true })
    expect(view.result.current.setMotionStage).toBe(before)
  })

  it('shows a chat just started with Motion as Motion', () => {
    const view = mount('a')
    act(() => view.result.current.seedMotion('a'))
    expect(view.result.current.motionMode).toBe(true)
    expect(view.result.current.motionStage).toBe('idea')
  })
})

describe('useChatMotion', () => {
  afterEach(cleanup)
  const store = () =>
    new ThreadMotionStore({
      setMode: async () => ({}),
      legacy: legacyFlags(),
      onError: vi.fn(),
    })

  it('shows the mode and stage the server keeps for another chat, and follows its pushes', () => {
    const motion = store()
    const view = renderHook(() => useChatMotion(motion, 'beside', false))
    expect(view.result.current).toEqual({ mode: false, stage: undefined })
    act(() => motion.adopt('beside', { mode: 'motion', motionStage: 'soundtrack' }))
    expect(view.result.current).toEqual({ mode: true, stage: 'soundtrack' })
    act(() => motion.adopt('beside', { mode: 'motion', motionStage: 'review' }))
    expect(view.result.current).toEqual({ mode: true, stage: 'review' })
    act(() => motion.adopt('beside', { motionStage: 'review' }))
    expect(view.result.current).toEqual({ mode: false, stage: 'review' })
  })

  it('keeps what the pane showed until the server has been asked about the chat', () => {
    const motion = store()
    const view = renderHook(() => useChatMotion(motion, 'beside', true))
    expect(view.result.current).toEqual({ mode: true, stage: undefined })
    act(() => motion.adopt('beside', { model: 'm' }))
    expect(view.result.current).toEqual({ mode: false, stage: undefined })
    const draft = renderHook(() => useChatMotion(motion, undefined, true))
    expect(draft.result.current.mode).toBe(true)
  })

  it('does not re-render for settings that say nothing new about Motion', () => {
    const motion = store()
    let renders = 0
    renderHook(() => {
      renders += 1
      return useChatMotion(motion, 'beside', false)
    })
    act(() => motion.adopt('beside', { mode: 'motion', motionStage: 'idea' }))
    const settled = renders
    act(() => motion.adopt('beside', { model: 'other', mode: 'motion', motionStage: 'idea' }))
    act(() => motion.adopt('elsewhere', { mode: 'motion', motionStage: 'review' }))
    expect(renders).toBe(settled)
  })
})
