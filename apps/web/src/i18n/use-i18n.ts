import { useSyncExternalStore } from 'react'
import type { MessageKey, PluralKey } from './en.js'
import {
  getLanguage,
  subscribeLanguage,
  translate,
  translatePlural,
  type Language,
  type MessageVars,
} from './i18n.js'

export type I18n = {
  language: Language
  t: (key: MessageKey, vars?: MessageVars) => string
  tp: (base: PluralKey, count: number, vars?: MessageVars) => string
}

// One object per language, so the hook's result is stable between renders.
const bound = new Map<Language, I18n>()

function i18nFor(language: Language): I18n {
  let value = bound.get(language)
  if (!value) {
    value = {
      language,
      t: (key, vars) => translate(language, key, vars),
      tp: (base, count, vars) => translatePlural(language, base, count, vars),
    }
    bound.set(language, value)
  }
  return value
}

/** The translators for the current language; the component renders again when it changes. */
export function useI18n(): I18n {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage)
  return i18nFor(language)
}
