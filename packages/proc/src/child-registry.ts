import { execFile, type ChildProcess } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { userInfo } from 'node:os'
import path from 'node:path'
import { setOwnedChildHook } from './kill.js'
import {
  descendantsOf,
  readProcessTable,
  sameProcess,
  type ProcessInfo,
  type ProcessTableReader,
} from './process-table.js'

/**
 * Remembers the processes this app started, on disk, so the next start can end the ones a crash
 * left behind.
 *
 * Node ends its direct children on Windows when it dies (libuv's job object, which lets a child's
 * own children escape it), so a `.cmd` shim goes with the app and the CLI it started keeps
 * running, with its memory, its open files and its MCP servers. Measured: the shim's `cmd.exe`
 * died, the `node.exe` behind it lived on. Nothing else would ever end it.
 *
 * Each entry names a process by what the system says about it: its pid, its own start time and its
 * executable. A pid alone proves nothing, since the system hands them out again; an entry is ended
 * only while a process with that pid still has that start time and that executable.
 */
export type RegisteredProcess = {
  pid: number
  startTime: string
  exe: string
  /** The app process that started it. While that one lives, this is not left behind. */
  owner: { pid: number; startTime: string }
}

type RegistryFile = { version: 1; user: string; entries: RegisteredProcess[] }

type DropReason = 'gone' | 'reused' | 'owner-alive' | 'unverifiable' | 'self'

export type ReapReport = {
  /** Ended, with the processes below them. */
  ended: RegisteredProcess[]
  /** Not ended, with the reason. */
  dropped: Array<{ entry: RegisteredProcess; reason: DropReason }>
  /** Still running after the forced stop; kept for the next start. */
  failed: RegisteredProcess[]
}

/** Ends a process and everything below it: politely first where the platform has a way, then by force. */
export type TreeEnder = (entry: RegisteredProcess, table: ProcessTableReader) => Promise<boolean>

type Options = {
  table?: ProcessTableReader
  endTree?: TreeEnder
  log?: (line: string) => void
  /** How long a child lives before it is written down. Most short commands end before it. */
  graceMs?: number
  /** Who wrote the file, to ignore one written by another user. */
  user?: string
}

/** A child that lives this long is a provider, a server or a long command, not a quick `git status`. */
const REGISTER_AFTER_MS = 1_500
/** Reads of the process table within this window share one run. */
const TABLE_SHARE_MS = 300
const MAX_ENTRIES = 512

const exited = (child: ChildProcess) => child.exitCode != null || child.signalCode != null

const DROP_REASONS = {
  gone: 'it had already ended',
  reused: 'another process has this pid now, so it was not touched',
  'owner-alive': 'the app that started it is still running',
  unverifiable: 'the system does not name its executable, so it was not touched',
  self: 'it is this app',
} as const satisfies Record<DropReason, string>

export class ChildRegistry {
  readonly #file: string
  readonly #table: ProcessTableReader
  readonly #endTree: TreeEnder
  readonly #log: (line: string) => void
  readonly #graceMs: number
  readonly #user: string
  /** What an earlier run left in the file and nobody has settled yet. */
  #left: RegisteredProcess[]
  /** The trees of the children this run has started, by their root pid. */
  readonly #live = new Map<number, RegisteredProcess[]>()
  #shared: { at: number; read: ReturnType<ProcessTableReader> } | undefined
  #closed = false

  constructor(file: string, options: Options = {}) {
    this.#file = file
    this.#table = options.table ?? readProcessTable
    this.#endTree = options.endTree ?? endProcessTree
    this.#log = options.log ?? (() => undefined)
    this.#graceMs = options.graceMs ?? REGISTER_AFTER_MS
    this.#user = options.user ?? currentUser()
    this.#left = this.#load()
  }

  /** What an earlier run left in the file, before anything has been settled. */
  get leftBehind(): readonly RegisteredProcess[] {
    return this.#left
  }

