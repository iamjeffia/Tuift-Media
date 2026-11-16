import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HIDDEN_UNLOAD_MS, HiddenWindowUnloader } from './hidden-window-unload.js'
import { createQuitRequest } from './quit-request.js'
import { ServerActivity } from './server-activity.js'
import { POWER_REPORT_GRACE_MS, TurnPowerGuard } from './turn-power.js'

/** The three consumers wired the way main.ts wires them, with no page anywhere. */
function fixture(options: { windowExists?: boolean } = {}) {
  let running = 0
  let next = 1
  const blocker = { start: vi.fn(() => next++), stop: vi.fn<(id: number) => void>() }
  const power = new TurnPowerGuard(blocker)
  const state = { windowExists: options.windowExists ?? false }
  const unloader = new HiddenWindowUnloader({
    mayUnload: () => state.windowExists && running === 0,
    pageIsSafe: async () => true,
    unload: vi.fn(() => {
      state.windowExists = false
    }),
  })
  const activity = new ServerActivity((count) => {
    running = count
    power.report(count)
    unloader.agentsChanged(count)
  })
  const deps = {
    chats: vi.fn(() => running),
    show: vi.fn(),
    // No window: nothing can show the question.
    ask: vi.fn((_chats: number) => state.windowExists),
    askNatively: vi.fn((_chats: number) => Promise.resolve(false)),
    confirm: vi.fn(),
  }
  const quit = createQuitRequest(deps)
  return { activity, power, blocker, unloader, quit, deps, state, running: () => running }
}

describe('what the server reports, with no page', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('keeps the computer awake from a turn started on the phone, and lets go when it ends', () => {
    const { activity, power, blocker } = fixture()
    activity.report(1)
    expect(power.holding).toBe(true)
    activity.report(2)
    expect(blocker.start).toHaveBeenCalledOnce()
    activity.report(0)
    expect(blocker.stop).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('asks before a quit, natively, when no window exists', () => {
    const { activity, quit, deps } = fixture()
    activity.report(2)
    quit.request()
    expect(deps.ask).toHaveBeenCalledExactlyOnceWith(2)
    expect(deps.askNatively).toHaveBeenCalledExactlyOnceWith(2)
  })

  it('does not unload a hidden window while a chat runs, and starts the wait when it ends', async () => {
    const { activity, unloader, state } = fixture({ windowExists: true })
    unloader.hidden()
    activity.report(1)
    await vi.advanceTimersByTimeAsync(HIDDEN_UNLOAD_MS * 3)
    expect(state.windowExists).toBe(true)
    activity.report(0)
    await vi.advanceTimersByTimeAsync(HIDDEN_UNLOAD_MS - 1)
    expect(state.windowExists).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(state.windowExists).toBe(false)
  })

  it('keeps a window that was recreated during a turn loaded until the server reports zero', async () => {
    const { activity, unloader, state } = fixture({ windowExists: false })
    // A turn starts with the window unloaded; then the person opens the window and hides it again.
    activity.report(1)
    state.windowExists = true
    unloader.shown()
    unloader.hidden()
    await vi.advanceTimersByTimeAsync(HIDDEN_UNLOAD_MS * 4)
    expect(state.windowExists).toBe(true)
    activity.report(0)
    await vi.advanceTimersByTimeAsync(HIDDEN_UNLOAD_MS)
    expect(state.windowExists).toBe(false)
  })

  it('does not restart the unload wait for a report that changes nothing about the count', async () => {
    const { activity, unloader, state } = fixture({ windowExists: true })
    unloader.hidden()
    await vi.advanceTimersByTimeAsync(HIDDEN_UNLOAD_MS - 1000)
    // A chat failed, or was renamed: the server reports again, still zero running.
    activity.report(0)
    activity.report(0)
    await vi.advanceTimersByTimeAsync(1000)
    expect(state.windowExists).toBe(false)
  })

  it('replaces a stale count with the first report of a restarted server', () => {
    const { activity, power, running } = fixture()
    activity.report(3)
    activity.serverGone()
    // Meanwhile it errs towards something runs.
    vi.advanceTimersByTime(POWER_REPORT_GRACE_MS - 1)
    expect(running()).toBe(3)
    expect(power.holding).toBe(true)
    // The new server was back in time and says nothing runs.
    activity.report(0)
    expect(running()).toBe(0)
    expect(power.holding).toBe(false)
    vi.advanceTimersByTime(POWER_REPORT_GRACE_MS * 2)
    expect(running()).toBe(0)
  })

  it('does not keep a count for ever for a server that never comes back', () => {
    const { activity, power, running } = fixture()
    activity.report(2)
    activity.serverGone()
    activity.serverGone()
    vi.advanceTimersByTime(POWER_REPORT_GRACE_MS)
    expect(running()).toBe(0)
    expect(power.holding).toBe(false)
  })

  it('a restarted server that is busy again keeps the hold', () => {
    const { activity, power, blocker } = fixture()
    activity.report(1)
    activity.serverGone()
    activity.report(1)
    vi.advanceTimersByTime(POWER_REPORT_GRACE_MS * 2)
    expect(power.holding).toBe(true)
    expect(blocker.start).toHaveBeenCalledOnce()
  })

  it('has nothing to count down for a server that ended with nothing running', () => {
    const { activity } = fixture()
    activity.serverGone()
    expect(vi.getTimerCount()).toBe(0)
  })
})
