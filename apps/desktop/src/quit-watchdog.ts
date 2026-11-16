/**
 * Deadlines for quitting. A quit is a short list of steps (let go of an update, stop the server
 * and with it the turns and the provider processes, close the windows). Each step may take only
 * so long, and the whole quit may take only so long: a step that hangs is written in the log and
 * the quit goes on, and a quit that does not finish exits anyway with a code of its own. Whoever
 * waits for the app to end (the installer) can then wait for a known time and no longer.
 */

/** The app ended because its quit ran out of time, not because every step closed. */
export const QUIT_FORCED_EXIT = 3

export const QUIT_DEADLINES = {
  /** Detaching a mounted update disk image. */
  updateCleanupMs: 3_000,
  /**
   * The server's own shutdown: stopping the turns (1.5 s), then everything else, asked for 3 s
   * and ended by force for up to 5 s more (SERVER_SHUTDOWN_TIMEOUT_MS and
   * SERVER_TREE_STOP_BUDGET_MS in server-supervisor.ts); this is the outer limit over both.
   */
  serverMs: 10_000,
  /** From the start of the quit to the exit, whatever is still open. */
  totalMs: 15_000,
} as const

export type QuitWatchdogOptions = {
  totalMs?: number
  log: (line: string) => void
  exit: (code: number) => void
  /** Called once, before the forced exit, with the steps that had not closed. */
  forced?: (notClosed: string[]) => void
}

export function createQuitWatchdog(options: QuitWatchdogOptions) {
  const totalMs = options.totalMs ?? QUIT_DEADLINES.totalMs
  let timer: ReturnType<typeof setTimeout> | undefined
  let started = false
  const open = new Set<string>()
  const missed = new Set<string>()

  const expire = () => {
    timer = undefined
    const notClosed = [...open]
    options.log(
      `[quit] did not finish in ${totalMs} ms; still open: ${notClosed.join(', ') || 'closing the windows'}; exiting anyway`,
    )
    options.forced?.(notClosed)
    options.exit(QUIT_FORCED_EXIT)
  }

  return {
    get started(): boolean {
      return started
    },
    /** Starts the clock for the whole quit. Later calls change nothing. */
    start(): void {
      if (started) return
      started = true
      timer = setTimeout(expire, totalMs)
    },
    /**
     * Runs one step and resolves when it ends or when its time is up, whichever comes first: a
     * step that is late is logged and left behind, and one that fails is logged and counted as
     * ended. Never rejects, so the steps after it always run.
     */
    step(name: string, deadlineMs: number, work: () => unknown): Promise<void> {
      open.add(name)
      return new Promise<void>((resolve) => {
        let settled = false
        const end = (why?: string) => {
          if (settled) return
          settled = true
          clearTimeout(late)
          if (why) options.log(why)
          resolve()
        }
        const late = setTimeout(() => {
          missed.add(name)
          end(`[quit] ${name} did not close in ${deadlineMs} ms; going on without it`)
        }, deadlineMs)
        Promise.resolve()
          .then(work)
          .then(
            () => {
              open.delete(name)
              end()
            },
            (error: unknown) => {
              open.delete(name)
              end(
                `[quit] ${name} failed: ${error instanceof Error ? error.message : String(error)}`,
              )
            },
          )
      })
    },
    /** The quit reached its end: stops the clock and returns the steps that were late. */
    finish(): string[] {
      clearTimeout(timer)
      timer = undefined
      return [...missed]
    },
  }
}

export type QuitWatchdog = ReturnType<typeof createQuitWatchdog>
