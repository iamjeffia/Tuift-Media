/**
 * Quitting from inside the app while chats work asks first. The shell holds the quit and asks
 * the page to show its question (the notice the update question uses). A page that cannot show
 * it, or never says it listens, leaves the person without a way to quit, so after a short wait
 * the shell asks in a native dialog instead. Whoever answers, "quit" lets the quit through and
 * "keep working" leaves everything as it was.
 */

export type QuitRequestDeps = {
  /** Chats with a running turn, as the page last reported them. */
  chats: () => number
  /** Brings the window forward; a quit from the tray comes with the window hidden. */
  show: () => void
  /** Sends the question to the page. False when there is no page that can show it. */
  ask: (chats: number) => boolean
  askNatively: (chats: number) => Promise<boolean>
  /** The person said quit: let the quit through. */
  confirm: () => void
  /** The person said keep working: nothing changes. */
  declined?: () => void
  /** How long the page has to say it shows the question. */
  ackMs?: number
}

export const QUIT_ACK_MS = 2_000

export function createQuitRequest(deps: QuitRequestDeps) {
  let open = false
  let shown = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const finish = (quit: boolean) => {
    if (!open) return
    open = false
    shown = false
    clearTimeout(timer)
    timer = undefined
    if (quit) deps.confirm()
    else deps.declined?.()
  }
  const natively = (chats: number) => {
    shown = true
    void deps.askNatively(chats).then(finish, () => finish(false))
  }

  return {
    /** A quit began while chats work. Asking again while a question is open only shows it. */
    request(): void {
      deps.show()
      if (open) return
      open = true
      shown = false
      const chats = deps.chats()
      if (!deps.ask(chats)) {
        natively(chats)
        return
      }
      timer = setTimeout(() => {
        if (open && !shown) natively(chats)
      }, deps.ackMs ?? QUIT_ACK_MS)
    },
    /** The page shows its question. */
    shown(): void {
      if (open) shown = true
    },
    /** The page's answer: true quits, false keeps working. */
    answer(quit: boolean): void {
      finish(quit)
    },
  }
}
