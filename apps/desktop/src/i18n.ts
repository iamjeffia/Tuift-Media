import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * The text the main process shows itself: native menus, the tray, the file
 * pickers, dialogs and OS notifications. A small mirror of the web module in
 * apps/web/src/i18n (the main process cannot import it), with the same default
 * and the same fallback: a key missing from a language falls back to English,
 * then to the key. The renderer owns the choice (Settings > General > Language,
 * `harness.language` in its localStorage) and tells the main process over the
 * bridge; the main process keeps the last one in a small file so the first
 * menu of the next launch is already right.
 */

export type Language = 'pt-BR' | 'en'
export type MessageVars = Record<string, string | number>

export const DEFAULT_LANGUAGE: Language = 'pt-BR'

export function isLanguage(value: unknown): value is Language {
  return value === 'pt-BR' || value === 'en'
}

/** Validates a renderer-supplied language; throws on anything else. */
export function parseLanguage(value: unknown): Language {
  if (!isLanguage(value)) throw new Error('Invalid language')
  return value
}

export const en = {
  'menu.about': 'About {appName}',
  'menu.hide': 'Hide {appName}',
  'menu.hideOthers': 'Hide Others',
  'menu.showAll': 'Show All',
  'menu.services': 'Services',
  'menu.quitApp': 'Quit {appName}',
  'menu.quit': 'Quit',
  'menu.exit': 'Exit',
  'menu.settings': 'Settings…',
  'menu.keyboardShortcuts': 'Keyboard Shortcuts…',

  'menu.file': 'File',
  'menu.newChat': 'New Chat',
  'menu.addProject': 'Add Project…',
  'menu.switchProject': 'Switch Project…',
  'menu.openPullRequests': 'Open Pull Requests',
  'menu.close': 'Close',

  'menu.edit': 'Edit',
  'menu.undo': 'Undo',
  'menu.redo': 'Redo',
  'menu.cut': 'Cut',
  'menu.copy': 'Copy',
  'menu.paste': 'Paste',
  'menu.pasteAndMatchStyle': 'Paste and Match Style',
  'menu.delete': 'Delete',
  'menu.selectAll': 'Select All',

  'menu.view': 'View',
  'menu.commandPalette': 'Command Palette…',
  'menu.searchChats': 'Search Chats…',
  'menu.toggleSidebar': 'Toggle Sidebar',
  'menu.toggleTerminal': 'Toggle Terminal',
  'menu.toggleWorkspaceTools': 'Toggle Workspace Tools',
  'menu.actualSize': 'Actual Size',
  'menu.zoomIn': 'Zoom In',
  'menu.zoomOut': 'Zoom Out',
  'menu.toggleFullScreen': 'Toggle Full Screen',

  'menu.chat': 'Chat',
  'menu.focusComposer': 'Focus Composer',
  'menu.stopResponse': 'Stop Response',
  'menu.previousChat': 'Previous Chat',
  'menu.nextChat': 'Next Chat',
  'menu.pinOrUnpinChat': 'Pin or Unpin Chat',
  'menu.deleteCurrentChat': 'Delete Current Chat…',
  'menu.openRestorePoints': 'Open Restore Points…',

  'menu.workspace': 'Workspace',
  'menu.toggleFastMode': 'Toggle Fast Mode',
  'menu.toggleDesignMode': 'Toggle Design Mode',
  'menu.toggleIsolatedCheckout': 'Toggle Isolated Checkout',

  'menu.window': 'Window',
  'menu.minimize': 'Minimize',
  'menu.zoom': 'Zoom',
  'menu.bringAllToFront': 'Bring All to Front',

  'menu.help': 'Help',
  'menu.openDiagnosticsFolder': 'Open Diagnostics Folder',

  'contextMenu.open': 'Open',
  'contextMenu.copyLink': 'Copy Link',
  'contextMenu.copyImage': 'Copy Image',

  'tray.open': 'Open {appName}',
  'tray.quit': 'Quit {appName}',

  'notice.approval': 'Needs your approval',
  'notice.input': 'Has a question',
  'notice.failed': 'Failed',
  'notice.finished': 'Finished',
  'badge.chatsNeedYou_one': '{count} chat needs you',
  'badge.chatsNeedYou_other': '{count} chats need you',

  // Desk lifecycle: what the page says after the window recovered on its own.
  'lifecycle.chatNotReopenedOom': 'The chat was not reopened because the window ran out of memory.',

  'dialog.serverCrashed.message': 'The core server keeps crashing.',
  'dialog.serverCrashed.detail':
    'Restart the server to try again. If this keeps happening, reinstall the app.',
  'dialog.serverCrashed.restart': 'Restart server',
  'dialog.windowCrashed.message': 'The window stopped unexpectedly.',
  'dialog.windowCrashed.detail':
    'Your core server is still running. Reload the window to reconnect.',
  'dialog.windowCrashed.reload': 'Reload',
  'dialog.quitRunning.message_one': '{count} chat is still working.',
  'dialog.quitRunning.message_other': '{count} chats are still working.',
  'dialog.quitRunning.detail':
    'Quitting stops them where they are. You can continue them when you open the app again.',
  'dialog.quitRunning.quit': 'Quit and stop',
  'dialog.quitRunning.keep': 'Keep working',
  'dialog.notNow': 'Not now',
  'dialog.pickFolder.title': 'Choose a project folder',
  'dialog.pickSkillFolder.title': 'Choose an Agent Skill folder',
  'dialog.pickFiles.title': 'Attach files',
  'dialog.saveDeliveredFile.title': 'Save file',
} as const

