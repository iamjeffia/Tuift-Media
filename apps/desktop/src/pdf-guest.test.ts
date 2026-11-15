import { describe, expect, it, vi } from 'vitest'
import { PDF_PARTITION, configurePdfGuest, type PdfGuestPolicy } from './pdf-guest.js'

const SIGNED = 'tastecode-attachment://file/sig/path'

function setup() {
  const session = {
    webRequest: { onBeforeRequest: vi.fn() },
    setPermissionCheckHandler: vi.fn(),
    setPermissionRequestHandler: vi.fn(),
  }
  const listeners = new Map<string, (...args: any[]) => void>()
  const guest = {
    session,
    on: vi.fn((name: string, listener: (...args: any[]) => void) => listeners.set(name, listener)),
    setWindowOpenHandler: vi.fn(),
  }
  const policy: PdfGuestPolicy = {
    session: session as never,
    isPdfUrl: (url) => url === SIGNED,
    openExternal: vi.fn(),
  }
  configurePdfGuest(guest as never, policy)
  return { session, guest, listeners, policy }
}

describe('PDF guest', () => {
  it('uses a persistent partition, which is where the PDF viewer extension lives', () => {
    expect(PDF_PARTITION).toBe('persist:harness-pdf')
  })

  it('cancels every main-frame request but the signed PDF and a blank bootstrap document', () => {
    const { session } = setup()
    const beforeRequest = session.webRequest.onBeforeRequest.mock.calls[0]![0]
    for (const [resourceType, url, cancel] of [
      ['mainFrame', SIGNED, false],
      ['mainFrame', 'about:blank', false],
      ['mainFrame', 'https://example.com/', true],
      ['mainFrame', 'http://127.0.0.1:4311/', true],
      ['mainFrame', 'file:///C:/Users/someone/secret.pdf', true],
      ['mainFrame', 'tastecode-attachment://file/sig/other', true],
      // The viewer's own extension frames and fetches are not main-frame requests.
      ['subFrame', 'chrome-extension://viewer/index.html', false],
      ['xhr', 'chrome-extension://viewer/data', false],
      // A PDF has no business on the network, whatever kind of request it is.
      ['xhr', 'https://example.com/collect', true],
      ['image', 'http://example.com/pixel.png', true],
      ['subFrame', 'https://example.com/', true],
    ] as const) {
      const callback = vi.fn()
      beforeRequest({ resourceType, url }, callback)
      expect(callback, `${resourceType} ${url}`).toHaveBeenCalledWith({ cancel })
    }
  })

  it('denies every permission request and check', () => {
    const { session } = setup()
    expect(session.setPermissionCheckHandler.mock.calls[0]![0]()).toBe(false)
    const callback = vi.fn()
    session.setPermissionRequestHandler.mock.calls[0]![0]({}, 'geolocation', callback)
    expect(callback).toHaveBeenCalledWith(false)
  })

  it('never opens a window; a web link goes to the system browser, anything else nowhere', () => {
    const { guest, policy } = setup()
    const openWindow = guest.setWindowOpenHandler.mock.calls[0]![0]
    expect(openWindow({ url: 'https://example.com/docs' })).toEqual({ action: 'deny' })
    expect(policy.openExternal).toHaveBeenCalledWith('https://example.com/docs')
    expect(openWindow({ url: 'file:///C:/Windows/System32/calc.exe' })).toEqual({ action: 'deny' })
    expect(openWindow({ url: 'javascript:alert(1)' })).toEqual({ action: 'deny' })
    expect(policy.openExternal).toHaveBeenCalledOnce()
  })

  it('does not let the guest navigate, on any hook', () => {
    const { listeners, policy } = setup()
    for (const hook of ['will-navigate', 'will-redirect']) {
      const navigate = listeners.get(hook)!
      const stays = { preventDefault: vi.fn() }
      navigate(stays, SIGNED)
      expect(stays.preventDefault).not.toHaveBeenCalled()

      const leaves = { preventDefault: vi.fn() }
      navigate(leaves, 'https://example.com/next')
      expect(leaves.preventDefault).toHaveBeenCalledOnce()

      const local = { preventDefault: vi.fn() }
      navigate(local, 'file:///C:/private')
      expect(local.preventDefault).toHaveBeenCalledOnce()
    }
    // Only the web link was handed over, once per hook.
    expect(policy.openExternal).toHaveBeenCalledTimes(2)
  })

  it('locks a session once however many guests attach to it', () => {
    const { session, guest, policy } = setup()
    configurePdfGuest(guest as never, policy)
    expect(session.webRequest.onBeforeRequest).toHaveBeenCalledOnce()
    expect(session.setPermissionCheckHandler).toHaveBeenCalledOnce()
  })
})
