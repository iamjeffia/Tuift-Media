import { POWER_REPORT_GRACE_MS } from './turn-power.js'

/**
 * How many chats the server this app owns runs a turn in, as it last reported.
 * Power, the hidden-window unloader, the quit question and the update installer
 * all read this one number.
 *
 * The server sends the whole picture at every change, and once in full when it
 * starts, so a restarted server replaces whatever the last one left. When the
 * server's process ends, its last count is kept (a restart is usually back within
 * seconds, and the supervisor's restart must not let the computer sleep in the
 * middle of a turn or let a quit through unasked), but not for ever: a server
 * that does not come back leaves no turn running, so after a while the count is
 * zero.
 */
export class ServerActivity {
  #running = 0
  #grace: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly changed: (running: number) => void,
    private readonly graceMs = POWER_REPORT_GRACE_MS,
  ) {}

  get running(): number {
    return this.#running
  }

  /** The server reported: its count replaces the last. */
  report(running: number): void {
    this.#clearGrace()
    this.#set(running)
  }

  /** The server's process ended; the last count holds only for the grace period. */
  serverGone(): void {
    if (this.#running === 0 || this.#grace !== undefined) return
    this.#grace = setTimeout(() => {
      this.#grace = undefined
      this.#set(0)
    }, this.graceMs)
    this.#grace.unref?.()
  }

  dispose(): void {
    this.#clearGrace()
  }

  #set(running: number): void {
    if (running === this.#running) return
    this.#running = running
    this.changed(running)
  }

  #clearGrace(): void {
    clearTimeout(this.#grace)
    this.#grace = undefined
  }
}
