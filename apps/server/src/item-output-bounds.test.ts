import { describe, expect, it } from 'vitest'
import type { DomainEvent, Item } from '@harness/contracts'
import {
  boundItemEvent,
  elideOutput,
  ItemOutputBounds,
  MAX_ITEM_OUTPUT_CHARS,
} from './item-output-bounds.js'
import { Store } from './store.js'

const THREAD = 'thread'

const item = (over: Partial<Item> = {}): Item => ({
  id: 'cmd',
  turnId: 't1',
  type: 'command',
  command: 'python -m http.server 8891',
  status: 'started',
  createdAt: 1,
  ...over,
})
const started = (over?: Partial<Item>): DomainEvent => ({ type: 'item.started', item: item(over) })
const completed = (over?: Partial<Item>): DomainEvent => ({
  type: 'item.completed',
  item: item({ status: 'completed', ...over }),
})
const delta = (itemId: string, textDelta: string): DomainEvent => ({
  type: 'item.delta',
  turnId: 't1',
  itemId,
  textDelta,
})
const textOf = (event: DomainEvent | undefined): string | undefined =>
  event?.type === 'item.delta' ? event.textDelta : undefined

describe('elideOutput', () => {
  it('leaves a text that fits alone', () => {
    expect(elideOutput('short')).toBe('short')
    expect(elideOutput('x'.repeat(MAX_ITEM_OUTPUT_CHARS))).toHaveLength(MAX_ITEM_OUTPUT_CHARS)
  })

  it('keeps the start and the end and says how much it dropped', () => {
    const text = `START${'-'.repeat(500_000)}END`
    const kept = elideOutput(text)

    expect(kept.startsWith('START')).toBe(true)
    expect(kept.endsWith('END')).toBe(true)
    expect(kept).toMatch(/\n… \d+ characters omitted …\n/)
    expect(kept.length).toBeLessThan(MAX_ITEM_OUTPUT_CHARS + 64)
    const omitted = Number(/… (\d+) characters omitted/.exec(kept)![1])
    expect(kept.length - omitted).toBeLessThan(text.length)
    expect(omitted).toBeGreaterThan(text.length - MAX_ITEM_OUTPUT_CHARS - 2)
  })

  it('never cuts a surrogate pair in half', () => {
    const text = '😀'.repeat(MAX_ITEM_OUTPUT_CHARS)
    const kept = elideOutput(text)

    expect(new TextDecoder('utf-8', { fatal: true }).decode(new TextEncoder().encode(kept))).toBe(
      kept,
    )
    expect(kept.isWellFormed()).toBe(true)
  })
})

describe('boundItemEvent', () => {
  const big = 'x'.repeat(MAX_ITEM_OUTPUT_CHARS * 3)

  it.each(['command', 'tool_call', 'error'] as const)('bounds the text of a %s', (type) => {
    const event = boundItemEvent(completed({ type, text: big }))

    expect(event.type === 'item.completed' && event.item.text!.length).toBeLessThan(
      MAX_ITEM_OUTPUT_CHARS + 64,
    )
  })

  it.each(['message', 'reasoning', 'file_change'] as const)(
    'leaves the text of a %s whole',
    (type) => {
      const event = completed({ type, text: big })

      expect(boundItemEvent(event)).toBe(event)
    },
  )

  it('leaves every other event alone', () => {
    const event = delta('cmd', big)

    expect(boundItemEvent(event)).toBe(event)
  })
})

