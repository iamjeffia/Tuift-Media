import {
  CHAT_ACTIVITY_MESSAGE,
  MAX_CHAT_ID_LENGTH,
  MAX_REPORTED_CHATS,
  MAX_REPORTED_TITLE_LENGTH,
  chatStateOf,
  isTurnStatus,
  type ChatActivityMessage,
  type ReportedChat,
  type ThreadInboxStatus,
} from '@harness/contracts'

/**
 * Tells the process that owns this server (the desktop shell) which chats are
 * not at rest, so it can keep the computer awake, notify, and ask before a quit
 * when no window is open to say it. The state is the sidebar's own: the same
 * status function and the same rule for which chats the sidebar lists.
 *
 * Every report is the whole list, not a change, so a lost or late message is
 * corrected by the next one. A burst of status changes sends one message.
 */

/** Changes that arrive within this window of the first one go out together. */
export const CHAT_ACTIVITY_COALESCE_MS = 200

type ReportedThread = {
  title: string
  ephemeral?: boolean | undefined
  closedAt?: number | undefined
  worktreeBranch?: string | undefined
  unread?: boolean | undefined
}

export type ChatActivityDeps = {
  /** The sidebar's status for a chat; `queued` and `unread` spare a lookup when already known. */
  status: (threadId: string, queued?: boolean, unread?: boolean) => ThreadInboxStatus
  /** One chat, for a change. */
  thread: (threadId: string) => (ReportedThread & { id?: string }) | undefined
  /** Every chat the sidebar lists and which of them have prompts queued, read once for the first report. */
  sidebar: () => { threads: Iterable<ReportedThread & { id: string }>; queued: ReadonlySet<string> }
  send: (message: ChatActivityMessage) => void
}

export class ChatActivityReporter {
  readonly #deps: ChatActivityDeps
  /** Chats last found not at rest. */
  readonly #active = new Map<string, ReportedChat & { running: boolean }>()
  readonly #changed = new Set<string>()
  #all = true
  #timer: ReturnType<typeof setTimeout> | undefined
  #sent: string | undefined

  constructor(deps: ChatActivityDeps) {
    this.#deps = deps
  }

  /** The first report: every chat, once the server has recovered what the last run left. */
  start(): void {
    this.#all = true
    this.#schedule()
  }

  /** A chat's status, title or queue may have changed. */
  changed(threadId: string): void {
    this.#changed.add(threadId)
    this.#schedule()
  }

  dispose(): void {
    clearTimeout(this.#timer)
    this.#timer = undefined
  }

  #schedule(): void {
    if (this.#timer) return
    this.#timer = setTimeout(() => this.#flush(), CHAT_ACTIVITY_COALESCE_MS)
    this.#timer.unref?.()
  }

  #flush(): void {
    this.#timer = undefined
    if (this.#all) {
      this.#all = false
      this.#active.clear()
      try {
        const { threads, queued } = this.#deps.sidebar()
        for (const thread of threads) this.#evaluate(thread.id, thread, queued.has(thread.id))
      } catch {
        // The store cannot be read right now: the changes that follow rebuild the picture.
      }
    }
    for (const id of this.#changed) {
      try {
        this.#evaluate(id, this.#deps.thread(id))
      } catch {
        // A chat the store cannot read right now keeps what was last known; the next change retries.
      }
    }
    this.#changed.clear()
    // A title can change without a status change: read the live ones again.
    for (const [id, chat] of this.#active) {
      const title = this.#deps.thread(id)?.title
      if (title !== undefined) chat.title = reportedTitle(title)
    }
    const chats = [...this.#active.values()]
    // Past the bound (never seen in practice) the chats inside a turn are the ones to keep.
    if (chats.length > MAX_REPORTED_CHATS)
      chats.sort((a, b) => Number(b.running) - Number(a.running))
    const message: ChatActivityMessage = {
      type: CHAT_ACTIVITY_MESSAGE,
      running: chats.filter((chat) => chat.running).length,
      chats: chats
        .slice(0, MAX_REPORTED_CHATS)
        .map(({ id, title, state }) => ({ id, title, state })),
    }
    const serialized = JSON.stringify(message)
    // The first report always goes out: a new desktop run has nothing yet.
    if (serialized === this.#sent) return
    this.#sent = serialized
    try {
      this.#deps.send(message)
    } catch {
      // The channel is closed: the process that owns this server is gone.
    }
  }

  #evaluate(threadId: string, thread: ReportedThread | undefined, queued?: boolean): void {
    // The sidebar does not list side chats, sub-agent chats or archived chats
    // (unless one still owns a checkout), so neither does this.
    const listed =
      thread !== undefined &&
      threadId.length <= MAX_CHAT_ID_LENGTH &&
      !thread.ephemeral &&
      (thread.closedAt === undefined || thread.worktreeBranch !== undefined)
    if (!listed) {
      this.#active.delete(threadId)
      return
    }
    const status = this.#deps.status(threadId, queued, thread.unread)
    const state = chatStateOf(status)
    if (state === undefined) this.#active.delete(threadId)
    else {
      this.#active.set(threadId, {
        id: threadId,
        title: reportedTitle(thread.title),
        state,
        running: isTurnStatus(status),
      })
    }
  }
}

function reportedTitle(title: string): string {
  return title.length <= MAX_REPORTED_TITLE_LENGTH
    ? title
    : title.slice(0, MAX_REPORTED_TITLE_LENGTH)
}
