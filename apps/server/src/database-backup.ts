import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statfsSync,
  statSync,
} from 'node:fs'
import path from 'node:path'
import { Worker } from 'node:worker_threads'

/** One consistent copy a day at most, and the two newest kept. */
export const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000
export const KEEP_BACKUPS = 2
const BACKUP_PATTERN = /^backup-(\d{8})-(\d{6})\.db$/
// Long after the port opened, so the copy never competes with a start-up.
const FIRST_CHECK_DELAY_MS = 60_000
const CHECK_INTERVAL_MS = 60 * 60 * 1000

export type BackupFile = { file: string; at: number }

export function backupDirectory(database: string): string {
  return path.join(path.dirname(database), 'backups')
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0')
}

/** `YYYYMMDD-HHMMSS` in UTC, so names sort by time and a change of time zone cannot reorder them. */
export function timestampName(at: number): string {
  const d = new Date(at)
  return `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
}

export function backupFileName(at: number): string {
  return `backup-${timestampName(at)}.db`
}

/** The copies in `directory`, newest first. Anything else in the folder is ignored. */
export function listBackups(directory: string): BackupFile[] {
  let names: string[]
  try {
    names = readdirSync(directory)
  } catch {
    return []
  }
  const found: BackupFile[] = []
  for (const name of names) {
    const match = BACKUP_PATTERN.exec(name)
    if (!match) continue
    const [, day, time] = match
    const at = Date.UTC(
      Number(day!.slice(0, 4)),
      Number(day!.slice(4, 6)) - 1,
      Number(day!.slice(6, 8)),
      Number(time!.slice(0, 2)),
      Number(time!.slice(2, 4)),
      Number(time!.slice(4, 6)),
    )
    found.push({ file: path.join(directory, name), at })
  }
  return found.sort((a, b) => b.at - a.at)
}

export function freeBytes(directory: string): number {
  const stats = statfsSync(directory)
  return stats.bavail * stats.bsize
}

function sizeOf(file: string): number {
  try {
    return statSync(file).size
  } catch {
    return 0
  }
}

type WorkerJob =
  { task: 'backup'; source: string; destination: string } | { task: 'checkpoint'; source: string }

function runDatabaseWorker(job: WorkerJob): Promise<void> {
  return new Promise((resolve, reject) => {
    const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
    const worker = new Worker(new URL(`./database-worker.${extension}`, import.meta.url), {
      workerData: job,
      name: `harness-database-${job.task}`,
      execArgv: process.execArgv.filter((argument) => !argument.startsWith('--input-type')),
    })
    let settled = false
    const settle = (error?: Error) => {
      if (settled) return
      settled = true
      if (error) reject(error)
      else resolve()
    }
    worker.on('message', (message: { type: 'done' } | { type: 'error'; message: string }) =>
      settle(message.type === 'done' ? undefined : new Error(message.message)),
    )
    worker.on('error', (error: unknown) =>
      settle(error instanceof Error ? error : new Error(String(error))),
    )
    worker.on('exit', (code) => settle(new Error(`The database worker exited with code ${code}.`)))
    stopWorkers.add(worker)
    worker.once('exit', () => stopWorkers.delete(worker))
  })
}

const stopWorkers = new Set<Worker>()

/** Copies the database with SQLite's VACUUM INTO on a worker thread, so no request waits for it. */
export function copyDatabaseInWorker(source: string, destination: string): Promise<void> {
  return runDatabaseWorker({ task: 'backup', source, destination })
}

/** A passive WAL checkpoint on a worker thread: the log is folded into the database off the event loop. */
export function checkpointDatabaseInWorker(source: string): Promise<void> {
  return runDatabaseWorker({ task: 'checkpoint', source })
}

export type BackupOptions = {
  database: string
  now?: () => number
  copy?: (source: string, destination: string) => Promise<void>
  /** Free bytes on the disk that holds `directory`. */
  freeSpace?: (directory: string) => number
}

export type BackupResult =
  | { status: 'written'; file: string }
  | { status: 'skipped'; reason: 'recent' | 'low-disk' | 'missing' }
  | { status: 'failed'; error: unknown }

/**
 * One backup if the newest is more than a day old and the disk has room for it. Written under
 * a temporary name and renamed; a failed copy removes only its own temporary file, so a good
 * backup is never touched by one that went wrong. Older copies beyond the newest two go last.
 */
export async function backupIfDue(options: BackupOptions): Promise<BackupResult> {
  const now = options.now ?? Date.now
  const directory = backupDirectory(options.database)
  if (!existsSync(options.database)) return { status: 'skipped', reason: 'missing' }
  try {
    mkdirSync(directory, { recursive: true })
    const newest = listBackups(directory)[0]
    if (newest && now() - newest.at < BACKUP_INTERVAL_MS)
      return { status: 'skipped', reason: 'recent' }
    // The copy is never larger than the database and its log together.
    const needed = sizeOf(options.database) + sizeOf(`${options.database}-wal`)
    if ((options.freeSpace ?? freeBytes)(directory) < needed)
      return { status: 'skipped', reason: 'low-disk' }
  } catch (error) {
    return { status: 'failed', error }
  }
  const final = path.join(directory, backupFileName(now()))
  const partial = `${final}.part`
  try {
    rmSync(partial, { force: true })
    await (options.copy ?? copyDatabaseInWorker)(options.database, partial)
    renameSync(partial, final)
  } catch (error) {
    rmSync(partial, { force: true })
    return { status: 'failed', error }
  }
  try {
    for (const old of listBackups(directory).slice(KEEP_BACKUPS)) rmSync(old.file, { force: true })
  } catch {
    // A copy that could not be pruned is still a good copy.
  }
  return { status: 'written', file: final }
}

/**
 * Checks once a minute after start and then hourly; each check does nothing unless the newest
 * copy is more than a day old. Returns a stop function that also ends a copy in progress.
 */
export function startBackupSchedule(
  options: BackupOptions & { onResult?: (result: BackupResult) => void },
): () => void {
  let running = false
  let stopped = false
  const check = () => {
    if (running || stopped) return
    running = true
    void backupIfDue(options)
      .then((result) => options.onResult?.(result))
      .catch(() => undefined)
      .finally(() => {
        running = false
      })
  }
  let interval: NodeJS.Timeout | undefined
  const first = setTimeout(() => {
    check()
    interval = setInterval(check, CHECK_INTERVAL_MS)
    interval.unref()
  }, FIRST_CHECK_DELAY_MS)
  first.unref()
  return () => {
    stopped = true
    clearTimeout(first)
    if (interval) clearInterval(interval)
    for (const worker of stopWorkers) void worker.terminate()
  }
}
