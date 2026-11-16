import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { scrub } from './local-diagnostics.js'
import type { MessageKey } from './i18n.js'
import type { ServerExit } from './server-supervisor.js'
import type { ServerExitCause } from './server-exit-codes.js'

const MAX_LOG_BYTES = 128 * 1024
const MAX_ENTRY_BYTES = 8 * 1024
const LOG_NAME = 'server-exit.log'

/** Where the server's exits are written: the app's local diagnostics folder. */
export function serverExitLogFile(diagnosticsDirectory: string): string {
  return path.join(diagnosticsDirectory, LOG_NAME)
}

/**
 * One entry for a run of the server that ended: the exit code and signal, the cause the server
 * named, and the last lines it printed, each cut to a bounded length and scrubbed of secrets,
 * addresses and home folders. It is written even when the person left Local diagnostics off,
 * because a server that cannot start is exactly when nothing else explains it. Only exits
 * are recorded, never a line of a healthy run, and the file is capped: when it passes its
 * size the old one is replaced by the new, so at most two files are kept.
 */
export function recordServerExit(diagnosticsDirectory: string, exit: ServerExit): void {
  try {
    mkdirSync(diagnosticsDirectory, { recursive: true, mode: 0o700 })
    const header =
      `${new Date().toISOString()} [server exit] code=${exit.code ?? 'null'}` +
      ` signal=${exit.signal ?? 'null'} cause=${exit.cause ?? 'unknown'}` +
      ` restarting=${exit.willRetry ? 'yes' : 'no'}`
    const lines = exit.tail.map((line) => `  | ${scrub(line)}`)
    let entry = [scrub(header), ...lines].join('\n') + '\n'
    if (Buffer.byteLength(entry) > MAX_ENTRY_BYTES)
      entry =
        Buffer.from(entry).subarray(0, MAX_ENTRY_BYTES).toString('utf8').replace(/�$/u, '') + '\n'
    const file = serverExitLogFile(diagnosticsDirectory)
    const size = statSync(file, { throwIfNoEntry: false })?.size ?? 0
    if (size + Buffer.byteLength(entry) > MAX_LOG_BYTES) {
      rmSync(`${file}.previous`, { force: true })
      renameSync(file, `${file}.previous`)
    }
    appendFileSync(file, entry, { encoding: 'utf8', mode: 0o600 })
  } catch {
    // Writing the record must never become a second failure.
  }
}

export type ServerFailureText = {
  message: { key: MessageKey; vars?: Record<string, string> }
  detail: { key: MessageKey; vars?: Record<string, string> }
  /** True for a cause the person can fix and then try again; false for the unknown case. */
  named: boolean
}

/** The catalog keys, with their values, that say what happened and what to do for a failure. */
export function serverFailureText(
  cause: ServerExitCause | undefined,
  context: { port: string | undefined; file: string },
): ServerFailureText {
  const port = context.port ?? '4317'
  const file = context.file
  switch (cause) {
    case 'portInUse':
      return {
        message: { key: 'dialog.serverFailed.portInUse.message', vars: { port } },
        detail: { key: 'dialog.serverFailed.portInUse.detail', vars: { port } },
        named: true,
      }
    case 'dataFolderInUse':
      return {
        message: { key: 'dialog.serverFailed.dataFolderInUse.message' },
        detail: { key: 'dialog.serverFailed.dataFolderInUse.detail' },
        named: true,
      }
    case 'databaseLocked':
      return {
        message: { key: 'dialog.serverFailed.databaseLocked.message' },
        detail: { key: 'dialog.serverFailed.databaseLocked.detail' },
        named: true,
      }
    case 'databaseDamaged':
      return {
        message: { key: 'dialog.serverFailed.databaseDamaged.message' },
        detail: { key: 'dialog.serverFailed.databaseDamaged.detail', vars: { file } },
        named: true,
      }
    case 'databaseNoAccess':
      return {
        message: { key: 'dialog.serverFailed.databaseNoAccess.message' },
        detail: { key: 'dialog.serverFailed.databaseNoAccess.detail', vars: { file } },
        named: true,
      }
    case 'diskFull':
      return {
        message: { key: 'dialog.serverFailed.diskFull.message' },
        detail: { key: 'dialog.serverFailed.diskFull.detail' },
        named: true,
      }
    default:
      return {
        message: { key: 'dialog.serverCrashed.message' },
        detail: { key: 'dialog.serverFailed.unknown.detail', vars: { file } },
        named: false,
      }
  }
}
