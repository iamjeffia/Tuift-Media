import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQuitWatchdog, QUIT_DEADLINES, QUIT_FORCED_EXIT } from './quit-watchdog.js'

afterEach(() => vi.useRealTimers())

function fixture(totalMs?: number) {
  vi.useFakeTimers()
  const log = vi.fn()
  const exit = vi.fn()
  const forced = vi.fn()
  const watchdog = createQuitWatchdog({ log, exit, forced, ...(totalMs ? { totalMs } : {}) })
  return { watchdog, log, exit, forced }
}

describe('a step of the quit', () => {
  it('ends when its work ends, with no log line', async () => {
    const { watchdog, log } = fixture()
    const done = vi.fn()
    void watchdog.step('server shutdown', 1_000, () => Promise.resolve()).then(done)
    await vi.advanceTimersByTimeAsync(0)
    expect(done).toHaveBeenCalledOnce()
    expect(log).not.toHaveBeenCalled()
  })

  it('is left behind, and logged, when it is late; the next step still runs', async () => {
    const { watchdog, log } = fixture()
    const order: string[] = []
    const first = watchdog
      .step('update cleanup', 3_000, () => new Promise(() => {}))
      .then(() => order.push('first'))
    await vi.advanceTimersByTimeAsync(2_999)
    expect(order).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    await first
    expect(order).toEqual(['first'])
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('update cleanup did not close in 3000'),
    )
    await watchdog.step('server shutdown', 1_000, () => order.push('second'))
    expect(order).toEqual(['first', 'second'])
    expect(watchdog.finish()).toEqual(['update cleanup'])
  })

  it.each([
    [
      'throws',
      () => {
        throw new Error('detach failed')
      },
    ],
    ['rejects', () => Promise.reject(new Error('detach failed'))],
  ])('counts as ended, and is logged, when it %s', async (_name, work) => {
    const { watchdog, log } = fixture()
    await watchdog.step('update cleanup', 3_000, work)
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('update cleanup failed: detach failed'),
    )
    expect(watchdog.finish()).toEqual([])
  })
})

describe('the clock of the whole quit', () => {
  it('does nothing until it starts, and starts only once', async () => {
    const { watchdog, exit } = fixture(1_000)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(exit).not.toHaveBeenCalled()
    expect(watchdog.started).toBe(false)
    watchdog.start()
    await vi.advanceTimersByTimeAsync(600)
    watchdog.start()
    await vi.advanceTimersByTimeAsync(399)
    expect(exit).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(exit).toHaveBeenCalledExactlyOnceWith(QUIT_FORCED_EXIT)
  })

  it('says what did not close, tells who waits, and exits with its own code', async () => {
    const { watchdog, log, exit, forced } = fixture(1_000)
    watchdog.start()
    void watchdog.step('server shutdown', 5_000, () => new Promise(() => {}))
    await vi.advanceTimersByTimeAsync(1_000)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('still open: server shutdown'))
    expect(forced).toHaveBeenCalledExactlyOnceWith(['server shutdown'])
    expect(exit).toHaveBeenCalledExactlyOnceWith(QUIT_FORCED_EXIT)
  })

  it('says the windows when every step closed but the quit still did not end', async () => {
    const { watchdog, log, exit } = fixture(1_000)
    watchdog.start()
    await watchdog.step('server shutdown', 5_000, () => {})
    await vi.advanceTimersByTimeAsync(1_000)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('closing the windows'))
    expect(exit).toHaveBeenCalledOnce()
  })

  it('stops when the quit ends in time', async () => {
    const { watchdog, exit } = fixture(1_000)
    watchdog.start()
    expect(watchdog.finish()).toEqual([])
    await vi.advanceTimersByTimeAsync(10_000)
    expect(exit).not.toHaveBeenCalled()
  })

  it('keeps the steps inside the whole', () => {
    // The server's own limit plus the update cleanup must fit in the total, or a slow step could
    // only ever be cut short by the exit.
    expect(QUIT_DEADLINES.updateCleanupMs + QUIT_DEADLINES.serverMs).toBeLessThan(
      QUIT_DEADLINES.totalMs,
    )
  })
})
