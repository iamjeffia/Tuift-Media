import { en, type MessageKey, type PluralKey } from './en.js'
import { ptBR } from './pt-BR.js'

export type Language = 'pt-BR' | 'en'
export type MessageVars = Record<string, string | number>
type Catalog = Readonly<Record<string, string | undefined>>
type Catalogs = Readonly<Record<Language, Catalog>>

export const DEFAULT_LANGUAGE: Language = 'pt-BR'
export const LANGUAGE_KEY = 'harness.language'
/** Each language in its own name, so it can be found whatever the current one is. */
export const LANGUAGE_OPTIONS = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'en', label: 'English' },
] as const satisfies ReadonlyArray<{ value: Language; label: string }>

const CATALOGS = { en, 'pt-BR': ptBR } satisfies Catalogs

export function isLanguage(value: unknown): value is Language {
  return value === 'pt-BR' || value === 'en'
}

/** A stored or requested value that is not a known language falls back to the default. */
export function resolveLanguage(value: unknown): Language {
  return isLanguage(value) ? value : DEFAULT_LANGUAGE
}

const interpolation = /\{(\w+)\}/g

/**
 * The message for `key` in `language`. A key missing from that catalog falls
 * back to English, and a key missing from both is returned as written, so a
 * gap shows up on screen instead of throwing. `{name}` placeholders are filled
 * from `vars`; one without a value is left as written.
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

/**
 * The message for `base` that fits `count`: `base_one`, `base_other` and so on,
 * picked with the language's own plural rules (`one` covers 0 in Portuguese).
 * `{count}` is filled in; `vars` add the rest.
 */
export function translatePlural(
  language: Language,
  base: string,
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

function readStoredLanguage(): string | null {
  try {
    return localStorage.getItem(LANGUAGE_KEY)
  } catch {
    return null
  }
}

/**
 * The test setup names a language here so that every test starts in English
 * whatever the storage holds (see src/test-setup.ts). Nothing in the app sets it.
 */
const TEST_LANGUAGE_GLOBAL = '__TUIFT_TEST_LANGUAGE__'

let current: Language = resolveLanguage(
  readStoredLanguage() ?? (globalThis as Record<string, unknown>)[TEST_LANGUAGE_GLOBAL],
)
const listeners = new Set<() => void>()

export function getLanguage(): Language {
  return current
}

export function subscribeLanguage(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

/**
 * Points the document at the language, for screen readers, hyphenation and
 * spellcheck, and tells the desktop shell so its native menus, tray, dialogs
 * and notifications follow (a no-op in a browser). Runs at startup and on every change.
 */
export function applyDocumentLanguage(): void {
  if (typeof document !== 'undefined') document.documentElement.lang = current
  try {
    // Straight to the bridge object: bridge.ts imports this module, not the other way round.
    void window.harness?.setLanguage?.(current)?.catch(() => undefined)
  } catch {
    // The shell keeps the language it already has.
  }
}

/**
 * Switches the interface language and remembers it. `persist: false` changes
 * the language for this session only (the test setup uses it).
 */
export function setLanguage(language: Language, options: { persist?: boolean } = {}): void {
  if (options.persist !== false) {
    try {
      localStorage.setItem(LANGUAGE_KEY, language)
    } catch {
      // The language still applies to this session when storage is unavailable.
    }
  }
  if (language === current) return
  current = language
  applyDocumentLanguage()
  for (const listener of listeners) listener()
}

const NUMBER_LOCALES = { en: 'en-US', 'pt-BR': 'pt-BR' } as const satisfies Record<Language, string>
const numberFormats = new Map<string, Intl.NumberFormat>()

/** A number in the current language: `1,234` in English, `1.234` in Portuguese. */
export function formatNumber(value: number, options: Intl.NumberFormatOptions = {}): string {
  const key = `${current}:${JSON.stringify(options)}`
  let format = numberFormats.get(key)
  if (!format) {
    format = new Intl.NumberFormat(NUMBER_LOCALES[current], options)
    numberFormats.set(key, format)
  }
  return format.format(value)
}

export function t(key: MessageKey, vars?: MessageVars): string {
  return translate(current, key, vars)
}

export function tp(base: PluralKey, count: number, vars?: MessageVars): string {
  return translatePlural(current, base, count, vars)
}
