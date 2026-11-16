import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CHAT_ACTIVITY_MESSAGE,
  MAX_REPORTED_CHATS,
  MAX_REPORTED_TITLE_LENGTH,
  type ChatActivityMessage,
  type ThreadInboxStatus,
} from '@harness/contracts'
import { CHAT_ACTIVITY_COALESCE_MS, ChatActivityReporter } from './chat-activity.js'

type Thread = {
  title: string
  ephemeral: boolean
  closedAt?: number
  worktreeBranch?: string
}

function setup(chats: Record<string, ThreadInboxStatus> = {}) {
  const statuses = new Map<string, ThreadInboxStatus>(Object.entries(chats))
  const threads = new Map<string, Thread>(
    Object.keys(chats).map((id) => [id, { title: `Chat ${id}`, ephemeral: false }]),
  )
  const sent: ChatActivityMessage[] = []
  const reporter = new ChatActivityReporter({
    status: (id) => {
      const status = statuses.get(id)
      if (!status) throw new Error('no such chat')
      return status
    },
    thread: (id) => threads.get(id),
    sidebar: () => ({
      threads: [...threads.entries()].map(([id, thread]) => ({ id, ...thread })),
      queued: new Set(),
    }),
    send: (message) => sent.push(message),
  })
  /** The chat's status changes, as the orchestrator reports it, and the window passes. */
  const change = (id: string, status: ThreadInboxStatus) => {
    statuses.set(id, status)
    if (!threads.has(id)) threads.set(id, { title: `Chat ${id}`, ephemeral: false })
    reporter.changed(id)
    vi.advanceTimersByTime(CHAT_ACTIVITY_COALESCE_MS)
  }
  const start = () => {
    reporter.start()
    vi.advanceTimersByTime(CHAT_ACTIVITY_COALESCE_MS)
  }
  return { reporter, statuses, threads, sent, change, start }
}

const entries = (message: ChatActivityMessage | undefined) =>
  message?.chats.map(({ id, state }) => `${id}:${state}`)

afterEach(() => vi.useRealTimers())