describe('ItemOutputBounds', () => {
  it('drops the output a command prints after its turn settled it', () => {
    const bounds = new ItemOutputBounds()
    expect(bounds.apply(THREAD, started())).toBeDefined()
    expect(bounds.apply(THREAD, delta('cmd', 'first\n'))).toBeDefined()
    // The adapter settles the still-running command with its turn, without text.
    expect(bounds.apply(THREAD, completed())).toBeDefined()

    for (let line = 0; line < 100; line += 1) {
      expect(bounds.apply(THREAD, delta('cmd', `GET /frames/${line}.png 200\n`))).toBeUndefined()
    }
  })

  it('still takes the report Codex sends when the process finally exits', () => {
    const bounds = new ItemOutputBounds()
    bounds.apply(THREAD, started())
    bounds.apply(THREAD, completed())

    const final = completed({ text: 'exit report', exitCode: 1 })
    expect(bounds.apply(THREAD, final)).toEqual(final)
  })

  it('keeps a tool call open while its call is reported as started', () => {
    // Claude Code announces a tool call as an item.completed that is still started.
    const bounds = new ItemOutputBounds()
    bounds.apply(THREAD, completed({ id: 'tool', type: 'tool_call', status: 'started' }))

    expect(bounds.apply(THREAD, delta('tool', 'partial'))).toBeDefined()
    bounds.apply(THREAD, completed({ id: 'tool', type: 'tool_call', text: 'result' }))
    expect(bounds.apply(THREAD, delta('tool', 'late'))).toBeUndefined()
  })

  it('does not reopen a finished item when a retried start arrives', () => {
    const bounds = new ItemOutputBounds()
    bounds.apply(THREAD, started())
    bounds.apply(THREAD, completed())
    bounds.apply(THREAD, started())

    expect(bounds.apply(THREAD, delta('cmd', 'late'))).toBeUndefined()
  })

  it('cuts a stream of command output at the cap and says so once', () => {
    const bounds = new ItemOutputBounds()
    bounds.apply(THREAD, started())
    const chunk = 'y'.repeat(10_000)
    const kept: string[] = []
    for (let index = 0; index < 50; index += 1) {
      const text = textOf(bounds.apply(THREAD, delta('cmd', chunk)))
      if (text !== undefined) kept.push(text)
    }

    const total = kept.join('')
    expect(total.length).toBeLessThan(MAX_ITEM_OUTPUT_CHARS + 64)
    expect(total.length).toBeGreaterThan(MAX_ITEM_OUTPUT_CHARS)
    expect(total.match(/output truncated/g)).toHaveLength(1)
    // 6 whole chunks, the cut one, then nothing.
    expect(kept).toHaveLength(7)
  })

  it('bounds a stream that arrives in one huge chunk', () => {
    const bounds = new ItemOutputBounds()
    bounds.apply(THREAD, started({ type: 'tool_call' }))

    const text = textOf(bounds.apply(THREAD, delta('cmd', 'z'.repeat(5_000_000))))
    expect(text!.length).toBeLessThan(MAX_ITEM_OUTPUT_CHARS + 64)
    expect(bounds.apply(THREAD, delta('cmd', 'more'))).toBeUndefined()
  })

  it('counts the text an item started with against its budget', () => {
    const bounds = new ItemOutputBounds()
    bounds.apply(THREAD, started({ text: 'a'.repeat(MAX_ITEM_OUTPUT_CHARS - 10) }))

    const text = textOf(bounds.apply(THREAD, delta('cmd', 'b'.repeat(100))))
    expect(text!.startsWith('b'.repeat(10))).toBe(true)
    expect(text!.length).toBeLessThan(100)
  })

  it('bounds the text of an item that arrives whole', () => {
    const bounds = new ItemOutputBounds()
    const event = bounds.apply(THREAD, completed({ text: 'o'.repeat(1_000_000) }))

    expect(event?.type === 'item.completed' && event.item.text!.length).toBeLessThan(
      MAX_ITEM_OUTPUT_CHARS + 64,
    )
  })

  it('never cuts what the agent says', () => {
    const bounds = new ItemOutputBounds()
    const reply = { id: 'reply', type: 'message' as const, role: 'assistant' as const }
    bounds.apply(THREAD, started(reply))
    const chunk = 'w'.repeat(MAX_ITEM_OUTPUT_CHARS)

    for (let index = 0; index < 5; index += 1) {
      expect(textOf(bounds.apply(THREAD, delta('reply', chunk)))).toBe(chunk)
    }
    bounds.apply(THREAD, completed(reply))
    expect(bounds.apply(THREAD, delta('reply', 'late'))).toBeUndefined()
  })

  it('passes output of an item it never saw, for the renderer to place', () => {
    const bounds = new ItemOutputBounds()
    const event = delta('unknown', 'early')

    expect(bounds.apply(THREAD, event)).toBe(event)
  })

  it('keeps chats apart and forgets a deleted one', () => {
    const bounds = new ItemOutputBounds()
    bounds.apply('a', started())
    bounds.apply('a', completed())

    expect(bounds.apply('b', delta('cmd', 'x'))).toBeDefined()
    expect(bounds.apply('a', delta('cmd', 'x'))).toBeUndefined()
    bounds.forget('a')
    expect(bounds.apply('a', delta('cmd', 'x'))).toBeDefined()
  })

  it('remembers a bounded number of items per chat', () => {
    const bounds = new ItemOutputBounds()
    for (let index = 0; index < 3000; index += 1) {
      bounds.apply(THREAD, started({ id: `cmd-${index}` }))
      bounds.apply(THREAD, completed({ id: `cmd-${index}` }))
    }

    expect(bounds.apply(THREAD, delta('cmd-2999', 'x'))).toBeUndefined()
    // The oldest was forgotten; the renderer's own guard covers it.
    expect(bounds.apply(THREAD, delta('cmd-0', 'x'))).toBeDefined()
  })
})

describe('a saved transcript', () => {
  it('is bounded like a live one when it is imported', () => {
    const store = new Store(':memory:')
    store.addProject('/repo')
    store.addThread({ id: THREAD, projectPath: '/repo', provider: 'claude-code', title: 'Saved' })
    const output = `HEAD${'-'.repeat(2_000_000)}TAIL`

    store.mergeProviderHistory(THREAD, 'one', [
      { key: 'a', event: completed({ type: 'tool_call', id: 'read', text: output }) },
      { key: 'b', event: completed({ type: 'message', id: 'reply', text: output }) },
    ])

    const [tool, reply] = store
      .history(THREAD)
      .flatMap(({ event }) => (event.type === 'item.completed' ? [event.item] : []))
    expect(tool!.text!.length).toBeLessThan(MAX_ITEM_OUTPUT_CHARS + 64)
    expect(tool!.text!.startsWith('HEAD')).toBe(true)
    expect(tool!.text!.endsWith('TAIL')).toBe(true)
    expect(reply!.text).toBe(output)
    store.close()
  })
})
