// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DomainEvent, Item } from '@harness/contracts'
import { emptyThread, reduceEventLog } from '../thread-store.js'
import { ThreadFrameStore } from '../thread-frame-store.js'
import type { Transport } from '../transport.js'
import { Thread } from './Thread.js'

// A browser tab: no desktop bridge, so a picture arrives through the server, one row at a time.
vi.mock('../bridge.js', () => ({
  canPreviewViewedImages: false,
  knownViewedImagePreview: (reference: string) =>
    reference.startsWith('data:')
      ? { path: reference, name: 'Attached image', mediaType: 'image', previewUrl: reference }
      : undefined,
  previewViewedImage: vi.fn(async () => undefined),
  revealPath: vi.fn(async () => undefined),
  writeClipboardText: vi.fn(async () => undefined),
}))

// Only the first rows are near the viewport; the rest are off screen and not mounted.
const VISIBLE_ROWS = 4
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, VISIBLE_ROWS) }, (_, index) => ({
        index,
        key: index,
        start: index * 72,
      })),
    getTotalSize: () => count * 72,
    measureElement: () => undefined,
    indexFromElement: (node: Element) => Number(node.getAttribute('data-index')),
    resizeItem: () => undefined,
    measurementsCache: [],
    getOffsetForIndex: () => [0],
    scrollToIndex: () => undefined,
  }),
}))

afterEach(cleanup)

const reference = (index: number) =>
  `C:\\data\\pasted-files\\${String(index).padStart(64, 'a')}.png`

function prompt(index: number, attachments: string[]): Item {
  return {
    id: `prompt-${index}`,
    turnId: `turn-${index}`,
    type: 'message',
    role: 'user',
    status: 'completed',
    text: `Prompt ${index}`,
    attachments,
    createdAt: index,
  }
}

function transportWith(read: (path: string) => Promise<{ mimeType: string; data: string }>) {
  const request = vi.fn(async (method: string, params: { path: string }) => {
    if (method !== 'attachments.read') throw new Error(`unexpected ${method}`)
    return read(params.path)
  })
  return { transport: { request } as unknown as Transport, request }
}

describe('a transcript image kept as a path', () => {
  it('is loaded only for the rows that are mounted, never as a string in the store', async () => {
    const items = Array.from({ length: 40 }, (_, index) => prompt(index, [reference(index)]))
    const { transport, request } = transportWith(async () => ({
      mimeType: 'image/png',
      data: 'AAAA',
    }))

    render(
      <Thread
        frameStore={new ThreadFrameStore({ ...emptyThread, items })}
        threadId="thread-1"
        transport={transport}
        onDecide={() => undefined}
        onAnswerUserInput={() => undefined}
      />,
    )

    await waitFor(() => expect(document.querySelectorAll('img').length).toBe(VISIBLE_ROWS))
    expect(request).toHaveBeenCalledTimes(VISIBLE_ROWS)
    expect(request.mock.calls.map(([, params]) => params.path)).toEqual(
      items.slice(0, VISIBLE_ROWS).map((item) => item.attachments![0]),
    )
    // What the store holds for all 40 rows is the paths.
    expect(items.every((item) => item.attachments![0]!.length < 200)).toBe(true)
  })

  it('shows a picture an old saved chat still carries inline, without asking the server', async () => {
    const inline = `data:image/png;base64,${'A'.repeat(2_000)}`
    const { transport, request } = transportWith(async () => {
      throw new Error('not expected')
    })

    render(
      <Thread
        frameStore={new ThreadFrameStore({ ...emptyThread, items: [prompt(1, [inline])] })}
        threadId="thread-1"
        transport={transport}
        onDecide={() => undefined}
        onAnswerUserInput={() => undefined}
      />,
    )

    expect(await screen.findByRole('img', { name: 'Preview of Attached image' })).toBeTruthy()
    expect(request).not.toHaveBeenCalled()
  })

  it('says the preview is unavailable when the file is gone', async () => {
    const { transport } = transportWith(async () => {
      throw new Error('This chat has no such image.')
    })

    render(
      <Thread
        frameStore={new ThreadFrameStore({ ...emptyThread, items: [prompt(1, [reference(1)])] })}
        threadId="thread-1"
        transport={transport}
        onDecide={() => undefined}
        onAnswerUserInput={() => undefined}
      />,
    )

    expect(await screen.findByRole('status', { name: /Preview unavailable/ })).toBeTruthy()
  })
})

describe('a chat with many large pictures, as the renderer receives it', () => {
  it('keeps the page that crosses to the renderer and what its store retains small', () => {
    // What the server sends for a chat whose tool calls read 300 screenshots of ~400 KB each:
    // every item names its file and carries a few facts about it, never the bytes.
    const events: DomainEvent[] = []
    for (let index = 0; index < 300; index += 1) {
      const file = reference(index)
      events.push({
        type: 'item.completed',
        item: {
          id: `read-${index}`,
          turnId: 'turn-1',
          type: 'tool_call',
          status: 'completed',
          text: 'Read',
          attachments: [file],
          attachmentInfo: {
            [file]: { mediaType: 'image/png', bytes: 400_000, width: 1920, height: 1080 },
          },
          createdAt: index,
        },
      })
    }
    const page = JSON.stringify({ events: events.map((event, seq) => ({ seq, event })) })

    const state = reduceEventLog(
      emptyThread,
      events.map((event, seq) => ({ seq, event })),
    )

    // 300 pictures of 400 KB are 120 MB; the page is under 150 KB (500 bytes a picture).
    expect(page.length).toBeLessThan(150_000)
    expect(state.items).toHaveLength(300)
    const retained = state.items.reduce(
      (total, item) =>
        total +
        (item.attachments ?? []).reduce((sum, value) => sum + value.length, 0) +
        JSON.stringify(item.attachmentInfo ?? {}).length,
      0,
    )
    expect(retained).toBeLessThan(150_000)
    expect(
      state.items.some((item) => item.attachments?.some((value) => value.startsWith('data:'))),
    ).toBe(false)
  })
})
