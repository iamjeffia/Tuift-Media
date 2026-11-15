import { clipboard, Menu, shell, type BrowserWindow, type WebContents } from 'electron'
import { translate, type Language } from './i18n.js'

/** `language` is read when the menu opens, so a language change applies at once. */
export function configureImageContextMenu(
  contents: WebContents,
  window: BrowserWindow,
  language: () => Language,
): void {
  contents.on('context-menu', (_event, params) => {
    const t = (key: 'contextMenu.open' | 'contextMenu.copyLink' | 'contextMenu.copyImage') =>
      translate(language(), key)
    if (params.linkURL) {
      const url = params.linkURL
      const canOpen = /^https?:\/\//i.test(url)
      Menu.buildFromTemplate([
        {
          label: t('contextMenu.open'),
          enabled: canOpen,
          click: () => {
            if (canOpen) void shell.openExternal(url).catch(() => {})
          },
        },
        { type: 'separator' },
        { label: t('contextMenu.copyLink'), click: () => clipboard.writeText(url) },
      ]).popup({ window })
      return
    }

    if (params.mediaType !== 'image' || !params.hasImageContents) return

    Menu.buildFromTemplate([
      {
        label: t('contextMenu.copyImage'),
        click: () => {
          if (!contents.isDestroyed()) contents.copyImageAt(params.x, params.y)
        },
      },
    ]).popup({ window })
  })
}
