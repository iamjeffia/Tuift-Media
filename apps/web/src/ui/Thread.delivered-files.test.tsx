// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Item } from '@harness/contracts'
import { emptyThread } from '../thread-store.js'
import { ThreadFrameStore } from '../thread-frame-store.js'
import { Thread } from './Thread.js'

const PROJECT = 'C:\\site'
const VIDEO = {
  path: `${PROJECT}\\render\\final.mp4`,
  name: 'final.mp4',
  size: 6_300_000,
  mediaType: 'video',
  url: 'tastecode-attachment://file/sig/final.mp4',
  copyable: true,
}

const bridge = vi.hoisted(() => ({ resolve: vi.fn() }))
vi.mock('../bridge.js', () => ({
  canPreviewViewedImages: false,
  isMacOS: () => false,
  knownViewedImagePreview: () => undefined,
  previewViewedImage: vi.fn(async () => undefined),
  resolveDeliveredFiles: bridge.resolve,
  revealPath: vi.fn(async () => undefined),
  writeClipboardText: vi.fn(async () => undefined),
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

// The desktop shell is what can resolve a path: without `window.harness` nothing is looked up.
beforeEach(() => {
  Object.assign(window, { harness: { resolveDeliveredFiles: bridge.resolve } })
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'harness')
  bridge.resolve.mockReset()
})

function message(role: 'user' | 'assistant', status: Item['status'], text: string): Item {
  return { id: `${role}-1`, turnId: 'turn-1', type: 'message', role, status, text, createdAt: 1 }
}

function renderThread(items: Item[]) {
  const view = (key: number) => (
    <Thread
      key={key}
      frameStore={new ThreadFrameStore({ ...emptyThread, items })}
      threadId="thread-1"
      projectPath={PROJECT}
      onDecide={() => undefined}
      onAnswerUserInput={() => undefined}
    />
  )
  return { view, ...render(view(0)) }
}

describe('a file a finished reply names', () => {
  it('shows its card right under the reply, once the desktop resolved it', async () => {
    bridge.resolve.mockResolvedValue([VIDEO])
    renderThread([message('assistant', 'completed', 'Pronto:\n\nrender/final.mp4')])

    expect(await screen.findByRole('group', { name: 'final.mp4' })).toBeTruthy()
    expect(bridge.resolve).toHaveBeenCalledTimes(1)
    expect(bridge.resolve).toHaveBeenCalledWith(['render/final.mp4'], [PROJECT])
  })

  it('is left as plain text in a browser tab, where there is no desktop to look it up', async () => {
    Reflect.deleteProperty(window, 'harness')
    renderThread([message('assistant', 'completed', 'Pronto:\n\nrender/final.mp4')])
    await screen.findByText(/Pronto/)
    expect(bridge.resolve).not.toHaveBeenCalled()
    expect(screen.queryByRole('group', { name: 'final.mp4' })).toBeNull()
  })

  it('is not looked up while the reply streams, nor for the person’s own message', async () => {
    bridge.resolve.mockResolvedValue([VIDEO])
    renderThread([
      message('assistant', 'started', 'Pronto:\n\nrender/final.mp4'),
      { ...message('user', 'completed', 'Veja render/final.mp4'), id: 'user-1' },
    ])
    await screen.findByText(/Veja/)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(bridge.resolve).not.toHaveBeenCalled()
    expect(screen.queryByRole('group', { name: 'final.mp4' })).toBeNull()
  })

  it('leaves the text as it was when the path does not resolve', async () => {
    bridge.resolve.mockResolvedValue([])
    renderThread([message('assistant', 'completed', 'Pronto: render/gone.mp4')])
    await waitFor(() => expect(bridge.resolve).toHaveBeenCalled())
    expect(screen.queryByRole('group', { name: 'Files in this message' })).toBeNull()
    expect(document.body.textContent).toContain('render/gone.mp4')
  })

  it('is looked up once per message, however often the transcript draws it again', async () => {
    bridge.resolve.mockResolvedValue([VIDEO])
    const items = [message('assistant', 'completed', 'Pronto:\n\nrender/once.mp4')]
    const { rerender, view } = renderThread(items)
    await screen.findByRole('group', { name: 'final.mp4' })
    rerender(view(0))
    rerender(view(0))
    expect(bridge.resolve).toHaveBeenCalledTimes(1)
  })
})
