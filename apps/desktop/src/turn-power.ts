/**
 * Keeps the computer awake while a chat works, so a long turn is not cut off
 * by the system going to sleep (the display may still turn off).
 *
 * With the server this app owns, the count comes from the server itself (see
 * server-activity.ts), so it is right with no window open, and the page's
 * grace below is not used. Only a server the app does not own (a dev server)
 * leaves the count to the main window's page, which reports after every
 * sidebar status change. That page can go away without saying zero (a crash, a
 * reload), so its last count is held only for a grace period; a page that
 * comes back reports again at once and the hold carries on.
 */

/** How long the last count is trusted after its page went away. */
export const POWER_REPORT_GRACE_MS = 2 * 60_000

export type PowerBlocker = {
  /** Starts a blocker that keeps the system awake and returns its id. */
  start: () => number
  stop: (id: number) => void
}

export class TurnPowerGuard {
  #id: number | undefined
  #grace: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly blocker: PowerBlocker) {}

  get holding(): boolean {
    return this.#id !== undefined
  }

  /** The main page's count of chats with a running turn. */
  report(count: number): void {
    this.#clearGrace()
    if (count > 0) this.#hold()
    else this.#release()
  }

  /** The page was replaced or crashed: its last count is trusted only for a while. */
  pageGone(): void {
    if (this.#id === undefined || this.#grace !== undefined) return
    this.#grace = setTimeout(() => {
      this.#grace = undefined
      this.#release()
    }, POWER_REPORT_GRACE_MS)
    this.#grace.unref?.()
  }

  dispose(): void {
    this.#clearGrace()
    this.#release()
  }

  #hold(): void {
    this.#id ??= this.blocker.start()
  }

  #release(): void {
    if (this.#id === undefined) return
    const id = this.#id
    this.#id = undefined
    this.blocker.stop(id)
  }

  #clearGrace(): void {
    clearTimeout(this.#grace)
    this.#grace = undefined
  }
}
