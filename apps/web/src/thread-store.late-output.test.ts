import { describe, expect, it } from 'vitest'
import type { DomainEvent, Item } from '@harness/contracts'
import {
  emptyThread,
  reduce,
  reduceDeltas,
  reduceEventLog,
  threadItems,
  type ItemDeltaEvent,
} from './thread-store.js'

/**
 * Reported case: the agent starts `python -m http.server` in the background, the turn
 * ends with the command still reported as running, and the server keeps printing its
 * access log. That output belongs to the command row, never to the reply.
 */
const SERVER = 'exec-server'
const REPLY = 'msg-reply'

const server = (status: Item['status'], text?: string): Item => ({
  id: SERVER,
  turnId: 't1',
  type: 'command',
  command: 'python -m http.server 8891',
  status,
  createdAt: 1,
  ...(text === undefined ? {} : { text }),
})

const reply = (status: Item['status'], text?: string): Item => ({
  id: REPLY,
  turnId: 't1',
  type: 'message',
  role: 'assistant',
  phase: 'final_answer',
  status,
  createdAt: 2,
  ...(text === undefined ? {} : { text }),
})

const logLine = (index: number): ItemDeltaEvent => ({
  type: 'item.delta',
  turnId: 't1',
  itemId: SERVER,
  textDelta: `127.0.0.1 - - "GET /frames/f_${index}.png HTTP/1.1" 200 -\n`,
})

const turn: DomainEvent[] = [
  { type: 'turn.started', turn: { id: 't1', threadId: 'th1', status: 'running', createdAt: 1 } },
  { type: 'item.started', item: server('started') },
  logLine(0),
  { type: 'item.started', item: reply('started', '') },
  { type: 'item.delta', turnId: 't1', itemId: REPLY, textDelta: 'Done. ' },
  { type: 'item.delta', turnId: 't1', itemId: REPLY, textDelta: 'See the page.' },
  { type: 'item.completed', item: reply('completed') },
  // The adapter settles the still-running command with the turn, without text.
  { type: 'item.completed', item: server('completed') },
  { type: 'turn.completed', turnId: 't1', status: 'completed' },
]

const repliesOf = (events: DomainEvent[], state = events.reduce(reduce, emptyThread)) =>
  threadItems(state).filter((entry) => entry.type === 'message')

describe('output of a command that outlives its turn', () => {
  it('stays out of the reply when it arrives one chunk at a time', () => {
    const state = [...turn, logLine(1), logLine(2), logLine(3)].reduce(reduce, emptyThread)

    const items = threadItems(state)
    expect(items.map(({ id }) => id)).toEqual([SERVER, REPLY])
    expect(items.find(({ id }) => id === REPLY)?.text).toBe('Done. See the page.')
    expect(repliesOf([], state).map(({ id }) => id)).toEqual([REPLY])
  })

  it('stays out of the reply when frames carry several chunks at once', () => {
    const settled = turn.reduce(reduce, emptyThread)
    const state = reduceDeltas(settled, [logLine(1), logLine(2), logLine(3)])

    expect(threadItems(state).map(({ id }) => id)).toEqual([SERVER, REPLY])
  })

  it('stays out of the reply when a frame mixes the command with another item', () => {
    const settled = turn.reduce(reduce, emptyThread)
    const state = reduceDeltas(settled, [
      logLine(1),
      { type: 'item.delta', turnId: 't1', itemId: 'other-finished', textDelta: 'late' },
      logLine(2),
    ])

    // The unrelated unknown id is the pre-existing early-delta placeholder; the
    // command's own output must not create a second one.
    expect(threadItems(state).filter(({ id }) => id === SERVER)).toHaveLength(1)
    expect(threadItems(state).find(({ id }) => id === SERVER)?.type).toBe('command')
  })

  it('stays out of the reply while the next turn is running', () => {
    const next: DomainEvent = {
      type: 'turn.started',
      turn: { id: 't2', threadId: 'th1', status: 'running', createdAt: 5 },
    }
    const state = [...turn, next, logLine(1)].reduce(reduce, emptyThread)

    expect(threadItems(state).map(({ id }) => id)).toEqual([SERVER, REPLY])
  })

  it('keeps the same transcript after a reload of the stored log', () => {
    const events = [...turn, logLine(1), logLine(2)]
    const live = events.reduce(reduce, emptyThread)
    const replayed = reduceEventLog(
      emptyThread,
      events.map((event, index) => ({ seq: index + 1, event })),
    )

    expect(threadItems(replayed).map(({ id }) => id)).toEqual(threadItems(live).map(({ id }) => id))
  })

  it('still lets the output of a running command grow its own row', () => {
    const running = turn.slice(0, 3).reduce(reduce, emptyThread)
    const state = [logLine(1), logLine(2)].reduce(reduce, running)

    const row = threadItems(state).find(({ id }) => id === SERVER)
    expect(row?.type).toBe('command')
    expect(row?.text?.split('\n').filter(Boolean)).toHaveLength(3)
  })
})
