/**
 * A window hidden in the tray keeps its renderer alive with whatever memory it
 * grew to. After it has stayed hidden long enough, and nothing would be lost,
 * the window is destroyed; showing it again builds a new one the way startup
 * does (the same first paint). The server is a separate process: a turn that
 * starts meanwhile keeps working.
 */

/** How long a window stays hidden before its renderer is given up. */
export const HIDDEN_UNLOAD_MS = 5 * 60_000
/** The page has this long to say whether anything would be lost. */
export const UNLOAD_PROBE_TIMEOUT_MS = 2_000

export type HiddenWindowUnloadHost = {
  /** What only the shell knows: not quitting, no chat working, the window hidden and healthy. */
  mayUnload: () => boolean
  /** Asks the page whether anything it holds would be lost; false when it cannot tell. */
  pageIsSafe: () => Promise<boolean>
  unload: () => void
}

export class HiddenWindowUnloader {
  #hidden = false
  #generation = 0
  #timer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly host: HiddenWindowUnloadHost) {}

  /** The window was hidden to the tray. */
  hidden(): void {
    this.#hidden = true
    this.#schedule()
  }

  /** The window is on screen again, or gone. */
  shown(): void {
    this.#hidden = false
    this.#generation += 1
    this.#clear()
  }

  /**
   * The count of chats working, as the server reports it. A chat that just ended
   * gets the whole wait again, so its notification and the next queued prompt
   * are not cut off by an unload.
   */
  agentsChanged(count: number): void {
    if (!this.#hidden) return
    if (count > 0) this.#clear()
    else this.#schedule()
  }

  dispose(): void {
    this.shown()
  }

  #schedule(): void {
    this.#clear()
    this.#timer = setTimeout(() => void this.#check(), HIDDEN_UNLOAD_MS)
    this.#timer.unref?.()
  }

  #clear(): void {
    clearTimeout(this.#timer)
    this.#timer = undefined
  }

  async #check(): Promise<void> {
    this.#timer = undefined
    const generation = this.#generation
    // Not now: ask again after another wait instead of keeping a watcher.
    if (!this.host.mayUnload()) return this.#schedule()
    const safe = await this.host.pageIsSafe().catch(() => false)
    if (generation !== this.#generation) return
    if (!safe || !this.host.mayUnload()) return this.#schedule()
    this.#hidden = false
    this.host.unload()
  }
}

/** Matches the page's answers to the questions the shell asked. */
export class UnloadProbe {
  #next = 1
  readonly #pending = new Map<number, (safe: boolean) => void>()

  /** `send` delivers the question to the page; no answer in time counts as not safe. */
  ask(send: (id: number) => void, timeoutMs = UNLOAD_PROBE_TIMEOUT_MS): Promise<boolean> {
    return new Promise((resolve) => {
      const id = this.#next++
      const finish = (safe: boolean) => {
        clearTimeout(timer)
        this.#pending.delete(id)
        resolve(safe)
      }
      const timer = setTimeout(() => finish(false), timeoutMs)
      this.#pending.set(id, finish)
      try {
        send(id)
      } catch {
        finish(false)
      }
    })
  }

  answer(id: unknown, safe: unknown): void {
    if (typeof id !== 'number') return
    this.#pending.get(id)?.(safe === true)
  }
}

const MAX_CHAT_ID_LENGTH = 256

/** The chat the page shows, as it reports it; anything malformed means none. */
export function parseActiveChatId(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_CHAT_ID_LENGTH
    ? value
    : undefined
}
