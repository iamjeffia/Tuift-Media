import { describeFailure } from './write-failure.js'

/**
 * The exit code for an exception nothing caught. A plain non-zero code for now: the server's
 * exit codes are defined together elsewhere, and this is the one to replace there.
 */
export const UNCAUGHT_EXCEPTION_EXIT_CODE = 1

/** How long the log gets to flush before an uncaught exception ends the process. */
const FLUSH_MS = 200

type Guards = {
  /** Where the server logs; one line, never conversation text. */
  log?: (line: string) => void
  exit?: (code: number) => void
  /** Whatever must be stopped cleanly before exiting, such as the agents' processes. */
  beforeExit?: () => void
  /** Where the events come from; the process, unless a test says otherwise. */
  target?: Pick<NodeJS.Process, 'on' | 'off'>
}

function describe(value: unknown): string {
  const name = value instanceof Error ? value.name : typeof value
  return `${name}: ${describeFailure(value)}`
}

/**
 * The process's last resort. A promise nobody awaited that rejects is logged and the server keeps
 * serving: one failed write or one adapter bug must not take every chat down with it. An
 * exception that reached the top leaves the process in a state nobody knows, so it is logged and
 * the process exits with a code.
 *
 * Only what failed is logged: the error's name and first line, and the origin. The message is
 * cut short, and the stack is left out, since an error can carry the text it was working on.
 */
export function installProcessGuards({
  log = (line) => console.error(line),
  exit = (code) => process.exit(code),
  beforeExit,
  target = process,
}: Guards = {}): () => void {
  let exiting = false
  const onRejection = (reason: unknown) => log(`[server] unhandled rejection: ${describe(reason)}`)
  const onException = (error: unknown, origin: string) => {
    log(`[server] uncaught exception (${origin}): ${describe(error)}`)
    if (exiting) return
    exiting = true
    try {
      beforeExit?.()
    } catch {
      // Already exiting; nothing is left to report it to.
    }
    setTimeout(() => exit(UNCAUGHT_EXCEPTION_EXIT_CODE), FLUSH_MS)
  }
  target.on('unhandledRejection', onRejection)
  target.on('uncaughtException', onException)
  return () => {
    target.off('unhandledRejection', onRejection)
    target.off('uncaughtException', onException)
  }
}
