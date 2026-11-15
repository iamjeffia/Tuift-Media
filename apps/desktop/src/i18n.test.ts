import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LANGUAGE,
  en,
  loadLanguage,
  parseLanguage,
  ptBR,
  saveLanguage,
  translate,
  translatePlural,
} from './i18n.js'

const placeholders = (message: string) =>
  [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

describe('desktop message catalogs', () => {
  it('have exactly the same keys in English and Portuguese', () => {
    const english = Object.keys(en).sort()
    const portuguese = Object.keys(ptBR).sort()
    expect(portuguese.filter((key) => !(key in en))).toEqual([])
    expect(english.filter((key) => !(key in ptBR))).toEqual([])
  })

  it('use the same {placeholders} in both languages', () => {
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(placeholders(ptBR[key]), key).toEqual(placeholders(en[key]))
    }
  })

  it('have no empty messages and give every plural its _other form', () => {
    for (const catalog of [en, ptBR] as Array<Record<string, string>>) {
      for (const [key, message] of Object.entries(catalog)) {
        expect(message.trim(), key).not.toBe('')
        const match = /^(.*)_(zero|one|two|few|many)$/.exec(key)
        if (match) expect(catalog[`${match[1]}_other`], key).toBeDefined()
        if (/_(zero|one|two|few|many|other)$/.test(key)) expect(message, key).toContain('{count}')
      }
    }
  })
})

describe('desktop translate', () => {
  it('defaults to Brazilian Portuguese, like the web module', () => {
    expect(DEFAULT_LANGUAGE).toBe('pt-BR')
  })

  it('fills placeholders and leaves one without a value as written', () => {
    expect(translate('en', 'tray.open', { appName: 'TUIFT Code' })).toBe('Open TUIFT Code')
    expect(translate('pt-BR', 'tray.quit', { appName: 'TUIFT Code' })).toBe('Sair do TUIFT Code')
    expect(translate('en', 'tray.open')).toBe('Open {appName}')
  })

  it('falls back to English, then to the key, for a key a catalog lacks', () => {
    const catalogs = { en: { 'a.b': 'Only English' }, 'pt-BR': {} }
    expect(translate('pt-BR', 'a.b', undefined, catalogs)).toBe('Only English')
    expect(translate('pt-BR', 'a.c', undefined, catalogs)).toBe('a.c')
  })

  it('picks the plural form of the language', () => {
    expect(translatePlural('en', 'badge.chatsNeedYou', 1)).toBe('1 chat needs you')
    expect(translatePlural('en', 'badge.chatsNeedYou', 0)).toBe('0 chats need you')
    expect(translatePlural('pt-BR', 'badge.chatsNeedYou', 0)).toBe('0 chat precisa de você')
    expect(translatePlural('pt-BR', 'badge.chatsNeedYou', 3)).toBe('3 chats precisam de você')
  })
})

describe('desktop language', () => {
  it('accepts only the two languages the renderer offers', () => {
    expect(parseLanguage('pt-BR')).toBe('pt-BR')
    expect(parseLanguage('en')).toBe('en')
    for (const value of ['pt', 'es', 'en-US', '', undefined, 1, { language: 'en' }]) {
      expect(() => parseLanguage(value)).toThrow('Invalid language')
    }
  })

  it('keeps the last language for the next launch and ignores a damaged file', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'language-'))
    try {
      const file = path.join(directory, 'nested', 'language.json')
      expect(loadLanguage(file)).toBeUndefined()
      saveLanguage(file, 'en')
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ language: 'en' })
      expect(loadLanguage(file)).toBe('en')
      saveLanguage(file, 'pt-BR')
      expect(loadLanguage(file)).toBe('pt-BR')
      writeFileSync(file, '{"language":"fr"}')
      expect(loadLanguage(file)).toBeUndefined()
      writeFileSync(file, 'null')
      expect(loadLanguage(file)).toBeUndefined()
      writeFileSync(file, 'not json')
      expect(loadLanguage(file)).toBeUndefined()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('is wired from the renderer to the menu, tray and dialogs in main and the preload', () => {
    const main = readFileSync(new URL('./main.ts', import.meta.url), 'utf8')
    const preload = readFileSync(new URL('./preload.ts', import.meta.url), 'utf8')
    expect(preload).toContain("ipcRenderer.invoke('harness:setLanguage', language)")
    const handler = main.slice(main.indexOf("ipcMain.handle('harness:setLanguage'"))
    const body = handler.slice(0, handler.indexOf('\n})\n'))
    expect(body).toContain('requireOwnRenderer(event.sender)')
    expect(body).toContain('parseLanguage(value)')
    expect(body).toContain('installApplicationMenu()')
    expect(body).toContain('installTrayMenu()')
    expect(body).toContain('saveLanguage(languagePath, language)')
  })
})
