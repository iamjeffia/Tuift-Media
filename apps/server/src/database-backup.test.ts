import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  backupDirectory,
  backupFileName,
  backupIfDue,
  copyDatabaseInWorker,
  KEEP_BACKUPS,
  listBackups,
} from './database-backup.js'
import { DatabaseSync } from './sqlite.js'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

const DAY = 24 * 60 * 60 * 1000
const START = Date.UTC(2026, 10, 1, 12, 0, 0)

function folder() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'harness-backup-'))
  dirs.push(dir)
  const database = path.join(dir, 'tastecode.db')
  writeFileSync(database, 'not a real database: the copy is faked')
  return { dir, database, backups: backupDirectory(database) }
}

const fakeCopy = async (_source: string, destination: string) => {
  writeFileSync(destination, 'copy')
}
const names = (dir: string) => readdirSync(dir).sort()

describe('daily backup', () => {
  it('writes one, skips while the newest is under a day old, and keeps the two newest', async () => {
    const { database, backups } = folder()
    const options = (now: number) => ({
      database,
      now: () => now,
      copy: fakeCopy,
      freeSpace: () => 1e12,
    })
    expect(await backupIfDue(options(START))).toMatchObject({ status: 'written' })
    expect(await backupIfDue(options(START + DAY / 2))).toEqual({
      status: 'skipped',
      reason: 'recent',
    })
    for (let day = 1; day <= 3; day++)
      expect(await backupIfDue(options(START + day * DAY))).toMatchObject({ status: 'written' })
    expect(names(backups)).toEqual(
      [backupFileName(START + 2 * DAY), backupFileName(START + 3 * DAY)].sort(),
    )
    expect(listBackups(backups)).toHaveLength(KEEP_BACKUPS)
    expect(listBackups(backups)[0]!.at).toBe(START + 3 * DAY)
  })

  it('a failed copy removes only its own file and keeps the good backups', async () => {
    const { database, backups } = folder()
    const good = { database, copy: fakeCopy, freeSpace: () => 1e12 }
    await backupIfDue({ ...good, now: () => START })
    await backupIfDue({ ...good, now: () => START + DAY })
    const before = names(backups)
    const result = await backupIfDue({
      ...good,
      now: () => START + 2 * DAY,
      copy: async (_source, destination) => {
        writeFileSync(destination, 'half')
        throw new Error('the disk went away')
      },
    })
    expect(result.status).toBe('failed')
    expect(names(backups)).toEqual(before)
  })

  it('skips when the disk has less room than the copy needs, and writes nothing', async () => {
    const { database, backups } = folder()
    const result = await backupIfDue({
      database,
      now: () => START,
      copy: fakeCopy,
      freeSpace: () => 10,
    })
    expect(result).toEqual({ status: 'skipped', reason: 'low-disk' })
    expect(existsSync(backups) ? names(backups) : []).toEqual([])
  })

  it('ignores files in the folder that are not its backups', async () => {
    const { database, backups } = folder()
    mkdirSync(backups, { recursive: true })
    writeFileSync(path.join(backups, 'notes.txt'), 'mine')
    await backupIfDue({ database, now: () => START, copy: fakeCopy, freeSpace: () => 1e12 })
    await backupIfDue({ database, now: () => START + DAY, copy: fakeCopy, freeSpace: () => 1e12 })
    await backupIfDue({
      database,
      now: () => START + 2 * DAY,
      copy: fakeCopy,
      freeSpace: () => 1e12,
    })
    expect(names(backups)).toContain('notes.txt')
  })

  it('makes a real copy of a WAL database on a worker thread', async () => {
    const { dir } = folder()
    const source = path.join(dir, 'real.db')
    const live = new DatabaseSync(source)
    live.exec('PRAGMA journal_mode = WAL; CREATE TABLE t (n INTEGER); INSERT INTO t VALUES (7)')
    const destination = path.join(dir, 'copy.db')
    await copyDatabaseInWorker(source, destination)
    live.close()
    const copy = new DatabaseSync(destination)
    expect(copy.prepare('SELECT n FROM t').get()).toMatchObject({ n: 7 })
    copy.close()
  })
})
