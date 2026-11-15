import { mkdtempSync, rmSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DomainEvent, Item } from '@harness/contracts'
import { isCutDiff } from '@harness/contracts'
import {
  boundItemEvent,
  elideDiff,
  elideOutput,
  ItemOutputBounds,
  MAX_DIFF_CHARS,
  MAX_ITEM_OUTPUT_CHARS,
  MAX_MESSAGE_CHARS,
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

/** A unified diff of `files` new files, each one hunk of 1,000 added lines: 61 KB a file. */
function bigDiff(files = 30): string {
  const hunk = Array.from({ length: 1_000 }, () => `+${'x'.repeat(60)}`).join('\n')
  return Array.from({ length: files }, (_, file) =>
    [
      `diff --git a/f${file}.txt b/f${file}.txt`,
      'new file mode 100644',
      '--- /dev/null',
      `+++ b/f${file}.txt`,
      '@@ -0,0 +1,1000 @@',
      hunk,
    ].join('\n'),
  ).join('\n')
}

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

  it.each(['reasoning', 'plan', 'notice', 'unknown'] as const)(
    'leaves the text of a %s whole',
    (type) => {
      const event = completed({ type, text: big })

      expect(boundItemEvent(event)).toBe(event)
    },
  )

  it('leaves what the user typed whole, however long', () => {
    const event = completed({ type: 'message', role: 'user', text: 'u'.repeat(3_000_000) })

    expect(boundItemEvent(event)).toBe(event)
  })

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

  it('lets a message of any ordinary length through, then drops what comes after it closed', () => {
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

  it('never cuts what the user typed, nor the reasoning', () => {
    const bounds = new ItemOutputBounds()
    bounds.apply(THREAD, started({ id: 'mine', type: 'message', role: 'user' }))
    bounds.apply(THREAD, started({ id: 'thought', type: 'reasoning' }))
    const chunk = 'w'.repeat(MAX_MESSAGE_CHARS)

    for (const id of ['mine', 'thought']) {
      for (let index = 0; index < 3; index += 1) {
        expect(textOf(bounds.apply(THREAD, delta(id, chunk)))).toBe(chunk)
      }
    }
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
    expect(reply!.text!.length).toBeLessThan(MAX_MESSAGE_CHARS + 64)
    expect(reply!.text!.startsWith('HEAD')).toBe(true)
    expect(reply!.text!.endsWith('TAIL')).toBe(true)
    store.close()
  })

  it('leaves a message or a diff the log already holds over its limit as it was saved', () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'bounds-'))
    const file = path.join(folder, 'state.sqlite')
    try {
      const long = `HEAD${'-'.repeat(2_000_000)}TAIL`
      const chat = [
        { key: 'a', event: completed({ type: 'message', id: 'reply', text: long }) },
        { key: 'b', event: completed({ type: 'tool_call', id: 'read', text: long }) },
        { key: 'c', event: { type: 'diff.updated', turnId: 't1', diff: bigDiff() } as DomainEvent },
      ]
      let store = new Store(file)
      store.addProject('/repo')
      store.addThread({ id: THREAD, projectPath: '/repo', provider: 'claude-code', title: 'Old' })
      store.mergeProviderHistory(THREAD, 'one', chat)
      store.close()

      // What an older version of the app saved: the message whole, only the output bounded.
      const db = new DatabaseSync(file)
      const find = db.prepare('SELECT seq FROM events WHERE payload LIKE ?')
      const save = db.prepare('UPDATE events SET payload = ? WHERE seq = ?')
      for (const [pattern, event] of [
        ['%"id":"reply"%', chat[0]!.event],
        ['%"type":"diff.updated"%', chat[2]!.event],
      ] as const) {
        const [row] = find.all(pattern) as Array<{ seq: number }>
        save.run(JSON.stringify(event), row!.seq)
      }
      db.close()

      store = new Store(file)
      const before = store.history(THREAD).map(({ seq }) => seq)
      // The provider's file is read again: nothing is rewritten.
      expect(store.mergeProviderHistory(THREAD, 'two', chat)).toBe(false)
      expect(store.history(THREAD).map(({ seq }) => seq)).toEqual(before)
      const [reply] = store
        .history(THREAD)
        .flatMap(({ event }) => (event.type === 'item.completed' ? [event.item] : []))
      expect(reply!.text).toBe(long)
      const diffs = store
        .history(THREAD)
        .flatMap(({ event }) => (event.type === 'diff.updated' ? [event.diff] : []))
      expect(diffs).toEqual([bigDiff()])
      store.close()
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })
})

