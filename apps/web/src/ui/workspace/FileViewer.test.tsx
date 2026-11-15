// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setLanguage } from '../../i18n/index.js'

const bridge = vi.hoisted(() => ({
  previewProjectFile: vi.fn(
    async (
      _path: string,
      _root: string,
    ): Promise<{ url: string; mediaType: 'image' | 'video' | 'audio' | 'pdf' } | undefined> =>
      undefined,
  ),
}))

vi.mock('../../bridge.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../bridge.js')>()),
  previewProjectFile: bridge.previewProjectFile,
}))

const { FileViewer } = await import('./FileViewer.js')

// The first Markdown preview loads its renderer; a loaded machine can take a while.
const SLOW = { timeout: 8_000 }
const ROOT = 'C:\\projects\\site'
const file = (
  name: string,
  content?: string,
  extra: Partial<Parameters<typeof FileViewer>[0]['file']> = {},
) => ({
  name: name.split('/').at(-1)!,
  path: name,
  size: content?.length ?? 2048,
  binary: content === undefined,
  truncated: false,
  ...(content === undefined ? {} : { content }),
  ...extra,
})

function view(name: string, content?: string, props: { root?: string | undefined } = {}) {
  return render(
    <FileViewer
      file={file(name, content)}
      projectPath={ROOT}
      root={'root' in props ? props.root : ROOT}
      onReveal={vi.fn()}
    />,
  )
}

// The row window measures its scroller; happy-dom has no layout, so give it a height.
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 400 })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 600 })
})

afterEach(() => {
  cleanup()
  bridge.previewProjectFile.mockReset()
})

