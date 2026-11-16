import { describe, expect, it } from 'vitest'
import { DESIGN_MESSAGES, ItemSchema, joinMessageParts } from '@harness/contracts'
import {
  designNote,
  findingPart,
  finalMessageParts,
  sortedFindings,
  type DesignFinding,
  type FinalInput,
} from './design-final.js'

const finding = (
  id: string,
  severity: DesignFinding['severity'],
  extra: Partial<DesignFinding> = {},
): DesignFinding => ({
  id,
  severity,
  area: 'hero, 1440px',
  evidenceType: 'visual_inspection',
  confidence: 'high',
  evidence: `evidence of ${id}`,
  repair: `repair of ${id}`,
  ...extra,
})

const base: FinalInput = {
  kind: 'build',
  dashboard: false,
  previewUrl: 'http://127.0.0.1:4173/',
  repairAttempt: 0,
  repairLimit: 2,
  pages: [{ route: '/', open: 0 }],
  pageCeiling: 6,
  pagesFound: 1,
  pagesCut: [],
  openFindings: [],
  cropped: [],
  scanSkipped: false,
  repairNotes: [],
}

const codes = (parts: ReturnType<typeof finalMessageParts>) =>
  parts.map(({ code }) => code).filter(Boolean)

describe('every message of the pipeline carries a code', () => {
  it('uses only codes the shared table defines, and every code with a sentence of its own', () => {
    const everything = finalMessageParts({
      ...base,
      repairAttempt: 2,
      pages: [
        { route: '/', open: 1 },
        { route: '/menu.html', open: 0 },
      ],
      pagesFound: 9,
      pagesCut: ['/a.html'],
      openFindings: [
        {
          route: '/',
          finding: finding('empty_region', 'major', {
            message: {
              code: 'review.finding.empty_region',
              params: {
                viewport: '1440px',
                near: 'Hi',
                height: 500,
                percent: 50,
                top: 300,
                bottom: 800,
              },
            },
          }),
        },
        { route: '/menu.html', finding: finding('model_finding', 'minor') },
      ],
      repairNotes: [
        {
          code: 'repair.page.reference',
          params: { section: 4, family: 'contact', id: 'contact-a' },
        },
      ],
      model: 'claude-haiku',
      scanSkipped: true,
      buildSummary: 'Verify before publishing: o telefone é de exemplo.',
    })
    for (const part of everything) {
      if (part.code) expect(Object.keys(DESIGN_MESSAGES)).toContain(part.code)
      expect(part.text).not.toMatch(/\{\w+\}/)
    }
    // What a model wrote has no code and travels as it is.
    expect(everything.at(-1)).toEqual({
      text: 'Verify before publishing: o telefone é de exemplo.',
    })
  })

  it('writes the same English text a client that does not know the codes shows', () => {
    const text = joinMessageParts(finalMessageParts({ ...base, repairAttempt: 1 }))
    expect(text).toBe(
      'Website built. Preview ready at http://127.0.0.1:4173/. Visual review passed after 1 repair attempt.',
    )
    expect(designNote('note.briefLocked').text).toBe('Brief locked in. Starting the design.')
  })
})

describe('the closing message of a build', () => {
  it('says how many problems remain and lists them, and never calls the page finished', () => {
    const parts = finalMessageParts({
      ...base,
      repairAttempt: 2,
      pages: [{ route: '/', open: 2 }],
      openFindings: [
        { route: '/', finding: finding('a', 'minor') },
        { route: '/', finding: finding('b', 'blocking') },
      ],
    })
    const text = joinMessageParts(parts)
    expect(text).toContain('Website built. Not finished: 2 problems remain.')
    expect(text).toContain(
      'Visual review stopped after 2 repair attempts with 2 problems remaining.',
    )
    // Blocking first.
    expect(text.indexOf('evidence of b')).toBeLessThan(text.indexOf('evidence of a'))
    expect(text).not.toContain('Visual review passed')
    expect(codes(parts)).toContain('final.notFinished_other')
  })

  it('uses the singular form for one', () => {
    const text = joinMessageParts(
      finalMessageParts({
        ...base,
        repairAttempt: 2,
        pages: [{ route: '/', open: 1 }],
        openFindings: [{ route: '/', finding: finding('a', 'major') }],
      }),
    )
    expect(text).toContain('Not finished: 1 problem remains.')
  })

  it('reports each page of a redesign, and what the ceiling left out', () => {
    const text = joinMessageParts(
      finalMessageParts({
        ...base,
        pages: [
          { route: '/', open: 0 },
          { route: '/cardapio.html', open: 0 },
          { route: '/contato.html', open: 0 },
        ],
        pagesFound: 9,
        pagesCut: ['/x.html', '/y.html', '/z.html'],
      }),
    )
    expect(text).toContain('Checked 3 pages:')
    expect(text).toContain('\n- /cardapio.html: no problems.')
    expect(text).toContain(
      '9 pages were found and one run checks at most 6, so these were not checked: /x.html, /y.html, /z.html.',
    )
  })

  it('says when a model needed the server to finish its checks, with the model it ran on', () => {
    const text = joinMessageParts(
      finalMessageParts({
        ...base,
        model: 'claude-haiku',
        repairNotes: [
          {
            code: 'repair.page.reference',
            params: { section: 4, family: 'contact', id: 'contact-a' },
          },
        ],
      }),
    )
    expect(text).toContain(
      'The model claude-haiku could not satisfy some of the checks of this run',
    )
    expect(text).toContain(
      'Page: section 4 (contact) was given the reference contact-a of its own family.',
    )
    const noModel = joinMessageParts(
      finalMessageParts({ ...base, repairNotes: [{ code: 'repair.review.unreadable' }] }),
    )
    expect(noModel).toContain('The provider default model could not satisfy')
  })

  it('says what a skipped review means, in the three ways it happens', () => {
    const skipped = (reason: 'no_images' | 'no_window' | 'other', text?: string) =>
      joinMessageParts(
        finalMessageParts({ ...base, skipped: { reason, ...(text ? { text } : {}) } }),
      )
    expect(skipped('no_images')).toContain('does not declare image support')
    expect(skipped('no_window')).toContain('no TUIFT Code window was open')
    expect(skipped('other', 'the capture timed out')).toContain(
      'skipped because the capture timed out.',
    )
  })

  it('names the part of the page that was not reviewed', () => {
    expect(joinMessageParts(finalMessageParts({ ...base, cropped: ['1440x1000'] }))).toContain(
      '1440x1000 ended before the page did',
    )
  })

  it('says what the movement check captured and could not verify, for a change', () => {
    const text = joinMessageParts(
      finalMessageParts({
        ...base,
        kind: 'change',
        changeSummary: 'Adicionei a animação.',
        motion: {
          moments: 3,
          animations: 2,
          reduced: 0,
          hovers: 2,
          limits: ['script_animation', 'click_not_captured'],
        },
      }),
    )
    expect(text).toContain('Change made.')
    expect(text).toContain('captured 3 moments of the first screen')
    expect(text).toContain('Not verified: animation driven by script')
    expect(text).toContain('Not verified: states after a click')
    expect(text.endsWith('Adicionei a animação.')).toBe(true)
  })
})

