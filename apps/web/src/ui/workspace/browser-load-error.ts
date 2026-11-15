import { t } from '../../i18n/index.js'
import { isLoopbackHostname, PLAIN_HTTP_LOOPBACK_ONLY } from './browser-url.js'

export type BrowserLoadFailure = {
  /** Chromium net error code, e.g. -105. */
  code?: number | undefined
  /** Chromium net error name, e.g. ERR_NAME_NOT_RESOLVED. */
  name?: string | undefined
  url?: string | undefined
}

/** What the Browser canvas shows in place of a page that failed to load. */
export type BrowserLoadFailureView = { title: string; detail: string }

const ABORTED = -3

/**
 * The failure of a guest navigation as the canvas's error view: the host it
 * could not reach and one plain sentence about why. Undefined for a navigation
 * that was only cancelled: by Stop, by a newer navigation or by the page itself.
 */
export function browserLoadFailureView(
  failure: BrowserLoadFailure,
): BrowserLoadFailureView | undefined {
  const name = errorName(failure.name)
  if (failure.code === ABORTED || name === 'ERR_ABORTED') return undefined
  const target = parseUrl(failure.url)
  const title = target?.host
    ? t('workspace.browser.fail.titleHost', { host: target.host })
    : t('workspace.browser.fail.titlePage')
  return { title, detail: failureDetail(name, target) }
}

function failureDetail(name: string | undefined, target: URL | undefined): string {
  switch (name) {
    case 'ERR_NAME_NOT_RESOLVED':
    case 'ERR_NAME_RESOLUTION_FAILED':
      return t('workspace.browser.fail.dns')
    case 'ERR_CONNECTION_REFUSED':
      return target && isLoopbackHostname(target.hostname)
        ? t('workspace.browser.fail.noListener')
        : t('workspace.browser.fail.refused')
    case 'ERR_INTERNET_DISCONNECTED':
      return t('workspace.browser.fail.offline')
    case 'ERR_TIMED_OUT':
    case 'ERR_CONNECTION_TIMED_OUT':
      return t('workspace.browser.fail.timeout')
    case 'ERR_ADDRESS_INVALID':
    case 'ERR_ADDRESS_UNREACHABLE':
    case 'ERR_CONNECTION_FAILED':
      return t('workspace.browser.fail.connection')
    case 'ERR_CONNECTION_CLOSED':
    case 'ERR_CONNECTION_RESET':
    case 'ERR_EMPTY_RESPONSE':
      return t('workspace.browser.fail.closed')
    case 'ERR_NETWORK_CHANGED':
      return t('workspace.browser.fail.network')
    case 'ERR_INVALID_URL':
      return t('workspace.browser.fail.invalidUrl')
    case 'ERR_BLOCKED_BY_CLIENT':
    case 'ERR_BLOCKED_BY_RESPONSE':
    case 'ERR_UNSAFE_REDIRECT':
      return target?.protocol === 'http:' && !isLoopbackHostname(target.hostname)
        ? t(PLAIN_HTTP_LOOPBACK_ONLY)
        : t('workspace.browser.fail.blocked')
  }
  if (name && /SSL|CERT/.test(name)) return t('workspace.browser.fail.secure')
  return name && name !== 'ERR_FAILED'
    ? t('workspace.browser.fail.loadedWith', { name })
    : t('workspace.browser.fail.loaded')
}

/**
 * The failure behind a rejected `<webview>.loadURL()`. Electron wraps it as
 * "Error invoking remote method 'GUEST_VIEW_MANAGER_CALL': Error: ERR_NAME_NOT_RESOLVED (-105) loading '…'".
 */
export function loadRejectionFailure(cause: unknown, url: string): BrowserLoadFailure {
  const message = cause instanceof Error ? cause.message : String(cause)
  const match = /\b(ERR_[A-Z_]+)\s*\((-?\d+)\)/.exec(message)
  return match ? { name: match[1], code: Number(match[2]), url } : { url }
}

/** ERR_NAME_NOT_RESOLVED for `NAME_NOT_RESOLVED`, `net::ERR_NAME_NOT_RESOLVED` or itself. */
function errorName(value: string | undefined): string | undefined {
  const name = value
    ?.trim()
    .replace(/^net::/i, '')
    .toUpperCase()
  if (!name || !/^[A-Z_]+$/.test(name)) return undefined
  return name.startsWith('ERR_') ? name : `ERR_${name}`
}

function parseUrl(value: string | undefined): URL | undefined {
  if (!value) return undefined
  try {
    return new URL(value)
  } catch {
    return undefined
  }
}
