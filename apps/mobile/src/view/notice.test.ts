import { describe, expect, it } from 'vitest'
import type { StartupNotice } from '@harness/contracts'
import { noticeView } from './notice'
import { deviceLanguage, languageOf } from './strings'

const aside = 'D:\data\chats.sqlite.damaged-20261116'
const restored: StartupNotice = {
  kind: 'database.restored',
  at: Date.UTC(2026, 10, 16, 12),
  backupAt: Date.UTC(2026, 10, 15, 12),
  asidePath: aside,
}
const empty: StartupNotice = { ...restored, backupAt: null }

describe('the restored-database notice on the phone', () => {
  it('says what happened, the date of the copy and where the damaged file is, in English', () => {
    const view = noticeView(restored, 'en')
    expect(view.title).toBe('Chat database restored')
    expect(view.message).toMatch(
      /^Your chat database was damaged\. It was restored from the backup of .*2026/,
    )
    expect(view.detail).toContain('kept on your computer')
    expect(view.detail).toContain(aside)
    expect(view.dismiss).toBe('Dismiss')
  })

  it('says it in Brazilian Portuguese', () => {
    const view = noticeView(restored, 'pt-BR')
    expect(view.title).toBe('Banco de dados restaurado')
    expect(view.message).toMatch(
      /^O banco de dados dos chats estava danificado e foi restaurado da cópia de .*novembro de 2026.*\.$/,
    )
    expect(view.detail).toBe(
      `O arquivo danificado foi guardado no computador, em ${aside}. Chats posteriores a essa cópia não estão nela.`,
    )
    expect(view.dismiss).toBe('Dispensar')
  })

  it('says when no copy could be used, in both languages', () => {
    expect(noticeView(empty, 'en').message).toBe(
      'Your chat database was damaged and no backup could be used, so TUIFT Code started empty.',
    )
    expect(noticeView(empty, 'en').detail).toBe(
      `The damaged file was kept on your computer, at ${aside}. Nothing was deleted.`,
    )
    expect(noticeView(empty, 'pt-BR').message).toBe(
      'O banco de dados dos chats estava danificado e nenhuma cópia pôde ser usada. O TUIFT Code começou vazio.',
    )
    expect(noticeView(empty, 'pt-BR').detail).toBe(
      `O arquivo danificado foi guardado no computador, em ${aside}. Nada foi apagado.`,
    )
  })

  it('follows the phone language: Portuguese for any pt locale, English otherwise', () => {
    expect(languageOf('pt-BR')).toBe('pt-BR')
    expect(languageOf('pt-PT')).toBe('pt-BR')
    expect(languageOf('en-US')).toBe('en')
    expect(languageOf('de-DE')).toBe('en')
    expect(languageOf(undefined)).toBe('en')
    expect(['en', 'pt-BR']).toContain(deviceLanguage())
  })
})
