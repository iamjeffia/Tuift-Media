import { copyFileSync, existsSync, renameSync, rmSync, statSync } from 'node:fs'
import type { StartupNotice } from '@harness/contracts'
import { backupDirectory, freeBytes, listBackups, timestampName } from './database-backup.js'
import { canonicalDataPath } from './data-lease.js'
import { isDamagedDatabaseError, startupCause, StartupFailure } from './exit-codes.js'
import { DatabaseSync } from './sqlite.js'
import type { StartupNotices } from './startup-notice.js'
import { Store } from './store.js'

const SIDE_FILES = ['', '-wal', '-shm'] as const

function openOnce(location: string): Store {
  const database = new DatabaseSync(location)
  try {
    return new Store(location, { database, deferDerivedIndexes: true })
  } catch (error) {
    // A handle left open would keep Windows from moving the file.
    try {
      database.close()
    } catch {}
    throw error
  }
}

/** The database and its write-ahead log and shared memory, moved to dated names in the same folder. */
export function setAside(location: string, at: number): string {
  const suffix = `.damaged-${timestampName(at)}`
  const moved: Array<[string, string]> = []
  try {
    for (const side of SIDE_FILES) {
      const from = `${location}${side}`
      if (!existsSync(from)) continue
      const to = `${location}${suffix}${side}`
      renameSync(from, to)
      moved.push([from, to])
    }
  } catch (error) {
    // Half moved is worse than not moved: put back what was taken.
    for (const [from, to] of moved.reverse()) {
      try {
        renameSync(to, from)
      } catch {}
    }
    throw error
  }
  return `${location}${suffix}`
}

function removeDatabaseFiles(location: string): void {
  for (const side of SIDE_FILES) rmSync(`${location}${side}`, { force: true })
}

/** A backup is used only if SQLite itself finds it whole: a full check, which is worth its seconds here. */
function verifyBackup(file: string): void {
  const database = new DatabaseSync(file, { readOnly: true })
  try {
    const row = database.prepare('PRAGMA quick_check(1)').get() as
      { quick_check?: string } | undefined
    if (row?.quick_check !== 'ok') throw new Error(`Backup failed its check: ${row?.quick_check}`)
  } finally {
    database.close()
  }
}

/**
 * Opens the store. A damaged database (not a busy one, not a permission or disk problem: only
 * a file SQLite says is not a database or is malformed) is moved aside with its log files and
 * replaced by the newest backup that opens, or by an empty database. Nothing is deleted, and
 * `notices` is told what happened before anything else can fail, so a restart never hides it.
 * Any other failure is thrown with the file untouched.
 */
export function openStoreWithRecovery(
  databasePath: string,
  notices: StartupNotices,
  now: () => number = Date.now,
): Store {
  if (databasePath === ':memory:') return new Store(databasePath, { deferDerivedIndexes: true })
  const location = canonicalDataPath(databasePath)
  try {
    return openOnce(location)
  } catch (error) {
    if (!isDamagedDatabaseError(error)) throw error
    return recoverDamagedDatabase(location, error, notices, now)
  }
}

function recoverDamagedDatabase(
  location: string,
  cause: unknown,
  notices: StartupNotices,
  now: () => number,
): Store {
  const backups = listBackups(backupDirectory(location))
  // Before anything moves: with no room for the newest copy the restore cannot finish, and a
  // database set aside for nothing would look like lost history.
  const newest = backups[0]
  if (newest && freeBytes(backupDirectory(location)) < statSync(newest.file).size)
    throw new StartupFailure(
      'diskFull',
      'There is not enough free disk space to restore a backup.',
      {
        cause,
      },
    )
  const at = now()
  let asidePath: string
  try {
    asidePath = setAside(location, at)
  } catch (error) {
    throw new StartupFailure(
      startupCause(error) ?? 'databaseDamaged',
      `The damaged database could not be set aside: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
  console.error(`[server] the database is damaged; it was set aside as ${asidePath}`)
  const notice = (backupAt: number | null): StartupNotice => ({
    kind: 'database.restored',
    at,
    backupAt,
    asidePath,
  })
  // Said first as "started empty": if the restore below fails, the next start must still tell.
  notices.write(notice(null))
  for (const backup of backups) {
    try {
      verifyBackup(backup.file)
      const partial = `${location}.restoring`
      rmSync(partial, { force: true })
      copyFileSync(backup.file, partial)
      renameSync(partial, location)
      const store = openOnce(location)
      console.error(`[server] restored the backup of ${new Date(backup.at).toISOString()}`)
      try {
        notices.write(notice(backup.at))
      } catch {
        // The notice already says the app started from a copy or empty; this only dates the copy.
      }
      return store
    } catch (error) {
      // Only the copy made for this attempt goes; the backup it came from stays.
      console.error(
        `[server] the backup ${backup.file} could not be used: ${error instanceof Error ? error.message : String(error)}`,
      )
      removeDatabaseFiles(location)
      rmSync(`${location}.restoring`, { force: true })
    }
  }
  try {
    console.error('[server] no backup opened; starting with an empty database')
    return openOnce(location)
  } catch (error) {
    throw new StartupFailure(
      startupCause(error) ?? 'databaseDamaged',
      `A new database could not be created: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
}
