import type { MenuItemConstructorOptions } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { createApplicationMenuTemplate, electronAccelerator } from './app-menu.js'
import type { Language } from './i18n.js'
import {
  NATIVE_MENU_ACTIONS,
  parseNativeMenuShortcuts,
  type NativeMenuAction,
} from './menu-contract.js'

describe('application menu', () => {
  it.each(['macOS', 'Windows', 'Linux'])('exposes every renderer action on %s', (platform) => {
    const onAction = vi.fn()
    const template = createApplicationMenuTemplate({
      appName: 'TUIFT Code',
      isMacOS: platform === 'macOS',
      isWindows: platform === 'Windows',
      language: 'en',
      isDevelopment: false,
      shortcuts: {},
      onAction,
      onZoom: vi.fn(),
      onOpenDiagnostics: vi.fn(),
    })

    for (const item of menuItems(template))
      item.click?.(item as never, undefined, { triggeredByAccelerator: false } as never)

    expect(new Set(onAction.mock.calls.map(([action]) => action))).toEqual(
      new Set<NativeMenuAction>(NATIVE_MENU_ACTIONS),
    )
    expect(new Set(onAction.mock.calls.map(([, source]) => source))).toEqual(new Set(['menu']))
    const settings = findLabel(template, 'Settings…')!
    settings.click?.(settings as never, undefined, { triggeredByAccelerator: true } as never)
    expect(onAction).toHaveBeenLastCalledWith('settings', 'accelerator')
    expect(template.map((item) => item.label ?? item.role)).toEqual([
      ...(platform === 'macOS' ? ['TUIFT Code'] : []),
      'File',
      'Edit',
      'View',
      'Chat',
      'Workspace',
      'Window',
      'Help',
    ])
    expect(findLabel(template, 'Delete Current Chat…')).toBeDefined()
    expect(findLabel(template, 'Archive Current Chat…')).toBeUndefined()
  })

  it('uses current custom shortcuts and leaves unassigned actions free', () => {
    const template = createApplicationMenuTemplate({
      appName: 'TUIFT Code',
      isMacOS: false,
      isWindows: true,
      language: 'en',
      isDevelopment: false,
      shortcuts: {
        toggleSidebar: { key: 's', primary: true, alt: true },
        toggleTerminal: null,
      },
      onAction: vi.fn(),
      onZoom: vi.fn(),
      onOpenDiagnostics: vi.fn(),
    })

    expect(findLabel(template, 'Toggle Sidebar')?.accelerator).toBe('CommandOrControl+Alt+S')
    expect(findLabel(template, 'Toggle Terminal')?.accelerator).toBeUndefined()
    expect(findLabel(template, 'Settings…')).toBeDefined()
    expect(findRole(template, 'quit')).toBeDefined()
  })

  it('converts supported browser shortcut keys to Electron accelerators', () => {
    expect(electronAccelerator({ key: 'arrowdown', primary: true, shift: true })).toBe(
      'CommandOrControl+Shift+Down',
    )
    expect(electronAccelerator({ key: 'f8' })).toBe('F8')
    expect(electronAccelerator({ key: 'not-a-key', primary: true })).toBeUndefined()
  })

  it('rejects malformed or unknown shortcut updates from the renderer', () => {
    expect(parseNativeMenuShortcuts({ toggleSidebar: { key: 'b', primary: true } })).toEqual({
      toggleSidebar: { key: 'b', primary: true },
    })
    expect(parseNativeMenuShortcuts({ launchAnything: { key: 'x' } })).toBeUndefined()
    expect(parseNativeMenuShortcuts({ toggleSidebar: { key: 'b', command: true } })).toBeUndefined()
    expect(parseNativeMenuShortcuts(new Date())).toBeUndefined()
    expect(parseNativeMenuShortcuts(new Map())).toBeUndefined()
  })
})

describe('application menu language', () => {
  const build = (language: Language, platform: 'macOS' | 'Windows' | 'Linux') =>
    createApplicationMenuTemplate({
      appName: 'TUIFT Code',
      isMacOS: platform === 'macOS',
      isWindows: platform === 'Windows',
      language,
      isDevelopment: false,
      shortcuts: { toggleSidebar: { key: 'b', primary: true } },
      onAction: vi.fn(),
      onZoom: vi.fn(),
      onOpenDiagnostics: vi.fn(),
    })

  it.each(['macOS', 'Windows', 'Linux'] as const)(
    'keeps the same roles, accelerators and separators in both languages on %s',
    (platform) => {
      expect(structure(build('pt-BR', platform))).toEqual(structure(build('en', platform)))
    },
  )

  it('translates every label, including the role items the OS would label itself', () => {
    const template = build('pt-BR', 'Windows')
    expect(template.map((item) => item.label)).toEqual([
      'Arquivo',
      'Editar',
      'Exibir',
      'Chat',
      'Workspace',
      'Janela',
      'Ajuda',
    ])
    expect(findLabel(template, 'Novo chat')).toBeDefined()
    expect(findLabel(template, 'Excluir chat atual…')).toBeDefined()
    expect(findLabel(template, 'Tamanho real')?.accelerator).toBe('CommandOrControl+0')
    expect(findLabel(template, 'Alternar barra lateral')?.accelerator).toBe('CommandOrControl+B')
    expect(findRole(template, 'copy')?.label).toBe('Copiar')
    expect(findRole(template, 'quit')?.label).toBe('Sair')
    for (const item of menuItems(template)) {
      if (item.type !== 'separator') expect(item.label).toBeTruthy()
    }
  })

  it('names the application on macOS and uses each platform quit word in English', () => {
    expect(findRole(build('pt-BR', 'macOS'), 'about')?.label).toBe('Sobre o TUIFT Code')
    expect(findRole(build('en', 'macOS'), 'quit')?.label).toBe('Quit TUIFT Code')
    expect(findRole(build('en', 'Windows'), 'quit')?.label).toBe('Exit')
    expect(findRole(build('en', 'Linux'), 'quit')?.label).toBe('Quit')
  })
})

/** The menu without its words: roles, accelerators, separators and nesting. */
function structure(items: MenuItemConstructorOptions[]): unknown[] {
  return items.map((item) => ({
    role: item.role,
    type: item.type,
    accelerator: item.accelerator,
    submenu: Array.isArray(item.submenu) ? structure(item.submenu) : undefined,
  }))
}

function menuItems(items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return items.flatMap((item) => [
    item,
    ...(Array.isArray(item.submenu) ? menuItems(item.submenu) : []),
  ])
}

function findLabel(
  items: MenuItemConstructorOptions[],
  label: string,
): MenuItemConstructorOptions | undefined {
  return menuItems(items).find((item) => item.label === label)
}

function findRole(
  items: MenuItemConstructorOptions[],
  role: MenuItemConstructorOptions['role'],
): MenuItemConstructorOptions | undefined {
  return menuItems(items).find((item) => item.role === role)
}
