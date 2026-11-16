import { execFile } from 'node:child_process'
import path from 'node:path'

/** One process as the system reports it. */
export type ProcessInfo = {
  pid: number
  ppid: number
  /**
   * When the process started, as the system writes it: Windows creation time in .NET ticks (UTC),
   * `ps` `lstart` elsewhere. Only ever compared with the same field of another read, never parsed.
   */
  startTime: string
  /** The executable's path on Windows, `ps` `comm` elsewhere. Empty when the system will not say. */
  exe: string
}

export type ProcessTable = ReadonlyMap<number, ProcessInfo>
export type ProcessTableReader = () => Promise<ProcessTable>

// One run lists every process with its parent, start time and executable. UTF-8 out, so a path with
// accents survives. Windows has no cheaper way from plain Node: this is one PowerShell start, about
// 0.4 s on the owner's machine, paid when a child has lived a while and when the app starts after a crash.
const WINDOWS_SCRIPT =
  '[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);' +
  'Get-CimInstance -ClassName Win32_Process -Property ProcessId,ParentProcessId,CreationDate,ExecutablePath |' +
  " ForEach-Object { '{0}|{1}|{2}|{3}' -f $_.ProcessId,$_.ParentProcessId," +
  '$_.CreationDate.ToUniversalTime().Ticks,$_.ExecutablePath }'

const READ_TIMEOUT_MS = 15_000

/** Parses the lines the Windows script prints. */
export function parseWindowsProcessTable(output: string): ProcessTable {
  const table = new Map<number, ProcessInfo>()
  for (const line of output.split(/\r?\n/)) {
    const first = line.indexOf('|')
    const second = line.indexOf('|', first + 1)
    const third = line.indexOf('|', second + 1)
    if (first < 0 || second < 0 || third < 0) continue
    const pid = Number(line.slice(0, first))
    const ppid = Number(line.slice(first + 1, second))
    const startTime = line.slice(second + 1, third)
    if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(ppid) || startTime === '') continue
    table.set(pid, { pid, ppid, startTime, exe: line.slice(third + 1) })
  }
  return table
}

const POSIX_ROW = /^\s*(\d+)\s+(\d+)\s+([A-Za-z]{3} [A-Za-z]{3}\s+\d+ \d\d:\d\d:\d\d \d{4})\s+(.*)$/

/** Parses `ps -A -o pid= -o ppid= -o lstart= -o comm=`. */
export function parsePosixProcessTable(output: string): ProcessTable {
  const table = new Map<number, ProcessInfo>()
  for (const line of output.split('\n')) {
    const row = POSIX_ROW.exec(line)
    if (!row) continue
    const pid = Number(row[1])
    table.set(pid, { pid, ppid: Number(row[2]), startTime: row[3]!, exe: row[4]!.trim() })
  }
  return table
}

/** Every process on the machine, with the system's own start time and executable for each. */
export const readProcessTable: ProcessTableReader = () =>
  new Promise((resolve, reject) => {
    const windows = process.platform === 'win32'
    const command = windows
      ? path.join(
          process.env['SystemRoot'] ?? 'C:\\Windows',
          'System32',
          'WindowsPowerShell',
          'v1.0',
          'powershell.exe',
        )
      : 'ps'
    const args = windows
      ? ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_SCRIPT]
      : ['-A', '-o', 'pid=', '-o', 'ppid=', '-o', 'lstart=', '-o', 'comm=']
    execFile(
      command,
      args,
      {
        windowsHide: true,
        encoding: 'utf8',
        timeout: READ_TIMEOUT_MS,
        maxBuffer: 16 * 1024 * 1024,
        // `lstart` is written in the locale's words otherwise.
        env: { ...process.env, LC_ALL: 'C' },
      },
      (error, stdout) => {
        if (error) reject(error)
        else resolve(windows ? parseWindowsProcessTable(stdout) : parsePosixProcessTable(stdout))
      },
    )
  })

/** Whether two reads describe the same process: same start time and the same executable. */
export function sameProcess(
  a: Pick<ProcessInfo, 'startTime' | 'exe'>,
  b: Pick<ProcessInfo, 'startTime' | 'exe'>,
): boolean {
  if (a.startTime !== b.startTime) return false
  return process.platform === 'win32'
    ? a.exe.toLowerCase() === b.exe.toLowerCase()
    : a.exe === b.exe
}

/** The processes below `pid`, by parent links, nearest first, at most `limit` of them. */
export function descendantsOf(table: ProcessTable, pid: number, limit = 64): ProcessInfo[] {
  const found: ProcessInfo[] = []
  const seen = new Set([pid])
  let level = [pid]
  while (level.length > 0 && found.length < limit) {
    const next: number[] = []
    for (const info of table.values()) {
      if (!level.includes(info.ppid) || seen.has(info.pid)) continue
      seen.add(info.pid)
      found.push(info)
      next.push(info.pid)
      if (found.length >= limit) break
    }
    level = next
  }
  return found
}
