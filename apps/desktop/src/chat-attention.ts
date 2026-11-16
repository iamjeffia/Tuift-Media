import type { MessageKey } from './i18n.js'

/**
 * Telling the user that a chat needs them, or finished, while TUIFT Code is not
 * in front.
 *
 * After every sidebar status change the renderer reports the chats that are
 * not at rest: running, waiting on an approval or a question, or failed. It
 * reads the status the sidebar draws, so this works the same for every
 * provider and API connection. This module compares each report with the one
 * before and decides what the OS shows:
 *
 * - one notification per chat state change, and only while the window is not
 *   in front (not focused, minimized or hidden), so the chat the user is
 *   looking at never notifies;
 * - a badge that counts the chats that started waiting on the user while the
 *   window was away, cleared when the window comes back to the front.
 *
 * The first report from a page is a baseline: chats that were already waiting
 * before the app or the page started do not notify.
 *
 * With the server this app owns, the server is the source of the chats: it tells
 * this process over the parent channel (see parseChatActivity), so the same rules
 * hold with no window open. The page then only says which notification mode the
 * person chose, and the baseline is the server's first report after it starts.
 */

export const NOTIFICATION_MODES = ['off', 'needs-you', 'needs-you-or-finished'] as const
export type NotificationMode = (typeof NOTIFICATION_MODES)[number]
/** The page's default, until the person picks another. */
export const DEFAULT_NOTIFICATION_MODE: NotificationMode = 'needs-you'

export const CHAT_STATES = ['working', 'approval', 'input', 'failed'] as const
/** A chat missing from a report is at rest: idle, or finished and waiting to be read. */
export type ChatState = (typeof CHAT_STATES)[number]

export type ReportedChat = { id: string; title: string; state: ChatState }
export type ChatAttentionReport = { mode: NotificationMode; chats: ReportedChat[] }

export type ChatNotice = 'approval' | 'input' | 'failed' | 'finished'
export type ChatNotification = { chatId: string; title: string; notice: ChatNotice }

/** The catalog key (see i18n.ts) of what a notification says under the chat's title. */
export const NOTICE_KEY = {
  approval: 'notice.approval',
  input: 'notice.input',
  failed: 'notice.failed',
  finished: 'notice.finished',
} as const satisfies Record<ChatNotice, MessageKey>

export type ChatAttentionChange = {
  /** Notifications to show, at most one per chat. */
  notify: ChatNotification[]
  /** Chats whose state changed: a notification still up for one of them is out of date. */
  stale: string[]
  /** The badge count after this report. */
  badge: number
}

export const MAX_REPORTED_CHATS = 5_000
const MAX_CHAT_ID_LENGTH = 256
const MAX_REPORTED_TITLE_LENGTH = 1_000
/** Windows cuts a toast's title at about this length anyway. */
const MAX_NOTIFICATION_TITLE_LENGTH = 120

type WaitingState = Exclude<ChatState, 'working'>

function isWaiting(state: ChatState): state is WaitingState {
  return state !== 'working'
}

export class ChatAttention {
  #states = new Map<string, ChatState>()
  #titles = new Map<string, string>()
  /** The next report only re-learns the states; it announces nothing. */
  #baseline = true
  /** Chats that started waiting on the user while the window was away. */
  readonly #unseen = new Set<string>()

  get badge(): number {
    return this.#unseen.size
  }

  /** The window came to the front: everything that was waiting has been seen. */
  seen(): void {
    this.#unseen.clear()
  }

  /** A new page reports from scratch, so its first report is a baseline again. */
  reset(): void {
    this.#baseline = true
  }

  report(report: ChatAttentionReport, away: boolean): ChatAttentionChange {
    const previous = this.#states
    const previousTitles = this.#titles
    const announce = !this.#baseline && away && report.mode !== 'off'
    this.#baseline = false
    this.#states = new Map(report.chats.map((chat) => [chat.id, chat.state]))
    this.#titles = new Map(report.chats.map((chat) => [chat.id, notificationTitle(chat.title)]))
    if (report.mode === 'off') this.#unseen.clear()

    const notify: ChatNotification[] = []
    const stale: string[] = []
    for (const chat of report.chats) {
      if (previous.get(chat.id) === chat.state) continue
      stale.push(chat.id)
      if (!isWaiting(chat.state)) {
        this.#unseen.delete(chat.id)
      } else if (announce) {
        this.#unseen.add(chat.id)
        notify.push({ chatId: chat.id, title: this.#titles.get(chat.id)!, notice: chat.state })
      }
    }
    for (const [id, before] of previous) {
      if (this.#states.has(id)) continue
      stale.push(id)
      this.#unseen.delete(id)
      // Running, or held on the user, and now at rest: the turn ended. A
      // failed chat at rest was read or removed; nothing finished.
      if (announce && before !== 'failed' && report.mode === 'needs-you-or-finished') {
        notify.push({ chatId: id, title: previousTitles.get(id) ?? 'New chat', notice: 'finished' })
      }
    }
    return { notify, stale, badge: this.badge }
  }
}

function notificationTitle(title: string): string {
  const flat = title.replace(/\s+/g, ' ').trim()
  if (!flat) return 'New chat'
  return flat.length <= MAX_NOTIFICATION_TITLE_LENGTH
    ? flat
    : `${flat.slice(0, MAX_NOTIFICATION_TITLE_LENGTH - 1).trimEnd()}…`
}

/** The renderer is the least trusted process: anything malformed is ignored whole. */
export function parseChatAttentionReport(value: unknown): ChatAttentionReport | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const mode = record['mode']
  if (!NOTIFICATION_MODES.includes(mode as NotificationMode)) return undefined
  const chats = parseReportedChats(record['chats'])
  return chats && { mode: mode as NotificationMode, chats }
}

/** The type of the message the server sends up; mirrors CHAT_ACTIVITY_MESSAGE in @harness/contracts. */
export const CHAT_ACTIVITY_MESSAGE = 'harness:chatActivity'
export type ChatActivity = {
  /** Chats inside a turn or starting one: what keeps the computer awake and makes a quit ask. */
  running: number
  chats: ReportedChat[]
}

/**
 * What the server says about its chats. The parent channel carries anything the
 * server prints to it, so what is not exactly this message is ignored whole.
 */
export function parseChatActivity(value: unknown): ChatActivity | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const running = record['running']
  if (record['type'] !== CHAT_ACTIVITY_MESSAGE) return undefined
  if (typeof running !== 'number' || !Number.isSafeInteger(running) || running < 0) return undefined
  const chats = parseReportedChats(record['chats'])
  return chats && { running, chats }
}

function parseReportedChats(chats: unknown): ReportedChat[] | undefined {
  if (!Array.isArray(chats) || chats.length > MAX_REPORTED_CHATS) return undefined
  const parsed: ReportedChat[] = []
  const ids = new Set<string>()
  for (const entry of chats as unknown[]) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return undefined
    const chat = entry as Record<string, unknown>
    const id = chat['id']
    const title = chat['title']
    const state = chat['state']
    if (
      typeof id !== 'string' ||
      id.length === 0 ||
      id.length > MAX_CHAT_ID_LENGTH ||
      id.includes('\0') ||
      ids.has(id) ||
      typeof title !== 'string' ||
      title.length > MAX_REPORTED_TITLE_LENGTH ||
      !CHAT_STATES.includes(state as ChatState)
    ) {
      return undefined
    }
    ids.add(id)
    parsed.push({ id, title, state: state as ChatState })
  }
  return parsed
}
