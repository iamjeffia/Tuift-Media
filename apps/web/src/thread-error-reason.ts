import type { ThreadErrorReason } from '@harness/contracts'
import { formatNumber, t, type MessageKey } from './i18n/index.js'

const MESSAGES = {
  process_memory: 'chat.crash.memoryLikely',
  process_signal: 'chat.crash.signal',
  process_provider_error: 'chat.crash.providerError',
  process_unknown: 'chat.crash.unknown',
  app_closed: 'chat.crash.appClosed',
  save_disk_full: 'chat.crash.saveDiskFull',
  save_locked: 'chat.crash.saveLocked',
  save_failed: 'chat.crash.saveFailed',
  auth_failed: 'chat.crash.authFailed',
  auth_no_access: 'chat.crash.authNoAccess',
} as const satisfies Record<ThreadErrorReason['code'], MessageKey>

/** The provider refused the login: the way forward is to sign in, not only to try again. */
export function isLoginFailure(reason: ThreadErrorReason | undefined): boolean {
  return reason?.code === 'auth_failed' || reason?.code === 'auth_no_access'
}

/** A Windows status is read in hex; the number the platform gave stays beside it. */
function exitCodeText(code: number): string {
  const text = code >= 0x80000000 ? `0x${code.toString(16).toUpperCase()} (${code})` : String(code)
  return t('chat.crash.exitCode', { code: text })
}

/**
 * What the notice says about an error the server could explain: a plain sentence that says what
 * happened and what was kept, and a muted line of technical details for support. The headline
 * never carries a raw exit code.
 */
export function threadErrorNotice(reason: ThreadErrorReason, provider: string) {
  const key =
    reason.code === 'process_memory' && reason.certainty === 'certain'
      ? 'chat.crash.memoryCertain'
      : MESSAGES[reason.code]
  const details = [
    reason.exitCode === undefined ? undefined : exitCodeText(reason.exitCode),
    reason.signal === undefined ? undefined : t('chat.crash.signalName', { signal: reason.signal }),
    reason.message,
  ].filter((part): part is string => part !== undefined && part !== '')
  return {
    message: t(key, { provider }),
    detail:
      details.length > 0 ? t('chat.crash.details', { details: details.join(' · ') }) : undefined,
  }
}

const GIB = 1024 ** 3

/** The low memory warning: names the biggest programs when the server knew them. */
export function lowMemoryMessage(
  consumers: ReadonlyArray<{ name: string; bytes: number }> = [],
): string {
  if (consumers.length === 0) return t('chat.memory.low')
  const programs = consumers
    .slice(0, 3)
    .map((consumer) =>
      t('chat.memory.consumer', {
        name: consumer.name,
        size: formatNumber(consumer.bytes / GIB, { maximumFractionDigits: 1 }),
      }),
    )
    .join(', ')
  return t('chat.memory.lowNamed', { programs })
}
