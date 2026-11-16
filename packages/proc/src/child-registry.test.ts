import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ChildRegistry,
  closeChildRegistry,
  openChildRegistry,
  trackOwnedProcess,
  type RegisteredProcess,
  type TreeEnder,
} from './child-registry.js'
import { killTree, spawnOwned } from './kill.js'
import {
  descendantsOf,
  parsePosixProcessTable,
  parseWindowsProcessTable,
  readProcessTable,
  sameProcess,
} from './process-table.js'

/**
 * These tests only ever end processes that they started themselves: every tree here is a node
 * process this file spawned, named by the pid it printed, and each test ends what is left of it.
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const isRunning = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function until(done: () => boolean, ms = 20_000): Promise<void> {
  const deadline = Date.now() + ms
  while (!done()) {
    if (Date.now() >= deadline) throw new Error('timed out waiting')
    await sleep(50)
  }
}

// The sleeper records its pid and waits. The holder starts it the way a provider CLI is started on
// Windows, behind a cmd.exe (a direct child of a node process dies with it, a grandchild does not).
const SLEEPER =
  "require('node:fs').writeFileSync(process.argv[2], String(process.pid)); setTimeout(() => {}, 120000)"
const HOLDER = `const { spawn } = require('node:child_process');
const [script, pidFile] = process.argv.slice(1);
if (process.platform === 'win32') {
  spawn('cmd.exe', ['/d', '/s', '/v:off', '/c', '""' + process.execPath + '" "' + script + '" "' + pidFile + '""'],
    { stdio: 'ignore', windowsVerbatimArguments: true, windowsHide: true });
} else {
  spawn(process.execPath, [script, pidFile], { stdio: 'ignore' });
}
setTimeout(() => {}, 120000)`

const started = new Set<number>()
const folders: string[] = []

function folder(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'tuift-registry-'))
  folders.push(dir)
  return dir
}

/** The arguments that start the holder, and where its child will write its pid. */
function holderArgs() {
  const dir = folder()
  const script = path.join(dir, 'sleeper.js')
  writeFileSync(script, SLEEPER)
  const pidFile = path.join(dir, 'sleeper.pid')
  return { args: ['-e', HOLDER, script, pidFile], pidFile }
}

async function sleeperPid(pidFile: string): Promise<number> {
  await until(() => existsSync(pidFile) && readFileSync(pidFile, 'utf8') !== '')
  const pid = Number(readFileSync(pidFile, 'utf8'))
  started.add(pid)
  return pid
}

/** A node process that started a sleeper behind a shell; resolves with both pids. */
async function startTree(): Promise<{ holderPid: number; childPid: number }> {
  const { args, pidFile } = holderArgs()
  const holder = spawn(process.execPath, args, { stdio: 'ignore' })
  started.add(holder.pid!)
  return { holderPid: holder.pid!, childPid: await sleeperPid(pidFile) }
}

/** The holder dies and its child is left running, the way a crash leaves a provider CLI. */
async function orphanTheChild(): Promise<{ childPid: number }> {
  const { holderPid, childPid } = await startTree()
  process.kill(holderPid, 'SIGKILL')
  await until(() => !isRunning(holderPid))
  // The shell that was between them dies with the holder; the sleeper goes on.
  await sleep(500)
  expect(isRunning(childPid)).toBe(true)
  return { childPid }
}

async function entryFor(pid: number): Promise<RegisteredProcess> {
  const table = await readProcessTable()
  const info = table.get(pid)!
  return {
    pid,
    startTime: info.startTime,
    exe: info.exe,
    // An app that is long gone.
    owner: { pid: 2_000_000_000, startTime: 'gone' },
  }
}

function writeFileOf(file: string, entries: RegisteredProcess[], user = userInfo().username): void {
  writeFileSync(file, JSON.stringify({ version: 1, user, entries }))
}

const files = (dir: string) => readdirSync(dir)

beforeEach(() => started.clear())

afterEach(() => {
  closeChildRegistry()
  // Only what this test started, by the pids it recorded.
  for (const pid of started) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // Already gone.
    }
  }
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('the process table', () => {
  it('reads this very process with its parent, a start time and its executable', async () => {
    const table = await readProcessTable()
    const me = table.get(process.pid)!
    expect(me.ppid).toBe(process.ppid)
    expect(me.startTime).not.toBe('')
    expect(path.basename(me.exe).toLowerCase()).toContain('node')
    expect(sameProcess(me, { ...me })).toBe(true)
    expect(sameProcess(me, { ...me, startTime: `${me.startTime}1` })).toBe(false)
    expect(sameProcess(me, { ...me, exe: `${me.exe}.old` })).toBe(false)
  })

  it('parses what the Windows script and ps print', () => {
    const windows = parseWindowsProcessTable(
      '4|0|639302998753780800|\r\n428|4|639302998606513050|C:\\Windows\\System32\\smss.exe\r\nnoise\r\n',
    )
    expect(windows.get(428)).toEqual({
      pid: 428,
      ppid: 4,
      startTime: '639302998606513050',
      exe: 'C:\\Windows\\System32\\smss.exe',
    })
    const posix = parsePosixProcessTable(
      '  1     0 Mon Nov 16 07:13:40 2026 /sbin/launchd\n 42     1 Tue Nov  3 10:00:01 2026 /Applications/My App.app/x\n',
    )
    expect(posix.get(42)).toEqual({
      pid: 42,
      ppid: 1,
      startTime: 'Tue Nov  3 10:00:01 2026',
      exe: '/Applications/My App.app/x',
    })
  })

  it('lists what is below a process, nearest first', () => {
    const table = parseWindowsProcessTable('1|0|1|a\n2|1|2|b\n3|2|3|c\n4|1|4|d\n9|0|9|z\n')
    expect(descendantsOf(table, 1).map(({ pid }) => pid)).toEqual([2, 4, 3])
    expect(descendantsOf(table, 1, 2)).toHaveLength(2)
  })
})