const reply = { id: 'reply', type: 'message' as const, role: 'assistant' as const }
const itemText = (event: DomainEvent | undefined): string | undefined =>
  event?.type === 'item.started' || event?.type === 'item.completed' ? event.item.text : undefined

describe('an agent message', () => {
  it('passes whole, identical, when it is under the limit', () => {
    const bounds = new ItemOutputBounds()
    const text = `# Done\n\n${'A normal answer. '.repeat(2_000)}`
    const event = completed({ ...reply, text })

    expect(bounds.apply(THREAD, event)).toBe(event)
    expect(boundItemEvent(event)).toBe(event)
    const exact = completed({ ...reply, id: 'exact', text: 'm'.repeat(MAX_MESSAGE_CHARS) })
    expect(boundItemEvent(exact)).toBe(exact)
  })

  it('keeps the start and the end of one over the limit, and counts what it dropped', () => {
    const text = `START${'-'.repeat(3_000_000)}END`
    const kept = itemText(boundItemEvent(completed({ ...reply, text })))!

    expect(kept.startsWith('START')).toBe(true)
    expect(kept.endsWith('END')).toBe(true)
    // A quarter of the limit is the start; the end is the rest, where the conclusion is.
    const marker = /\n… (\d+) characters omitted …\n/.exec(kept)!
    expect(marker.index).toBe(MAX_MESSAGE_CHARS / 4)
    const omitted = Number(marker[1])
    expect(kept.length - marker[0].length).toBe(MAX_MESSAGE_CHARS)
    expect(kept.length - marker[0].length + omitted).toBe(text.length)
  })

  it('is bounded when a provider sends the whole of it again on every update', () => {
    // Some providers resend the whole text so far, as a new started or completed event.
    const bounds = new ItemOutputBounds()
    let text = ''
    for (let update = 1; update <= 6; update += 1) {
      text += 'r'.repeat(400_000)
      const event =
        update === 1
          ? started({ ...reply, text })
          : completed({ ...reply, status: 'started', text })
      const kept = itemText(bounds.apply(THREAD, event))!
      expect(kept.length).toBeLessThan(MAX_MESSAGE_CHARS + 64)
      if (text.length <= MAX_MESSAGE_CHARS) expect(kept).toBe(text)
      else expect(kept).toMatch(/\n… \d+ characters omitted …\n/)
    }
    // It reached the limit that way, so a delta after it grows nothing.
    expect(bounds.apply(THREAD, delta('reply', 'more'))).toBeUndefined()
  })

  it('is cut where it streams, once, and later deltas keep nothing and open no item', () => {
    const bounds = new ItemOutputBounds()
    bounds.apply(THREAD, started(reply))
    const chunk = 's'.repeat(100_000)
    const kept: string[] = []
    for (let index = 0; index < 40; index += 1) {
      const event = bounds.apply(THREAD, delta('reply', chunk))
      if (event) {
        expect(event.type).toBe('item.delta')
        kept.push(textOf(event)!)
      }
    }

    expect(kept.join('')).toBe(`${'s'.repeat(MAX_MESSAGE_CHARS)}\n… message truncated …\n`)
    // 10 whole chunks make 1,000,000 of the 1,048,576 allowed; the 11th is the cut one.
    expect(kept).toHaveLength(11)
  })

  it('is bounded when its first delta alone is longer than the limit', () => {
    const bounds = new ItemOutputBounds()
    bounds.apply(THREAD, started(reply))

    const text = textOf(bounds.apply(THREAD, delta('reply', 'z'.repeat(5_000_000))))!
    expect(text.length).toBeLessThan(MAX_MESSAGE_CHARS + 64)
    expect(bounds.apply(THREAD, delta('reply', 'more'))).toBeUndefined()
  })

  it('keeps the start of a stream and the end of the message that closes it', () => {
    const bounds = new ItemOutputBounds()
    bounds.apply(THREAD, started(reply))
    for (let index = 0; index < 12; index += 1) {
      bounds.apply(THREAD, delta('reply', 'q'.repeat(100_000)))
    }
    const whole = `${'q'.repeat(1_200_000)}CONCLUSION`

    const closing = bounds.apply(THREAD, completed({ ...reply, text: whole }))
    expect(itemText(closing)!.endsWith('CONCLUSION')).toBe(true)
    expect(itemText(closing)!.length).toBeLessThan(MAX_MESSAGE_CHARS + 64)
    expect(bounds.apply(THREAD, delta('reply', 'late'))).toBeUndefined()
  })

  it('does not cut a surrogate pair where a stream is cut', () => {
    const bounds = new ItemOutputBounds()
    bounds.apply(THREAD, started({ ...reply, text: 'a'.repeat(MAX_MESSAGE_CHARS - 1) }))

    const text = textOf(bounds.apply(THREAD, delta('reply', '😀😀')))!
    expect(text.isWellFormed()).toBe(true)
    expect(text).toBe('\n… message truncated …\n')
  })

  it('does not make a long stream quadratic', () => {
    const bounds = new ItemOutputBounds()
    bounds.apply(THREAD, started(reply))
    const begin = performance.now()
    let kept = 0
    for (let index = 0; index < 400_000; index += 1) {
      kept += textOf(bounds.apply(THREAD, delta('reply', 'tok ')))?.length ?? 0
    }
    // 1.6 million characters in 400,000 deltas: the limit is reached part way, and what
    // comes after costs nothing. The tracker only counts; it never joins the text.
    expect(kept).toBeLessThan(MAX_MESSAGE_CHARS + 64)
    expect(performance.now() - begin).toBeLessThan(2_000)
  })
})