  /** Writes a child down once it has lived a while, and takes it out when it ends. Never throws. */
  track(child: ChildProcess): void {
    const root = child.pid
    if (this.#closed || !root) return
    const timer = setTimeout(() => void this.#register(child, root), this.#graceMs)
    timer.unref()
    const done = () => {
      clearTimeout(timer)
      if (this.#live.delete(root)) this.#write()
    }
    child.once('exit', done)
    child.once('error', done)
  }

  /**
   * Settles what an earlier run left: each entry is ended only while its pid still names the same
   * process, otherwise it is dropped. Records what it did through the log. Never throws.
   */
  async reapLeftBehind(): Promise<ReapReport> {
    const report: ReapReport = { ended: [], dropped: [], failed: [] }
    const entries = [...this.#left]
    if (entries.length === 0) return report
    let table
    try {
      table = await this.#table()
    } catch (error) {
      this.#log(
        `could not list the running processes, ${entries.length} left for the next start: ${errorText(error)}`,
      )
      return report
    }
    for (const entry of entries) {
      const running = table.get(entry.pid)
      const owner = table.get(entry.owner.pid)
      let drop: DropReason | undefined
      if (!running) drop = 'gone'
      else if (!sameProcess(running, entry)) drop = 'reused'
      else if (entry.exe === '') drop = 'unverifiable'
      else if (entry.pid === process.pid || entry.pid === process.ppid) drop = 'self'
      else if (owner && owner.startTime === entry.owner.startTime) drop = 'owner-alive'
      if (drop) {
        report.dropped.push({ entry, reason: drop })
        this.#log(`dropped pid ${entry.pid} (${entry.exe || 'unknown'}): ${DROP_REASONS[drop]}`)
        this.#settle(entry)
        continue
      }
      let stopped = false
      try {
        stopped = await this.#endTree(entry, this.#table)
      } catch (error) {
        this.#log(`could not end pid ${entry.pid}: ${errorText(error)}`)
      }
      if (stopped) {
        report.ended.push(entry)
        this.#log(
          `ended pid ${entry.pid} (${entry.exe}) and what it had started, left behind by an earlier run`,
        )
        this.#settle(entry)
      } else {
        report.failed.push(entry)
        this.#log(
          `pid ${entry.pid} (${entry.exe}) is still running after the forced stop; kept for the next start`,
        )
      }
    }
    return report
  }

  /** Stops tracking: nothing more is written. The file keeps what is running. */
  close(): void {
    this.#closed = true
  }

  #settle(entry: RegisteredProcess): void {
    this.#left = this.#left.filter((other) => other !== entry)
    this.#write()
  }

  async #register(child: ChildProcess, root: number): Promise<void> {
    if (this.#closed || exited(child)) return
    let table
    try {
      table = await this.#sharedTable()
    } catch (error) {
      this.#log(`could not list the running processes to register pid ${root}: ${errorText(error)}`)
      return
    }
    const own = table.get(process.pid)
    const first = table.get(root)
    if (this.#closed || exited(child) || !own || !first) return
    const owner = { pid: own.pid, startTime: own.startTime }
    const tree: ProcessInfo[] = [first, ...descendantsOf(table, root)]
    this.#live.set(
      root,
      tree
        .filter((info) => info.exe !== '')
        .map(({ pid, startTime, exe }) => ({ pid, startTime, exe, owner })),
    )
    this.#write()
  }