describe('the chat activity the server reports to its parent', () => {
  it('sends everything that is not at rest once, when it starts', () => {
    vi.useFakeTimers()
    const { start, sent } = setup({
      a: 'idle',
      b: 'working',
      c: 'approval',
      d: 'ready',
      e: 'failed',
    })
    start()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ type: CHAT_ACTIVITY_MESSAGE, running: 2 })
    expect(entries(sent[0])).toEqual(['b:working', 'c:approval', 'e:failed'])
  })

  it('reads what the sidebar already knows for the first report, instead of one lookup per chat', () => {
    vi.useFakeTimers()
    const status = vi.fn((_id: string, _queued?: boolean, _unread?: boolean) => 'idle' as const)
    const reporter = new ChatActivityReporter({
      status,
      thread: () => undefined,
      sidebar: () => ({
        threads: [
          { id: 'a', title: 'a', unread: true },
          { id: 'b', title: 'b', unread: false },
        ],
        queued: new Set(['b']),
      }),
      send: () => {},
    })
    reporter.start()
    vi.advanceTimersByTime(CHAT_ACTIVITY_COALESCE_MS)
    expect(status.mock.calls).toEqual([
      ['a', false, true],
      ['b', true, false],
    ])
  })

  it('sends an empty first report so a restarted server corrects a stale count', () => {
    vi.useFakeTimers()
    const { start, sent } = setup({ a: 'idle' })
    start()
    expect(sent).toEqual([{ type: CHAT_ACTIVITY_MESSAGE, running: 0, chats: [] }])
  })

  it('follows a turn: starts, asks for approval, asks a question, ends', () => {
    vi.useFakeTimers()
    const { start, change, sent } = setup({ a: 'idle' })
    start()
    change('a', 'starting')
    change('a', 'working')
    change('a', 'approval')
    change('a', 'working')
    change('a', 'input')
    change('a', 'working')
    change('a', 'ready')
    expect(sent.slice(1).map((message) => [message.running, entries(message)])).toEqual([
      [1, ['a:working']],
      // starting and working are the same state, so the second is not sent again
      [1, ['a:approval']],
      [1, ['a:working']],
      [1, ['a:input']],
      [1, ['a:working']],
      [0, []],
    ])
  })

  it('reports a failed turn as failed, and a stopped one as at rest', () => {
    vi.useFakeTimers()
    const { start, change, sent } = setup({ a: 'working', b: 'working' })
    start()
    change('a', 'failed')
    change('b', 'idle')
    expect(sent.slice(1).map((message) => [message.running, entries(message)])).toEqual([
      [1, ['a:failed', 'b:working']],
      [0, ['a:failed']],
    ])
  })

  it('counts a queued prompt as working for notifications, but not as a running turn', () => {
    vi.useFakeTimers()
    const { start, change, sent } = setup({ a: 'idle' })
    start()
    change('a', 'queued')
    expect(sent.at(-1)).toMatchObject({ running: 0 })
    expect(entries(sent.at(-1))).toEqual(['a:working'])
  })

  it('sends one message for a burst of changes', () => {
    vi.useFakeTimers()
    const { start, reporter, statuses, threads, sent } = setup({ a: 'idle' })
    start()
    for (const id of ['b', 'c', 'd']) {
      statuses.set(id, 'working')
      threads.set(id, { title: id, ephemeral: false })
      reporter.changed(id)
    }
    statuses.set('a', 'approval')
    reporter.changed('a')
    expect(sent).toHaveLength(1)
    vi.advanceTimersByTime(CHAT_ACTIVITY_COALESCE_MS)
    expect(sent).toHaveLength(2)
    expect(sent[1]).toMatchObject({ running: 4 })
  })

  it('does not repeat a report that says the same thing', () => {
    vi.useFakeTimers()
    const { start, change, sent } = setup({ a: 'working' })
    start()
    change('a', 'starting')
    change('a', 'working')
    expect(sent).toHaveLength(1)
  })

  it('reports a rename of a chat that is not at rest', () => {
    vi.useFakeTimers()
    const { start, threads, reporter, sent } = setup({ a: 'working' })
    start()
    threads.set('a', { title: 'Fix the login', ephemeral: false })
    reporter.changed('a')
    vi.advanceTimersByTime(CHAT_ACTIVITY_COALESCE_MS)
    expect(sent.at(-1)?.chats[0]?.title).toBe('Fix the login')
  })

  it('lists what the sidebar lists: no side chats, sub-agent chats or archived chats', () => {
    vi.useFakeTimers()
    const { start, statuses, threads, sent } = setup({
      listed: 'working',
      side: 'working',
      archived: 'working',
      archivedWithCheckout: 'working',
    })
    threads.set('side', { title: 'Side', ephemeral: true })
    threads.set('archived', { title: 'Old', ephemeral: false, closedAt: 1 })
    threads.set('archivedWithCheckout', {
      title: 'Checkout',
      ephemeral: false,
      closedAt: 1,
      worktreeBranch: 'tuift/x',
    })
    expect(statuses.size).toBe(4)
    start()
    expect(entries(sent[0])).toEqual(['listed:working', 'archivedWithCheckout:working'])
    expect(sent[0]?.running).toBe(2)
  })

  it('drops a chat that was deleted', () => {
    vi.useFakeTimers()
    const { start, threads, reporter, sent } = setup({ a: 'working', b: 'working' })
    start()
    threads.delete('a')
    reporter.changed('a')
    vi.advanceTimersByTime(CHAT_ACTIVITY_COALESCE_MS)
    expect(sent.at(-1)).toMatchObject({ running: 1 })
    expect(entries(sent.at(-1))).toEqual(['b:working'])
  })

  it('bounds titles, and the list, keeping the chats that run', () => {
    vi.useFakeTimers()
    const { start, statuses, threads, sent } = setup()
    for (let index = 0; index < MAX_REPORTED_CHATS + 10; index += 1) {
      const id = `c${index}`
      // The last ten run; the rest only failed.
      statuses.set(id, index >= MAX_REPORTED_CHATS ? 'working' : 'failed')
      threads.set(id, { title: 'x'.repeat(MAX_REPORTED_TITLE_LENGTH + 50), ephemeral: false })
    }
    start()
    const message = sent[0]!
    expect(message.chats).toHaveLength(MAX_REPORTED_CHATS)
    expect(message.running).toBe(10)
    expect(message.chats.slice(0, 10).every((chat) => chat.state === 'working')).toBe(true)
    expect(message.chats.every((chat) => chat.title.length === MAX_REPORTED_TITLE_LENGTH)).toBe(
      true,
    )
  })

  it('skips a chat the store cannot read and keeps reporting the others', () => {
    vi.useFakeTimers()
    const { start, change, statuses, reporter, sent } = setup({ a: 'idle' })
    start()
    statuses.delete('gone')
    reporter.changed('gone')
    change('a', 'working')
    expect(entries(sent.at(-1))).toEqual(['a:working'])
  })

  it('does not send after it is disposed', () => {
    vi.useFakeTimers()
    const { reporter, sent } = setup({ a: 'working' })
    reporter.start()
    reporter.dispose()
    vi.advanceTimersByTime(CHAT_ACTIVITY_COALESCE_MS * 2)
    expect(sent).toEqual([])
  })

  it('survives a parent channel that is closed', () => {
    vi.useFakeTimers()
    const reporter = new ChatActivityReporter({
      status: () => 'working',
      thread: () => ({ title: 'a', ephemeral: false }),
      sidebar: () => ({ threads: [{ id: 'a', title: 'a' }], queued: new Set() }),
      send: () => {
        throw new Error('channel closed')
      },
    })
    reporter.start()
    expect(() => vi.advanceTimersByTime(CHAT_ACTIVITY_COALESCE_MS)).not.toThrow()
  })
})