describe('the registry file', () => {
  it('writes a child and what it started once it has lived a while, and removes them when it ends', async () => {
    const dir = folder()
    const file = path.join(dir, 'child-processes.json')
    const registry = openChildRegistry(file, { graceMs: 1_500 })
    const { args, pidFile } = holderArgs()
    const holder = spawnOwned(process.execPath, args, { stdio: 'ignore' })
    started.add(holder.pid!)
    const childPid = await sleeperPid(pidFile)

    await until(() => existsSync(file))
    const written = JSON.parse(readFileSync(file, 'utf8')) as {
      version: number
      user: string
      entries: RegisteredProcess[]
    }
    expect(written.version).toBe(1)
    expect(written.user).toBe(userInfo().username)
    const registered = written.entries.map((entry) => entry.pid)
    expect(registered).toContain(holder.pid)
    // The sleeper behind the shell: the process that outlives a crash.
    expect(registered).toContain(childPid)
    const table = await readProcessTable()
    for (const entry of written.entries) {
      const real = table.get(entry.pid)!
      expect(entry.startTime).toBe(real.startTime)
      expect(entry.exe).toBe(real.exe)
      expect(entry.owner.pid).toBe(process.pid)
    }
    // Atomic: nothing is left beside it while it is not being written.
    expect(files(dir)).toEqual(['child-processes.json'])

    await killTree(holder)
    await until(() => !existsSync(file))
    expect(files(dir)).toEqual([])
    registry.close()
  }, 60_000)

  it('never writes a command that ends before the grace period', async () => {
    const dir = folder()
    const file = path.join(dir, 'child-processes.json')
    const registry = openChildRegistry(file, { graceMs: 2_000 })
    const quick = spawnOwned(process.execPath, ['-e', '0'], { stdio: 'ignore' })
    started.add(quick.pid!)
    await new Promise((resolve) => quick.once('exit', resolve))
    await sleep(2_300)
    expect(existsSync(file)).toBe(false)
    registry.close()
  })

  it('writes a process that is not a ChildProcess (a terminal shell) and removes it when released', async () => {
    const dir = folder()
    const file = path.join(dir, 'child-processes.json')
    const registry = openChildRegistry(file, { graceMs: 300 })
    // A process this test started, which node-pty would own instead of node's child_process.
    const shell = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], {
      stdio: 'ignore',
    })
    started.add(shell.pid!)
    const release = trackOwnedProcess(shell.pid!)

    await until(() => existsSync(file))
    const written = JSON.parse(readFileSync(file, 'utf8')) as { entries: RegisteredProcess[] }
    const real = (await readProcessTable()).get(shell.pid!)!
    expect(written.entries).toEqual([
      {
        pid: shell.pid,
        startTime: real.startTime,
        exe: real.exe,
        owner: { pid: process.pid, startTime: expect.any(String) },
      },
    ])

    release()
    await until(() => !existsSync(file))
    registry.close()
  }, 60_000)

  it('does not write a process released before the grace period, and does nothing with no registry open', async () => {
    const dir = folder()
    const file = path.join(dir, 'child-processes.json')
    trackOwnedProcess(process.pid)()
    const registry = openChildRegistry(file, { graceMs: 300 })
    trackOwnedProcess(process.pid)()
    await sleep(700)
    expect(existsSync(file)).toBe(false)
    registry.close()
  })

  it('ignores a file that is damaged, one that is not a registry and one written by another user', () => {
    const dir = folder()
    const file = path.join(dir, 'child-processes.json')
    const log: string[] = []
    const entry = { pid: 1234, startTime: '1', exe: 'x', owner: { pid: 9, startTime: '2' } }

    writeFileSync(file, '{"version":1,"user":"')
    expect(new ChildRegistry(file, { log: (line) => log.push(line) }).leftBehind).toEqual([])
    writeFileSync(file, JSON.stringify({ hello: 'world' }))
    expect(new ChildRegistry(file, { log: (line) => log.push(line) }).leftBehind).toEqual([])
    writeFileOf(file, [entry], 'somebody-else')
    expect(new ChildRegistry(file, { log: (line) => log.push(line) }).leftBehind).toEqual([])
    expect(log.map((line) => line.replace(/:.*/, ''))).toEqual([
      'ignored the child registry',
      'ignored the child registry',
      'ignored the child registry',
    ])
    // Its own user's file is read, and an entry that is not well formed is skipped.
    writeFileOf(file, [entry, { pid: -1 } as unknown as RegisteredProcess])
    expect(new ChildRegistry(file).leftBehind).toEqual([entry])
  })

  it('leaves another data folder alone: each file is its own', async () => {
    const mine = folder()
    const other = folder()
    const otherFile = path.join(other, 'child-processes.json')
    const { childPid } = await orphanTheChild()
    // The other folder's file names a live orphan; this folder's registry must never read it.
    writeFileOf(otherFile, [await entryFor(childPid)])
    const registry = new ChildRegistry(path.join(mine, 'child-processes.json'))
    const report = await registry.reapLeftBehind()
    expect(report.ended).toEqual([])
    expect(isRunning(childPid)).toBe(true)
    expect(JSON.parse(readFileSync(otherFile, 'utf8')).entries).toHaveLength(1)
  }, 60_000)
})

