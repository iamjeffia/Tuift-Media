// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_KEY,
  formatNumber,
  getLanguage,
  resolveLanguage,
  setLanguage,
  subscribeLanguage,
  t,
  tp,
  translate,
  translatePlural,
} from './i18n.js'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('language resolution', () => {
  it('defaults to Brazilian Portuguese when nothing valid is stored', () => {
    expect(DEFAULT_LANGUAGE).toBe('pt-BR')
    expect(resolveLanguage(null)).toBe('pt-BR')
    expect(resolveLanguage(undefined)).toBe('pt-BR')
    expect(resolveLanguage('fr')).toBe('pt-BR')
    expect(resolveLanguage('en')).toBe('en')
    expect(resolveLanguage('pt-BR')).toBe('pt-BR')
  })

  it('starts the app in Portuguese when storage and the test override are both empty', async () => {
    vi.resetModules()
    vi.stubGlobal('__TUIFT_TEST_LANGUAGE__', undefined)
    const fresh = await import('./i18n.js')
    expect(fresh.getLanguage()).toBe('pt-BR')
    expect(fresh.t('settings.nav.general')).toBe('Geral')
    vi.unstubAllGlobals()
  })

  it('starts in the stored language', async () => {
    localStorage.setItem(LANGUAGE_KEY, 'en')
    vi.resetModules()
    vi.stubGlobal('__TUIFT_TEST_LANGUAGE__', 'pt-BR')
    const fresh = await import('./i18n.js')
    expect(fresh.getLanguage()).toBe('en')
    vi.unstubAllGlobals()
  })
})

describe('translate', () => {
  const catalogs = {
    en: { 'only.en': 'English only', greeting: 'Hello {name}, you have {count} chats' },
    'pt-BR': { greeting: 'Olá {name}, você tem {count} chats' },
  } as const

  it('reads the catalog of the language', () => {
    expect(translate('pt-BR', 'greeting', { name: 'Ana', count: 3 }, catalogs)).toBe(
      'Olá Ana, você tem 3 chats',
    )
    expect(translate('en', 'greeting', { name: 'Ana', count: 1 }, catalogs)).toBe(
      'Hello Ana, you have 1 chats',
    )
  })

  it('falls back to English for a key the language lacks, then to the key itself', () => {
    expect(translate('pt-BR', 'only.en', undefined, catalogs)).toBe('English only')
    expect(translate('pt-BR', 'nowhere', undefined, catalogs)).toBe('nowhere')
  })

  it('leaves a placeholder without a value as written', () => {
    expect(translate('en', 'greeting', { name: 'Ana' }, catalogs)).toBe(
      'Hello Ana, you have {count} chats',
    )
  })
})

describe('plurals', () => {
  const catalogs = {
    en: { item_one: '{count} item', item_other: '{count} items', only_other: '{count} only' },
    'pt-BR': { item_one: '{count} item', item_other: '{count} itens' },
  } as const

  it('picks the form the language uses for the count', () => {
    expect(translatePlural('en', 'item', 1, undefined, catalogs)).toBe('1 item')
    expect(translatePlural('en', 'item', 0, undefined, catalogs)).toBe('0 items')
    expect(translatePlural('en', 'item', 5, undefined, catalogs)).toBe('5 items')
  })

  it('follows Portuguese rules, where zero takes the singular', () => {
    expect(translatePlural('pt-BR', 'item', 0, undefined, catalogs)).toBe('0 item')
    expect(translatePlural('pt-BR', 'item', 2, undefined, catalogs)).toBe('2 itens')
  })

  it('uses _other when the specific form is missing', () => {
    expect(translatePlural('pt-BR', 'only', 1, undefined, catalogs)).toBe('1 only')
  })

  it('works on the real catalog', () => {
    setLanguage('pt-BR', { persist: false })
    expect(tp('common.days', 1)).toBe('1 dia')
    expect(tp('common.days', 7)).toBe('7 dias')
    setLanguage('en', { persist: false })
    expect(tp('common.days', 1)).toBe('1 day')
    expect(tp('common.days', 7)).toBe('7 days')
  })
})

describe('current language', () => {
  it('changes t, notifies subscribers and sets <html lang>', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeLanguage(listener)

    setLanguage('pt-BR', { persist: false })
    expect(getLanguage()).toBe('pt-BR')
    expect(t('settings.title')).toBe('Configurações')
    expect(document.documentElement.lang).toBe('pt-BR')
    expect(listener).toHaveBeenCalledTimes(1)

    setLanguage('pt-BR', { persist: false })
    expect(listener).toHaveBeenCalledTimes(1)

    setLanguage('en', { persist: false })
    expect(t('settings.title')).toBe('Settings')
    expect(document.documentElement.lang).toBe('en')
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    setLanguage('pt-BR', { persist: false })
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('persists the choice unless told not to', () => {
    setLanguage('pt-BR', { persist: false })
    expect(localStorage.getItem(LANGUAGE_KEY)).toBeNull()
    setLanguage('en')
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe('en')
  })

  it('still switches when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    setLanguage('pt-BR')
    expect(getLanguage()).toBe('pt-BR')
    setLanguage('en', { persist: false })
  })
})

describe('formatNumber', () => {
  it('groups thousands the way the current language does', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
    expect(formatNumber(1.5, { minimumFractionDigits: 1 })).toBe('1.5')
    setLanguage('pt-BR', { persist: false })
    expect(formatNumber(1234567)).toBe('1.234.567')
    expect(formatNumber(1.5, { minimumFractionDigits: 1 })).toBe('1,5')
  })
})
