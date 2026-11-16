import {
  ChatAttention,
  DEFAULT_NOTIFICATION_MODE,
  NOTICE_KEY,
  parseChatAttentionReport,
  type ChatNotification,
  type NotificationMode,
  type ReportedChat,
} from './chat-attention.js'
import { translate, type Language } from './i18n.js'

/** A notification the OS is showing or keeps in its notification centre. */
export type ShownNotification = { close: () => void }

/** What the notifier needs from Electron, so the rules can be tested without it. */
export type ChatNotifierHost = {
  /** True while the main window is not in front: unfocused, minimized or hidden. */
  isAway: () => boolean
  /** Shows one OS notification; `onClick` runs when the user clicks it. */
  show: (title: string, body: string, onClick: () => void) => ShownNotification | undefined
  /** Puts the count on the taskbar button or the Dock icon; zero removes it. */
  setBadge: (count: number) => void
  /** Brings the window to the front and opens the chat. */
  openChat: (chatId: string) => void
  /** The interface language now, read each time a notification is composed. */
  language: () => Language
  /** True when the server this app owns tells which chats need the person, so a page need not. */
  serverReports: () => boolean
  /** The notification mode kept from the last time the page sent one. */
  loadMode: () => NotificationMode | undefined
  saveMode: (mode: NotificationMode) => void
}

/**
 * Owns the OS side of chat notifications: the notifications on screen, one per
 * chat at most, and the badge. A newer state of a chat replaces its
 * notification; coming back to the window clears them all, because the
 * sidebar now shows everything they said.
 */
export class ChatNotifier {
  readonly #attention = new ChatAttention()
  readonly #shown = new Map<string, ShownNotification>()
  #badge = 0
  #mode: NotificationMode
  /** The chats the server last reported, for a change of mode between its reports. */
  #serverChats: ReportedChat[] = []

  readonly #host: ChatNotifierHost

  constructor(host: ChatNotifierHost) {
    this.#host = host
    this.#mode = host.loadMode() ?? DEFAULT_NOTIFICATION_MODE
  }

  /**
   * A report from the renderer, validated here; a malformed one is dropped. It
   * always carries the mode. Its chats count only when no server reports them.
   */
  report(value: unknown): void {
    const report = parseChatAttentionReport(value)
    if (!report) return
    const modeChanged = report.mode !== this.#mode
    if (modeChanged) {
      this.#mode = report.mode
      try {
        this.#host.saveMode(report.mode)
      } catch {
        // Only the next launch, with no page yet, depends on it.
      }
    }
    if (!this.#host.serverReports()) this.#apply(report.chats)
    else if (modeChanged) this.#apply(this.#serverChats)
  }

  /** The chats that are not at rest, as the server this app owns reports them (already validated). */
  serverReport(chats: ReportedChat[]): void {
    this.#serverChats = chats
    this.#apply(chats)
  }

  /** The server process started: its first report is a baseline, and says what the last one left. */
  serverStarted(): void {
    this.#attention.reset()
  }

  #apply(chats: ReportedChat[]): void {
    const change = this.#attention.report({ mode: this.#mode, chats }, this.#host.isAway())
    for (const chatId of change.stale) this.#close(chatId)
    if (this.#mode === 'off') this.#closeAll()
    for (const notification of change.notify) this.#show(notification)
    this.#setBadge(change.badge)
  }

  /** The window came to the front. */
  windowFocused(): void {
    this.#attention.seen()
    this.#closeAll()
    this.#setBadge(0)
  }

  /** The renderer page was replaced; its first report is a baseline, unless the server reports. */
  pageReplaced(): void {
    if (!this.#host.serverReports()) this.#attention.reset()
  }

  dispose(): void {
    this.#closeAll()
    this.#setBadge(0)
  }

  #show(notification: ChatNotification): void {
    this.#close(notification.chatId)
    const shown = this.#host.show(
      notification.title,
      translate(this.#host.language(), NOTICE_KEY[notification.notice]),
      () => {
        // Windows keeps a clicked notification in its centre unless it is closed.
        this.#close(notification.chatId)
        this.#host.openChat(notification.chatId)
      },
    )
    if (shown) this.#shown.set(notification.chatId, shown)
  }

  #close(chatId: string): void {
    const shown = this.#shown.get(chatId)
    if (!shown) return
    this.#shown.delete(chatId)
    shown.close()
  }

  #closeAll(): void {
    for (const chatId of this.#shown.keys()) this.#close(chatId)
  }

  #setBadge(count: number): void {
    if (count === this.#badge) return
    this.#badge = count
    this.#host.setBadge(count)
  }
}
