// @vitest-environment happy-dom
import { Profiler } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { Item, Subagent } from '@harness/contracts'
import { ThreadFrameStore } from '../thread-frame-store.js'
import { emptyThread, reduce } from '../thread-store.js'
import { Thread } from './Thread.js'

vi.mock('../bridge.js', () => ({
  canPreviewViewedImages: false,
  knownViewedImagePreview: () => undefined,
  previewViewedImage: async () => undefined,
  revealPath: async () => undefined,
  writeClipboardText: async () => undefined,
}))

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 72 })),
    getTotalSize: () => count * 72,
    measureElement: () => undefined,
    indexFromElement: (node: Element) => Number(node.getAttribute('data-index')),
    resizeItem: () => undefined,
    measurementsCache: [],
    getOffsetForIndex: () => [0],
    scrollToIndex: () => undefined,
  }),
}))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const NOW = 1_800_000_000_000
const TURN = 'turn-1'

function prompt(): Item {
  return {
    id: 'prompt',
    turnId: TURN,
    type: 'message',
    role: 'user',
    status: 'completed',
    text: 'Build the video',
    createdAt: NOW - 900_000,
  }
}

function helper(subagent: Partial<Subagent> = {}, fields: Partial<Item> = {}): Item {
  return {
    id: 'helper',
    turnId: TURN,
    type: 'tool_call',
    status: 'started',
    text: 'Agent\n{"prompt":"Assemble it"}',
    createdAt: NOW - 840_000,
    subagent: {
      id: 'helper',
      name: 'tuift-media:cloud',
      description: 'Montagem AE e render 15s',
      state: 'running',
      ...subagent,
    },
    ...fields,
  }
}

function running(items: Item[]): ThreadFrameStore {
  return new ThreadFrameStore({
    ...emptyThread,
    items,
    running: true,
    activeTurn: { id: TURN, startedAt: NOW - 900_000 },
  })
}

function view(store: ThreadFrameStore) {
  return (
    <Thread frameStore={store} onDecide={() => undefined} onAnswerUserInput={() => undefined} />
  )
}

describe('a running helper in the transcript', () => {
  it('has its own time after a separator, apart from a number in its title, and says what it does', () => {
    vi.useFakeTimers({ now: NOW })
    const { container } = render(
      view(running([prompt(), helper({ toolUses: 12, summary: 'Rendering frame 45 of 450' })])),
    )
    const row = container.querySelector('.activity--live')!
    expect(row.querySelector('.activity__label')?.textContent).toBe(
      'Running tuift-media:cloud · Montagem AE e render 15s',
    )
    expect(row.querySelector('.live-elapsed')?.textContent).toBe('14m')
    expect(row.querySelector('.live-now__text')?.textContent).toBe('Rendering frame 45 of 450')
    expect(row.querySelector('.live-now__count')?.textContent).toBe('12 tools')
    act(() => vi.advanceTimersByTime(3_000))
    expect(row.querySelector('.live-elapsed')?.textContent).toBe('14m 3s')
  })

  it('replaces its line as new activity arrives', () => {
    const store = running([prompt(), helper({ lastTool: 'Read', toolUses: 1 })])
    const { container } = render(view(store))
    expect(container.querySelector('.live-now__text')?.textContent).toBe('Read')
    act(() =>
      store.publish({
        ...store.getSnapshot(),
        items: [
          prompt(),
          helper({ lastTool: 'Bash', summary: 'Running the encoder', toolUses: 2 }),
        ],
      }),
    )
    expect(container.querySelector('.live-now__text')?.textContent).toBe('Running the encoder')
    expect(container.querySelector('.live-now__count')?.textContent).toBe('2 tools')
  })

  it('says nothing about its steps when the provider reports none, and keeps the time', () => {
    vi.useFakeTimers({ now: NOW })
    const { container } = render(view(running([prompt(), helper()])))
    expect(container.querySelector('.live-now')).toBeNull()
    expect(container.querySelector('.activity--live .live-elapsed')?.textContent).not.toBe('')
  })
})