describe('the answer to a review', () => {
  const measured = finding('empty_region', 'major', {
    evidenceType: 'automated',
    message: {
      code: 'review.finding.empty_region',
      params: {
        viewport: '1440px',
        near: 'Navalha Fina.',
        height: 568,
        percent: 57,
        top: 304,
        bottom: 872,
      },
    },
  })

  it('lists findings most important first, each with where and what to do, and changes nothing', () => {
    const parts = finalMessageParts({
      ...base,
      kind: 'review',
      pages: [
        { route: '/', open: 2, summary: 'Só desktop e celular foram vistos.' },
        { route: '/contato.html', open: 1 },
      ],
      openFindings: [
        { route: '/', finding: finding('model_minor', 'minor') },
        { route: '/', finding: measured },
        { route: '/contato.html', finding: finding('model_blocking', 'blocking') },
      ],
    })
    const text = joinMessageParts(parts)
    expect(text.startsWith('Review finished. Nothing in the project was changed.')).toBe(true)
    expect(text).toContain('Reviewed 2 page(s) and found 3 problems, most important first.')
    expect(text.indexOf('Blocking:')).toBeLessThan(text.indexOf('Major:'))
    expect(text.indexOf('Major:')).toBeLessThan(text.indexOf('Minor:'))
    expect(text).toContain(
      '1. /contato.html, hero, 1440px: evidence of model_blocking What to do: repair of model_blocking',
    )
    expect(text).toContain(
      '2. /, 1440px wide, near "Navalha Fina.": a band 568px tall (57% of the window)',
    )
    expect(text).toContain('\n- /: Só desktop e celular foram vistos.')
    expect(text).not.toContain('Website built')
    expect(codes(parts)).toContain('review.finding.empty_region')
  })

  it('says so when it found nothing, and when files changed although they may not', () => {
    const clean = joinMessageParts(finalMessageParts({ ...base, kind: 'review' }))
    expect(clean).toContain('Reviewed 1 page(s) and found no problems.')
    const dirty = joinMessageParts(
      finalMessageParts({
        ...base,
        kind: 'review',
        filesChangedInReview: ['index.html', 'styles.css'],
      }),
    )
    expect(dirty).toContain(
      'changed files during this review although it was told not to: index.html, styles.css',
    )
  })
})

describe('findings', () => {
  it('falls back to the generic line for a code the table does not know', () => {
    const part = findingPart(
      1,
      '/',
      finding('x', 'minor', { message: { code: 'review.finding.from_the_future', params: {} } }),
    )
    expect(part.code).toBe('review.finding')
  })

  it('keeps page order inside one importance', () => {
    const sorted = sortedFindings([
      { route: '/a', finding: finding('1', 'major') },
      { route: '/b', finding: finding('2', 'blocking') },
      { route: '/c', finding: finding('3', 'major') },
    ])
    expect(sorted.map(({ route }) => route)).toEqual(['/b', '/a', '/c'])
  })
})

describe('the closing message as a chat item', () => {
  it('stays a valid item with dozens of findings, as a real review of three pages produced', () => {
    const openFindings = Array.from({ length: 60 }, (_, index) => ({
      route: index % 2 ? '/cardapio.html' : '/',
      finding: finding(`finding_${index}`, index % 3 === 0 ? 'blocking' : 'major'),
    }))
    const parts = finalMessageParts({
      ...base,
      kind: 'review',
      pages: [
        { route: '/', open: 30 },
        { route: '/cardapio.html', open: 30 },
      ],
      openFindings,
    })
    expect(parts.length).toBeGreaterThan(60)
    expect(() =>
      ItemSchema.parse({
        id: 'design-complete-1',
        turnId: 't1',
        type: 'message',
        role: 'assistant',
        phase: 'final_answer',
        status: 'completed',
        text: joinMessageParts(parts),
        parts,
        createdAt: 1,
      }),
    ).not.toThrow()
  })
})
