import type { MessageKey } from '../i18n/index.js'

/**
 * Whether After Effects can be used from a Motion chat, as the server says it in
 * the chat's settings (`afterEffects`).
 *
 * Local on purpose: until the contract carries the field, the renderer reads it
 * defensively from the settings object. When `ThreadSettings` has it, delete
 * this type and `readAfterEffects`, and import the contract's type instead.
 */
export type AfterEffectsState = 'ready' | 'not-installed' | 'unavailable'

/** The states that need a word to the person: After Effects cannot be used. */
export type AfterEffectsProblem = Exclude<AfterEffectsState, 'ready'>

const STATES: readonly AfterEffectsState[] = ['ready', 'not-installed', 'unavailable']

/** The field of a settings object, or `undefined` for an older server or a value it does not know. */
export const readAfterEffects = (settings: object): AfterEffectsState | undefined => {
  const value = (settings as { afterEffects?: unknown }).afterEffects
  return STATES.find((state) => state === value)
}

/** What is going on, whole: the line at the top of Cloud's menu and the announcement. */
export const AFTER_EFFECTS_NOTE = {
  'not-installed': 'chat.motion.afterEffects.notInstalled',
  unavailable: 'chat.motion.afterEffects.unavailable',
} satisfies Record<AfterEffectsProblem, MessageKey>

/** The same in a few words, for Cloud's accessible name and tooltip. */
export const AFTER_EFFECTS_NAME = {
  'not-installed': 'chat.motion.afterEffects.notInstalledName',
  unavailable: 'chat.motion.afterEffects.unavailableName',
} satisfies Record<AfterEffectsProblem, MessageKey>

/** `ready` and unknown say nothing. */
export const afterEffectsProblem = (
  state: AfterEffectsState | undefined,
): AfterEffectsProblem | undefined =>
  state === 'not-installed' || state === 'unavailable' ? state : undefined
