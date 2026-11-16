import { describe, expect, it, vi } from 'vitest'
import { designBriefingPrompt, parseBriefingOutput } from './workflow.js'
import { designBuildPrompt, parseBuildPhaseOutput } from './build-phase.js'
import {
  designAuditPrompt,
  designChangePrompt,
  designChangeRepairPrompt,
  designChangeReviewPrompt,
  reviewAttachments,
} from './light-phases.js'
import { designPreviewPrompt, parsePreviewPhaseOutput } from './preview.js'
import {
  designRepairPrompt,
  designReviewPrompt,
  parseRepairPhaseOutput,
  parseReviewPhaseOutput,
  type ReviewScreenshot,
} from './review-phase.js'
import { DESIGN_PACK_NOTE } from './skills-note.js'

vi.mock('./dashboard-references.js', () => ({ DASHBOARD_REFERENCES_ENABLED: true }))

const brief = {
  originalRequest: 'Build a page.',
  subject: 'Coffee',
  pageType: 'Landing page',
  scope: 'One page',
  primaryGoal: 'Sell coffee',
  audience: 'Home brewers',
  offer: 'Fresh coffee',
  primaryAction: 'Buy',
  requiredContent: [],
  constraints: [],
  brandInputs: [],
  creativeControl: 'Agent decides',
  explicitAnswers: [],
  assumptions: [],
  unresolved: [],
}
const brand = {
  version: 1 as const,
  foundation: {
    strategy: 'create' as const,
    existingAssets: [],
    assetActions: [],
    lockedDecisions: [],
    assumptions: [],
  },
  creativeDirection: {
    summary: 'Warm.',
    traits: [],
    productiveTension: 'x',
    signatureDevice: { description: 'd', status: 'candidate' as const, invariants: [] },
    restraint: 'r',
    avoid: [],
  },
  colorPalette: [{ name: 'Ink', value: '#111', usage: 'Text' }],
  typefaces: [{ family: 'Geist', source: 'Project', roles: ['UI'], weights: [500] }],
  interfaceDirection: 'Editorial.',
  imageDirection: { summary: 'Product.', subjects: [], treatment: 'Warm.', avoid: [] },
  motionDirection: { summary: 'Tactile.', principles: [], avoid: [] },
  voice: { summary: 'Direct.', avoid: [] },
}
const page = {
  version: 1 as const,
  page: { title: 'Coffee', route: '/', description: 'Fresh coffee.' },
  architecture: {
    contract: 'c',
    mode: 'persuade_convert' as const,
    novelty: 'medium' as const,
    grid: 'g',
    signatureRule: 's',
    rhythm: 'r',
  },
  navigation: [],
  sections: [],
  responsive: [],
  interactions: [],
  acceptanceCriteria: [],
}

const shots: ReviewScreenshot[] = [
  {
    path: '/tmp/1440x1000.jpg',
    width: 1440,
    height: 1000,
    documentHeight: 3000,
    capturedHeight: 3000,
    tiles: [
      { path: '/tmp/1440x1000-01.jpg', top: 0, height: 1000 },
      { path: '/tmp/1440x1000-02.jpg', top: 1000, height: 1000 },
      { path: '/tmp/1440x1000-03.jpg', top: 2000, height: 1000 },
    ],
    measures: {
      documentWidth: 1440,
      documentHeight: 3000,
      bodyFontSize: 16,
      emptyRegions: [{ top: 300, height: 500, before: 'Navalha Fina.' }],
      headings: [],
      duplicateCtas: [],
      clippedText: [],
      overlappingText: [],
      imagesMissingAlt: { count: 0, examples: [] },
      lowContrast: { count: 0, worst: [] },
    },
  },
  { path: '/tmp/390x844.jpg', width: 390, height: 844, documentHeight: 844, capturedHeight: 844 },
]

