// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeliveredFile } from '../bridge.js'
import { registerComposerAttacher } from '../composer-attach.js'
import { setLanguage } from '../i18n/index.js'
import { registerProjectFileOpener } from '../project-file-open.js'

const bridge = vi.hoisted(() => ({
  resolve: vi.fn(),
  copy: vi.fn(async (_path: string, _roots: string[]) => {}),
  save: vi.fn(async (_path: string, _roots: string[]) => true),
  attach: vi.fn(async (path: string, _roots: string[]) => ({ path, name: 'attached' })),
  reveal: vi.fn(async (_path: string, _root: string) => {}),
  write: vi.fn(async (_text: string) => {}),
}))

vi.mock('../bridge.js', () => ({
  isMacOS: () => false,
  resolveDeliveredFiles: bridge.resolve,
  copyDeliveredFile: bridge.copy,
  saveDeliveredFile: bridge.save,
  attachDeliveredFile: bridge.attach,
  revealProjectFile: bridge.reveal,
  writeClipboardText: bridge.write,
}))

const { DeliveredFiles } = await import('./DeliveredFiles.js')

const PROJECT = 'C:\\Vídeos de teste'
const file = (name: string, mediaType: DeliveredFile['mediaType'], size = 4_400_000) => ({
  path: `${PROJECT}\\render\\${name}`,
  name,
  size,
  mediaType,
  url: `tastecode-attachment://file/sig/${name}`,
  copyable: true,
})
const VIDEO = file('apresentacao-15s.mp4', 'video')
const IMAGE = file('capa.png', 'image', 412_000)
const AUDIO = file('voz.wav', 'audio', 264_000)
const PDF = file('brief.pdf', 'pdf', 184_320)

let texts = 0
// Each test names its files in a text of its own, so the module's cache of answers cannot leak.
const message = (...names: string[]) => `Pronto (${++texts}):\n\n${names.join('\n')}`

function renderFiles(text: string, answer: DeliveredFile[]) {
  bridge.resolve.mockResolvedValue(answer)
  return render(<DeliveredFiles text={text} projectPath={PROJECT} />)
}

const unregister: Array<() => void> = []

// A scroll position the test controls: every observed card is on screen until it says otherwise.
const observers = new Set<{ report: (visible: boolean) => void }>()
class ControlledObserver {
  private readonly targets = new Set<Element>()
  constructor(private readonly callback: IntersectionObserverCallback) {
    observers.add(this)
  }
  report(visible: boolean) {
    this.callback(
      [...this.targets].map((target) => ({
        isIntersecting: visible,
        target,
      })) as IntersectionObserverEntry[],
      this as unknown as IntersectionObserver,
    )
  }
  observe(target: Element) {
    this.targets.add(target)
    this.report(true)
  }
  unobserve() {}
  disconnect() {
    observers.delete(this)
  }
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', ControlledObserver)
  bridge.resolve.mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
  cleanup()
  for (const stop of unregister.splice(0)) stop()
  for (const mock of Object.values(bridge)) if (mock !== bridge.resolve) mock.mockClear()
  setLanguage('en', { persist: false })
})

