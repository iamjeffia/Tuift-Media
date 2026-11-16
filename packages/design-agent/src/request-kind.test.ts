import { describe, expect, it } from 'vitest'
import { classifyDesignRequest, isLightRequestKind, resolveRequestKind } from './request-kind.js'

/**
 * The five kinds of request of the 16 November diagnosis. The originals were not kept with the
 * evidence; these are written in the same shape and language (the owner's requests are in
 * Portuguese), each of the kind the diagnosis ran it as.
 */
const DIAGNOSIS = [
  {
    name: '1 new site',
    request:
      'Crie um site para a padaria Pão de Lenha, na Vila Madalena: cardápio, história, horários e encomendas pelo WhatsApp.',
    kind: 'build',
    hasProject: false,
  },
  {
    name: '2 app screen',
    request:
      'Desenhe a tela de notificações de um app de controle de gastos chamado Fio, com avisos por categoria e resumo mensal.',
    kind: 'build',
    hasProject: false,
  },
  {
    name: '3 redesign',
    request:
      'Refaça o site da Padaria Doce Trigo, que está feio: as três páginas (início, cardápio e contato), mantendo o endereço.',
    kind: 'redesign',
    hasProject: true,
  },
  {
    name: '4a review',
    request: 'Revise esta página e me diga o que está errado. Não altere nenhum arquivo.',
    kind: 'review',
    hasProject: true,
  },
  {
    name: '4b animation',
    request: 'Acrescente uma animação de entrada no título e um hover nos links do menu.',
    kind: 'change',
    hasProject: true,
  },
  {
    name: '5 big folder',
    request: 'Faça o site da barbearia Navalha Fina, com agendamento pelo WhatsApp.',
    kind: 'build',
    hasProject: true,
  },
] as const

describe('request classification', () => {
  for (const { name, request, kind, hasProject } of DIAGNOSIS) {
    it(`${name} is a ${kind}`, () => {
      expect(classifyDesignRequest(request, { hasProject })).toEqual({
        kind,
        confidence: 'clear',
      })
    })
  }

  it('reads English and Spanish the same way', () => {
    const project = { hasProject: true }
    expect(
      classifyDesignRequest('Review this page and tell me what is wrong with it.', project).kind,
    ).toBe('review')
    expect(
      classifyDesignRequest('Audit the landing page, without changing any file.', project).kind,
    ).toBe('review')
    expect(
      classifyDesignRequest(
        'Add a fade-in animation to the hero heading and a hover on the nav links.',
        project,
      ).kind,
    ).toBe('change')
    expect(classifyDesignRequest('Redesign the homepage from scratch.', project).kind).toBe(
      'redesign',
    )
    expect(classifyDesignRequest('Create a landing page for a yoga studio.', project).kind).toBe(
      'build',
    )
    expect(classifyDesignRequest('Revisa esta página y dime qué está mal.', project).kind).toBe(
      'review',
    )
    expect(classifyDesignRequest('Añade una animación al título.', project).kind).toBe('change')
  })

  it('treats "review and fix" as a change, and "fix what the review found" too', () => {
    const project = { hasProject: true }
    expect(
      classifyDesignRequest('Revise a página e corrija o que estiver errado.', project).kind,
    ).toBe('change')
    expect(classifyDesignRequest('Corrija os problemas que a revisão achou.', project).kind).toBe(
      'change',
    )
  })

  it('takes the lighter path when no word names the kind', () => {
    expect(classifyDesignRequest('Quero algo mais bonito', { hasProject: true })).toEqual({
      kind: 'change',
      confidence: 'unclear',
    })
    expect(classifyDesignRequest('Make it pop', { hasProject: false })).toEqual({
      kind: 'build',
      confidence: 'unclear',
    })
  })

  it('has nothing to change or redesign in an empty folder, so it builds', () => {
    expect(
      classifyDesignRequest('Acrescente uma animação no título.', { hasProject: false }).kind,
    ).toBe('build')
    expect(classifyDesignRequest('Refaça o site.', { hasProject: false }).kind).toBe('build')
  })
})

describe('reconciling the model and the words', () => {
  const clearBuild = { kind: 'build', confidence: 'clear' } as const
  const clearReview = { kind: 'review', confidence: 'clear' } as const
  const unclear = { kind: 'change', confidence: 'unclear' } as const
  const project = { hasProject: true }

  it('agrees when both say the same', () => {
    expect(resolveRequestKind(clearReview, 'review', project)).toEqual({
      kind: 'review',
      source: 'agreed',
    })
  })

  it('takes the lighter kind when they disagree, so a heavy build is never a mistake', () => {
    expect(resolveRequestKind(clearReview, 'build', project)).toEqual({
      kind: 'review',
      source: 'lighter_of_both',
    })
    expect(resolveRequestKind(clearBuild, 'change', project)).toEqual({
      kind: 'change',
      source: 'lighter_of_both',
    })
  })

  it('defers to the model when the words name nothing', () => {
    expect(resolveRequestKind(unclear, 'redesign', project)).toEqual({
      kind: 'redesign',
      source: 'model',
    })
  })

  it('uses the words, or the light default, when the model gives no kind', () => {
    expect(resolveRequestKind(clearReview, undefined, project)).toEqual({
      kind: 'review',
      source: 'words',
    })
    expect(resolveRequestKind(unclear, undefined, project)).toEqual({
      kind: 'change',
      source: 'default_light',
    })
  })

  it('builds when the folder has no page to change', () => {
    expect(
      resolveRequestKind({ kind: 'change', confidence: 'clear' }, 'change', { hasProject: false })
        .kind,
    ).toBe('build')
    expect(resolveRequestKind(clearReview, 'review', { hasProject: false }).kind).toBe('review')
  })

  it('names the kinds that run no brief, brand, page or asset phase', () => {
    expect(
      ['review', 'change', 'build', 'redesign'].filter((kind) => isLightRequestKind(kind as never)),
    ).toEqual(['review', 'change'])
  })
})
