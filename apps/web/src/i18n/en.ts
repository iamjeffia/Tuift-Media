import { soundsEn } from './areas/sounds.en.js'
import { settingsEn } from './areas/settings.en.js'
import { clubeEn } from './areas/clube.en.js'
import { sidebarEn } from './areas/sidebar.en.js'
import { onboardingEn } from './areas/onboarding.en.js'
import { workspaceEn } from './areas/workspace.en.js'
import { dialogsEn } from './areas/dialogs.en.js'
import { chatEn } from './areas/chat.en.js'
import { startupEn } from './areas/startup.en.js'
import { designEn } from './areas/design.en.js'

/**
 * The English catalog is the source of truth for message keys: `MessageKey`
 * is derived from it, and `pt-BR.ts` must provide exactly the same keys.
 * See README.md in this folder for the naming convention.
 */
export const en = {
  // Settings shell and navigation
  'settings.title': 'Settings',
  'settings.back': 'Back to app',
  'settings.nav.label': 'Settings categories',
  'settings.nav.general': 'General',
  'settings.nav.profile': 'Profile',
  'settings.nav.appearance': 'Appearance',
  'settings.nav.keybinds': 'Keybinds',
  'settings.nav.providers': 'Providers',
  'settings.nav.models': 'Models',
  'settings.nav.mcp': 'MCP servers',
  'settings.nav.skills': 'Skills',
  'settings.nav.usage': 'Usage',
  'settings.nav.phone': 'Phone',
  'settings.nav.import': 'Import chats',
  'settings.nav.data': 'Data & privacy',
  'settings.nav.debug': 'Debug',
  'settings.nav.about': 'About',

  // Settings search
  'settings.search.label': 'Search settings',
  'settings.search.placeholder': 'Search settings…',
  'settings.search.resultsLabel': 'Settings results',
  'settings.search.empty': 'No matching settings',
  'settings.search.count_one': '{count} result',
  'settings.search.count_other': '{count} results',

  // Shared units
  'common.days_one': '{count} day',
  'common.days_other': '{count} days',

  // Settings > General
  'general.title': 'General',
  'general.language.name': 'Language',
  'general.language.note':
    'The language of the TUIFT Code interface. Chats and what the AI writes are not translated.',
  'general.sidebar.name': 'Sidebar',
  'general.sidebar.note':
    'Classic files chats under their projects. Inbox lines them up by last activity.',
  'general.sidebar.classic': 'Classic',
  'general.sidebar.inbox': 'Inbox',
  'general.terminal.name': 'Terminal',
  'general.terminal.note': 'Where the Toggle terminal shortcut opens a terminal.',
  'general.terminal.bottom': 'Bottom',
  'general.terminal.right': 'Right',
  'general.modelPicker.name': 'Model picker',
  'general.modelPicker.note':
    'Rail picks a provider first, then its models. List shows every model in one scroll.',
  'general.modelPicker.list': 'List',
  'general.modelPicker.rail': 'Rail',
  'general.notifications.name': 'Notifications',
  'general.notifications.note':
    'While TUIFT Code is in the background, for approvals, questions and failures, or also when a chat finishes.',
  'general.notifications.off': 'Off',
  'general.notifications.needsYou': 'Needs me',
  'general.notifications.alsoFinished': 'Also finished',
  'general.settle.name': 'Settle idle chats',
  'general.settle.never': 'never',
  'general.settle.neverSpoken': 'Never',
  'general.settle.after': 'after {days}',
  // Area catalogs: each wave-2 front owns one file in ./areas
  ...settingsEn,
  ...sidebarEn,
  ...onboardingEn,
  ...workspaceEn,
  ...dialogsEn,
  ...chatEn,
  ...startupEn,
  ...designEn,
  ...clubeEn,
  ...soundsEn,
} as const

export type MessageKey = keyof typeof en

/** Keys written as `base_one` / `base_other` (and friends), addressed by their `base`. */
export type PluralKey = {
  [Key in MessageKey]: Key extends `${infer Base}_other` ? Base : never
}[MessageKey]
