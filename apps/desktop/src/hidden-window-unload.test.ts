import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  HIDDEN_UNLOAD_MS,
  HiddenWindowUnloader,
  parseActiveChatId,
  UNLOAD_PROBE_TIMEOUT_MS,
  UnloadProbe,
} from './hidden-window-unload.js'

function fixture(state: { may?: boolean; safe?: boolean } = {}) {
  const host = {
    may: state.may ?? true,
    safe: state.safe ?? true,
    mayUnload: vi.fn(() => host.may),
    pageIsSafe: vi.fn(async () => host.safe),
    unload: vi.fn(),
  }
  return { unloader: new HiddenWindowUnloader(host), host }
}

describe('hidden window unload', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('unloads a window that stayed hidden long enough with nothing to lose', async () => {
    const { unloader, host } = fixture()
    unloader.hidden()
    await vi.advanceTimersByTimeAsync(HIDDEN_UNLOAD_MS - 1)
    expect(host.unload).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(host.pageIsSafe).toHaveBeenCalledOnce()
    expect(host.unload).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does nothing when the window is shown again before the timer', async () => {
    const { unloader, host } = fixture()
    unloader.hidden()
    await vi.advanceTimersByTimeAsync(HIDDEN_UNLOAD_MS - 1000)
    unloader.shown()
    await vi.advanceTimersByTimeAsync(HIDDEN_UNLOAD_MS * 2)
    expect(host.mayUnload).not.toHaveBeenCalled()
    expect(host.unload).not.toHaveBeenCalled()
  })

  it('does not unload while a chat works, and waits again from the moment it ends', async () => {
    const { unloader, host } = fixture({ may: false })
    unloader.hidden()
    unloader.agentsChanged(2)
    await vi.advanceTimersByTimeAsync(HIDDEN_UNLOAD_MS * 3)
    expect(host.unload).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    host.may = true
    unloader.agentsChanged(0)
    await vi.advanceTimersByTimeAsync(HIDDEN_UNLOAD_MS - 1)
    expect(host.unload).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(host.unload).toHaveBeenCalledOnce()
  })

  it('keeps the window while the page holds something that would be lost, and asks again later', async () => {
    const { unloader, host } = fixture({ safe: false })
    unloader.hidden()
    await vi.advanceTimersByTimeAsync(HIDDEN_UNLOAD_MS)
    expect(host.pageIsSafe).toHaveBeenCalledTimes(1)
    expect(host.unload).not.toHaveBeenCalled()
    host.safe = true
    await vi.advanceTimersByTimeAsync(HIDDEN_UNLOAD_MS)
    expect(host.pageIsSafe).toHaveBeenCalledTimes(2)
    expect(host.unload).toHaveBeenCalledOnce()
  })

  it('keeps the window when the page cannot answer', async () => {
    const { unloader, host } = fixture()
    host.pageIsSafe.mockRejectedValue(new Error('gone'))
    unloader.hidden()
    await vi.advanceTimersByTimeAsync(HIDDEN_UNLOAD_MS)
    expect(host.unload).not.toHaveBeenCalled()
  })

  it('drops the unload when the window is shown or a chat starts while the page is asked', async () => {
    const { unloader, host } = fixture()
    let answer: (safe: boolean) => void = () => {}
    host.pageIsSafe.mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    unloader.hidden()
    await vi.advanceTimersByTimeAsync(HIDDEN_UNLOAD_MS)
    unloader.shown()
    answer(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(host.unload).not.toHaveBeenCalled()

    unloader.hidden()
    await vi.advanceTimersByTimeAsync(HIDDEN_UNLOAD_MS)
    host.may = false
    answer(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(host.unload).not.toHaveBeenCalled()
  })

  it('clears its timer on quit', async () => {
    const { unloader, host } = fixture()
    unloader.hidden()
    unloader.dispose()
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(HIDDEN_UNLOAD_MS * 2)
    expect(host.unload).not.toHaveBeenCalled()
  })

  it('ignores a chat count while the window is visible', () => {
    const { unloader } = fixture()
    unloader.agentsChanged(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('unload probe', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('resolves with the page answer for the matching question only', async () => {
    const probe = new UnloadProbe()
    let asked = 0
    const result = probe.ask((id) => (asked = id))
    probe.answer(asked + 1, true)
    probe.answer('x', true)
    probe.answer(asked, true)
    await expect(result).resolves.toBe(true)
  })

  it('counts a missing, late or non-true answer as not safe', async () => {
    const probe = new UnloadProbe()
    const silent = probe.ask(() => {})
    await vi.advanceTimersByTimeAsync(UNLOAD_PROBE_TIMEOUT_MS)
    await expect(silent).resolves.toBe(false)
    let asked = 0
    const sloppy = probe.ask((id) => (asked = id))
    probe.answer(asked, 'yes')
    await expect(sloppy).resolves.toBe(false)
    await expect(
      probe.ask(() => {
        throw new Error('window gone')
      }),
    ).resolves.toBe(false)
  })
})

describe('active chat id', () => {
  it('accepts a chat id and turns anything else into none', () => {
    expect(parseActiveChatId('chat-1')).toBe('chat-1')
    expect(parseActiveChatId('')).toBeUndefined()
    expect(parseActiveChatId(null)).toBeUndefined()
    expect(parseActiveChatId('x'.repeat(257))).toBeUndefined()
    expect(parseActiveChatId(12)).toBeUndefined()
  })
})
