import { describe, expect, it } from 'vitest'
import { DESIGN_MESSAGES, designMessagePart, joinMessageParts } from '@harness/contracts'
import { en } from './i18n/en.js'
import { setLanguage } from './i18n/index.js'
import { ptBR } from './i18n/pt-BR.js'
import { messageDisplayText, serverMessageText } from './server-message.js'

const placeholders = (message: string) =>
  [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

describe('the Design pipeline messages', () => {
  const codes = Object.keys(DESIGN_MESSAGES) as Array<keyof typeof DESIGN_MESSAGES>

  it('have an English catalog entry that is the server text', () => {
    for (const code of codes) {
      expect((en as Record<string, string>)[`design.msg.${code}`], code).toBe(DESIGN_MESSAGES[code])
    }
  })

  it('have a Portuguese sentence of their own, with the same values', () => {
    for (const code of codes) {
      const pt = (ptBR as Record<string, string>)[`design.msg.${code}`]
      expect(pt, code).toBeTruthy()
      expect(pt, code).not.toBe(DESIGN_MESSAGES[code])
      expect(placeholders(pt!), code).toEqual(placeholders(DESIGN_MESSAGES[code]))
    }
  })

  it('are said in Portuguese by the page, and in English when the language is English', () => {
    const part = designMessagePart('final.previewReady', { url: 'http://127.0.0.1:4173/' })
    const item = { text: part.text, parts: [part] }
    setLanguage('pt-BR', { persist: false })
    expect(serverMessageText(item)).toBe('Prévia pronta em http://127.0.0.1:4173/.')
    setLanguage('en', { persist: false })
    expect(serverMessageText(item)).toBe('Preview ready at http://127.0.0.1:4173/.')
  })

  it('translate a whole closing message and leave what a model wrote as it is', () => {
    const parts = [
      designMessagePart('final.websiteBuilt'),
      designMessagePart('final.notFinished_other', { count: 3 }),
      designMessagePart('final.reviewStopped_other', { limit: 2, count: 3 }),
      designMessagePart('final.pageOk', { page: '/contato.html' }),
      { text: 'Verify before publishing: o telefone é de exemplo.' },
    ]
    setLanguage('pt-BR', { persist: false })
    expect(serverMessageText({ parts })).toBe(
      'Site pronto. Não está terminado: restam 3 problemas. A revisão visual parou depois de 2 tentativas de correção, com 3 problemas restantes.' +
        '\n- /contato.html: sem problemas. Verify before publishing: o telefone é de exemplo.',
    )
    expect(joinMessageParts(parts)).toContain('Website built. Not finished: 3 problems remain.')
  })

  it('say a finding the page measured, in Portuguese, with its numbers', () => {
    const part = designMessagePart('review.finding.empty_region', {
      n: 1,
      page: '/',
      viewport: '1440px',
      near: 'Navalha Fina.',
      height: 568,
      percent: 57,
      top: 304,
      bottom: 872,
    })
    setLanguage('pt-BR', { persist: false })
    const text = serverMessageText({ parts: [part] })!
    expect(text).toContain('1. /, largura 1440px, perto de "Navalha Fina."')
    expect(text).toContain('uma faixa de 568px de altura (57% da janela)')
  })

  it('show the English of a code this app does not know', () => {
    setLanguage('pt-BR', { persist: false })
    expect(
      serverMessageText({
        parts: [{ code: 'note.from_the_future', text: 'Something new happened.' }],
      }),
    ).toBe('Something new happened.')
  })

  it('leave a message with no pieces as it was', () => {
    setLanguage('pt-BR', { persist: false })
    expect(messageDisplayText({ text: 'Plain text.' })).toBe('Plain text.')
    expect(serverMessageText({})).toBeUndefined()
  })
})