describe('the cards under a reply', () => {
  it('asks the desktop once, with the paths the text names and the chat project as the only root', async () => {
    renderFiles(message('render/final.mp4', '`capa.png`'), [VIDEO])
    await screen.findByRole('group', { name: VIDEO.name })
    expect(bridge.resolve).toHaveBeenCalledTimes(1)
    expect(bridge.resolve.mock.calls[0]).toEqual([['render/final.mp4', 'capa.png'], [PROJECT]])
  })

  it('shows nothing, and no error, for a path that does not resolve', async () => {
    const view = renderFiles(message('render/gone.mp4'), [])
    await waitFor(() => expect(bridge.resolve).toHaveBeenCalled())
    expect(view.container.innerHTML).toBe('')
  })

  it('does not ask for a text that names no file, or without a project', () => {
    render(<DeliveredFiles text="Tudo certo, sem arquivos." projectPath={PROJECT} />)
    render(<DeliveredFiles text={message('render/final.mp4')} projectPath={undefined} />)
    expect(bridge.resolve).not.toHaveBeenCalled()
  })

  it('shows a video with the standard controls, never autoplaying, in a box that is already sized', async () => {
    const view = renderFiles(message('a.mp4'), [VIDEO])
    const player = (await screen.findByLabelText(VIDEO.name, {
      selector: 'video',
    })) as HTMLVideoElement
    expect(player.controls).toBe(true)
    expect(player.autoplay).toBe(false)
    expect(player.getAttribute('src')).toBe(VIDEO.url)
    expect(player.preload).toBe('metadata')
    expect(view.container.querySelector('.delivered__frame video')).toBe(player)
    expect(screen.getByText(VIDEO.name)).toBeTruthy()
    expect(screen.getByText('4.2 MB')).toBeTruthy()
  })

  it('adds the duration and the size of a video once its metadata arrives', async () => {
    renderFiles(message('b.mp4'), [VIDEO])
    const player = (await screen.findByLabelText(VIDEO.name, {
      selector: 'video',
    })) as HTMLVideoElement
    Object.defineProperty(player, 'duration', { value: 15.2 })
    Object.defineProperty(player, 'videoWidth', { value: 1920 })
    Object.defineProperty(player, 'videoHeight', { value: 1080 })
    fireEvent.loadedMetadata(player)
    expect(screen.getByText('0:15 · 1920 × 1080 · 4.2 MB')).toBeTruthy()
  })

  it('gives a vertical video a card of its own shape, and remembers it', async () => {
    const VERTICAL = { ...VIDEO, path: `${PROJECT}/render/vertical.mp4`, name: 'vertical.mp4' }
    const first = renderFiles(message('vertical.mp4'), [VERTICAL])
    const player = (await screen.findByLabelText(VERTICAL.name, {
      selector: 'video',
    })) as HTMLVideoElement
    const card = () => document.querySelector<HTMLElement>('.delivered__card')!
    expect(card().style.getPropertyValue('--delivered-ratio')).toBe('')
    Object.defineProperty(player, 'videoWidth', { value: 1080 })
    Object.defineProperty(player, 'videoHeight', { value: 1920 })
    fireEvent.loadedMetadata(player)
    expect(card().style.getPropertyValue('--delivered-ratio')).toBe('0.5625')
    expect(card().hasAttribute('data-narrow')).toBe(true)
    // Back on screen later: the card starts with the shape it measured.
    first.unmount()
    renderFiles(message('vertical.mp4'), [VERTICAL])
    await screen.findByLabelText(VERTICAL.name, { selector: 'video' })
    expect(card().style.getPropertyValue('--delivered-ratio')).toBe('0.5625')
  })

  it('shows an image as a thumbnail that opens in the media viewer', async () => {
    renderFiles(message('c.png'), [IMAGE])
    const open = await screen.findByRole('button', { name: `Open ${IMAGE.name}` })
    // The picture mounts once its card is on screen, a tick after the button appears.
    await waitFor(() => expect(open.querySelector('img')?.getAttribute('src')).toBe(IMAGE.url))
    fireEvent.click(open)
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('shows audio as a compact player', async () => {
    renderFiles(message('d.wav'), [AUDIO])
    const player = (await screen.findByLabelText(AUDIO.name, {
      selector: 'audio',
    })) as HTMLAudioElement
    expect(player.controls).toBe(true)
    expect(player.autoplay).toBe(false)
  })

  it('shows a PDF as a card that opens in the side panel, or in Explorer where there is none', async () => {
    renderFiles(message('e.pdf'), [PDF])
    const card = await screen.findByRole('button', { name: `Open ${PDF.name} in the side panel` })
    expect(screen.getByText('PDF · 180.0 KB')).toBeTruthy()
    fireEvent.click(card)
    expect(bridge.reveal).toHaveBeenCalledWith(PDF.path, PROJECT)

    const open = vi.fn()
    act(() => void unregister.push(registerProjectFileOpener(open)))
    fireEvent.click(card)
    expect(open).toHaveBeenCalledWith({ path: PDF.path, projectPath: PROJECT })
  })

  it('says it could not load a file the player refuses', async () => {
    renderFiles(message('f.mp4'), [VIDEO])
    fireEvent.error(await screen.findByLabelText(VIDEO.name, { selector: 'video' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText(`Could not load ${VIDEO.name}`)).toBeTruthy()
  })

  it('shows at most six cards and says how many there are', async () => {
    const many = Array.from({ length: 8 }, (_unused, index) => file(`clip-${index}.mp4`, 'video'))
    renderFiles(message(...many.map((entry) => entry.name)), many)
    await screen.findByRole('group', { name: 'clip-0.mp4' })
    expect(document.querySelectorAll('.delivered__card')).toHaveLength(6)
    expect(screen.getByText('Showing the first 6 of 8 files in this message')).toBeTruthy()
  })

  it('holds no decoded media while off screen, and keeps a player that is playing', async () => {
    renderFiles(message('o.mp4', 'p.png'), [VIDEO, IMAGE])
    await screen.findByLabelText(VIDEO.name, { selector: 'video' })
    expect(document.querySelectorAll('img').length).toBe(1)

    act(() => observers.forEach((observer) => observer.report(false)))
    expect(document.querySelector('video')).toBeNull()
    expect(document.querySelector('img[src]')).toBeNull()
    // The card keeps its box, so nothing below it moves.
    expect(document.querySelectorAll('.delivered__frame').length).toBe(2)

    act(() => observers.forEach((observer) => observer.report(true)))
    const player = await screen.findByLabelText(VIDEO.name, { selector: 'video' })
    fireEvent.play(player)
    act(() => observers.forEach((observer) => observer.report(false)))
    expect(document.querySelector('video')).toBe(player)
    fireEvent.pause(player)
    expect(document.querySelector('video')).toBeNull()
  })

  it('answers again from memory when the same message comes back on screen', async () => {
    const text = message('g.mp4')
    const first = renderFiles(text, [VIDEO])
    await screen.findByRole('group', { name: VIDEO.name })
    first.unmount()
    render(<DeliveredFiles text={text} projectPath={PROJECT} />)
    // The same render, no waiting: a row that scrolls back in does not change height.
    expect(screen.getByRole('group', { name: VIDEO.name })).toBeTruthy()
    expect(bridge.resolve).toHaveBeenCalledTimes(1)
  })
})

describe('the menu of a card', () => {
  const items = () => screen.getAllByRole('menuitem').map((item) => item.textContent)

  it('offers what the owner asked for, in order, and each item does its job', async () => {
    const attached = vi.fn()
    unregister.push(registerComposerAttacher(attached))
    unregister.push(registerProjectFileOpener(vi.fn()))
    renderFiles(message('h.mp4'), [VIDEO])
    const card = await screen.findByRole('group', { name: VIDEO.name })

    fireEvent.contextMenu(card)
    expect(items()).toEqual([
      'Copy file',
      'Save as…',
      'Attach as context',
      'Copy path',
      'Copy file name',
      'Open in panel',
      'Show in Explorer',
    ])

    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy file' }))
    expect(bridge.copy).toHaveBeenCalledWith(VIDEO.path, [PROJECT])

    fireEvent.contextMenu(card)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save as…' }))
    expect(bridge.save).toHaveBeenCalledWith(VIDEO.path, [PROJECT])

    fireEvent.contextMenu(card)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Attach as context' }))
    await waitFor(() =>
      expect(attached).toHaveBeenCalledWith([{ path: VIDEO.path, name: 'attached' }]),
    )

    fireEvent.contextMenu(card)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy path' }))
    expect(bridge.write).toHaveBeenLastCalledWith(VIDEO.path)

    fireEvent.contextMenu(card)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy file name' }))
    expect(bridge.write).toHaveBeenLastCalledWith(VIDEO.name)

    fireEvent.contextMenu(card)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Show in Explorer' }))
    expect(bridge.reveal).toHaveBeenCalledWith(VIDEO.path, PROJECT)
  })

  it('copies an image as an image, and leaves out what the place cannot do', async () => {
    renderFiles(message('i.png'), [IMAGE])
    fireEvent.contextMenu(await screen.findByRole('group', { name: IMAGE.name }))
    // No composer to attach to and no side panel registered: those two are left out, not disabled.
    expect(items()).toEqual([
      'Copy image',
      'Save as…',
      'Copy path',
      'Copy file name',
      'Show in Explorer',
    ])
  })

  it('leaves Copy out for a file the system cannot put on the clipboard', async () => {
    renderFiles(message('j.mp4'), [{ ...VIDEO, copyable: false }])
    fireEvent.contextMenu(await screen.findByRole('group', { name: VIDEO.name }))
    expect(items()).not.toContain('Copy file')
    expect(items()).toContain('Save as…')
  })

  it('opens from the keyboard: Shift+F10 or the menu key on the focused card', async () => {
    renderFiles(message('k.mp4'), [VIDEO])
    const card = await screen.findByRole('group', { name: VIDEO.name })
    expect(card.tabIndex).toBe(0)
    card.focus()
    expect(document.activeElement).toBe(card)

    fireEvent.keyDown(card, { key: 'F10', shiftKey: true })
    fireEvent.contextMenu(card)
    const menu = await screen.findByRole('menu')
    expect(within(menu).getAllByRole('menuitem').length).toBeGreaterThan(3)
    await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true))

    fireEvent.keyDown(document.activeElement ?? menu, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    cleanup()

    renderFiles(message('l.mp4'), [VIDEO])
    const again = await screen.findByRole('group', { name: VIDEO.name })
    again.focus()
    fireEvent.keyDown(again, { key: 'ContextMenu' })
    fireEvent.contextMenu(again)
    expect(await screen.findByRole('menu')).toBeTruthy()
  })

  it('says so on the card when a copy or a save fails', async () => {
    bridge.copy.mockRejectedValueOnce(new Error('refused'))
    bridge.save.mockRejectedValueOnce(new Error('refused'))
    renderFiles(message('m.mp4'), [VIDEO])
    const card = await screen.findByRole('group', { name: VIDEO.name })

    fireEvent.contextMenu(card)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy file' }))
    expect(await screen.findByText('Could not copy the file')).toBeTruthy()

    fireEvent.contextMenu(card)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save as…' }))
    expect(await screen.findByText('Could not save the file')).toBeTruthy()
  })

  it('is in Portuguese when the language is', async () => {
    setLanguage('pt-BR', { persist: false })
    unregister.push(registerComposerAttacher(vi.fn()))
    unregister.push(registerProjectFileOpener(vi.fn()))
    renderFiles(message('n.mp4'), [VIDEO])
    fireEvent.contextMenu(await screen.findByRole('group', { name: VIDEO.name }))
    expect(items()).toEqual([
      'Copiar arquivo',
      'Salvar como…',
      'Anexar como contexto',
      'Copiar caminho',
      'Copiar nome do arquivo',
      'Abrir no painel',
      'Mostrar no Explorer',
    ])
    cleanup()

    const many = Array.from({ length: 7 }, (_unused, index) => file(`clip-${index}.png`, 'image'))
    renderFiles(message(...many.map((entry) => entry.name)), many)
    await screen.findByRole('group', { name: 'Arquivos desta mensagem' })
    expect(screen.getByText('Mostrando os primeiros 6 de 7 arquivos desta mensagem')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Abrir clip-0.png' })).toBeTruthy()
    await act(async () => {})
  })
})