describe('a diff', () => {
  const fileChange = (text: string, status: Item['status'] = 'completed'): Item =>
    item({ id: 'edit', type: 'file_change', path: 'f0.txt', status, text })

  it('passes whole, identical, when it is under the limit', () => {
    const bounds = new ItemOutputBounds()
    const diff = bigDiff(10)
    expect(diff.length).toBeLessThan(MAX_DIFF_CHARS)
    const event: DomainEvent = { type: 'item.completed', item: fileChange(diff) }
    const turn: DomainEvent = { type: 'diff.updated', turnId: 't1', diff }

    expect(bounds.apply(THREAD, event)).toBe(event)
    expect(bounds.apply(THREAD, turn)).toBe(turn)
    expect(boundItemEvent(turn)).toBe(turn)
  })

  it('keeps the start, cut at a line, and says how much it dropped on the last line', () => {
    const diff = bigDiff()
    const kept = elideDiff(diff)

    expect(diff.length).toBeGreaterThan(MAX_DIFF_CHARS)
    expect(kept.length).toBeLessThanOrEqual(MAX_DIFF_CHARS + 64)
    const lines = kept.split('\n')
    const note = lines.pop()!
    const omitted = Number(/^… (\d+) characters omitted …$/.exec(note)![1])
    // Every line before the note is a whole line of the diff, and the cut is where it ends.
    expect(diff.startsWith(`${lines.join('\n')}\n`)).toBe(true)
    expect(lines.join('\n').length + omitted).toBe(diff.length)
    expect(isCutDiff(kept)).toBe(true)
    expect(isCutDiff(diff)).toBe(false)
  })

  it('is cut the same way as a file change item and as the turn diff', () => {
    const diff = bigDiff()
    const bounds = new ItemOutputBounds()

    const itemEvent = bounds.apply(THREAD, { type: 'item.completed', item: fileChange(diff) })
    const turnEvent = bounds.apply(THREAD, { type: 'diff.updated', turnId: 't1', diff })
    expect(itemText(itemEvent)).toBe(elideDiff(diff))
    expect(turnEvent?.type === 'diff.updated' && turnEvent.diff).toBe(elideDiff(diff))
  })

  it('is the same cut every time, so an unchanged diff is still recognised as unchanged', () => {
    const diff = bigDiff()

    expect(boundItemEvent({ type: 'diff.updated', turnId: 't1', diff })).toEqual(
      boundItemEvent({ type: 'diff.updated', turnId: 't1', diff }),
    )
  })

  it('cuts one very long line without splitting a surrogate pair', () => {
    const kept = elideDiff(`+${'😀'.repeat(MAX_DIFF_CHARS)}`)

    expect(kept.isWellFormed()).toBe(true)
    expect(isCutDiff(kept)).toBe(true)
  })

  it('is cut where it streams, like any other text', () => {
    const bounds = new ItemOutputBounds()
    bounds.apply(THREAD, { type: 'item.started', item: fileChange('', 'started') })
    const text = textOf(bounds.apply(THREAD, delta('edit', '+x\n'.repeat(500_000))))!

    expect(text.endsWith('\n… diff truncated …\n')).toBe(true)
    expect(bounds.apply(THREAD, delta('edit', '+y\n'))).toBeUndefined()
  })

  it('is told apart from a diff that merely ends in a line like the note', () => {
    expect(isCutDiff('+… 5 characters omitted …')).toBe(false)
    expect(isCutDiff('diff --git a/x b/x\n@@ -1 +1 @@\n-a\n+b')).toBe(false)
    expect(isCutDiff('')).toBe(false)
  })
})