describe('FileViewer by type', () => {
  it('shows source with line numbers', async () => {
    const { container } = view('src/app.ts', 'const a = 1\nconst b = 2\n')
    await waitFor(() => expect(container.querySelectorAll('.workspace-code__line').length).toBe(3))
    const lines = [...container.querySelectorAll('.workspace-code__line')]
    expect(lines.map((line) => line.querySelector('span')?.textContent)).toEqual(['1', '2', '3'])
    expect(lines[0]?.querySelector('code')?.textContent).toBe('const a = 1')
    expect(screen.queryByRole('radiogroup')).toBeNull()
  })

  it('renders Markdown first and switches to the raw text and back', async () => {
    const { container } = view('docs/guide.md', '# Guide\n\nSome **bold** words.\n')

    expect(await screen.findByRole('heading', { name: 'Guide' }, SLOW)).toBeTruthy()
    expect(container.querySelector('.workspace-markdown__column strong')?.textContent).toBe('bold')
    expect(container.querySelector('.workspace-code')).toBeNull()
    expect(screen.getByRole('radio', { name: 'Preview' }).getAttribute('aria-checked')).toBe('true')

    fireEvent.click(screen.getByRole('radio', { name: 'Raw' }))
    expect(screen.queryByRole('heading', { name: 'Guide' })).toBeNull()
    await waitFor(() =>
      expect(container.querySelector('.workspace-code__line code')).not.toBeNull(),
    )
    expect(container.querySelector('.workspace-code__line code')?.textContent).toBe('# Guide')

    fireEvent.click(screen.getByRole('radio', { name: 'Preview' }))
    expect(await screen.findByRole('heading', { name: 'Guide' }, SLOW)).toBeTruthy()
  })

  it.each([
    ['frame.png', 'image', 'img'],
    ['take.mp4', 'video', 'video'],
    ['voice.mp3', 'audio', 'audio'],
  ] as const)(
    'plays or shows %s from the signed URL the desktop gives',
    async (name, mediaType, tag) => {
      bridge.previewProjectFile.mockResolvedValue({
        url: `tastecode-attachment://file/sig/${name}`,
        mediaType,
      })
      const { container } = view(`media/${name}`)

      await waitFor(() => expect(container.querySelector(tag)).not.toBeNull())
      expect(container.querySelector(tag)?.getAttribute('src')).toBe(
        `tastecode-attachment://file/sig/${name}`,
      )
      expect(bridge.previewProjectFile).toHaveBeenCalledWith(`${ROOT}\\media\\${name}`, ROOT)
      // Native controls on video and audio; no text was read for any of them.
      if (tag !== 'img') expect(container.querySelector(tag)?.hasAttribute('controls')).toBe(true)
    },
  )

  it('says a video it cannot play, with a way out', async () => {
    bridge.previewProjectFile.mockResolvedValue({
      url: 'tastecode-attachment://file/sig/a',
      mediaType: 'video',
    })
    const { container } = view('take.mov')
    const video = await waitFor(() => {
      const element = container.querySelector('video')
      if (!element) throw new Error('no video yet')
      return element
    })
    fireEvent.error(video)
    expect((await screen.findByRole('alert')).textContent).toContain('can’t be played here')
    expect(screen.getByRole('button', { name: 'Open in Explorer' })).toBeTruthy()
  })

  describe('PDF', () => {
    const signed = 'tastecode-attachment://file/sig/path'
    const openPdf = async (name = 'docs/brief.pdf') => {
      bridge.previewProjectFile.mockResolvedValue({ url: signed, mediaType: 'pdf' })
      const result = view(name)
      const guest = await waitFor(() => {
        const element = result.container.querySelector('webview')
        if (!element) throw new Error('no guest yet')
        return element
      })
      return { ...result, guest }
    }

    it.each(['docs/brief.pdf', 'docs/BRIEF.PDF'])(
      'shows %s in a guest that loads only the signed URL',
      async (name) => {
        const { guest } = await openPdf(name)

        expect(guest.getAttribute('src')).toBe(signed)
        expect(guest.getAttribute('partition')).toBe('persist:harness-pdf')
        expect(guest.getAttribute('aria-label')).toBe(name.split('/').at(-1))
        expect(guest.getAttribute('webpreferences')).toBe(
          'contextIsolation=yes, nodeIntegration=no, sandbox=yes, spellcheck=no',
        )
        // Nothing that would let the guest open windows, run Node or load a preload.
        for (const attribute of ['allowpopups', 'nodeintegration', 'preload', 'plugins']) {
          expect(guest.hasAttribute(attribute)).toBe(false)
        }
        expect(bridge.previewProjectFile).toHaveBeenCalledWith(
          `${ROOT}\\${name.replace('/', '\\')}`,
          ROOT,
        )
        // The desktop streams the file: no text was read into the renderer.
        expect(screen.queryByText('Binary file')).toBeNull()
      },
    )

    it('keeps the loading state until the viewer has loaded', async () => {
      const { guest } = await openPdf()
      expect(screen.getByText('Opening file…')).toBeTruthy()

      fireEvent(guest, new Event('did-stop-loading'))
      await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
      expect(guest.isConnected).toBe(true)
    })

    it('says a PDF could not be shown, with a way out', async () => {
      const { guest, container } = await openPdf()
      fireEvent(guest, Object.assign(new Event('did-fail-load'), { errorCode: -6 }))

      expect((await screen.findByRole('alert')).textContent).toContain(
        'This PDF could not be shown.',
      )
      expect(screen.getByRole('button', { name: 'Open in Explorer' })).toBeTruthy()
      expect(container.querySelector('webview')).toBeNull()
    })

    it('ignores a load another one replaced and a failure in a sub-frame', async () => {
      const { guest } = await openPdf()
      fireEvent(guest, Object.assign(new Event('did-fail-load'), { errorCode: -3 }))
      fireEvent(
        guest,
        Object.assign(new Event('did-fail-load'), { errorCode: -6, isMainFrame: false }),
      )
      fireEvent(guest, new Event('did-stop-loading'))
      await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('reloads when the file was replaced on disk', async () => {
      bridge.previewProjectFile.mockResolvedValue({ url: signed, mediaType: 'pdf' })
      const props = { file: file('docs/brief.pdf'), projectPath: ROOT, root: ROOT }
      const { container, rerender } = render(<FileViewer {...props} revision={0} />)
      await waitFor(() => expect(container.querySelector('webview')).not.toBeNull())
      rerender(<FileViewer {...props} revision={1} />)
      await waitFor(() =>
        expect(container.querySelector('webview')?.getAttribute('src')).toBe(`${signed}?v=1`),
      )
    })

    it('falls back to Explorer where the desktop cannot show it', async () => {
      // The sandbox, a browser and the phone view have no bridge: no guest, no blank frame.
      const { container } = view('docs/brief.pdf')
      expect(await screen.findByText('Preview not available')).toBeTruthy()
      expect(container.querySelector('webview, iframe, embed, object')).toBeNull()
      expect(screen.getByRole('button', { name: 'Open in Explorer' })).toBeTruthy()
    })

    it('is translated', async () => {
      setLanguage('pt-BR', { persist: false })
      const { guest } = await openPdf()
      expect(screen.getByText('Abrindo arquivo…')).toBeTruthy()
      fireEvent(guest, Object.assign(new Event('did-fail-load'), { errorCode: -6 }))
      expect((await screen.findByRole('alert')).textContent).toContain(
        'Não foi possível mostrar este PDF.',
      )
      expect(screen.getByRole('button', { name: 'Abrir no Explorer' })).toBeTruthy()
    })
  })

  it('needs the desktop app for media, and says so, when it cannot stream it', async () => {
    view('frame.png')
    expect(await screen.findByText('Preview not available')).toBeTruthy()
  })

  it('names a binary file it cannot show as text', () => {
    view('data.bin')
    expect(screen.getByText('Binary file')).toBeTruthy()
  })

  it('shows the size and a way out when the text was cut', () => {
    render(
      <FileViewer
        file={file('big.log', 'line\n', { truncated: true, size: 5_000_000 })}
        projectPath={ROOT}
        root={ROOT}
        onReveal={vi.fn()}
      />,
    )
    expect(screen.getByText(/First 2 MB/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open in Explorer' })).toBeTruthy()
  })
})
