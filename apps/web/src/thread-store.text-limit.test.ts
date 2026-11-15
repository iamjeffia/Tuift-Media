import { describe, expect, it } from 'vitest'
import {
  MAX_ITEM_OUTPUT_CHARS,
  MAX_MESSAGE_CHARS,
  streamCutMarker,
  type DomainEvent,
  type Item,
} from '@harness/contracts'
import {
  emptyThread,
  reduce,
  reduceDeltas,
  reduceEventLog,
  threadItems,
  type ItemDeltaEvent,
} from './thread-store.js'

/**
 * The server cuts an item's text at its limit and sends the cut as the last delta, ending with a
 * marker. Whatever comes after it, the copy kept here does not grow and no item is opened for it.
 */
const REPLY = 'msg-reply'
const COMMAND = 'exec-build'

const turnStarted: DomainEvent = {
  type: 'turn.started',
  turn: { id: 't1', threadId: 'th1', status: 'running', createdAt: 1 },
}
const reply = (text = ''): DomainEvent => ({
  type: 'item.started',
  item: {
    id: REPLY,
    turnId: 't1',
    type: 'message',
    role: 'assistant',
    status: 'started',
    createdAt: 2,
    text,
  },
})
const command = (): DomainEvent => ({
  type: 'item.started',
  item: {
    id: COMMAND,
    turnId: 't1',
    type: 'command',
    command: 'pnpm build',
    status: 'started',
    createdAt: 3,
  },
})
const delta = (itemId: string, textDelta: string): ItemDeltaEvent => ({
  type: 'item.delta',
  turnId: 't1',
  itemId,
  textDelta,
})

/** What the server sends for a message that streams past its limit. */
const cutMessage = () => {
  const first = 'a'.repeat(MAX_MESSAGE_CHARS - 10)
  const last = `${'b'.repeat(10)}${streamCutMarker('message')}`
  return { events: [delta(REPLY, first), delta(REPLY, last)], text: first + last }
}

const textOf = (events: DomainEvent[], id: string): string | undefined =>
  threadItems(events.reduce(reduce, emptyThread)).find((item) => item.id === id)?.text

describe('an item that reached its text limit', () => {
  it('takes whatever a message under the limit says', () => {
    const events = [turnStarted, reply(), delta(REPLY, 'First. '), delta(REPLY, 'Second.')]

    expect(textOf(events, REPLY)).toBe('First. Second.')
  })

  it('takes no more text, one delta at a time, and opens no item', () => {
    const { events, text } = cutMessage()
    const state = [
      turnStarted,
      reply(),
      ...events,
      delta(REPLY, 'late'),
      delta(REPLY, 'later'),
    ].reduce(reduce, emptyThread)

    const items = threadItems(state)
    expect(items.map(({ id }) => id)).toEqual([REPLY])
    expect(items[0]!.text).toBe(text)
    expect(items[0]!.text!.endsWith('\n… message truncated …\n')).toBe(true)
  })

  it('takes no more text when a frame carries many deltas, and none for another item', () => {
    const { events, text } = cutMessage()
    const cut = [turnStarted, reply(), command(), ...events].reduce(reduce, emptyThread)

    const frame = reduceDeltas(cut, [
      delta(REPLY, 'late'),
      delta(COMMAND, 'building\n'),
      delta(REPLY, 'later'),
    ])
    const items = threadItems(frame)
    expect(items.map(({ id }) => id)).toEqual([REPLY, COMMAND])
    expect(items[0]!.text).toBe(text)
    expect(items[1]!.text).toBe('building\n')
    // A frame of only late text changes nothing at all.
    expect(reduceDeltas(cut, [delta(REPLY, 'late'), delta(REPLY, 'later')])).toBe(cut)
  })

  it('takes no more text when the log is replayed', () => {
    const { events, text } = cutMessage()
    // Replay folds a run of deltas into one, so the late one comes after something else.
    const log: DomainEvent[] = [
      turnStarted,
      reply(),
      ...events,
      { type: 'plan.updated', turnId: 't1', steps: [] },
      delta(REPLY, 'late'),
    ]
    const replayed = reduceEventLog(
      emptyThread,
      log.map((event, index) => ({ seq: index + 1, event })),
    )

    expect(threadItems(replayed).map(({ id }) => id)).toEqual([REPLY])
    expect(threadItems(replayed)[0]!.text).toBe(text)
  })

  it('holds for a command at its own, smaller limit', () => {
    const output = 'o'.repeat(MAX_ITEM_OUTPUT_CHARS - 4) + `abcd${streamCutMarker('output')}`
    const state = [turnStarted, command(), delta(COMMAND, output), delta(COMMAND, 'late')].reduce(
      reduce,
      emptyThread,
    )

    expect(threadItems(state)).toHaveLength(1)
    expect(threadItems(state)[0]!.text).toBe(output)
  })

  it('shows the message the provider sends whole when the stream closes, cut or not', () => {
    const { events } = cutMessage()
    const whole: Item = {
      id: REPLY,
      turnId: 't1',
      type: 'message',
      role: 'assistant',
      status: 'completed',
      createdAt: 2,
      text: `start\n… 12 characters omitted …\nCONCLUSION`,
    }
    const closing: DomainEvent = { type: 'item.completed', item: whole }
    const state = [turnStarted, reply(), ...events, closing].reduce(reduce, emptyThread)

    expect(threadItems(state)[0]!.text).toBe(whole.text)
  })

  it('leaves a saved chat from before the limits as it was written', () => {
    // No marker: this message was stored whole by an older version, and still takes its text.
    const long = 'c'.repeat(MAX_MESSAGE_CHARS + 500_000)
    const state = [turnStarted, reply(long), delta(REPLY, ' and more')].reduce(reduce, emptyThread)
    const replayed = reduceEventLog(
      emptyThread,
      [turnStarted, reply(long), delta(REPLY, ' and more')].map((event, index) => ({
        seq: index + 1,
        event,
      })),
    )

    expect(threadItems(state)[0]!.text).toBe(`${long} and more`)
    expect(threadItems(replayed)[0]!.text).toBe(`${long} and more`)
  })

  it('keeps a turn diff as the server sent it, cut note included', () => {
    const diff = `diff --git a/a.txt b/a.txt\n@@ -1 +1 @@\n-a\n+b\n… 1048576 characters omitted …`
    const state = [turnStarted, { type: 'diff.updated', turnId: 't1', diff } as DomainEvent].reduce(
      reduce,
      emptyThread,
    )

    expect(state.diff).toBe(diff)
  })

  it('does not slow a long stream down as the message grows', () => {
    let state = [turnStarted, reply()].reduce(reduce, emptyThread)
    const begin = performance.now()
    for (let index = 0; index < 50_000; index += 1) state = reduce(state, delta(REPLY, 'tok '))

    expect(threadItems(state)[0]!.text).toHaveLength(200_000)
    expect(performance.now() - begin).toBeLessThan(5_000)
  })
})
