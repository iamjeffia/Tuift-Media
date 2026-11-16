import { describe, expect, it } from 'vitest'
import { chatStateOf, isTurnStatus } from './chat-activity.js'
import { ThreadInboxStatusSchema } from './protocol.js'

describe('what a chat status means for the desktop shell', () => {
  it('says something about every sidebar status', () => {
    const table = Object.fromEntries(
      ThreadInboxStatusSchema.options.map((status) => [
        status,
        [chatStateOf(status), isTurnStatus(status)],
      ]),
    )
    expect(table).toEqual({
      starting: ['working', true],
      working: ['working', true],
      // A prompt held back is not work, but the gap between two turns must not read as finished.
      queued: ['working', false],
      // Waiting on the person, with the agent still live.
      approval: ['approval', true],
      input: ['input', true],
      failed: ['failed', false],
      ready: [undefined, false],
      idle: [undefined, false],
    })
  })
})
