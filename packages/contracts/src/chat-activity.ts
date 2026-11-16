import type { ThreadInboxStatus } from './protocol.js'

/**
 * What the server tells the desktop shell about its chats over the parent
 * channel (the utility process port, or Node's IPC for the legacy launch).
 * The shell needs it with no window open: a turn started from the phone must
 * keep the computer awake, notify, and make a quit ask first.
 *
 * The desktop's main process reads this with its own small parser
 * (apps/desktop/src/chat-attention.ts), because it must not load this package
 * at startup. Its copy of the constants is checked against these in a test.
 */

export const CHAT_ACTIVITY_MESSAGE = 'harness:chatActivity'

export const CHAT_STATES = ['working', 'approval', 'input', 'failed'] as const
/** A chat missing from a report is at rest: idle, or finished and waiting to be read. */
export type ChatState = (typeof CHAT_STATES)[number]

export type ReportedChat = { id: string; title: string; state: ChatState }

export type ChatActivityMessage = {
  type: typeof CHAT_ACTIVITY_MESSAGE
  /** Chats inside a turn, or starting one (what keeps the computer awake). */
  running: number
  /** Every chat that is not at rest. */
  chats: ReportedChat[]
}

export const MAX_REPORTED_CHATS = 5_000
export const MAX_CHAT_ID_LENGTH = 256
export const MAX_REPORTED_TITLE_LENGTH = 1_000

/**
 * The chat is inside a turn, also while that turn waits on an approval or a
 * question (its agent is live), or is starting one. Not 'queued': the server
 * reports that for a prompt held back after a failure as well, and a held
 * prompt is not work.
 */
export function isTurnStatus(status: ThreadInboxStatus): boolean {
  return (
    status === 'starting' || status === 'working' || status === 'approval' || status === 'input'
  )
}

/**
 * What a chat is doing, as far as notifications care; undefined is at rest.
 * A queued prompt counts as working so the moment between one turn and the
 * next queued one does not read as the chat finishing.
 */
export function chatStateOf(status: ThreadInboxStatus): ChatState | undefined {
  switch (status) {
    case 'approval':
    case 'input':
    case 'failed':
      return status
    case 'starting':
    case 'working':
    case 'queued':
      return 'working'
    default:
      return undefined
  }
}
