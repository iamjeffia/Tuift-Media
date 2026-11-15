import type { TablerIcon } from '@tabler/icons-react'
import { t, type MessageKey } from '../i18n/index.js'

/**
 * `skill` and `mcp` become chips whose token is sent ahead of the prompt.
 * `command` is typed into the draft as `/name `, which the provider expands.
 */
type ComposerResourceKind = 'skill' | 'mcp' | 'command'

export type ComposerResource = {
  key: string
  kind: ComposerResourceKind
  id: string
  name: string
  description: string
  scope: string
  token: string
  available: boolean
  unavailableReason?: string | undefined
  /** Commands only: whether the provider calls it a skill, which picks its icon. */
  commandKind?: 'command' | 'skill' | undefined
  /** Commands only: other names typed after the slash that run the same command. */
  aliases?: readonly string[] | undefined
  /** Commands only: placeholder for the text the command takes after its name. */
  argumentHint?: string | undefined
  /** Commands only: Enter on the exactly typed name sends it instead of completing it. */
  runsAsTyped?: boolean | undefined
  /** TUIFT Code's own commands only: the icon their feature uses elsewhere. */
  icon?: TablerIcon | undefined
}

export type ComposerResourceMarker = '/' | '$' | '@'

export type ComposerResourceTrigger = {
  marker: ComposerResourceMarker
  query: string
  start: number
  end: number
}

export type ComposerResourcePickerHandle = {
  move: (direction: 1 | -1) => boolean
  /**
   * `selected` when the active row was taken, `run` when the draft already is
   * that command exactly and Enter should send it, `false` when there is
   * nothing to take.
   */
  selectActive: (key?: 'Enter' | 'Tab') => 'selected' | 'run' | false
}

export const COMPOSER_RESOURCE_LIST_ID = 'composer-resource-list'

/** The list's accessible name and its loading announcement. */
export type ComposerResourceListLabel = { label: string; loading: string }

/** What each marker lists: `/` commands and skills, `$` skills, `@` MCP servers. */
const LIST_LABELS = {
  '/': { label: 'chat.menu.list.slash', loading: 'chat.menu.list.slashLoading' },
  $: { label: 'chat.menu.list.skill', loading: 'chat.menu.list.skillLoading' },
  '@': { label: 'chat.menu.list.mcp', loading: 'chat.menu.list.mcpLoading' },
} satisfies Record<ComposerResourceMarker, Record<keyof ComposerResourceListLabel, MessageKey>>

export function composerResourceListLabel(
  marker: ComposerResourceMarker,
): ComposerResourceListLabel {
  const keys = LIST_LABELS[marker]
  return { label: t(keys.label), loading: t(keys.loading) }
}
