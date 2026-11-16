import type { ThreadErrorReason } from '@harness/contracts'

/**
 * What a failed write while a turn is recorded means for the person: the disk is full, another
 * program holds the conversation file, or something else went wrong. The first two are named
 * because the person can fix them; a lock may also pass by itself.
 */
export type WriteFailureKind = 'disk_full' | 'locked' | 'other'

const SQLITE_BUSY = 5
const SQLITE_LOCKED = 6
const SQLITE_FULL = 13

type ErrorFacts = { errcode?: number; code?: string; text: string }

/** What an error carries: node:sqlite sets `errcode` (possibly extended), the OS sets `code`. */
function facts(error: unknown): ErrorFacts {
  if (typeof error !== 'object' || error === null) return { text: String(error) }
  const { errcode, code } = error as { errcode?: unknown; code?: unknown }
  const message = error instanceof Error ? error.message : ''
  return {
    ...(typeof errcode === 'number' ? { errcode } : {}),
    ...(typeof code === 'string' ? { code } : {}),
    text: message,
  }
}

export function classifyWriteFailure(error: unknown): WriteFailureKind {
  const { errcode, code, text } = facts(error)
  // The low byte of an extended SQLite result code is the primary one.
  const primary = errcode === undefined ? undefined : errcode & 0xff
  if (primary === SQLITE_FULL || code === 'ENOSPC' || code === 'EDQUOT') return 'disk_full'
  if (
    primary === SQLITE_BUSY ||
    primary === SQLITE_LOCKED ||
    code === 'EBUSY' ||
    code === 'EPERM' ||
    code === 'EACCES'
  )
    return 'locked'
  // A wrapper that kept only the words.
  if (/database or disk is full|no space left/i.test(text)) return 'disk_full'
  if (/database is locked|database table is locked/i.test(text)) return 'locked'
  return 'other'
}

export function writeFailureReason(kind: WriteFailureKind): ThreadErrorReason {
  return {
    code:
      kind === 'disk_full' ? 'save_disk_full' : kind === 'locked' ? 'save_locked' : 'save_failed',
  }
}

/** The English line stored with the event, for the transcript and the logs. */
export function writeFailureMessage(kind: WriteFailureKind): string {
  const kept = 'The agent was stopped. What was saved before this point is kept.'
  if (kind === 'disk_full') return `This turn could not be saved because the disk is full. ${kept}`
  if (kind === 'locked')
    return `This turn could not be saved because another program is using the conversation file. ${kept}`
  return `This turn could not be saved. ${kept}`
}

/** One line for the server's log: what failed and why, never what the conversation said. */
export function describeFailure(error: unknown): string {
  const { errcode, code, text: said } = facts(error)
  // Only an error's own words are logged: any other value may be text from the conversation.
  const text = error instanceof Error ? said : ''
  const detail = [code, errcode === undefined ? undefined : `sqlite ${errcode}`]
    .filter(Boolean)
    .join(', ')
  const firstLine = text.split(/\r?\n/u, 1)[0]?.slice(0, 160) ?? ''
  return detail ? `${firstLine} (${detail})` : firstLine
}

/**
 * Pauses for a few milliseconds on the calling thread. A recorded event has to be written before
 * it is sent, so the retry below cannot wait on a timer.
 */
function pause(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** Delays before each retry of a locked write: 20 + 60 + 120 ms, about 0.2 s at most. */
export const LOCK_RETRY_DELAYS_MS = [20, 60, 120] as const

/**
 * Runs a write once; when it fails because the file is locked, again after each delay of
 * `LOCK_RETRY_DELAYS_MS`. A full disk or any other failure is not retried: it would not pass
 * in a fraction of a second, and it would hold up every other chat meanwhile.
 *
 * The wait blocks this thread, which is why it is that short: an antivirus scan or a backup
 * tool usually lets go in a few milliseconds, and a lock that outlasts this ends the turn
 * with a notice instead of freezing the server for everyone.
 */
export function retryLockedWrite<T>(write: () => T, sleep: (ms: number) => void = pause): T {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return write()
    } catch (error) {
      const delay = LOCK_RETRY_DELAYS_MS[attempt]
      if (delay === undefined || classifyWriteFailure(error) !== 'locked') throw error
      sleep(delay)
    }
  }
}
