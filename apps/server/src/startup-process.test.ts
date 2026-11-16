import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { acquireDataLease } from './data-lease.js'
import { isDamagedDatabaseError, SERVER_EXIT, startupCause, StartupFailure } from './exit-codes.js'
import { DatabaseSync } from './sqlite.js'
import { Store } from './store.js'

// The real entry point, started as a process: needs `pnpm --filter @harness/server build` first.
const main = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'main.js')
const built = existsSync(main)

const dirs: string[] = []
const children: ChildProcess[] = []
const listeners: Server[] = []
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode !== null || child.signalCode !== null) continue
    const gone = new Promise((resolve) => child.once('exit', resolve))
    child.kill()
    await gone
  }
  for (const server of listeners.splice(0)) server.close()
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
})

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolve(port))
    })
  })
}

function sandbox() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'harness-startup-'))
  dirs.push(root)
  for (const name of ['data', 'config', 'desktop', 'home']) mkdirSync(path.join(root, name))
  return { root, data: path.join(root, 'data'), database: path.join(root, 'data', 'tastecode.db') }
}

type Run = { child: ChildProcess; output: () => string; exited: Promise<number | null> }

function start(box: ReturnType<typeof sandbox>, port: number): Run {
  const env: NodeJS.ProcessEnv = {
    SystemRoot: process.env['SystemRoot'],
    PATH: path.dirname(process.execPath),
    TEMP: box.root,
    TMP: box.root,
    HARNESS_DATA_DIR: box.data,
    HARNESS_CONFIG_DIR: path.join(box.root, 'config'),
    HARNESS_DESKTOP_DATA_DIR: path.join(box.root, 'desktop'),
    HARNESS_PORT: String(port),
    HARNESS_HOST: '127.0.0.1',
    USERPROFILE: path.join(box.root, 'home'),
    HOME: path.join(box.root, 'home'),
    APPDATA: path.join(box.root, 'home'),
    LOCALAPPDATA: path.join(box.root, 'home'),
  }
  const child = spawn(process.execPath, [main], {
    env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  })
  children.push(child)
  let text = ''
  child.stdout?.on('data', (chunk) => (text += chunk))
  child.stderr?.on('data', (chunk) => (text += chunk))
  const exited = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)))
  return { child, output: () => text, exited }
}

