import type { BrowserWindow, ContextMenuParams, WebContents } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Language } from './i18n.js'
import { configureImageContextMenu } from './image-context-menu.js'

const { buildFromTemplate, popup } = vi.hoisted(() => ({
  buildFromTemplate: vi.fn(),
  popup: vi.fn(),
}))
vi.mock('electron', () => ({ Menu: { buildFromTemplate } }))

describe('native image context menu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    buildFromTemplate.mockReturnValue({ popup })
  })

  function setup(language: Language = 'en') {
    const contents = { on: vi.fn(), isDestroyed: vi.fn(() => false), copyImageAt: vi.fn() }
    const window = {} as BrowserWindow
    configureImageContextMenu(contents as unknown as WebContents, window, () => language)
    const open = (params: Partial<ContextMenuParams>) => contents.on.mock.calls[0]![1]({}, params)
    return { contents, window, open }
  }

  it('copies the clicked image from its own contents through a native menu', () => {
    const { contents, window, open } = setup()
    open({ mediaType: 'image', hasImageContents: true, x: 42, y: 73 })
    expect(popup).toHaveBeenCalledWith({ window })
    expect(contents.copyImageAt).not.toHaveBeenCalled()
    const item = buildFromTemplate.mock.calls[0]![0][0]
    expect(item.label).toBe('Copy Image')
    item.click()
    expect(contents.copyImageAt).toHaveBeenCalledWith(42, 73)
  })

  it('labels the menu in the language it is opened in', () => {
    let language: Language = 'en'
    const contents = { on: vi.fn(), isDestroyed: vi.fn(() => false), copyImageAt: vi.fn() }
    configureImageContextMenu(
      contents as unknown as WebContents,
      {} as BrowserWindow,
      () => language,
    )
    const open = (params: Partial<ContextMenuParams>) => contents.on.mock.calls[0]![1]({}, params)
    open({ mediaType: 'image', hasImageContents: true })
    language = 'pt-BR'
    open({ mediaType: 'image', hasImageContents: true })
    open({ linkURL: 'https://example.com' })
    const labels = buildFromTemplate.mock.calls.map(([items]) =>
      (items as Array<{ label?: string }>).flatMap((item) => (item.label ? [item.label] : [])),
    )
    expect(labels).toEqual([['Copy Image'], ['Copiar imagem'], ['Abrir', 'Copiar link']])
  })

  it.each([
    { mediaType: 'image', hasImageContents: false },
    { mediaType: 'none', hasImageContents: false },
    { mediaType: 'video', hasImageContents: true },
  ] as const)('leaves other targets alone: %j', (params) => {
    setup().open(params)
    expect(buildFromTemplate).not.toHaveBeenCalled()
  })

  it('ignores a menu action after the preview closes', () => {
    const { contents, open } = setup()
    open({ mediaType: 'image', hasImageContents: true, x: 42, y: 73 })
    contents.isDestroyed.mockReturnValue(true)
    buildFromTemplate.mock.calls[0]![0][0].click()
    expect(contents.copyImageAt).not.toHaveBeenCalled()
  })
})
