import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { DomainEvent } from '@harness/contracts'
import { backupDirectory, backupFileName } from './database-backup.js'
import { openStoreWithRecovery, setAside } from './database-recovery.js'
import { DatabaseSync } from './sqlite.js'
import { StartupNotices } from './startup-notice.js'
import { readAttachmentImage } from './uploaded-attachment.js'
import { Store } from './store.js'

const dirs: string[] = []
const open: Store[] = []
afterEach(() => {
  for (const store of open.splice(0)) {
    try {
      store.close()
    } catch {}
  }
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

const message = (text: string): DomainEvent => ({
  type: 'item.completed',
  item: {
    id: `i-${text}`,
    turnId: 't1',
    type: 'message',
    role: 'assistant',
    status: 'completed',
    text,
    createdAt: 0,
    attachments: ['C:/gone/pasted-files/missing.png'],
  },
})

const BACKUP_AT = Date.UTC(2026, 10, 1, 9, 30, 0)

function folder() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'harness-recovery-'))
  dirs.push(dir)
  const database = path.join(dir, 'tastecode.db')
  return { dir, database, notices: new StartupNotices(database) }
}

/** A database with one chat, and a copy of it as the backup of BACKUP_AT. */
function withBackup(database: string, text: string, newer?: string) {
  const store = new Store(database)
  store.addProject('/repo')
  store.addThread({ id: 'one', projectPath: '/repo', provider: 'codex', title: 'One' })
  store.append('one', message(text))
  store.close()
  mkdirSync(backupDirectory(database), { recursive: true })
  const copy = new DatabaseSync(database)
  copy.prepare('VACUUM INTO ?').run(path.join(backupDirectory(database), backupFileName(BACKUP_AT)))
  copy.close()
  if (newer) {
    const later = new Store(database)
    later.append('one', message(newer))
    later.close()
  }
}

const garbage = (file: string) =>
  writeFileSync(file, Buffer.from('this is not a database '.repeat(400)))
const searchable = (store: Store, word: string) =>
  store.searchSessions({ query: word }).results.length

describe('opening a damaged database', () => {
  it('sets it aside with its log files and restores the newest backup that opens', () => {
    const { dir, database, notices } = folder()
    withBackup(database, 'older words', 'newer words')
    garbage(database)

    const store = openStoreWithRecovery(database, notices, () => Date.UTC(2026, 10, 2, 8, 0, 0))
    open.push(store)
    expect(store.thread('one')?.title).toBe('One')
    // The restored copy has the older words, not the newer ones written after it.
    expect(searchable(store, 'older')).toBe(1)
    expect(searchable(store, 'newer')).toBe(0)
    const aside = readdirSync(dir).filter((name) => name.includes('.damaged-'))
    expect(aside).toEqual(['tastecode.db.damaged-20261102-080000'])
    // Nothing deleted: the garbage is still there, byte for byte, and the backup stays.
    expect(readFileSync(path.join(dir, aside[0]!), 'utf8')).toContain('this is not a database')
    expect(readdirSync(backupDirectory(database))).toHaveLength(1)
    expect(notices.current()).toEqual({
      kind: 'database.restored',
      at: Date.UTC(2026, 10, 2, 8, 0, 0),
      backupAt: BACKUP_AT,
      asidePath: path.join(dir, 'tastecode.db.damaged-20261102-080000'),
    })
  })

  it('starts empty, deleting nothing, when there is no backup', () => {
    const { dir, database, notices } = folder()
    garbage(database)
    const store = openStoreWithRecovery(database, notices)
    open.push(store)
    expect(store.projects()).toEqual([])
    expect(readdirSync(dir).some((name) => name.includes('.damaged-'))).toBe(true)
    expect(notices.current()).toMatchObject({ backupAt: null })
  })

  it('skips a backup that is itself damaged and uses the next one', () => {
    const { database, notices } = folder()
    withBackup(database, 'older words')
    garbage(path.join(backupDirectory(database), backupFileName(BACKUP_AT + 1000)))
    garbage(database)
    const store = openStoreWithRecovery(database, notices)
    open.push(store)
    expect(store.thread('one')?.title).toBe('One')
    expect(notices.current()?.backupAt).toBe(BACKUP_AT)
  })

  it('does NOT set aside a database that is only locked', () => {
    const { dir, database, notices } = folder()
    withBackup(database, 'words')
    const before = readFileSync(database)
    const other = new DatabaseSync(database)
    other.exec('BEGIN IMMEDIATE')
    try {
      expect(() => openStoreWithRecovery(database, notices)).toThrow(/locked/)
    } finally {
      other.exec('ROLLBACK')
      other.close()
    }
    expect(readdirSync(dir).some((name) => name.includes('.damaged-'))).toBe(false)
    expect(notices.current()).toBeUndefined()
    expect(existsSync(database)).toBe(true)
    // Unlocked again, it opens as it was.
    const store = new Store(database)
    open.push(store)
    expect(store.thread('one')?.title).toBe('One')
    expect(before.length).toBeGreaterThan(0)
  })

  it('does not set aside a database it cannot write to', () => {
    const { dir, database, notices } = folder()
    // A directory where the file should be: cannot be opened, and is not damage.
    mkdirSync(database)
    expect(() => openStoreWithRecovery(database, notices)).toThrow()
    expect(readdirSync(dir).some((name) => name.includes('.damaged-'))).toBe(false)
  })

  it('a restored copy that names a missing attachment opens and reads without crashing', async () => {
    const { database, notices } = folder()
    withBackup(database, 'picture words')
    garbage(database)
    const store = openStoreWithRecovery(database, notices)
    open.push(store)
    const item = store
      .history('one')
      .map(({ event }) => event)
      .find((event) => event.type === 'item.completed')
    expect(item?.type === 'item.completed' && item.item.attachments).toEqual([
      'C:/gone/pasted-files/missing.png',
    ])
    // The file is gone: the read is an ordinary failed request (the server answers it with an
    // error), never a crash, and the chat itself still loads.
    await expect(readAttachmentImage('C:/gone/pasted-files/missing.png')).rejects.toThrow(/ENOENT/)
  })
})

describe('setting a database aside', () => {
  it('moves the log files with it to dated names in the same folder, and keeps their bytes', () => {
    const { dir, database } = folder()
    writeFileSync(database, 'main')
    writeFileSync(`${database}-wal`, 'log')
    writeFileSync(`${database}-shm`, 'memory')
    const aside = setAside(database, Date.UTC(2026, 10, 2, 8, 0, 0))
    expect(readdirSync(dir).sort()).toEqual([
      'tastecode.db.damaged-20261102-080000',
      'tastecode.db.damaged-20261102-080000-shm',
      'tastecode.db.damaged-20261102-080000-wal',
    ])
    expect(readFileSync(`${aside}-wal`, 'utf8')).toBe('log')
  })
})

describe('startup notice', () => {
  it('survives a restart and stays until dismissed', () => {
    const { database, notices } = folder()
    notices.write({ kind: 'database.restored', at: 1, backupAt: null, asidePath: 'x' })
    expect(new StartupNotices(database).current()).toMatchObject({ at: 1 })
    notices.dismiss()
    expect(new StartupNotices(database).current()).toBeUndefined()
  })
})
