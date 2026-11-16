/**
 * The exit codes the core server ends with when it cannot start, one per cause it can name.
 * The desktop supervisor reads them to say what happened instead of retrying blindly.
 *
 * The desktop mirrors this table in `apps/desktop/src/server-exit-codes.ts` (it cannot import
 * the server without starting it) and a test there keeps both sides equal: change both.
 *
 * 1 stays the code of an unnamed failure. The values avoid 2 (usage), 126 to 165 (shell and
 * signal exits) and the large Windows crash codes.
 */
export const SERVER_EXIT = {
  /** Another copy of the app, or another program, holds the port. */
  portInUse: 71,
  /** Another copy of the app holds the data folder (see data-lease.ts). */
  dataFolderInUse: 72,
  /** The database is busy: another process has it locked. It is not damaged. */
  databaseLocked: 73,
  /** The database is damaged and could not be set aside and replaced. */
  databaseDamaged: 74,
  /** The database or its folder cannot be opened or written: permission, read-only. */
  databaseNoAccess: 75,
  /** The disk is full. */
  diskFull: 76,
} as const

export type ServerExitCause = keyof typeof SERVER_EXIT

/** A startup failure whose cause the server can name. */
export class StartupFailure extends Error {
  readonly startupCause: ServerExitCause

  constructor(startupCause: ServerExitCause, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'StartupFailure'
    this.startupCause = startupCause
  }
}

// SQLite result codes; an extended code carries the primary one in its low byte.
const SQLITE_BUSY = 5
const SQLITE_LOCKED = 6
const SQLITE_PERM = 3
const SQLITE_READONLY = 8
const SQLITE_FULL = 13
const SQLITE_CANTOPEN = 14
const SQLITE_CORRUPT = 11
const SQLITE_NOTADB = 26

/** The primary SQLite result code of an error from `node:sqlite`, if it is one. */
export function sqliteErrorCode(error: unknown): number | undefined {
  if (!(error instanceof Error) || !('errcode' in error)) return undefined
  return typeof error.errcode === 'number' ? error.errcode & 0xff : undefined
}

/**
 * True only for a database that is damaged: the file is not a database, or its pages do not
 * add up. A busy or locked database, a permission error and a full disk are not damage, and
 * the file must never be set aside for them.
 */
export function isDamagedDatabaseError(error: unknown): boolean {
  const code = sqliteErrorCode(error)
  return code === SQLITE_CORRUPT || code === SQLITE_NOTADB
}

/** The cause a startup error names, or undefined when it names none. */
export function startupCause(error: unknown): ServerExitCause | undefined {
  if (error instanceof StartupFailure) return error.startupCause
  const code = sqliteErrorCode(error)
  if (code === SQLITE_BUSY || code === SQLITE_LOCKED) return 'databaseLocked'
  if (code === SQLITE_CORRUPT || code === SQLITE_NOTADB) return 'databaseDamaged'
  if (code === SQLITE_FULL) return 'diskFull'
  if (code === SQLITE_PERM || code === SQLITE_READONLY || code === SQLITE_CANTOPEN)
    return 'databaseNoAccess'
  const fs = error instanceof Error && 'code' in error ? error.code : undefined
  if (fs === 'ENOSPC') return 'diskFull'
  if (fs === 'EACCES' || fs === 'EPERM' || fs === 'EROFS') return 'databaseNoAccess'
  if (fs === 'EBUSY') return 'databaseLocked'
  return undefined
}
