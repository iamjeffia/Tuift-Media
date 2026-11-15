import type { MenuItemConstructorOptions } from 'electron'
import { translate, type Language, type MessageKey, type MessageVars } from './i18n.js'
import type {
  NativeMenuAction,
  NativeMenuActionSource,
  NativeMenuShortcut,
  NativeMenuShortcuts,
} from './menu-contract.js'

type AppMenuOptions = {
  appName: string
  isMacOS: boolean
  /** Windows names its quit item "Exit"; the other platforms say "Quit". */
  isWindows: boolean
  language: Language
  isDevelopment: boolean
  shortcuts: NativeMenuShortcuts
  onAction: (action: NativeMenuAction, source: NativeMenuActionSource) => void
  onZoom: (action: 'in' | 'out' | 'reset') => void
  onOpenDiagnostics: () => void
}

type MenuItem = MenuItemConstructorOptions

export function createApplicationMenuTemplate(options: AppMenuOptions): MenuItem[] {
  const t = (key: MessageKey, vars?: MessageVars): string => translate(options.language, key, vars)
  // A role keeps its behaviour and accelerator; the label is ours so it follows
  // the app language and not the operating system's.
  const role = (name: NonNullable<MenuItem['role']>, key: MessageKey): MenuItem => ({
    role: name,
    label: t(key, { appName: options.appName }),
  })
  const action = (key: MessageKey, id: NativeMenuAction): MenuItem => {
    const accelerator = electronAccelerator(options.shortcuts[id])
    return {
      label: t(key),
      ...(accelerator ? { accelerator } : {}),
      click: (_item, _window, event) =>
        options.onAction(id, event.triggeredByAccelerator ? 'accelerator' : 'menu'),
    }
  }
  const separator: MenuItem = { type: 'separator' }

  return [
    ...(options.isMacOS
      ? [
          {
            label: options.appName,
            submenu: [
              role('about', 'menu.about'),
              separator,
              action('menu.settings', 'settings'),
              action('menu.keyboardShortcuts', 'keybindings'),
              separator,
              role('services', 'menu.services'),
              separator,
              role('hide', 'menu.hide'),
              role('hideOthers', 'menu.hideOthers'),
              role('unhide', 'menu.showAll'),
              separator,
              role('quit', 'menu.quitApp'),
            ],
          } satisfies MenuItem,
        ]
      : []),
    {
      label: t('menu.file'),
      submenu: [
        action('menu.newChat', 'newChat'),
        action('menu.addProject', 'newProject'),
        action('menu.switchProject', 'switchProject'),
        action('menu.openPullRequests', 'openPullRequests'),
        separator,
        ...(options.isMacOS
          ? [role('close', 'menu.close')]
          : [
              action('menu.settings', 'settings'),
              separator,
              role('quit', options.isWindows ? 'menu.exit' : 'menu.quit'),
            ]),
      ],
    },
    {
      label: t('menu.edit'),
      submenu: [
        role('undo', 'menu.undo'),
        role('redo', 'menu.redo'),
        separator,
        role('cut', 'menu.cut'),
        role('copy', 'menu.copy'),
        role('paste', 'menu.paste'),
        ...(options.isMacOS ? [role('pasteAndMatchStyle', 'menu.pasteAndMatchStyle')] : []),
        role('delete', 'menu.delete'),
        separator,
        role('selectAll', 'menu.selectAll'),
      ],
    },
    {
      label: t('menu.view'),
      submenu: [
        action('menu.commandPalette', 'commandPalette'),
        action('menu.searchChats', 'searchSessions'),
        separator,
        action('menu.toggleSidebar', 'toggleSidebar'),
        action('menu.toggleTerminal', 'toggleTerminal'),
        action('menu.toggleWorkspaceTools', 'toggleWorkspace'),
        separator,
        {
          label: t('menu.actualSize'),
          accelerator: 'CommandOrControl+0',
          click: () => options.onZoom('reset'),
        },
        {
          label: t('menu.zoomIn'),
          accelerator: 'CommandOrControl+=',
          click: () => options.onZoom('in'),
        },
        {
          label: t('menu.zoomOut'),
          accelerator: 'CommandOrControl+-',
          click: () => options.onZoom('out'),
        },
        separator,
        role('togglefullscreen', 'menu.toggleFullScreen'),
      ],
    },
    {
      label: t('menu.chat'),
      submenu: [
        action('menu.focusComposer', 'focusComposer'),
        action('menu.stopResponse', 'interrupt'),
        separator,
        action('menu.previousChat', 'previousChat'),
        action('menu.nextChat', 'nextChat'),
        separator,
        action('menu.pinOrUnpinChat', 'toggleSessionPin'),
        action('menu.deleteCurrentChat', 'archiveSession'),
        action('menu.openRestorePoints', 'rollback'),
      ],
    },
    {
      label: t('menu.workspace'),
      submenu: [
        action('menu.toggleFastMode', 'toggleFastMode'),
        action('menu.toggleDesignMode', 'toggleDesignMode'),
        action('menu.toggleIsolatedCheckout', 'toggleIsolatedSession'),
      ],
    },
    {
      label: t('menu.window'),
      submenu: [
        role('minimize', 'menu.minimize'),
        role('zoom', 'menu.zoom'),
        ...(options.isMacOS
          ? [separator, role('front', 'menu.bringAllToFront')]
          : [role('close', 'menu.close')]),
      ],
    },
    {
      role: 'help',
      label: t('menu.help'),
      submenu: [
        ...(!options.isMacOS ? [action('menu.keyboardShortcuts', 'keybindings')] : []),
        {
          label: t('menu.openDiagnosticsFolder'),
          click: options.onOpenDiagnostics,
        },
        ...(options.isDevelopment
          ? [
              separator,
              { role: 'reload' } satisfies MenuItem,
              { role: 'toggleDevTools' } satisfies MenuItem,
            ]
          : []),
      ],
    },
  ]
}

export function electronAccelerator(
  shortcut: NativeMenuShortcut | null | undefined,
): string | undefined {
  if (!shortcut) return undefined
  const key = acceleratorKey(shortcut.key)
  if (!key) return undefined
  return [
    shortcut.primary ? 'CommandOrControl' : undefined,
    shortcut.alt ? 'Alt' : undefined,
    shortcut.shift ? 'Shift' : undefined,
    key,
  ]
    .filter(Boolean)
    .join('+')
}

function acceleratorKey(key: string): string | undefined {
  const normalized = key.trim().toLowerCase()
  if (normalized === 'arrowup') return 'Up'
  if (normalized === 'arrowdown') return 'Down'
  if (normalized === 'arrowleft') return 'Left'
  if (normalized === 'arrowright') return 'Right'
  if (normalized === 'space') return 'Space'
  if (normalized === 'escape') return 'Esc'
  if (normalized === 'delete') return 'Delete'
  if (normalized === 'backspace') return 'Backspace'
  if (normalized === 'enter') return 'Enter'
  if (normalized === 'tab') return 'Tab'
  if (/^f(?:[1-9]|1[0-9]|2[0-4])$/.test(normalized)) return normalized.toUpperCase()
  return normalized.length === 1 ? normalized.toUpperCase() : undefined
}