describe('ending what an earlier run left behind', () => {
  it('ends a child that outlived its parent, only because the pid still names it', async () => {
    const dir = folder()
    const file = path.join(dir, 'child-processes.json')
    const { childPid } = await orphanTheChild()
    writeFileOf(file, [await entryFor(childPid)])

    const log: string[] = []
    const registry = new ChildRegistry(file, { log: (line) => log.push(line) })
    const report = await registry.reapLeftBehind()

    expect(report.ended.map((entry) => entry.pid)).toEqual([childPid])
    await until(() => !isRunning(childPid))
    expect(existsSync(file)).toBe(false)
    expect(log.some((line) => line.includes(`ended pid ${childPid}`))).toBe(true)
  }, 60_000)

  it('does not end a process whose start time differs: the pid was handed out again', async () => {
    const dir = folder()
    const file = path.join(dir, 'child-processes.json')
    const { childPid } = await orphanTheChild()
    const entry = await entryFor(childPid)
    writeFileOf(file, [{ ...entry, startTime: `${entry.startTime}0` }])

    const report = await new ChildRegistry(file).reapLeftBehind()

    expect(report.ended).toEqual([])
    expect(report.dropped.map(({ reason }) => reason)).toEqual(['reused'])
    expect(isRunning(childPid)).toBe(true)
    // The stale entry is forgotten, never carried to the next start.
    expect(existsSync(file)).toBe(false)
  }, 60_000)

  it('does not end a process whose executable differs', async () => {
    const dir = folder()
    const file = path.join(dir, 'child-processes.json')
    const { childPid } = await orphanTheChild()
    const entry = await entryFor(childPid)
    writeFileOf(file, [{ ...entry, exe: path.join(path.dirname(entry.exe), 'another-program') }])

    const report = await new ChildRegistry(file).reapLeftBehind()

    expect(report.ended).toEqual([])
    expect(report.dropped.map(({ reason }) => reason)).toEqual(['reused'])
    expect(isRunning(childPid)).toBe(true)
  }, 60_000)

  it('does not end a process whose app is still running, and drops an entry that is already gone', async () => {
    const dir = folder()
    const file = path.join(dir, 'child-processes.json')
    const { childPid } = await orphanTheChild()
    const entry = await entryFor(childPid)
    const me = (await readProcessTable()).get(process.pid)!
    writeFileOf(file, [
      { ...entry, owner: { pid: process.pid, startTime: me.startTime } },
      { pid: 2_000_000_001, startTime: '1', exe: entry.exe, owner: entry.owner },
    ])

    const report = await new ChildRegistry(file).reapLeftBehind()

    expect(report.ended).toEqual([])
    expect(report.dropped.map(({ reason }) => reason).sort()).toEqual(['gone', 'owner-alive'])
    expect(isRunning(childPid)).toBe(true)
  }, 60_000)

  it('keeps an entry it could not end for the next start, and never touches this app', async () => {
    const dir = folder()
    const file = path.join(dir, 'child-processes.json')
    const { childPid } = await orphanTheChild()
    const stubborn: TreeEnder = () => Promise.resolve(false)
    writeFileOf(file, [await entryFor(childPid), await entryFor(process.pid)])

    const registry = new ChildRegistry(file, { endTree: stubborn })
    const report = await registry.reapLeftBehind()

    expect(report.failed.map((entry) => entry.pid)).toEqual([childPid])
    expect(report.dropped.map(({ reason }) => reason)).toEqual(['self'])
    expect(
      JSON.parse(readFileSync(file, 'utf8')).entries.map((e: { pid: number }) => e.pid),
    ).toEqual([childPid])
    expect(isRunning(childPid)).toBe(true)
  }, 60_000)

  it('does nothing, and reads no process list, when the file has nothing in it', async () => {
    let reads = 0
    const registry = new ChildRegistry(path.join(folder(), 'child-processes.json'), {
      table: () => {
        reads += 1
        return readProcessTable()
      },
    })
    expect(await registry.reapLeftBehind()).toEqual({ ended: [], dropped: [], failed: [] })
    expect(reads).toBe(0)
  })
})
