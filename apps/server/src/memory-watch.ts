import { execFile } from 'node:child_process'
import { freemem, totalmem } from 'node:os'

/**
 * Tells the clients when the system is close to running out of memory while a turn runs, so the
 * person can close something before Windows starts ending programs, and tells the orchestrator
 * whether the system was low just before a provider's process died.
 *
 * It costs nothing while no turn runs. While one does, a tick every few seconds reads the
 * physical memory the process already knows (`os.freemem`, a counter read). Only when that is
 * low does it ask Windows for the commit charge and the biggest programs, at most once every
 * 20 seconds, because that read starts PowerShell. Windows ends processes when the commit
 * limit is reached, not when physical memory is, so a system with plenty of physical memory
 * and a full commit limit is not seen: that is the price of keeping the common case free.
 *
 * Only Windows reads the commit charge. Elsewhere the physical figure alone decides, with
 * lower thresholds, and macOS memory pressure is not read.
 */

export type MemoryConsumer = { name: string; bytes: number }
export type MemoryDetail = { committedPercent: number; consumers: MemoryConsumer[] }
export type MemoryNotice =
  { state: 'low'; committedPercent?: number; consumers?: MemoryConsumer[] } | { state: 'ok' }

const TICK_MS = 5_000
const DETAIL_MIN_MS = 20_000
/** A process that dies within this long of a low reading counts as dying while low. */
const RECENT_MS = 60_000
const GIB = 1024 ** 3
const COMMIT_LOW_PERCENT = 90
const COMMIT_OK_PERCENT = 80

export type MemoryWatchOptions = {
  onChange: (notice: MemoryNotice) => void
  readPhysical?: () => { freeBytes: number; totalBytes: number }
  readDetail?: () => Promise<MemoryDetail | undefined>
  now?: () => number
  tickMs?: number
  detailMinMs?: number
}

export class MemoryWatch {
  #options: MemoryWatchOptions
  #timer: NodeJS.Timeout | undefined
  #episode = false
  #lastLowAt: number | undefined
  #lastDetailAt = Number.NEGATIVE_INFINITY
  #reading = false

  constructor(options: MemoryWatchOptions) {
    this.#options = options
  }