  #sharedTable(): ReturnType<ProcessTableReader> {
    const now = Date.now()
    if (!this.#shared || now - this.#shared.at > TABLE_SHARE_MS) {
      this.#shared = { at: now, read: this.#table() }
    }
    return this.#shared.read
  }

  /** The file as an earlier run left it; one that is damaged or another user's counts as empty. */
  #load(): RegisteredProcess[] {
    let raw: string
    try {
      if (process.platform !== 'win32' && typeof process.getuid === 'function') {
        if (statSync(this.#file).uid !== process.getuid()) {
          this.#log('ignored the child registry: it belongs to another user')
          return []
        }
      }
      raw = readFileSync(this.#file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        this.#log(`ignored the child registry: ${errorText(error)}`)
      return []
    }
    try {
      const parsed = JSON.parse(raw) as Partial<RegistryFile> | null
      if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) throw new Error('not a registry')
      if (parsed.user !== this.#user) {
        this.#log('ignored the child registry: it was written by another user')
        return []
      }
      return parsed.entries.filter(isEntry).slice(0, MAX_ENTRIES)
    } catch {
      this.#log('ignored the child registry: the file is damaged')
      return []
    }
  }

  /** Atomically: written beside the file and moved over it. A failure is logged and the app goes on. */
  #write(): void {
    const entries = [...this.#left, ...[...this.#live.values()].flat()].slice(0, MAX_ENTRIES)
    try {
      if (entries.length === 0) {
        try {
          unlinkSync(this.#file)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
        return
      }
      mkdirSync(path.dirname(this.#file), { recursive: true })
      const staging = `${this.#file}.${process.pid}.tmp`
      const content: RegistryFile = { version: 1, user: this.#user, entries }
      writeFileSync(staging, JSON.stringify(content), { mode: 0o600 })
      moveOver(staging, this.#file)
    } catch (error) {
      this.#log(`could not write the child registry: ${errorText(error)}`)
    }
  }
}

function currentUser(): string {
  try {
    return userInfo().username
  } catch {
    return ''
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isEntry(value: unknown): value is RegisteredProcess {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  const owner = entry['owner'] as Record<string, unknown> | undefined
  return (
    Number.isInteger(entry['pid']) &&
    (entry['pid'] as number) > 0 &&
    typeof entry['startTime'] === 'string' &&
    entry['startTime'] !== '' &&
    typeof entry['exe'] === 'string' &&
    typeof owner === 'object' &&
    owner !== null &&
    Number.isInteger(owner['pid']) &&
    typeof owner['startTime'] === 'string'
  )
}

/** Windows can refuse a rename while a scanner holds the target for a moment. */
function moveOver(from: string, to: string): void {
  for (let attempt = 0; ; attempt += 1) {
    try {
      renameSync(from, to)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (attempt >= 4 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) {
        try {
          unlinkSync(from)
        } catch {
          // Nothing left to clean.
        }
        throw error
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25)
    }
  }
}

const POLITE_WAIT_MS = 2_000
const FORCE_WAIT_MS = 4_000

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM: it exists and is not ours to signal.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

async function goneWithin(pid: number, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms
  while (isRunning(pid)) {
    if (Date.now() >= deadline) return false
    await sleep(50)
  }
  return true
}

/** Resolves with taskkill's exit code. Whether the process is gone is read from the system after, never from this. */
function taskkill(args: string[]): Promise<number> {
  return new Promise((resolve) => {
    execFile('taskkill', args, { windowsHide: true, timeout: 15_000 }, (error) =>
      resolve(error ? Number((error as { code?: unknown }).code) || 1 : 0),
    )
  })
}

/**
 * The way `killTree` ends one, for a pid this process did not spawn: on Windows `taskkill /T`
 * first without force, which only works on a process with a window and says so quickly otherwise,
 * then `/T /F`; elsewhere SIGTERM, then SIGKILL, to the process's group when it leads one.
 * Just before the forced step it reads the system again and stops if the pid no longer names the
 * same process, so a pid handed out in the meantime is never forced.
 */
export const endProcessTree: TreeEnder = async (entry, table) => {
  const { pid } = entry
  if (process.platform === 'win32') {
    // Exit 0: the close request was sent. Anything else (a process with no window, which taskkill
    // says can only be ended by force) goes straight to the forced step.
    if (
      (await taskkill(['/pid', String(pid), '/T'])) === 0 &&
      (await goneWithin(pid, POLITE_WAIT_MS))
    )
      return true
    const again = (await table()).get(pid)
    if (!again || !sameProcess(again, entry)) return true
    await taskkill(['/pid', String(pid), '/T', '/F'])
    return goneWithin(pid, FORCE_WAIT_MS)
  }
  const signal = (name: NodeJS.Signals) => {
    try {
      process.kill(-pid, name)
    } catch {
      try {
        process.kill(pid, name)
      } catch {
        // Already gone.
      }
    }
  }
  signal('SIGTERM')
  if (await goneWithin(pid, POLITE_WAIT_MS)) return true
  const again = (await table()).get(pid)
  if (!again || !sameProcess(again, entry)) return true
  signal('SIGKILL')
  return goneWithin(pid, FORCE_WAIT_MS)
}

let active: ChildRegistry | undefined

/**
 * Starts remembering the children this process spawns through `spawnOwned`, in `file`, and
 * returns the registry so the caller can settle what an earlier run left in it. One file per
 * data folder: the file lives in the folder, so two copies of the app never read each other's.
 */
export function openChildRegistry(file: string, options?: Options): ChildRegistry {
  active?.close()
  active = new ChildRegistry(file, options)
  setOwnedChildHook((child) => active?.track(child))
  return active
}

/** Stops the open registry from writing; the file keeps what is running. */
export function closeChildRegistry(): void {
  active?.close()
  active = undefined
  setOwnedChildHook(undefined)
}
