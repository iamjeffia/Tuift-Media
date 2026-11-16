import { EventEmitter } from 'node:events'
import type { WebContents } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { translate } from './i18n.js'
import {
  configureRendererLifecycle,
  MAX_RECENT_RELOADS,
  RENDERER_HEALTHY_MS,
} from './renderer-lifecycle.js'

function fixture() {
  const contents = Object.assign(new EventEmitter(), {
    reload: vi.fn(),
    isDestroyed: vi.fn(() => false),
  })
  const options = {
    cancelCaptures: vi.fn(),
    onPageReplaced: vi.fn(),
    isQuitting: vi.fn(() => false),
    onRepeatedCrash: vi.fn(),
    onReload: vi.fn(),
  }
  const lifecycle = configureRendererLifecycle(contents as unknown as WebContents, options)
  const crash = (reason = 'crashed') => contents.emit('render-process-gone', {}, { reason })
  return { contents, crash, lifecycle, ...options }
}

describe('renderer lifecycle', () => {
  it('recovers a crashed renderer without restarting the server, up to a streak limit', () => {
    const test = fixture()
    for (let attempt = 1; attempt <= MAX_RECENT_RELOADS; attempt++) test.crash()
    expect(test.contents.reload).toHaveBeenCalledTimes(MAX_RECENT_RELOADS)
    expect(test.onRepeatedCrash).not.toHaveBeenCalled()
    test.crash()
    expect(test.contents.reload).toHaveBeenCalledTimes(MAX_RECENT_RELOADS)
    expect(test.onRepeatedCrash).toHaveBeenCalledOnce()
    expect(test.cancelCaptures).toHaveBeenCalledTimes(MAX_RECENT_RELOADS + 1)
  })

  it('still reloads once when Electron gives no details', () => {
    const test = fixture()
    test.contents.emit('render-process-gone')
    expect(test.contents.reload).toHaveBeenCalledOnce()
    expect(test.onReload).toHaveBeenCalledWith({ reason: 'unknown', attempt: 1, resumeChat: true })
  })

  describe('reload budget', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('returns to zero after the page has been healthy for a while', () => {
      const test = fixture()
      for (let attempt = 1; attempt <= MAX_RECENT_RELOADS; attempt++) {
        test.crash()
        test.contents.emit('did-navigate')
      }
      vi.advanceTimersByTime(RENDERER_HEALTHY_MS - 1)
      test.crash()
      expect(test.onRepeatedCrash).toHaveBeenCalledOnce()

      test.contents.emit('did-navigate')
      vi.advanceTimersByTime(RENDERER_HEALTHY_MS)
      test.crash()
      expect(test.onRepeatedCrash).toHaveBeenCalledOnce()
      expect(test.contents.reload).toHaveBeenCalledTimes(MAX_RECENT_RELOADS + 1)
      expect(test.onReload).toHaveBeenLastCalledWith({
        reason: 'crashed',
        attempt: 1,
        resumeChat: true,
      })
    })

    it('does not count a healthy stretch that a crash cut short', () => {
      const test = fixture()
      test.crash()
      test.contents.emit('did-navigate')
      vi.advanceTimersByTime(RENDERER_HEALTHY_MS - 1)
      test.crash()
      expect(test.onReload).toHaveBeenLastCalledWith(expect.objectContaining({ attempt: 2 }))
      vi.advanceTimersByTime(RENDERER_HEALTHY_MS)
      test.crash()
      expect(test.onReload).toHaveBeenLastCalledWith(expect.objectContaining({ attempt: 3 }))
    })

    it('starts over when the person reloads after the notice', () => {
      const test = fixture()
      for (let attempt = 0; attempt <= MAX_RECENT_RELOADS; attempt++) test.crash()
      expect(test.onRepeatedCrash).toHaveBeenCalledOnce()
      test.lifecycle.resetBudget()
      test.crash()
      expect(test.onRepeatedCrash).toHaveBeenCalledOnce()
      expect(test.onReload).toHaveBeenLastCalledWith(expect.objectContaining({ attempt: 1 }))
    })

    it('keeps no timer, so a page that is never destroyed leaves nothing running', () => {
      const test = fixture()
      test.contents.emit('did-navigate')
      expect(vi.getTimerCount()).toBe(0)
    })
  })

  it('reopens the chat only after a first crash that was not out of memory', () => {
    const test = fixture()
    test.crash('oom')
    expect(test.onReload).toHaveBeenLastCalledWith({ reason: 'oom', attempt: 1, resumeChat: false })
    test.crash('crashed')
    expect(test.onReload).toHaveBeenLastCalledWith({
      reason: 'crashed',
      attempt: 2,
      resumeChat: false,
    })
    const fresh = fixture()
    for (const reason of ['killed', 'launch-failed']) {
      fresh.lifecycle.resetBudget()
      fresh.crash(reason)
      expect(fresh.onReload).toHaveBeenLastCalledWith({ reason, attempt: 1, resumeChat: true })
    }
  })

  it('tells the shell about the reload before it happens', () => {
    const test = fixture()
    const order: string[] = []
    test.onReload.mockImplementation(() => order.push('onReload'))
    test.contents.reload.mockImplementation(() => order.push('reload'))
    test.crash('oom')
    expect(order).toEqual(['onReload', 'reload'])
  })

  it('cancels captures on a committed page load and destruction but not hash or iframe navigation', () => {
    const test = fixture()
    test.contents.emit('did-navigate-in-page', {}, 'file:///app/index.html#settings', true)
    test.contents.emit('did-frame-navigate', {}, 'https://example.com/', 200, 'OK', false)
    expect(test.cancelCaptures).not.toHaveBeenCalled()
    test.contents.emit('did-navigate', {}, 'file:///app/index.html', 200, 'OK')
    expect(test.cancelCaptures).toHaveBeenCalledOnce()
    expect(test.onPageReplaced).toHaveBeenCalledOnce()
    test.contents.emit('destroyed')
    expect(test.cancelCaptures).toHaveBeenCalledTimes(2)
  })

  it('keeps the page state when a started navigation is blocked before it commits', () => {
    const test = fixture()
    // Electron emits did-start-navigation before will-navigate can cancel a
    // same-window link, so the old page is still loaded and listening.
    test.contents.emit('did-start-navigation', {
      url: 'file:///C:/api/users',
      isMainFrame: true,
      isSameDocument: false,
    })
    expect(test.cancelCaptures).not.toHaveBeenCalled()
    expect(test.onPageReplaced).not.toHaveBeenCalled()
  })

  it('never revives a renderer during quit', () => {
    const test = fixture()
    test.isQuitting.mockReturnValue(true)
    test.crash()
    expect(test.contents.reload).not.toHaveBeenCalled()
    expect(test.onReload).not.toHaveBeenCalled()
    expect(test.cancelCaptures).toHaveBeenCalledOnce()
  })
})

describe('renderer recovery notice', () => {
  it('says in both languages why the chat was not reopened', () => {
    expect(translate('pt-BR', 'lifecycle.chatNotReopenedOom')).toBe(
      'Chat não reaberto: a janela ficou sem memória.',
    )
    expect(translate('en', 'lifecycle.chatNotReopenedOom')).toBe(
      'The chat was not reopened because the window ran out of memory.',
    )
  })
})
