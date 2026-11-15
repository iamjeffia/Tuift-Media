import type { MessageKey } from '../../i18n/index.js'
import { KEYBINDING_DEFINITIONS } from '../../shortcuts.js'
import type { SettingsSection } from '../Settings.js'

export type SearchContext = {
  phone: boolean
  debug: boolean
  desktop: boolean
  notifications: boolean
  haptics: boolean
  fontSmoothing: boolean
  backgroundMode: string
  backgroundImage: boolean
  material: boolean
  backgroundEffort: boolean
  backgroundSpeed: boolean
}
export type SettingsSearchEntry = {
  id: string
  section: SettingsSection
  title: string
  description?: string
  /** The catalog entries that translate `title` and `description` (the text here stays English). */
  titleKey?: MessageKey
  descriptionKey?: MessageKey
  keywords?: string
  /** A whole category: choosing it opens the page, with no row to jump to. */
  page?: boolean
  visible?: (context: SearchContext) => boolean
}

/** The categories themselves, so that searching for one never reports no matches. */
export const SETTINGS_PAGES: SettingsSearchEntry[] = [
  {
    id: 'page:workflows',
    section: 'workflows',
    title: 'General',
    titleKey: 'settings.nav.general',
    page: true,
  },
  {
    id: 'page:profile',
    section: 'profile',
    title: 'Profile',
    titleKey: 'settings.nav.profile',
    page: true,
  },
  {
    id: 'page:appearance',
    section: 'appearance',
    title: 'Appearance',
    titleKey: 'settings.nav.appearance',
    page: true,
  },
  {
    id: 'page:keybinds',
    section: 'keybinds',
    title: 'Keybinds',
    titleKey: 'settings.nav.keybinds',
    page: true,
  },
  {
    id: 'page:providers',
    section: 'providers',
    title: 'Providers',
    titleKey: 'settings.nav.providers',
    page: true,
  },
  {
    id: 'page:models',
    section: 'models',
    title: 'Models',
    titleKey: 'settings.nav.models',
    page: true,
  },
  {
    id: 'page:mcp',
    section: 'mcp',
    title: 'MCP servers',
    titleKey: 'settings.nav.mcp',
    page: true,
  },
  {
    id: 'page:skills',
    section: 'skills',
    title: 'Skills',
    titleKey: 'settings.nav.skills',
    page: true,
  },
  {
    id: 'page:usage',
    section: 'usage',
    title: 'Usage',
    titleKey: 'settings.nav.usage',
    page: true,
  },
  {
    id: 'page:phone',
    section: 'phone',
    title: 'Phone',
    titleKey: 'settings.nav.phone',
    page: true,
    visible: (c) => c.phone,
  },
  {
    id: 'page:import',
    section: 'import',
    title: 'Import chats',
    titleKey: 'settings.nav.import',
    keywords: 'threads history migrate move t3 code claude codex grok opencode',
    page: true,
  },
  {
    id: 'page:data',
    section: 'data',
    title: 'Data & privacy',
    titleKey: 'settings.nav.data',
    page: true,
  },
  {
    id: 'page:debug',
    section: 'debug',
    title: 'Debug',
    titleKey: 'settings.nav.debug',
    page: true,
    visible: (c) => c.debug,
  },
  {
    id: 'page:about',
    section: 'about',
    title: 'About',
    titleKey: 'settings.nav.about',
    page: true,
  },
]