async function untilListening(run: Run): Promise<void> {
  for (let i = 0; i < 200 && !run.output().includes('listening on'); i++) {
    if (run.child.exitCode !== null) throw new Error(`exited early: ${run.output()}`)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  expect(run.output()).toContain('listening on')
}

function pushes(port: number): Promise<{ channel: string; data: unknown }[]> {
  return new Promise((resolve, reject) => {
    const received: { channel: string; data: unknown }[] = []
    const socket = new WebSocket(`ws://127.0.0.1:${port}`)
    socket.on('message', (raw) => received.push(JSON.parse(String(raw))))
    socket.on('error', reject)
    setTimeout(() => {
      socket.close()
      resolve(received)
    }, 600)
  })
}

describe('what the server exits with when it cannot start', () => {
  it('names each cause with its own code, and none is the generic 1', () => {
    const codes = Object.values(SERVER_EXIT)
    expect(new Set(codes).size).toBe(codes.length)
    for (const code of codes) expect(code).toBeGreaterThan(1)
  })

  it('classifies SQLite and file errors without mistaking busy or full for damage', () => {
    const sqlite = (errcode: number) => Object.assign(new Error('x'), { errcode })
    expect(startupCause(sqlite(5))).toBe('databaseLocked')
    expect(startupCause(sqlite(6))).toBe('databaseLocked')
    expect(startupCause(sqlite(11))).toBe('databaseDamaged')
    expect(startupCause(sqlite(779))).toBe('databaseDamaged') // SQLITE_CORRUPT_INDEX
    expect(startupCause(sqlite(26))).toBe('databaseDamaged')
    expect(startupCause(sqlite(13))).toBe('diskFull')
    expect(startupCause(sqlite(8))).toBe('databaseNoAccess')
    expect(startupCause(sqlite(3))).toBe('databaseNoAccess')
    expect(startupCause(sqlite(14))).toBe('databaseNoAccess')
    expect(startupCause(Object.assign(new Error('x'), { code: 'ENOSPC' }))).toBe('diskFull')
    expect(startupCause(new StartupFailure('portInUse', 'x'))).toBe('portInUse')
    expect(startupCause(new Error('something else'))).toBeUndefined()
    for (const errcode of [3, 5, 6, 8, 10, 13, 14]) {
      expect(isDamagedDatabaseError(sqlite(errcode))).toBe(false)
    }
    expect(isDamagedDatabaseError(sqlite(11))).toBe(true)
    expect(isDamagedDatabaseError(sqlite(26))).toBe(true)
  })

  it.skipIf(!built)('exits with the port code when another program holds the port', async () => {
    const box = sandbox()
    const port = await freePort()
    const holder = createServer()
    listeners.push(holder)
    await new Promise<void>((resolve) => holder.listen(port, '127.0.0.1', resolve))
    const run = start(box, port)
    expect(await run.exited).toBe(SERVER_EXIT.portInUse)
    expect(run.output()).toMatch(/already in use/)
    // It did not say it was listening: the desktop reads that line as "the port is open".
    expect(run.output()).not.toContain('listening on')
  })

  it.skipIf(!built)(
    'exits with the data-folder code when another copy holds the lease',
    async () => {
      const box = sandbox()
      const release = acquireDataLease(box.database)
      try {
        const run = start(box, await freePort())
        expect(await run.exited).toBe(SERVER_EXIT.dataFolderInUse)
        expect(run.output()).toMatch(/cannot start \(dataFolderInUse\)/)
      } finally {
        release()
      }
    },
  )

  it.skipIf(!built)('exits with the locked code, and leaves a locked database alone', async () => {
    const box = sandbox()
    new Store(box.database).close()
    const other = new DatabaseSync(box.database)
    other.exec('BEGIN IMMEDIATE')
    try {
      const run = start(box, await freePort())
      expect(await run.exited).toBe(SERVER_EXIT.databaseLocked)
      expect(readdirSync(box.data).some((name) => name.includes('.damaged-'))).toBe(false)
    } finally {
      other.exec('ROLLBACK')
      other.close()
    }
  })

  it.skipIf(!built)(
    'starts on a damaged database, tells every connection, and stops telling once dismissed',
    async () => {
      const box = sandbox()
      writeFileSync(box.database, Buffer.from('garbage that is not a database '.repeat(300)))
      const port = await freePort()
      const run = start(box, port)
      await untilListening(run)

      const first = await pushes(port)
      const notice = first.find((push) => push.channel === 'server.startupNotice')
      expect(notice?.data).toMatchObject({
        notice: { kind: 'database.restored', backupAt: null },
      })
      // A second window, and a reconnect, hear it again.
      expect((await pushes(port)).some((push) => push.channel === 'server.startupNotice')).toBe(
        true,
      )
      expect(readdirSync(box.data).some((name) => name.includes('.damaged-'))).toBe(true)

      // Dismissed from one window: gone for the next, and after a restart.
      const dismissed = new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(`ws://127.0.0.1:${port}`)
        socket.on('open', () =>
          socket.send(JSON.stringify({ id: 'd1', method: 'startup.dismissNotice', params: {} })),
        )
        socket.on('message', (raw) => {
          if (JSON.parse(String(raw)).id === 'd1') {
            socket.close()
            resolve()
          }
        })
        socket.on('error', reject)
      })
      await dismissed
      expect((await pushes(port)).some((push) => push.channel === 'server.startupNotice')).toBe(
        false,
      )
    },
  )
})