  /** How many turns run right now; the watch ticks only while that is above zero. */
  setActiveTurns(count: number): void {
    if (count > 0) {
      if (this.#timer) return
      this.#timer = setInterval(() => void this.tick(), this.#options.tickMs ?? TICK_MS)
      this.#timer.unref?.()
      return
    }
    if (!this.#timer) return
    clearInterval(this.#timer)
    this.#timer = undefined
    // Nothing runs to be at risk any more; the warning has done its job.
    if (this.#episode) this.#end()
  }

  /** The system was low on memory now or within the last minute. */
  lowRecently(): boolean {
    if (this.#episode) return true
    const now = (this.#options.now ?? Date.now)()
    return this.#lastLowAt !== undefined && now - this.#lastLowAt <= RECENT_MS
  }

  dispose(): void {
    if (this.#timer) clearInterval(this.#timer)
    this.#timer = undefined
  }

  async tick(): Promise<void> {
    if (this.#reading) return
    this.#reading = true
    try {
      await this.#tick()
    } catch {
      // A failed read says nothing about memory; try again next tick.
    } finally {
      this.#reading = false
    }
  }

  async #tick(): Promise<void> {
    const now = (this.#options.now ?? Date.now)()
    const { freeBytes, totalBytes } = (this.#options.readPhysical ?? readPhysical)()
    const readDetail = this.#options.readDetail ?? readWindowsDetail
    const freeShare = totalBytes > 0 ? freeBytes / totalBytes : 1
    const physicalLow = freeShare < 0.12 || freeBytes < 2 * GIB
    if (!physicalLow) {
      if (this.#episode) this.#end()
      return
    }
    if (now - this.#lastDetailAt < (this.#options.detailMinMs ?? DETAIL_MIN_MS)) return
    this.#lastDetailAt = now
    const detail = await readDetail()
    if (detail === undefined) {
      // No commit charge on this platform: only a nearly empty physical memory is a warning.
      if (freeShare < 0.05 || freeBytes < 0.6 * GIB) {
        this.#lastLowAt = now
        this.#begin({})
      } else if (this.#episode && freeShare >= 0.1) this.#end()
      return
    }
    if (detail.committedPercent >= COMMIT_LOW_PERCENT) {
      this.#lastLowAt = now
      this.#begin(detail)
    } else if (this.#episode && detail.committedPercent < COMMIT_OK_PERCENT) this.#end()
  }

  #begin(detail: Partial<MemoryDetail>): void {
    if (this.#episode) return
    this.#episode = true
    this.#options.onChange({
      state: 'low',
      ...(detail.committedPercent !== undefined
        ? { committedPercent: detail.committedPercent }
        : {}),
      ...(detail.consumers?.length ? { consumers: detail.consumers } : {}),
    })
  }

  #end(): void {
    this.#episode = false
    this.#options.onChange({ state: 'ok' })
  }
}

function readPhysical() {
  return { freeBytes: freemem(), totalBytes: totalmem() }
}

/** The commit charge against its limit and the four biggest programs by working set. */
const WINDOWS_SCRIPT = [
  '$m = Get-CimInstance Win32_PerfRawData_PerfOS_Memory',
  '$p = Get-Process | Group-Object ProcessName | ForEach-Object { [pscustomobject]@{ n = $_.Name; b = ($_.Group | Measure-Object WorkingSet64 -Sum).Sum } } | Sort-Object b -Descending | Select-Object -First 4',
  '@{ used = $m.CommittedBytes; limit = $m.CommitLimit; top = @($p) } | ConvertTo-Json -Compress -Depth 3',
].join('; ')

const READ_TIMEOUT_MS = 8_000

export function readWindowsDetail(): Promise<MemoryDetail | undefined> {
  if (process.platform !== 'win32') return Promise.resolve(undefined)
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_SCRIPT],
      { windowsHide: true, timeout: READ_TIMEOUT_MS, maxBuffer: 64 * 1024 },
      (error, stdout) => resolve(error ? undefined : parseWindowsDetail(stdout)),
    )
  })
}

/** Friendly names for the programs a person recognises; anything else is shown as it is named. */
const PROGRAM_NAMES = new Map([
  ['afterfx', 'After Effects'],
  ['aerender', 'After Effects'],
  ['adobe premiere pro', 'Premiere Pro'],
])

export function parseWindowsDetail(stdout: string): MemoryDetail | undefined {
  let value: unknown
  try {
    value = JSON.parse(stdout.trim())
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null) return undefined
  const { used, limit, top } = value as { used?: unknown; limit?: unknown; top?: unknown }
  const usedBytes = Number(used)
  const limitBytes = Number(limit)
  if (!Number.isFinite(usedBytes) || !Number.isFinite(limitBytes) || limitBytes <= 0)
    return undefined
  const consumers: MemoryConsumer[] = []
  for (const entry of Array.isArray(top) ? top : []) {
    const { n, b } = (entry ?? {}) as { n?: unknown; b?: unknown }
    if (typeof n !== 'string' || n.length === 0 || !Number.isFinite(Number(b))) continue
    const name = PROGRAM_NAMES.get(n.toLowerCase()) ?? n
    const existing = consumers.find((consumer) => consumer.name === name)
    if (existing) existing.bytes += Number(b)
    else consumers.push({ name: name.slice(0, 80), bytes: Number(b) })
  }
  consumers.sort((a, b) => b.bytes - a.bytes)
  return {
    committedPercent: Math.min(100, Math.round((usedBytes / limitBytes) * 100)),
    consumers: consumers.slice(0, 3),
  }
}