export const STATIC_SETTINGS: SettingsSearchEntry[] = [
  {
    id: 'general-language',
    section: 'workflows',
    title: 'Language',
    description:
      'The language of the TUIFT Code interface. Chats and what the AI writes are not translated.',
    titleKey: 'general.language.name',
    descriptionKey: 'general.language.note',
    keywords: 'idioma lingua português portuguese english inglês translation tradução locale',
  },
  {
    id: 'general-sidebar',
    section: 'workflows',
    title: 'Sidebar',
    titleKey: 'general.sidebar.name',
    descriptionKey: 'general.sidebar.note',
    description: 'Classic files chats under their projects. Inbox lines them up by last activity.',
    keywords: 'inbox settle caixa de entrada',
  },
  {
    id: 'general-terminal',
    section: 'workflows',
    title: 'Terminal',
    titleKey: 'general.terminal.name',
    descriptionKey: 'general.terminal.note',
    description: 'Where the Toggle terminal shortcut opens a terminal.',
  },
  {
    id: 'general-model-picker',
    section: 'workflows',
    title: 'Model picker',
    titleKey: 'general.modelPicker.name',
    descriptionKey: 'general.modelPicker.note',
    description:
      'Rail picks a provider first, then its models. List shows every model in one scroll.',
  },
  {
    id: 'general-notifications',
    section: 'workflows',
    title: 'Notifications',
    titleKey: 'general.notifications.name',
    descriptionKey: 'general.notifications.note',
    description:
      'While TUIFT Code is in the background, for approvals, questions and failures, or also when a chat finishes.',
    visible: (c) => c.notifications,
  },
  {
    id: 'profile-identity',
    section: 'profile',
    title: 'Profile identity',
    titleKey: 'settings.search.entry.profileIdentity.title',
    keywords: 'name avatar photo picture nome foto imagem',
  },
  {
    id: 'theme',
    section: 'appearance',
    title: 'Theme',
    titleKey: 'settings.search.entry.theme.title',
    keywords: 'dark mode light system escuro claro sistema',
  },
  {
    id: 'font-smoothing',
    section: 'appearance',
    title: 'Font smoothing',
    titleKey: 'settings.search.entry.fontSmoothing.title',
    visible: (c) => c.fontSmoothing,
  },
  {
    id: 'haptics',
    section: 'appearance',
    title: 'Trackpad haptics',
    titleKey: 'settings.search.entry.haptics.title',
    descriptionKey: 'settings.search.entry.haptics.description',
    description:
      'Feel responsive detents while resizing, choosing effort, and placing dragged chats.',
    visible: (c) => c.haptics,
  },
  {
    id: 'window-style',
    section: 'appearance',
    title: 'Window background style',
    titleKey: 'settings.search.entry.windowStyle.title',
    keywords: 'transparent image effect transparente imagem efeito',
  },
  {
    id: 'window-material',
    section: 'appearance',
    title: 'Window material',
    titleKey: 'settings.search.entry.windowMaterial.title',
    visible: (c) => c.backgroundMode === 'transparent' && c.material,
  },
  {
    id: 'window-image',
    section: 'appearance',
    title: 'Window background image',
    titleKey: 'settings.search.entry.windowImage.title',
    visible: (c) => c.backgroundMode === 'image',
  },
  {
    id: 'window-effect',
    section: 'appearance',
    title: 'Window background effect',
    titleKey: 'settings.search.entry.windowEffect.title',
    visible: (c) => c.backgroundMode === 'effect',
  },
  {
    id: 'window-dim',
    section: 'appearance',
    title: 'Window background dim',
    titleKey: 'settings.search.entry.windowDim.title',
    visible: (c) =>
      c.backgroundMode === 'effect' || (c.backgroundMode === 'image' && c.backgroundImage),
  },
  {
    id: 'window-blur',
    section: 'appearance',
    title: 'Window background blur',
    titleKey: 'settings.search.entry.windowBlur.title',
    visible: (c) => c.backgroundMode === 'image' && c.backgroundImage,
  },
  {
    id: 'model-subagents',
    section: 'models',
    title: 'Sub-agents on other providers',
    titleKey: 'settings.search.entry.modelSubagents.title',
    descriptionKey: 'settings.search.entry.modelSubagents.description',
    description:
      "Let agents use your other subscriptions when another model fits a task better. When off, sub-agents run on the chat's provider unless your message asks for another one.",
  },
  {
    id: 'background-model',
    section: 'models',
    title: 'Background work model',
    titleKey: 'settings.search.entry.backgroundModel.title',
    descriptionKey: 'settings.search.entry.backgroundModel.description',
    description: 'Used for session titles, commit-message drafts, and other short writing.',
  },
  {
    id: 'background-effort',
    section: 'models',
    title: 'Background reasoning effort',
    titleKey: 'settings.search.entry.backgroundEffort.title',
    descriptionKey: 'settings.search.entry.backgroundEffort.description',
    description: 'Choose the effort used for background writing.',
    visible: (c) => c.backgroundEffort,
  },
  {
    id: 'background-speed',
    section: 'models',
    title: 'Background speed',
    titleKey: 'settings.search.entry.backgroundSpeed.title',
    descriptionKey: 'settings.search.entry.backgroundSpeed.description',
    description: 'Choose the speed used for background writing.',
    visible: (c) => c.backgroundSpeed,
  },
  {
    id: 'phone-access',
    section: 'phone',
    title: 'Phone access',
    titleKey: 'settings.search.entry.phoneAccess.title',
    descriptionKey: 'settings.search.entry.phoneAccess.description',
    description:
      "Phones reach this computer over your Wi-Fi or Tailscale. Every link is end-to-end encrypted and pinned to this computer's key; nothing passes through a server.",
    keywords: 'pair mobile celular parear telefone',
    visible: (c) => c.phone,
  },
  {
    id: 'diagnostics',
    section: 'data',
    title: 'Local diagnostics',
    titleKey: 'settings.search.entry.diagnostics.title',
    descriptionKey: 'settings.search.entry.diagnostics.description',
    description:
      'Off by default. Stores redacted app error text only on this device. Nothing is uploaded. New entries stop immediately when turned off.',
    visible: (c) => c.desktop,
  },
  {
    id: 'reset-preferences',
    section: 'data',
    title: 'Reset app preferences',
    titleKey: 'settings.search.entry.resetPreferences.title',
    descriptionKey: 'settings.search.entry.resetPreferences.description',
    description: 'Clears appearance, layout and model choices.',
  },
  {
    id: 'debug-onboarding',
    section: 'debug',
    title: 'Force onboarding',
    titleKey: 'settings.search.entry.debugOnboarding.title',
    visible: (c) => c.debug,
  },
  {
    id: 'debug-app-update',
    section: 'debug',
    title: 'Simulate app update',
    titleKey: 'settings.search.entry.debugAppUpdate.title',
    descriptionKey: 'settings.search.entry.debugAppUpdate.description',
    description:
      'Plays a fake release through the sidebar button and About. Nothing is downloaded; restarting reloads the window.',
    visible: (c) => c.debug,
  },
  {
    id: 'debug-provider-update',
    section: 'debug',
    title: 'Simulate provider updates',
    titleKey: 'settings.search.entry.debugProviderUpdate.title',
    descriptionKey: 'settings.search.entry.debugProviderUpdate.description',
    description:
      'Pops the update notice with made-up releases one step past what is installed. Update plays the whole run without touching a CLI; dismissing the notice ends it.',
    visible: (c) => c.debug,
  },
  {
    id: 'debug-usage',
    section: 'debug',
    title: 'Usage history index',
    titleKey: 'settings.search.entry.debugUsage.title',
    descriptionKey: 'settings.search.entry.debugUsage.description',
    description:
      'Clears the generated cache and reparses every local provider history. Sessions and Harness data are not deleted.',
    visible: (c) => c.debug,
  },
  {
    id: 'debug-avatar',
    section: 'debug',
    title: 'Avatar generator',
    titleKey: 'settings.search.entry.debugAvatar.title',
    descriptionKey: 'settings.search.entry.debugAvatar.description',
    description:
      'The picture a profile gets from its name when no photo is uploaded. Same name, same picture, on every provider.',
    visible: (c) => c.debug,
  },
  {
    id: 'about-version',
    section: 'about',
    title: 'TUIFT Code version',
    titleKey: 'settings.search.entry.aboutVersion.title',
  },
  {
    id: 'about-updates',
    section: 'about',
    title: 'Updates',
    titleKey: 'settings.search.entry.aboutUpdates.title',
  },
  {
    id: 'about-source',
    section: 'about',
    title: 'Source',
    titleKey: 'settings.search.entry.aboutSource.title',
  },
]

