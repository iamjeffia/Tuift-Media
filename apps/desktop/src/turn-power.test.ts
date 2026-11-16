import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POWER_REPORT_GRACE_MS, TurnPowerGuard } from './turn-power.js'

function fixture() {
  let next = 1
  const blocker = {
    start: vi.fn(() => next++),
    stop: vi.fn<(id: number) => void>(),
  }
  return { guard: new TurnPowerGuard(blocker), blocker }
}

describe('turn power guard', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('holds the system awake while a chat runs and lets go at zero', () => {
    const { guard, blocker } = fixture()
    guard.report(0)
    expect(blocker.start).not.toHaveBeenCalled()
    guard.report(1)
    guard.report(3)
    expect(blocker.start).toHaveBeenCalledOnce()
    expect(guard.holding).toBe(true)
    guard.report(0)
    expect(blocker.stop).toHaveBeenCalledExactlyOnceWith(1)
    expect(guard.holding).toBe(false)
    guard.report(0)
    expect(blocker.stop).toHaveBeenCalledOnce()
  })

  it('holds a new blocker for the next turn', () => {
    const { guard, blocker } = fixture()
    guard.report(1)
    guard.report(0)
    guard.report(2)
    expect(blocker.start).toHaveBeenCalledTimes(2)
    expect(guard.holding).toBe(true)
  })

  it('keeps the last count while a replaced page loads, and trusts its first report', () => {
    const { guard, blocker } = fixture()
    guard.report(1)
    guard.pageGone()
    vi.advanceTimersByTime(POWER_REPORT_GRACE_MS - 1)
    expect(guard.holding).toBe(true)
    guard.report(1)
    vi.advanceTimersByTime(POWER_REPORT_GRACE_MS * 2)
    expect(guard.holding).toBe(true)
    expect(blocker.start).toHaveBeenCalledOnce()
  })

  it('lets go when the page never reports again, so the PC is not kept awake for ever', () => {
    const { guard, blocker } = fixture()
    guard.report(2)
    guard.pageGone()
    guard.pageGone()
    vi.advanceTimersByTime(POWER_REPORT_GRACE_MS)
    expect(blocker.stop).toHaveBeenCalledExactlyOnceWith(1)
    expect(guard.holding).toBe(false)
    guard.report(1)
    expect(blocker.start).toHaveBeenCalledTimes(2)
  })

  it('does nothing for a page that goes away while nothing is held', () => {
    const { guard, blocker } = fixture()
    guard.pageGone()
    vi.advanceTimersByTime(POWER_REPORT_GRACE_MS * 2)
    expect(blocker.start).not.toHaveBeenCalled()
    expect(blocker.stop).not.toHaveBeenCalled()
  })

  it('releases on quit and leaves no timer behind', () => {
    const { guard, blocker } = fixture()
    guard.report(1)
    guard.pageGone()
    guard.dispose()
    expect(blocker.stop).toHaveBeenCalledExactlyOnceWith(1)
    expect(vi.getTimerCount()).toBe(0)
    guard.dispose()
    expect(blocker.stop).toHaveBeenCalledOnce()
  })
})
