import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { enforceMeasureFindings, measureFindings, type PageMeasures } from './page-measures.js'
import type { ReviewScreenshot, VisualReview } from './review-phase.js'

/**
 * The measures were taken by running the capture's page script in a real browser against the
 * fixture pages next to them (see the comment at the top of each .html file): the empty hero and
 * the giant footer heading are the two pages the first Design review approved and should not
 * have, and the app screen is the one it rightly approved.
 */
function measured(name: string): ReviewScreenshot[] {
  return (
    [
      ['desktop', 1440, 1000],
      ['mobile', 390, 844],
    ] as const
  ).map(([label, width, height]) => {
    const measures = JSON.parse(
      readFileSync(new URL(`./fixtures/measures/${name}.${label}.json`, import.meta.url), 'utf8'),
    ) as PageMeasures
    return { path: `${name}-${label}.jpg`, width, height, measures }
  })
}

const approved: VisualReview = {
  version: 1,
  verdict: 'pass',
  summary: 'Looks finished.',
  findings: [],
}

describe('page measures', () => {
  it('fail the hero with a huge empty block that a model approved', () => {
    const review = enforceMeasureFindings(approved, measured('empty-hero'))
    expect(review.verdict).toBe('repair')
    const finding = review.findings.find(({ id }) => id === 'empty_region')
    expect(finding).toBeDefined()
    expect(finding!.evidenceType).toBe('automated')
    expect(finding!.area).toContain('1440px')
    expect(finding!.evidence).toMatch(/\d+px tall/)
    expect(finding!.message?.code).toBe('review.finding.empty_region')
    expect(finding!.message?.params).toMatchObject({ viewport: '1440px' })
    expect(finding!.repair).toMatch(/as tall as its content/)
  })

  it('fail the footer address that became a giant heading', () => {
    const review = enforceMeasureFindings(approved, measured('giant-footer-heading'))
    expect(review.verdict).toBe('repair')
    const finding = review.findings.find(({ id }) => id === 'heading_out_of_scale')
    expect(finding).toBeDefined()
    expect(finding!.evidence).toContain('Rua das Flores, 120')
    expect(finding!.message?.params).toMatchObject({ size: 64, lines: 3 })
  })

  it('keep passing the app screen, which has nothing the measures can fail', () => {
    expect(measureFindings(measured('app-screen'))).toEqual([])
    expect(enforceMeasureFindings(approved, measured('app-screen'))).toBe(approved)
  })

  it('replace a model finding that uses a measured id, and keep its other findings', () => {
    const review = enforceMeasureFindings(
      {
        ...approved,
        verdict: 'repair',
        findings: [
          {
            id: 'empty_region',
            severity: 'minor',
            area: 'hero',
            evidenceType: 'visual_inspection',
            confidence: 'low',
            evidence: 'maybe some space',
            repair: 'meh',
          },
          {
            id: 'spacing_rhythm',
            severity: 'major',
            area: 'about',
            evidenceType: 'visual_inspection',
            confidence: 'high',
            evidence: 'gaps vary',
            repair: 'use the scale',
          },
        ],
      },
      measured('empty-hero'),
    )
    expect(review.findings.filter(({ id }) => id === 'empty_region')).toHaveLength(1)
    expect(review.findings.find(({ id }) => id === 'empty_region')!.confidence).toBe('high')
    expect(review.findings.some(({ id }) => id === 'spacing_rhythm')).toBe(true)
  })

  it('judge each rule on its own measures', () => {
    const base: PageMeasures = {
      documentWidth: 390,
      documentHeight: 1200,
      bodyFontSize: 16,
      emptyRegions: [],
      headings: [],
      duplicateCtas: [],
      clippedText: [],
      overlappingText: [],
      imagesMissingAlt: { count: 0, examples: [] },
      lowContrast: { count: 0, worst: [] },
    }
    const shot = (measures: Partial<PageMeasures>): ReviewScreenshot[] => [
      { path: 'a.jpg', width: 390, height: 844, measures: { ...base, ...measures } },
    ]
    expect(measureFindings(shot({})).length).toBe(0)
    expect(
      measureFindings(shot({ horizontalOverflow: { overflowBy: 80, elements: [] } })).map(
        ({ id, severity }) => `${id}:${severity}`,
      ),
    ).toEqual(['horizontal_overflow:blocking'])
    expect(
      measureFindings(shot({ imagesMissingAlt: { count: 2, examples: ['a.png'] } }))[0]!.id,
    ).toBe('image_alt_missing')
    expect(
      measureFindings(
        shot({
          lowContrast: {
            count: 1,
            worst: [{ selector: 'p', text: 'Hi', ratio: 2.1, required: 4.5 }],
          },
        }),
      )[0]!.evidence,
    ).toContain('2.1:1')
    expect(
      measureFindings(shot({ clippedText: [{ selector: 'h2', text: 'Cut off' }] }))[0]!.id,
    ).toBe('text_clipped')
    expect(
      measureFindings(
        shot({
          overlappingText: [
            { first: { selector: 'h1', text: 'A' }, second: { selector: 'p', text: 'B' } },
          ],
        }),
      )[0]!.id,
    ).toBe('text_overlap')
    // A short h1 at any size, and a footer label at label size, are fine.
    expect(
      measureFindings(
        shot({
          headings: [
            {
              selector: 'h1',
              tag: 'h1',
              text: 'Navalha Fina.',
              fontSize: 150,
              lines: 1,
              inFooter: false,
              top: 0,
            },
            {
              selector: 'footer h2',
              tag: 'h2',
              text: 'Contato',
              fontSize: 20,
              lines: 1,
              inFooter: true,
              top: 900,
            },
          ],
        }),
      ),
    ).toEqual([])
  })
})