describe('skills by phase', () => {
  it('lets the phases that write the interface use the Design pack', () => {
    expect(DESIGN_PACK_NOTE).toContain('Design skill pack')
    expect(designChangePrompt({ request: 'Add a hover.', motion: true })).toContain(
      DESIGN_PACK_NOTE,
    )
    expect(
      designChangeRepairPrompt(
        {
          version: 1,
          verdict: 'repair',
          summary: 's',
          findings: [
            {
              id: 'a',
              severity: 'major',
              area: 'x',
              evidenceType: 'automated',
              confidence: 'high',
              evidence: 'e',
              repair: 'r',
            },
          ],
        },
        1,
        2,
        'Add a hover.',
      ),
    ).toContain(DESIGN_PACK_NOTE)
    const build = designBuildPrompt(brief, brand, page, { version: 1, assets: [] })
    expect(build).toContain(DESIGN_PACK_NOTE)
    expect(build).not.toContain('without invoking external design skills')
    const repair = designRepairPrompt(
      {
        version: 1,
        verdict: 'repair',
        summary: 's',
        findings: [
          {
            id: 'a',
            severity: 'major',
            area: 'x',
            evidenceType: 'automated',
            confidence: 'high',
            evidence: 'e',
            repair: 'r',
          },
        ],
      },
      1,
      2,
      brief,
      brand,
      page,
    )
    expect(repair).toContain(DESIGN_PACK_NOTE)
  })

  it('keeps the phases that must answer strict JSON refusing skills', () => {
    expect(designBriefingPrompt('Make a site.')).toContain(
      'Do not browse or invoke external design skills.',
    )
    expect(designBriefingPrompt('Make a site.')).not.toContain(DESIGN_PACK_NOTE)
    for (const prompt of [
      designAuditPrompt({
        request: 'Review it.',
        page: '/',
        pageNumber: 1,
        pageCount: 1,
        screenshots: shots,
      }),
      designChangeReviewPrompt({
        request: 'Add a hover.',
        changeSummary: 'done',
        page: '/',
        pageNumber: 1,
        pageCount: 1,
        screenshots: shots,
      }),
      designReviewPrompt(brief, brand, page, shots),
    ]) {
      expect(prompt).toMatch(/do not invoke external design skills/i)
      expect(prompt).not.toContain(DESIGN_PACK_NOTE)
    }
    expect(designPreviewPrompt()).not.toContain(DESIGN_PACK_NOTE)
  })

  it('still parses the JSON each of those phases answers with', () => {
    expect(
      parseBriefingOutput(
        JSON.stringify({
          status: 'complete',
          kind: 'change',
          message: 'ok',
          questions: [],
          brief: null,
        }),
      ).status,
    ).toBe('complete')
    expect(
      parseReviewPhaseOutput(
        JSON.stringify({
          version: 1,
          verdict: 'repair',
          summary: 'Hero is empty.',
          findings: [
            { id: 'hero_empty', severity: 'major', area: 'hero', evidence: 'e', repair: 'r' },
          ],
        }),
      ).verdict,
    ).toBe('repair')
    expect(
      parseRepairPhaseOutput(
        '{"status":"complete","summary":"Added","files":["styles.css"],"checks":[]}',
      ).files,
    ).toEqual(['styles.css'])
    expect(
      parseBuildPhaseOutput(
        '{"status":"complete","summary":"Built","files":["index.html"],"checks":[]}',
      ).status,
    ).toBe('complete')
    expect(
      parsePreviewPhaseOutput(
        '{"version":1,"kind":"static","entry":"index.html","cwd":".","url":"http://127.0.0.1:4173/","viewports":[{"name":"desktop","width":1440,"height":1000},{"name":"mobile","width":390,"height":844}]}',
      ).kind,
    ).toBe('static')
  })
})

describe('the review request', () => {
  it('forbids changing any file and asks for findings by importance, each with a place and a fix', () => {
    const prompt = designAuditPrompt({
      request: 'Revise esta página e me diga o que está errado.',
      page: '/cardapio.html',
      pageNumber: 2,
      pageCount: 3,
      screenshots: shots,
    })
    expect(prompt).toContain('Nothing in the project may change')
    expect(prompt).toContain('Do not edit, create or delete any file')
    expect(prompt).toContain('page 2 of 3: /cardapio.html')
    expect(prompt).toContain('blocking first, then major, then minor')
    expect(prompt).toContain('where it is')
    expect(prompt).toContain('Look at every piece of every width, top to bottom')
    expect(prompt).toContain('"emptyRegions"')
    expect(prompt).toContain('1440x1000-02.jpg')
  })

  it('attaches the pieces of a tall page, and the single image of a short one', () => {
    expect(reviewAttachments(shots)).toEqual([
      '/tmp/1440x1000-01.jpg',
      '/tmp/1440x1000-02.jpg',
      '/tmp/1440x1000-03.jpg',
      '/tmp/390x844.jpg',
    ])
  })
})

describe('the change request', () => {
  it('skips the plan phases and asks for the animation checks it will be given', () => {
    const prompt = designChangePrompt({ request: 'Acrescente uma animação.', motion: true })
    expect(prompt).toContain('There is no brief, brand or page plan to write')
    expect(prompt).toContain('prefers-reduced-motion')
    expect(prompt).toContain('several moments after load')
  })

  it('judges movement by the evidence and says what could not be verified', () => {
    const prompt = designChangeReviewPrompt({
      request: 'Acrescente uma animação.',
      changeSummary: 'Added a fade-in.',
      page: '/',
      pageNumber: 1,
      pageCount: 1,
      screenshots: [
        {
          ...shots[0]!,
          motion: {
            moments: [{ atMs: 0, path: '/tmp/moment-1.jpg' }],
            animations: [{ name: 'fade-in', target: 'h1', durationMs: 600, iterations: 1 }],
            animationCount: 1,
            reducedMotionAnimationCount: 0,
            hovers: [],
            limits: ['script_animation'],
          },
        },
      ],
    })
    expect(prompt).toContain('<motion-evidence>')
    expect(prompt).toContain('fade-in')
    expect(prompt).toContain(
      'say, in one or two sentences, what was verified this way and what could not be',
    )
  })
})
