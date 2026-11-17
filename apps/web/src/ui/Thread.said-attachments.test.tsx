// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Item } from '@harness/contracts'
import { setLanguage } from '../i18n/index.js'
import { emptyThread } from '../thread-store.js'
import { ThreadFrameStore } from '../thread-frame-store.js'
import { browserCommentBlock } from './browser-comments.js'
import { Thread } from './Thread.js'

const PROJECT = 'C:\\site'
const bridge = vi.hoisted(() => ({
  resolve: vi.fn(),
  preview: vi.fn(),
  reveal: vi.fn(),
}))

vi.mock('../bridge.js', () => ({
  canPreviewViewedImages: true,
  isMacOS: () => false,
  knownViewedImagePreview: () => undefined,
  previewViewedImage: bridge.preview,
  resolveDeliveredFiles: bridge.resolve,
  revealPath: vi.fn(async () => undefined),
  revealProjectFile: bridge.reveal,
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

const SOUND = `${PROJECT}\\assets\\sounds\\Light_Waves.flac`
const VIDEO = `${PROJECT}\\render\\final.mp4`
const IMAGE = `${PROJECT}\\refs\\mood.png`
const PDF = `${PROJECT}\\docs\\brief.pdf`
const ARCHIVE = `${PROJECT}\\exports\\frames.zip`

const delivered = (path: string, mediaType: string) => ({
  path,
  name: path.split('\\').at(-1),
  size: 1000,
  mediaType,
  url: `tastecode-attachment://file/sig/${path.split('\\').at(-1)}`,
  copyable: true,
})

beforeEach(() => {
  Object.assign(window, {
    harness: { resolveDeliveredFiles: bridge.resolve, revealProjectFile: bridge.reveal },
  })
  bridge.resolve.mockImplementation(async (candidates: string[]) =>
    candidates.flatMap((path) =>
      path === SOUND ? [delivered(path, 'audio')] : path === PDF ? [delivered(path, 'pdf')] : [],
    ),
  )
  bridge.reveal.mockResolvedValue(undefined)
  bridge.preview.mockImplementation(async (reference: string) =>
    reference === VIDEO
      ? {
          path: reference,
          name: 'final.mp4',
          mediaType: 'video',
          previewUrl: 'tastecode-attachment://preview/sig/video',
          thumbnailUrl: 'tastecode-attachment://preview/sig/video?thumbnail=1',
        }
      : reference === IMAGE
        ? {
            path: reference,
            name: 'mood.png',
            mediaType: 'image',
            previewUrl: 'tastecode-attachment://preview/sig/image',
            thumbnailUrl: 'tastecode-attachment://preview/sig/image?thumbnail=1',
          }
        : undefined,
  )
})

afterEach(() => {
  cleanup()
  setLanguage('en')
  Reflect.deleteProperty(window, 'harness')
  bridge.resolve.mockReset()
  bridge.preview.mockReset()
  bridge.reveal.mockReset()
  vi.restoreAllMocks()
})

function sent(attachments: string[], text = 'Use this'): Item[] {
  return [
    {
      id: 'prompt-1',
      turnId: 'turn-1',
      type: 'message',
      role: 'user',
      status: 'completed',
      text,
      attachments,
      createdAt: 1,
    },
  ]
}

function renderSent(attachments: string[], text?: string) {
  return render(
    <Thread
      frameStore={new ThreadFrameStore({ ...emptyThread, items: sent(attachments, text) })}
      threadId="thread-1"
      projectPath={PROJECT}
      onDecide={() => undefined}
      onAnswerUserInput={() => undefined}
    />,
  )
}

describe('a sent message shows everything attached to it', () => {
  it('draws an image as a thumbnail', async () => {
    renderSent([IMAGE])
    expect(await screen.findByRole('img', { name: 'Preview of mood.png' })).toBeTruthy()
  })

  it('draws a video as a thumbnail with a play mark that opens the viewer', async () => {
    const { container } = renderSent([VIDEO])
    const thumbnail = await screen.findByRole('img', { name: 'Preview of final.mp4' })
    expect(thumbnail.getAttribute('src')).toContain('?thumbnail=1')
    expect(container.querySelector('.viewed-image-preview__play')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open preview of final.mp4' }))
    expect(await screen.findByRole('dialog', { name: 'Preview final.mp4' })).toBeTruthy()
  })

  it('keeps a video that cannot be previewed as a tile with its name', async () => {
    bridge.preview.mockResolvedValue(undefined)
    renderSent([VIDEO])
    const tile = await screen.findByRole('status', { name: 'Preview unavailable for final.mp4' })
    expect(tile.textContent).toContain('final.mp4')
    expect(document.querySelector('img')).toBeNull()
  })

  it('draws a sound as a chip with its name, and plays and pauses it', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async function (
      this: HTMLMediaElement,
    ) {
      Object.defineProperty(this, 'paused', { value: false, configurable: true })
      this.dispatchEvent(new Event('play'))
    })
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      Object.defineProperty(this, 'paused', { value: true, configurable: true })
      this.dispatchEvent(new Event('pause'))
    })
    const { container } = renderSent([SOUND], 'use esse som')
    const chip = container.querySelector('.said__chip--audio')
    expect(chip?.getAttribute('title')).toBe('Light_Waves.flac')
    expect(chip?.textContent).toContain('Light_Waves.flac')
    const button = await screen.findByRole('button', { name: 'Play Light_Waves.flac' })
    // The sound plays through the signed URL the desktop gave the delivered file.
    expect(container.querySelector('audio')?.getAttribute('src')).toBe(
      'tastecode-attachment://file/sig/Light_Waves.flac',
    )
    expect(bridge.resolve).toHaveBeenCalledWith([SOUND], [PROJECT])

    fireEvent.click(button)
    expect(play).toHaveBeenCalledTimes(1)
    const pausing = await screen.findByRole('button', { name: 'Pause Light_Waves.flac' })
    expect(pausing.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(pausing)
    expect(pause).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('button', { name: 'Play Light_Waves.flac' })).toBeTruthy()
  })

  it('shows a sound that is gone as a chip without a player', async () => {
    bridge.resolve.mockResolvedValue([])
    const { container } = renderSent([SOUND])
    await waitFor(() => expect(bridge.resolve).toHaveBeenCalled())
    expect(container.querySelector('.said__chip--audio')?.textContent).toContain('Light_Waves.flac')
    expect(screen.queryByRole('button', { name: /Light_Waves/ })).toBeNull()
    expect(container.querySelector('audio')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  it('shows any other file as a chip that shows it in its folder', async () => {
    renderSent([ARCHIVE])
    fireEvent.click(await screen.findByRole('button', { name: 'Show frames.zip' }))
    expect(bridge.reveal).toHaveBeenCalledWith(ARCHIVE, PROJECT)
    // A file that is not there is a click that finds nothing, never an error on screen.
    bridge.reveal.mockRejectedValue(new Error('missing'))
    fireEvent.click(screen.getByRole('button', { name: 'Show frames.zip' }))
    await act(async () => undefined)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('opens a PDF in the side panel when it can, as a delivered PDF does', async () => {
    const open = vi.fn()
    const { registerProjectFileOpener } = await import('../project-file-open.js')
    const unregister = registerProjectFileOpener(open)
    try {
      renderSent([PDF])
      await waitFor(() => expect(bridge.resolve).toHaveBeenCalledWith([PDF], [PROJECT]))
      fireEvent.click(await screen.findByRole('button', { name: 'Show brief.pdf' }))
      await waitFor(() => expect(open).toHaveBeenCalledWith({ path: PDF, projectPath: PROJECT }))
      expect(bridge.reveal).not.toHaveBeenCalled()
    } finally {
      unregister()
    }
  })

  it('draws four mixed attachments, tiles first, each once', async () => {
    const { container } = renderSent([SOUND, VIDEO, IMAGE, PDF])
    await screen.findByRole('img', { name: 'Preview of final.mp4' })
    await screen.findByRole('img', { name: 'Preview of mood.png' })
    const group = screen.getByRole('group', { name: 'Attachments' })
    expect(group.classList.contains('said__attachments')).toBe(true)
    expect(group.children).toHaveLength(4)
    expect(
      Array.from(group.children).map((child) => child.classList.contains('said__chip')),
    ).toEqual([false, false, true, true])
    expect(container.querySelectorAll('.said__attachments')).toHaveLength(1)
  })

  it('does not draw a browser comment screenshot twice', async () => {
    const shot = `${PROJECT}\\.shots\\comment-1.png`
    const text = browserCommentBlock({
      id: 'comment-1',
      comment: 'Make it bigger',
      url: 'https://example.test/page',
      title: 'Example page',
      selector: 'main > button',
      text: 'Buy now',
      image: shot,
    })
    const { container } = renderSent([shot, ARCHIVE], text)
    await screen.findByRole('button', { name: 'Show frames.zip' })
    expect(container.querySelectorAll('.said__attachments .viewed-image-preview')).toHaveLength(0)
    expect(bridge.preview).not.toHaveBeenCalledWith(shot)
  })

  it('draws nothing for a message without attachments', () => {
    const { container } = renderSent([])
    expect(container.querySelector('.said__attachments')).toBeNull()
  })

  it('names the group and the buttons in Portuguese', async () => {
    setLanguage('pt-BR')
    renderSent([SOUND, ARCHIVE])
    expect(screen.getByRole('group', { name: 'Anexos' })).toBeTruthy()
    const play = await screen.findByRole('button', { name: 'Ouvir Light_Waves.flac' })
    expect(play).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mostrar frames.zip' })).toBeTruthy()
  })
})