const APPEARANCE_MODES = [
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
] as const

/** The title key of each appearance setting per mode: `appearanceLightAccent` and so on. */
const APPEARANCE_TITLE_KEYS = {
  light: {
    accent: 'settings.search.entry.appearanceLightAccent.title',
    background: 'settings.search.entry.appearanceLightBackground.title',
    font: 'settings.search.entry.appearanceLightFont.title',
    translucency: 'settings.search.entry.appearanceLightTranslucency.title',
  },
  dark: {
    accent: 'settings.search.entry.appearanceDarkAccent.title',
    background: 'settings.search.entry.appearanceDarkBackground.title',
    font: 'settings.search.entry.appearanceDarkFont.title',
    translucency: 'settings.search.entry.appearanceDarkTranslucency.title',
  },
} as const satisfies Record<(typeof APPEARANCE_MODES)[number]['mode'], Record<string, MessageKey>>

export const SETTINGS_SEARCH_ENTRIES: SettingsSearchEntry[] = [
  ...SETTINGS_PAGES,
  ...STATIC_SETTINGS,
  ...APPEARANCE_MODES.flatMap(({ mode, label }) => [
    {
      id: `appearance:${mode}:accent`,
      section: 'appearance' as const,
      title: `${label} accent`,
      titleKey: APPEARANCE_TITLE_KEYS[mode].accent,
      keywords: 'color colour cor destaque',
    },
    {
      id: `appearance:${mode}:background`,
      section: 'appearance' as const,
      title: `${label} background`,
      titleKey: APPEARANCE_TITLE_KEYS[mode].background,
      keywords: 'color colour cor fundo',
    },
    {
      id: `appearance:${mode}:interface-font`,
      section: 'appearance' as const,
      title: `${label} interface font`,
      titleKey: APPEARANCE_TITLE_KEYS[mode].font,
      keywords: 'typography tipografia',
    },
    {
      id: `appearance:${mode}:sidebar-translucency`,
      section: 'appearance' as const,
      title: `${label} sidebar translucency`,
      titleKey: APPEARANCE_TITLE_KEYS[mode].translucency,
      keywords: 'glass opacity vidro opacidade',
    },
  ]),
  ...KEYBINDING_DEFINITIONS.map((definition) => ({
    id: `keybind:${definition.id}`,
    section: 'keybinds' as const,
    title: definition.label,
    description: definition.description,
    titleKey: definition.labelKey,
    descriptionKey: definition.descriptionKey,
    keywords: 'shortcut keyboard keybind atalho teclado',
  })),
]

