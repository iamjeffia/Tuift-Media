import { MAX_USER_MESSAGE_CHARS } from '@harness/contracts'
import { formatNumber, t, translate, getLanguage, type MessageVars } from './i18n/index.js'
import { ServerError } from './transport.js'

/** A text length as the person counts it: `300 KB`, rounded up so a size over the limit never reads as equal to it. */
export function formatTextSize(chars: number): string {
  const kb = chars / 1024
  if (kb < 1024) return `${formatNumber(Math.ceil(kb * 10) / 10, { maximumFractionDigits: 1 })} KB`
  return `${formatNumber(Math.ceil((kb / 1024) * 10) / 10, { maximumFractionDigits: 1 })} MB`
}

/** The prompt box's line for a text over the ceiling: the size, the limit, and what to do. */
export function userMessageTooLongText(size: number, limit = MAX_USER_MESSAGE_CHARS): string {
  return t('chat.send.tooLong', { size: formatTextSize(size), limit: formatTextSize(limit) })
}

/**
 * What to show for an error a call rejected with. A refusal the server also named in the app's
 * catalog is said in the reader's language; anything else keeps the server's own words.
 */
export function serverErrorText(error: unknown): string {
  if (error instanceof ServerError && error.key === 'chat.send.tooLong' && error.params) {
    const { size, limit } = error.params
    if (typeof size === 'number' && typeof limit === 'number')
      return userMessageTooLongText(size, limit)
  }
  if (error instanceof ServerError && error.key) {
    const vars: MessageVars = error.params ?? {}
    const text = translate(getLanguage(), error.key, vars)
    if (text !== error.key) return text
  }
  return error instanceof Error ? error.message : String(error)
}