describe('a running command in the transcript', () => {
  function command(text: string, createdAt: number): Item {
    return {
      id: 'cmd',
      turnId: TURN,
      type: 'command',
      status: 'started',
      command: 'ffmpeg -i a.mov out.mp4',
      text,
      createdAt,
    }
  }

  it('shows its time once it has run a few seconds, and only the last line it printed', () => {
    vi.useFakeTimers({ now: NOW })
    const { container } = render(
      view(running([prompt(), command('frame=1\nframe=2\nframe=3\n', NOW - 1_000)])),
    )
    const time = container.querySelector('.activity--live .live-elapsed')!
    expect(time.textContent).toBe('')
    expect(container.querySelector('.live-now--tail .live-now__text')?.textContent).toBe('frame=3')
    act(() => vi.advanceTimersByTime(5_000))
    expect(time.textContent).toBe('6s')
  })

  it('keeps a quiet command to its label and time', () => {
    const { container } = render(view(running([prompt(), command('', NOW - 60_000)])))
    expect(container.querySelector('.live-now')).toBeNull()
  })
})

describe('a tick does not render the transcript', () => {
  it('updates the timers by text node alone', () => {
    vi.useFakeTimers({ now: NOW })
    let commits = 0
    const store = running([prompt(), helper({ summary: 'Rendering' })])
    const { container } = render(
      <Profiler id="thread" onRender={() => (commits += 1)}>
        {view(store)}
      </Profiler>,
    )
    const before = commits
    const timers = [...container.querySelectorAll('.working-timer, .live-elapsed')] as HTMLElement[]
    const text = () => timers.map((node) => node.textContent)
    const first = text()
    act(() => vi.advanceTimersByTime(10_000))
    expect(commits).toBe(before)
    expect(text()).not.toEqual(first)
    expect(timers.length).toBeGreaterThanOrEqual(2)
  })
})

describe('a turn that ended under its helper', () => {
  function ended(helperState: Subagent['state'], status: 'failed' | 'interrupted') {
    const events = [
      {
        type: 'turn.started' as const,
        turn: { id: TURN, threadId: 't', status: 'running' as const, createdAt: NOW - 900_000 },
      },
      { type: 'item.completed' as const, item: prompt() },
      {
        type: 'item.completed' as const,
        item: {
          id: 'read',
          turnId: TURN,
          type: 'tool_call' as const,
          status: 'completed' as const,
          text: 'Read',
          createdAt: NOW - 880_000,
        },
      },
      {
        type: 'item.completed' as const,
        item: { ...helper({ state: helperState }), status: 'failed' as const },
      },
      { type: 'thread.error' as const, threadId: 't', message: 'The session ended' },
      { type: 'turn.completed' as const, turnId: TURN, status, completedAt: NOW },
    ]
    return events.reduce(reduce, emptyThread)
  }

  it('says interrupted, not "Worked for", and marks the helper interrupted', () => {
    const { container } = render(view(new ThreadFrameStore(ended('interrupted', 'failed'))))
    expect(screen.getByRole('button', { name: 'Interrupted after 15m' })).toBeTruthy()
    expect(screen.queryByText(/Worked for/)).toBeNull()
    expect(container.querySelector('.live-now')).toBeNull()
    expect(container.querySelector('.working-timer')).toBeNull()
  })

  it('shows a lone helper row as interrupted, not failed and not running', () => {
    const { container } = render(view(new ThreadFrameStore(ended('interrupted', 'failed'))))
    const state = container.querySelector('.subagent__state')
    expect(state?.textContent ?? 'Interrupted').toBe('Interrupted')
    expect(container.querySelector('.subagent__pulse')).toBeNull()
  })

  it('does not make a turn the user stopped look interrupted by a failure', () => {
    render(
      view(new ThreadFrameStore({ ...ended('interrupted', 'interrupted'), items: [prompt()] })),
    )
    expect(screen.queryByText(/Interrupted after/)).toBeNull()
  })
})
