import { afterEach, describe, expect, it, vi } from 'vitest'
import { QUIT_ACK_MS, createQuitRequest } from './quit-request.js'

function fixture(options: { pageCanAsk?: boolean; native?: Promise<boolean> } = {}) {
  const deps = {
    chats: vi.fn(() => 2),
    show: vi.fn(),
    ask: vi.fn((_chats: number) => options.pageCanAsk !== false),
    askNatively: vi.fn((_chats: number) => options.native ?? Promise.resolve(false)),
    confirm: vi.fn(),
  }
  return { deps, request: createQuitRequest(deps) }
}

afterEach(() => vi.useRealTimers())

describe('asking before a quit while chats work', () => {
  it('brings the window forward and asks the page how many chats work', () => {
    vi.useFakeTimers()
    const { deps, request } = fixture()
    request.request()
    expect(deps.show).toHaveBeenCalledOnce()
    expect(deps.ask).toHaveBeenCalledExactlyOnceWith(2)
    expect(deps.askNatively).not.toHaveBeenCalled()
  })

  it('quits only when the page answers quit', () => {
    vi.useFakeTimers()
    const { deps, request } = fixture()
    request.request()
    request.shown()
    request.answer(true)
    expect(deps.confirm).toHaveBeenCalledOnce()
  })

  it('keeps everything running when the page answers keep working, and asks again later', () => {
    vi.useFakeTimers()
    const { deps, request } = fixture()
    request.request()
    request.shown()
    request.answer(false)
    expect(deps.confirm).not.toHaveBeenCalled()
    request.request()
    expect(deps.ask).toHaveBeenCalledTimes(2)
  })

  it('only shows the question again while it is open', () => {
    vi.useFakeTimers()
    const { deps, request } = fixture()
    request.request()
    request.request()
    expect(deps.show).toHaveBeenCalledTimes(2)
    expect(deps.ask).toHaveBeenCalledOnce()
  })

  it('asks in a native dialog when no page can show the question', async () => {
    const { deps, request } = fixture({ pageCanAsk: false, native: Promise.resolve(true) })
    request.request()
    await Promise.resolve()
    expect(deps.askNatively).toHaveBeenCalledExactlyOnceWith(2)
    await vi.waitFor(() => expect(deps.confirm).toHaveBeenCalledOnce())
  })

  it('asks natively when the page never says it shows the question', async () => {
    vi.useFakeTimers()
    const { deps, request } = fixture({ native: Promise.resolve(false) })
    request.request()
    await vi.advanceTimersByTimeAsync(QUIT_ACK_MS - 1)
    expect(deps.askNatively).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(deps.askNatively).toHaveBeenCalledOnce()
    expect(deps.confirm).not.toHaveBeenCalled()
  })

  it('does not ask natively once the page shows the question', async () => {
    vi.useFakeTimers()
    const { deps, request } = fixture()
    request.request()
    request.shown()
    await vi.advanceTimersByTimeAsync(QUIT_ACK_MS * 2)
    expect(deps.askNatively).not.toHaveBeenCalled()
  })

  it('ignores an answer nobody asked for', () => {
    const { deps, request } = fixture()
    request.answer(true)
    expect(deps.confirm).not.toHaveBeenCalled()
  })
})