export function searchSettings(
  query: string,
  entries: readonly SettingsSearchEntry[],
): SettingsSearchEntry[] {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  return entries
    .map((entry, index) => {
      const fields = [entry.title, entry.keywords ?? '', entry.description ?? ''].map((value) =>
        value.toLocaleLowerCase(),
      )
      const scores = words.map((word) => fields.findIndex((field) => field.includes(word)))
      return {
        entry,
        index,
        matched: !scores.includes(-1),
        titleMatches: scores.filter((score) => score === 0).length,
        keywordMatches: scores.filter((score) => score === 1).length,
      }
    })
    .filter((result) => result.matched)
    .sort(
      (a, b) =>
        b.titleMatches - a.titleMatches || b.keywordMatches - a.keywordMatches || a.index - b.index,
    )
    .map((result) => result.entry)
}

/** The entry as it reads in the current language; entries without keys stay as written. */
export function localizeSettingsEntry(
  entry: SettingsSearchEntry,
  t: (key: MessageKey) => string,
): SettingsSearchEntry {
  if (!entry.titleKey && !entry.descriptionKey) return entry
  return {
    ...entry,
    title: entry.titleKey ? t(entry.titleKey) : entry.title,
    ...(entry.descriptionKey ? { description: t(entry.descriptionKey) } : {}),
  }
}
