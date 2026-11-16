import type { ThreadErrorReason } from '@harness/contracts'

/**
 * One place that says why a provider's process ended. Every adapter that runs a process
 * reports its end as the same few English sentences ("… exited with code N", "… terminated by
 * signal S", "… exited (code N)", "… returned an error result: …"); the orchestrator reads the
 * facts out of them here and turns them into a structured reason the renderer can word.
 *
 * Nothing here looks at the system. The caller says whether it was low on memory just before
 * the process ended, which is the only thing that lets a crash code mean "out of memory".
 */

export type ProcessExit = {
  /** The label the adapter used, such as "Claude Code". */
  label: string | undefined
  /** Unsigned on Windows. Absent when a signal ended the process or the adapter did not say. */
  code: number | undefined
  signal: string | undefined
  /** What the provider itself said when it ended with an error result. */
  providerMessage: string | undefined
}

const CODE_PATTERNS = [
  /exited with code (-?\d+|unknown)/i,
  /exited \(code (-?\d+|null|undefined)\)/i,
]
const SIGNAL_PATTERN = /terminated by signal (\w+)/i
const ERROR_RESULT_PATTERN = /returned an error result: ([\s\S]+)$/i
const LABEL_PATTERN = /^(.+?) (?:process |server )?(?:exited|terminated|returned)\b/i

/** The facts of a process that ended, when `message` is one of the adapters' end sentences. */
export function parseProcessExit(message: string): ProcessExit | undefined {
  const providerMessage = ERROR_RESULT_PATTERN.exec(message)?.[1]?.trim()
  const signal = SIGNAL_PATTERN.exec(message)?.[1]
  let code: number | undefined
  let matchedCode = false
  for (const pattern of CODE_PATTERNS) {
    const raw = pattern.exec(message)?.[1]
    if (raw === undefined) continue
    matchedCode = true
    const parsed = Number(raw)
    if (Number.isSafeInteger(parsed)) code = parsed < 0 ? parsed >>> 0 : parsed
    break
  }
  if (!matchedCode && !signal && providerMessage === undefined) return undefined
  return {
    label: LABEL_PATTERN.exec(message)?.[1],
    code,
    signal,
    providerMessage: providerMessage?.slice(0, 500),
  }
}

/** Windows status codes a process dies with when it crashes. */
const WINDOWS_CRASH_CODES = new Set([
  0xc0000005, // access violation
  0xc00000fd, // stack overflow
  0xc0000374, // heap corruption
  0xc0000409, // fast fail, which is what abort() and a failed allocation end in
  0x80000003, // breakpoint, as a runtime's fatal error raises it
])
/** Windows says outright that the allocation failed. */
const WINDOWS_MEMORY_CODES = new Set([0xc0000017, 0xc000009a])
/** The console's Ctrl+C or window close reached the process. */
const WINDOWS_STOP_CODES = new Set([0xc000013a, 0x40010004, 0x40010005])

const OUT_OF_MEMORY_TEXT = /out of memory|heap out of memory|ENOMEM|cannot allocate memory/i

/** What a shell reports when a signal ended the process: 128 plus the signal number. */
const SIGNALS_BY_SHELL_CODE = new Map([
  [129, 'SIGHUP'],
  [130, 'SIGINT'],
  [131, 'SIGQUIT'],
  [134, 'SIGABRT'],
  [137, 'SIGKILL'],
  [139, 'SIGSEGV'],
  [143, 'SIGTERM'],
])
/** Ended on request: the person or the system closing it, not a failure of the process. */
const STOP_SIGNALS = new Set(['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGTERM'])
/** What the kernel's out-of-memory killer and a failed allocation end a process with. */
const MEMORY_SIGNALS = new Set(['SIGKILL', 'SIGABRT', 'SIGSEGV', 'SIGBUS'])

export function windowsStatusHex(code: number): string {
  return `0x${(code >>> 0).toString(16).toUpperCase().padStart(8, '0')}`
}

/**
 * How sure each answer is:
 * - A status that means "no memory", or the provider saying so: out of memory, certain.
 * - A crash or a kill, with the system low on memory just before: out of memory, likely.
 * - A signal that asks a process to end: stopped. A crash or a kill alone: a signal, or unknown.
 * - Otherwise the provider's own error, or unknown. The code stays with the reason.
 */
export function classifyProcessExit(
  exit: ProcessExit,
  options: { lowMemory: boolean },
): ThreadErrorReason {
  const code = exit.code
  const signal = exit.signal ?? (code !== undefined ? SIGNALS_BY_SHELL_CODE.get(code) : undefined)
  const base = {
    ...(code !== undefined ? { exitCode: code } : {}),
    ...(signal ? { signal } : {}),
  }
  if (
    (code !== undefined && WINDOWS_MEMORY_CODES.has(code)) ||
    OUT_OF_MEMORY_TEXT.test(exit.providerMessage ?? '')
  )
    return { code: 'process_memory', certainty: 'certain', ...base }
  if (code !== undefined && WINDOWS_STOP_CODES.has(code)) return { code: 'process_signal', ...base }
  if (signal && STOP_SIGNALS.has(signal)) return { code: 'process_signal', ...base }
  const crashed =
    (code !== undefined && WINDOWS_CRASH_CODES.has(code)) ||
    (signal !== undefined && MEMORY_SIGNALS.has(signal))
  if (crashed && options.lowMemory) return { code: 'process_memory', certainty: 'likely', ...base }
  if (signal) return { code: 'process_signal', ...base }
  if (exit.providerMessage)
    return { code: 'process_provider_error', message: exit.providerMessage, ...base }
  return { code: 'process_unknown', ...base }
}

/**
 * The English line stored with the event, for the transcript and the logs. Only the reasons the
 * raw sentence explains badly are reworded; the rest keep what the adapter wrote, with the
 * Windows status in hex next to a bare number.
 */
export function describeProcessExit(
  original: string,
  exit: ProcessExit,
  reason: ThreadErrorReason,
): string {
  const label = exit.label ?? 'The provider'
  const status =
    reason.exitCode !== undefined && reason.exitCode >= 0x80000000
      ? `exit code ${windowsStatusHex(reason.exitCode)}`
      : reason.exitCode !== undefined
        ? `exit code ${reason.exitCode}`
        : reason.signal
          ? `signal ${reason.signal}`
          : undefined
  const kept = 'Your conversation and the files already written are kept.'
  if (reason.code === 'process_memory') {
    const how =
      reason.certainty === 'certain'
        ? 'because the system ran out of memory'
        : 'most likely because the system ran out of memory'
    return `${label} was ended unexpectedly, ${how}${status ? ` (${status})` : ''}. ${kept}`
  }
  if (reason.code === 'process_signal')
    return `${label} was stopped before the turn ended${status ? ` (${status})` : ''}. ${kept}`
  if (
    reason.code === 'process_unknown' &&
    reason.exitCode !== undefined &&
    reason.exitCode >= 0x80000000
  )
    return original.replace(
      String(reason.exitCode),
      `${reason.exitCode} (${windowsStatusHex(reason.exitCode)})`,
    )
  return original
}
