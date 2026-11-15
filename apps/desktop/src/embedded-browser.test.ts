import type { Event, WebContents, WebPreferences } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import {
  browserGuestUrl,
  browserUserAgent,
  configureEmbeddedBrowser,
  setAgentDrivenGuest,
} from './embedded-browser.js'

describe('embedded browser guest', () => {
  it('accepts HTTPS pages, loopback HTTP and a blank bootstrap document', () => {
    expect(browserGuestUrl('http://127.0.0.1:4311/preview')).toBe('http://127.0.0.1:4311/preview')
    expect(browserGuestUrl('http://127.38.0.1:5173/')).toBe('http://127.38.0.1:5173/')
    expect(browserGuestUrl('http://localhost:5173/')).toBe('http://localhost:5173/')
    expect(browserGuestUrl('http://app.localhost:5173/')).toBe('http://app.localhost:5173/')
    expect(browserGuestUrl('http://[::1]:5173/')).toBe('http://[::1]:5173/')
    expect(browserGuestUrl('https://example.com/')).toBe('https://example.com/')
    // The URL parser normalizes exotic spellings before the policy sees them.
    expect(browserGuestUrl('http://2130706433/')).toBe('http://2130706433/')
    expect(browserGuestUrl('http://0x7f.0.0.1/')).toBe('http://0x7f.0.0.1/')
    expect(() => browserGuestUrl('file:///etc/passwd')).toThrow('Invalid browser URL')
    expect(() => browserGuestUrl('javascript:alert(1)')).toThrow('Invalid browser URL')
  })

  it('rejects plain HTTP off the host machine', () => {
    // Cloud metadata endpoints, LAN services and WAN sites share one answer.
    expect(() => browserGuestUrl('http://169.254.169.254/latest/meta-data')).toThrow(
      'Invalid browser URL',
    )
    expect(() => browserGuestUrl('http://169.254.169.254./')).toThrow('Invalid browser URL')
    expect(() => browserGuestUrl('http://2852039166/')).toThrow('Invalid browser URL')
    expect(() => browserGuestUrl('http://192.168.1.1/')).toThrow('Invalid browser URL')
    expect(() => browserGuestUrl('http://10.0.0.1/')).toThrow('Invalid browser URL')
    expect(() => browserGuestUrl('http://100.64.0.1/')).toThrow('Invalid browser URL')
    expect(() => browserGuestUrl('http://example.com/')).toThrow('Invalid browser URL')
    expect(() => browserGuestUrl('http://[fe80::1]/')).toThrow('Invalid browser URL')
    expect(() => browserGuestUrl('http://[::ffff:a9fe:a9fe]/')).toThrow('Invalid browser URL')
    expect(() => browserGuestUrl('http://127.0.0.1.evil.example/')).toThrow('Invalid browser URL')
    expect(() => browserGuestUrl('http://localhost.evil.example/')).toThrow('Invalid browser URL')
  })

  it('strips Electron product markers without damaging the Chromium user agent', () => {
    expect(
      browserUserAgent(
        'Mozilla/5.0 Chrome/150.0.0.0 Safari/537.36 Electron/43.4.0 TUIFT Code/1.0.0',
      ),
    ).toBe('Mozilla/5.0 Chrome/150.0.0.0 Safari/537.36')
  })

  it('hardens guests before attachment and rejects privileged bootstrap URLs', () => {
    const owner = ownerHarness()
    configureEmbeddedBrowser(owner.contents)
    const willAttach = owner.listener('will-attach-webview')
    const event = { preventDefault: vi.fn() }
    const preferences = {
      allowRunningInsecureContent: true,
      backgroundThrottling: false,
      nodeIntegration: true,
      preload: '/tmp/untrusted.cjs',
      sandbox: false,
      webSecurity: false,
    }

    willAttach(event, preferences, { src: 'file:///private/data' })

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(preferences).toMatchObject({
      allowRunningInsecureContent: false,
      backgroundThrottling: true,
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'persist:harness-browser',
      sandbox: true,
      webSecurity: true,
    })
    expect(preferences).not.toHaveProperty('preload')
  })

  it('denies permissions and keeps new-window links inside the guest', async () => {
    const owner = ownerHarness()
    configureEmbeddedBrowser(owner.contents)
    const session = {
      webRequest: { onBeforeRequest: vi.fn() },
      setPermissionCheckHandler: vi.fn(),
      setPermissionRequestHandler: vi.fn(),
      on: vi.fn(),
    }
    const guest = {
      getUserAgent: vi.fn(() => 'Mozilla/5.0 Chrome/150 Safari/537.36 Electron/43.4.0'),
      loadURL: vi.fn(async () => undefined),
      on: vi.fn(),
      session,
      setUserAgent: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    }

    owner.listener('did-attach-webview')({}, guest)

    expect(session.setPermissionCheckHandler).toHaveBeenCalledOnce()
    expect(session.setPermissionRequestHandler).toHaveBeenCalledOnce()
    expect(guest.setUserAgent).toHaveBeenCalledWith('Mozilla/5.0 Chrome/150 Safari/537.36')

    // A tab an agent drives downloads nothing; the user's own tabs are unchanged.
    const willDownload = session.on.mock.calls.find(([name]) => name === 'will-download')![1] as (
      event: { preventDefault: () => void },
      item: unknown,
      contents: { id: number },
    ) => void
    const download = (id: number) => {
      const event = { preventDefault: vi.fn() }
      willDownload(event, {}, { id })
      return event.preventDefault
    }
    setAgentDrivenGuest(7, true)
    expect(download(7)).toHaveBeenCalledOnce()
    expect(download(8)).not.toHaveBeenCalled()
    setAgentDrivenGuest(7, false)
    expect(download(7)).not.toHaveBeenCalled()

    const openWindow = guest.setWindowOpenHandler.mock.calls[0]![0]
    expect(openWindow({ url: 'https://example.com/next' })).toEqual({ action: 'deny' })
    await vi.waitFor(() => expect(guest.loadURL).toHaveBeenCalledWith('https://example.com/next'))
    expect(openWindow({ url: 'file:///etc/passwd' })).toEqual({ action: 'deny' })
    expect(guest.loadURL).toHaveBeenCalledOnce()
  })

  it('denies guest navigation to non-loopback HTTP at every hook', () => {
    const owner = ownerHarness()
    configureEmbeddedBrowser(owner.contents)

    const event = { preventDefault: vi.fn() }
    owner.listener('will-attach-webview')(event, {}, { src: 'http://169.254.169.254/' })
    expect(event.preventDefault).toHaveBeenCalledOnce()

    const guestListeners = new Map<string, (...args: any[]) => void>()
    const guest = {
      getUserAgent: vi.fn(() => ''),
      loadURL: vi.fn(async () => undefined),
      on: vi.fn((name: string, listener: (...args: any[]) => void) =>
        guestListeners.set(name, listener),
      ),
      session: {
        webRequest: { onBeforeRequest: vi.fn() },
        setPermissionCheckHandler: vi.fn(),
        setPermissionRequestHandler: vi.fn(),
        on: vi.fn(),
      },
      setUserAgent: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      stop: vi.fn(),
    }
    owner.listener('did-attach-webview')({}, guest)

    const willNavigate = guestListeners.get('will-navigate')
    willNavigate?.(event, 'http://169.254.169.254/latest/meta-data')
    willNavigate?.(event, 'https://example.com/')
    willNavigate?.(event, 'http://127.0.0.1:4311/preview')
    expect(event.preventDefault).toHaveBeenCalledTimes(2)

    const beforeRequest = guest.session.webRequest.onBeforeRequest.mock.calls[0]![0]
    for (const [url, cancel] of [
      ['http://example.invalid/', true],
      ['file:///private/data', true],
      ['https://example.com/', false],
      ['http://127.0.0.1:4311/preview', false],
      ['about:blank', false],
    ] as const) {
      const callback = vi.fn()
      beforeRequest({ resourceType: 'mainFrame', url }, callback)
      expect(callback).toHaveBeenCalledWith({ cancel })
    }
    const subresource = vi.fn()
    beforeRequest({ resourceType: 'image', url: 'https://example.com/image.png' }, subresource)
    expect(subresource).toHaveBeenCalledWith({ cancel: false })
    expect(guestListeners.has('did-start-navigation')).toBe(false)
  })

  it('gives a signed PDF its own partition and still refuses every other non-web source', () => {
    const owner = ownerHarness()
    const pdfSession = {}
    configureEmbeddedBrowser(owner.contents, {
      session: pdfSession as never,
      isPdfUrl: (url) => url === 'tastecode-attachment://file/sig/path',
      openExternal: vi.fn(),
    })
    const willAttach = owner.listener('will-attach-webview')

    const preferences = { preload: '/tmp/untrusted.cjs', sandbox: false }
    const params = {
      src: 'tastecode-attachment://file/sig/path',
      partition: 'persist:harness-browser',
    }
    const event = { preventDefault: vi.fn() }
    willAttach(event, preferences, params)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(params['partition']).toBe('persist:harness-pdf')
    expect(preferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'persist:harness-pdf',
      plugins: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    })
    expect(preferences).not.toHaveProperty('preload')

    // Any other source, even one on the same scheme, is refused and stays on the browser rules.
    for (const src of [
      'tastecode-attachment://file/sig/other',
      'tastecode-attachment://preview/sig/path',
      'file:///private/data',
    ]) {
      const refused = { preventDefault: vi.fn() }
      const other = { src, partition: 'persist:harness-pdf' }
      willAttach(refused, {}, other)
      expect(refused.preventDefault).toHaveBeenCalledOnce()
      expect(other['partition']).toBe('persist:harness-browser')
    }
  })

  it('locks a guest attached to the PDF session and leaves a browser guest on its own rules', () => {
    const owner = ownerHarness()
    const fakeSession = () => ({
      webRequest: { onBeforeRequest: vi.fn() },
      setPermissionCheckHandler: vi.fn(),
      setPermissionRequestHandler: vi.fn(),
      on: vi.fn(),
    })
    const fakeGuest = (session: ReturnType<typeof fakeSession>) => ({
      session,
      getUserAgent: vi.fn(() => ''),
      on: vi.fn(),
      setUserAgent: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    })
    const pdfSession = fakeSession()
    configureEmbeddedBrowser(owner.contents, {
      session: pdfSession as never,
      isPdfUrl: () => true,
      openExternal: vi.fn(),
    })

    const pdfGuest = fakeGuest(pdfSession)
    owner.listener('did-attach-webview')({}, pdfGuest)
    expect(pdfSession.webRequest.onBeforeRequest).toHaveBeenCalledOnce()
    expect(pdfGuest.setWindowOpenHandler).toHaveBeenCalledOnce()
    // Not the browser's setup: no user agent rewrite, no unload on a non-web address.
    expect(pdfGuest.setUserAgent).not.toHaveBeenCalled()
    expect(pdfGuest.on.mock.calls.map(([name]) => name)).not.toContain('did-navigate')

    const browserGuest = fakeGuest(fakeSession())
    owner.listener('did-attach-webview')({}, browserGuest)
    expect(browserGuest.setUserAgent).toHaveBeenCalledOnce()
    expect(browserGuest.on.mock.calls.map(([name]) => name)).toContain('did-navigate')
  })

  it.each([
    { contentType: 'application/x-www-form-urlencoded', boundary: undefined },
    { contentType: 'multipart/form-data', boundary: '----chromium-form-boundary' },
  ])('preserves target=_blank POST data and $contentType headers', ({ contentType, boundary }) => {
    const owner = ownerHarness()
    configureEmbeddedBrowser(owner.contents)
    const guest = {
      getUserAgent: () => '',
      setUserAgent: vi.fn(),
      on: vi.fn(),
      loadURL: vi.fn(async () => undefined),
      setWindowOpenHandler: vi.fn(),
      session: {
        webRequest: { onBeforeRequest: vi.fn() },
        setPermissionCheckHandler: vi.fn(),
        setPermissionRequestHandler: vi.fn(),
        on: vi.fn(),
      },
    }
    owner.listener('did-attach-webview')({}, guest)
    const open = guest.setWindowOpenHandler.mock.calls[0]![0]
    const data = [{ type: 'rawData', bytes: Buffer.from('name=value') }]
    const referrer = { url: 'https://example.com/form', policy: 'strict-origin-when-cross-origin' }
    expect(
      open({
        url: 'https://example.com/submit',
        postBody: { data, contentType, boundary },
        referrer,
      }),
    ).toEqual({ action: 'deny' })
    expect(guest.loadURL).toHaveBeenCalledWith('https://example.com/submit', {
      postData: data,
      httpReferrer: referrer,
      extraHeaders: `Content-Type: ${contentType}${boundary ? `; boundary=${boundary}` : ''}`,
    })
    open({ url: 'file:///private/data', postBody: { data, contentType }, referrer })
    expect(guest.loadURL).toHaveBeenCalledOnce()
  })
})

function ownerHarness() {
  const listeners = new Map<string, (...args: never[]) => void>()
  function on(
    event: 'will-attach-webview',
    listener: (
      event: Event,
      webPreferences: WebPreferences,
      params: Record<string, string>,
    ) => void,
  ): void
  function on(
    event: 'did-attach-webview',
    listener: (event: Event, webContents: WebContents) => void,
  ): void
  function on(event: string, listener: (...args: never[]) => void): void {
    listeners.set(event, listener)
  }
  return {
    contents: {
      on: vi.fn(on),
    },
    listener(event: string): (...args: any[]) => void {
      const listener = listeners.get(event)
      if (!listener) throw new Error(`Missing ${event} listener`)
      return listener
    },
  }
}
