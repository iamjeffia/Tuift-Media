import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from './sqlite.js'

/**
 * The error SQLite really raises: a database capped in size for a full disk, and a second
 * connection holding the file for a lock. Tests throw these instead of a made-up message.
 */
export function realSqliteError(kind: 'full' | 'locked'): Error {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'harness-sqlite-error-'))
  const first = new DatabaseSync(path.join(dir, 'probe.db'))
  try {
    first.exec('CREATE TABLE t (x TEXT)')
    if (kind === 'full') {
      first.exec('PRAGMA max_page_count = 3')
      for (let index = 0; index < 1_000; index += 1)
        first.prepare('INSERT INTO t VALUES (?)').run('x'.repeat(2_000))
    } else {
      const holder = new DatabaseSync(path.join(dir, 'probe.db'))
      try {
        holder.exec('BEGIN EXCLUSIVE')
        first.exec('BEGIN IMMEDIATE')
      } finally {
        holder.close()
      }
    }
  } catch (error) {
    return error as Error
  } finally {
    first.close()
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  }
  throw new Error(`SQLite did not raise a ${kind} error`)
}