export type MessageKey = keyof typeof en
export type PluralKey = {
  [K in MessageKey]: K extends `${infer Base}_one` ? Base : never
}[MessageKey]

/** Typed to the same keys as English: a missing or extra key does not build. */
export const ptBR = {
  // Glossary (same words as apps/web/src/i18n): chat, projeto, workspace, Configurações.
  // "pull request" and "Design" stay as they are; "Composer" is the message field.
  'menu.about': 'Sobre o {appName}',
  'menu.hide': 'Ocultar {appName}',
  'menu.hideOthers': 'Ocultar outros',
  'menu.showAll': 'Mostrar tudo',
  'menu.services': 'Serviços',
  'menu.quitApp': 'Encerrar {appName}',
  'menu.quit': 'Sair',
  'menu.exit': 'Sair',
  'menu.settings': 'Configurações…',
  'menu.keyboardShortcuts': 'Atalhos de teclado…',

  'menu.file': 'Arquivo',
  'menu.newChat': 'Novo chat',
  'menu.addProject': 'Adicionar projeto…',
  'menu.switchProject': 'Trocar de projeto…',
  'menu.openPullRequests': 'Abrir pull requests',
  'menu.close': 'Fechar',

  'menu.edit': 'Editar',
  'menu.undo': 'Desfazer',
  'menu.redo': 'Refazer',
  'menu.cut': 'Recortar',
  'menu.copy': 'Copiar',
  'menu.paste': 'Colar',
  'menu.pasteAndMatchStyle': 'Colar e corresponder ao estilo',
  'menu.delete': 'Excluir',
  'menu.selectAll': 'Selecionar tudo',

  'menu.view': 'Exibir',
  'menu.commandPalette': 'Paleta de comandos…',
  'menu.searchChats': 'Buscar chats…',
  'menu.toggleSidebar': 'Alternar barra lateral',
  'menu.toggleTerminal': 'Alternar terminal',
  'menu.toggleWorkspaceTools': 'Alternar ferramentas do workspace',
  'menu.actualSize': 'Tamanho real',
  'menu.zoomIn': 'Ampliar',
  'menu.zoomOut': 'Reduzir',
  'menu.toggleFullScreen': 'Alternar tela inteira',

  'menu.chat': 'Chat',
  'menu.focusComposer': 'Focar no campo de mensagem',
  'menu.stopResponse': 'Parar resposta',
  'menu.previousChat': 'Chat anterior',
  'menu.nextChat': 'Próximo chat',
  'menu.pinOrUnpinChat': 'Fixar ou desafixar chat',
  'menu.deleteCurrentChat': 'Excluir chat atual…',
  'menu.openRestorePoints': 'Abrir pontos de restauração…',

  'menu.workspace': 'Workspace',
  'menu.toggleFastMode': 'Alternar modo rápido',
  'menu.toggleDesignMode': 'Alternar modo Design',
  'menu.toggleIsolatedCheckout': 'Alternar checkout isolado',

  'menu.window': 'Janela',
  'menu.minimize': 'Minimizar',
  'menu.zoom': 'Zoom',
  'menu.bringAllToFront': 'Trazer tudo para a frente',

  'menu.help': 'Ajuda',
  'menu.openDiagnosticsFolder': 'Abrir pasta de diagnósticos',

  'contextMenu.open': 'Abrir',
  'contextMenu.copyLink': 'Copiar link',
  'contextMenu.copyImage': 'Copiar imagem',

  'tray.open': 'Abrir o {appName}',
  'tray.quit': 'Sair do {appName}',

  'notice.approval': 'Precisa da sua aprovação',
  'notice.input': 'Tem uma pergunta',
  'notice.failed': 'Falhou',
  'notice.finished': 'Concluído',
  'badge.chatsNeedYou_one': '{count} chat precisa de você',
  'badge.chatsNeedYou_other': '{count} chats precisam de você',

  'lifecycle.chatNotReopenedOom': 'Chat não reaberto: a janela ficou sem memória.',

  'dialog.serverCrashed.message': 'O servidor principal continua falhando.',
  'dialog.serverCrashed.detail':
    'Reinicie o servidor para tentar de novo. Se continuar acontecendo, reinstale o app.',
  'dialog.serverCrashed.restart': 'Reiniciar servidor',
  'dialog.windowCrashed.message': 'A janela parou de funcionar de repente.',
  'dialog.windowCrashed.detail':
    'Seu servidor principal continua em execução. Recarregue a janela para reconectar.',
  'dialog.windowCrashed.reload': 'Recarregar',
  'dialog.quitRunning.message_one': '{count} chat ainda está trabalhando.',
  'dialog.quitRunning.message_other': '{count} chats ainda estão trabalhando.',
  'dialog.quitRunning.detail':
    'Sair interrompe o trabalho onde está. Você pode continuar quando abrir o app de novo.',
  'dialog.quitRunning.quit': 'Sair e parar',
  'dialog.quitRunning.keep': 'Continuar trabalhando',
  'dialog.notNow': 'Agora não',
  'dialog.pickFolder.title': 'Escolher uma pasta de projeto',
  'dialog.pickSkillFolder.title': 'Escolher uma pasta de Agent Skill',
  'dialog.pickFiles.title': 'Anexar arquivos',
  'dialog.saveDeliveredFile.title': 'Salvar arquivo',
} as const satisfies Record<MessageKey, string>

