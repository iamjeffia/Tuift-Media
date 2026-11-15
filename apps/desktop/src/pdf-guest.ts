import type { Session, WebContents } from 'electron'

/**
 * The Files tab shows a PDF with Chromium's own PDF viewer, in a `<webview>` guest.
 *
 * Why a guest and not an `<iframe>`: the viewer cannot run inside a sandboxed iframe (Chromium
 * refuses), and an unsandboxed frame needs `frame-src` in the window's CSP, which widens the
 * rule that keeps every document but the app's own out of the renderer. A guest runs in its own
 * process and session, never sees the preload bridge and needs no CSP change.
 *
 * Why its own persistent partition: the PDF viewer extension is only installed in the default
 * session and in `persist:` partitions (an in-memory partition loads the viewer shell and leaves
 * it dead, checked on Electron 43). The browser tab's partition cannot be shared because it
 * cancels any main-frame request that is not a web page, and this guest loads a signed file URL.
 *
 * What the guest may load: one signed project-file URL for a `.pdf`, nothing else, in its main
 * frame. Links inside the PDF leave for the user's browser; nothing navigates inside the guest.
 */
export const PDF_PARTITION = 'persist:harness-pdf'

export interface PdfGuestPolicy {
  /** The session behind {@link PDF_PARTITION}, which marks a guest as a PDF guest once attached. */
  session: Session
  /** True for a URL the desktop signed for a project PDF. */
  isPdfUrl(url: string): boolean
  /** Hands a web link clicked inside a PDF to the user's browser. */
  openExternal(url: string): void
}

const configuredSessions = new WeakSet<Session>()

function mayLoad(policy: PdfGuestPolicy, url: string): boolean {
  return url === 'about:blank' || policy.isPdfUrl(url)
}

function isWebLink(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

/** Locks the PDF session and the guest that was just attached to it. */
export function configurePdfGuest(guest: WebContents, policy: PdfGuestPolicy): void {
  const pdfSession = guest.session
  if (!configuredSessions.has(pdfSession)) {
    configuredSessions.add(pdfSession)
    // Programmatic loads skip will-navigate, so the request API is the gate (see the browser
    // guest: cancelling inside did-start-navigation can crash Chromium).
    pdfSession.webRequest.onBeforeRequest((details, callback) => {
      // The session serves signed PDFs and the viewer's own extension; it never needs the web.
      callback({
        cancel:
          isWebLink(details.url) ||
          (details.resourceType === 'mainFrame' && !mayLoad(policy, details.url)),
      })
    })
    pdfSession.setPermissionCheckHandler(() => false)
    pdfSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  }

  guest.setWindowOpenHandler(({ url }) => {
    if (isWebLink(url)) policy.openExternal(url)
    return { action: 'deny' }
  })
  const keepInside = (event: { preventDefault: () => void }, url: string) => {
    if (mayLoad(policy, url)) return
    event.preventDefault()
    if (isWebLink(url)) policy.openExternal(url)
  }
  guest.on('will-navigate', keepInside)
  guest.on('will-redirect', keepInside)
}
