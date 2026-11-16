import { MAX_USER_MESSAGE_CHARS } from '@harness/contracts'

/**
 * What the person sent was over the ceiling. The text is never cut to fit: the call is refused,
 * in words the app also has in its own catalog (`chat.send.tooLong`), so the screen says it in the
 * reader's language and the prompt box keeps the draft.
 */
export class UserMessageTooLongError extends Error {
  readonly key = 'chat.send.tooLong'
  readonly params: { size: number; limit: number }
  constructor(size: number) {
    super(
      `This message is ${size} characters long and the limit is ${MAX_USER_MESSAGE_CHARS}. ` +
        'Attach the text as a file instead.',
    )
    this.params = { size, limit: MAX_USER_MESSAGE_CHARS }
  }
}

/** Throws {@link UserMessageTooLongError} for a message over the ceiling. */
export function assertUserMessageFits(text: string): void {
  if (text.length > MAX_USER_MESSAGE_CHARS) throw new UserMessageTooLongError(text.length)
}