type Catalog = Readonly<Record<string, string | undefined>>
type Catalogs = Readonly<Record<Language, Catalog>>

const CATALOGS = { en, 'pt-BR': ptBR } satisfies Catalogs

const interpolation = /\{(\w+)\}/g

/**
 * The message for `key` in `language`. A key missing from that catalog falls
 * back to English, and a key missing from both is returned as written.
 * `{name}` placeholders are filled from `vars`; one without a value is left as written.
 */
export function translate(
  language: Language,
  key: string,
  vars?: MessageVars,
  catalogs: Catalogs = CATALOGS,
): string {
  const message = catalogs[language][key] ?? catalogs.en[key] ?? key
  if (!vars) return message
  return message.replace(interpolation, (placeholder, name: string) =>
    name in vars ? String(vars[name]) : placeholder,
  )
}

const pluralRules = new Map<Language, Intl.PluralRules>()

/** The `base_one` / `base_other` message that fits `count`, with `{count}` filled in. */
export function translatePlural(
  language: Language,
  base: PluralKey,
  count: number,
  vars?: MessageVars,
  catalogs: Catalogs = CATALOGS,
): string {
  let rules = pluralRules.get(language)
  if (!rules) {
    rules = new Intl.PluralRules(language)
    pluralRules.set(language, rules)
  }
  const specific = `${base}_${rules.select(count)}`
  const key = catalogs[language][specific] !== undefined ? specific : `${base}_other`
  return translate(language, key, { ...vars, count }, catalogs)
}

/** The language the renderer last chose, so the next launch opens in it. */
export function loadLanguage(filePath: string): Language | undefined {
  try {
    const saved: unknown = JSON.parse(readFileSync(filePath, 'utf8'))
    const language =
      typeof saved === 'object' && saved !== null
        ? (saved as Record<string, unknown>)['language']
        : undefined
    return parseLanguage(language)
  } catch {
    return undefined
  }
}

export function saveLanguage(filePath: string, language: Language): void {
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  writeFileSync(filePath, `${JSON.stringify({ language })}\n`, { encoding: 'utf8', mode: 0o600 })
}
