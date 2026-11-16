import { describe, expect, it } from 'vitest'
import { parsePagePhaseOutput } from './page-phase.js'
import { parseBrandPhaseOutput } from './brand-phase.js'
import type { ReferenceDirection } from './reference-directions.js'
import {
  repairBrandOutput,
  repairBriefInput,
  repairPageOutput,
  repairReviewOutput,
} from './repairs.js'
import { parseBriefingOutput } from './workflow.js'

const deck: ReferenceDirection[] = [
  { id: 'hero-a', family: 'hero', imagePath: '/x/hero-a.png', cue: 'hero' },
  { id: 'about-a', family: 'about', imagePath: '/x/about-a.png', cue: 'about' },
  { id: 'feature-a', family: 'feature', imagePath: '/x/feature-a.png', cue: 'feature' },
  { id: 'contact-a', family: 'contact', imagePath: '/x/contact-a.png', cue: 'contact' },
  { id: 'footer-a', family: 'footer', imagePath: '/x/footer-a.png', cue: 'footer' },
]

function section(id: string, family: string, referenceDirectionId: string, extra = {}) {
  return {
    id,
    layoutFamily: family,
    referenceDirectionId,
    purpose: `The ${id} section.`,
    userQuestion: 'Where?',
    stage: 'orient',
    dependencies: [],
    evidence: [],
    copy: { heading: `Heading of ${id}`, body: ['Plain copy.'], callsToAction: [] },
    layout: 'Split.',
    componentNeeds: [],
    assetNeeds: [],
    transformation: { compact: 'a', medium: 'b', expanded: 'c' },
    ...extra,
  }
}

const page = (sections: unknown[]) => ({
  version: 1,
  page: { title: 'Padaria', route: '/', description: 'Pães todos os dias.' },
  architecture: {
    contract: 'This page helps neighbours order bread.',
    mode: 'persuade_convert',
    novelty: 'low',
    grid: '12 columns',
    signatureRule: 'One loaf',
    rhythm: 'Even',
  },
  navigation: [],
  navigationDesign: {
    layoutCase: 'reference-navigation',
    layout: 'Logo left.',
    behavior: [],
    transformation: { compact: 'a', medium: 'b', expanded: 'c' },
  },
  sections,
  responsive: [],
  interactions: [],
  acceptanceCriteria: [],
})

const context = { deck, suppliedReferenceIds: [], referenceDriven: true }

describe('page repair', () => {
  // The diagnosis run on the smallest model: sections[3].referenceDirectionId must belong to contact.
  const failing = page([
    section('hero', 'hero', 'hero-a'),
    section('about', 'about', 'about-a'),
    section('menu', 'feature', 'feature-a'),
    section('contact', 'contact', 'feature-a'),
    section('footer', 'footer', 'footer-a'),
  ])

  it('is needed by the output the small model gave', () => {
    expect(() => parsePagePhaseOutput(JSON.stringify(failing), deck, [], true)).toThrow(
      'sections[3].referenceDirectionId must belong to contact',
    )
  })

  it('picks the reference of the right family itself', () => {
    const repaired = repairPageOutput(JSON.stringify(failing), context)
    expect(repaired).toBeDefined()
    expect(repaired!.notes).toEqual([
      { code: 'repair.page.reference', params: { section: 4, family: 'contact', id: 'contact-a' } },
    ])
    const parsed = parsePagePhaseOutput(repaired!.text, deck, [], true)
    expect(parsed.sections[3]!.referenceDirectionId).toBe('contact-a')
    expect(parsed.sections[3]!.layoutCases).toEqual(['contact-a'])
  })

  it('lets the family follow the reference the model chose when the deck has none of that family', () => {
    // The real diagnosis run: the deck held a cta reference named "contact", and no contact family.
    const smallDeck = deck
      .filter(({ family }) => family !== 'contact')
      .concat([{ id: 'cta-contact', family: 'cta', imagePath: '/x/cta.png', cue: 'cta' }])
    const plan = page([
      section('hero', 'hero', 'hero-a'),
      section('about', 'about', 'about-a'),
      section('menu', 'feature', 'feature-a'),
      section('contact', 'contact', 'cta-contact'),
      section('footer', 'footer', 'footer-a'),
    ])
    const repaired = repairPageOutput(JSON.stringify(plan), { ...context, deck: smallDeck })
    expect(repaired).toBeDefined()
    expect(repaired!.notes).toEqual([
      { code: 'repair.page.layout', params: { what: 'layoutFamily', section: 4, family: 'cta' } },
    ])
    const parsed = parsePagePhaseOutput(repaired!.text, smallDeck, [], true)
    expect(parsed.sections[3]).toMatchObject({
      layoutFamily: 'cta',
      referenceDirectionId: 'cta-contact',
    })
  })

  it('infers a missing family, makes ids unique and clamps motion and dependencies', () => {
    const messy = page([
      section('hero', 'hero', 'hero-a', {
        motion: {
          purpose: 'none',
          trigger: 'load',
          behavior: 'x',
          durationMs: 300,
          easing: 'ease',
          reducedMotion: 'none',
        },
      }),
      section('about', 'about', 'about-a', { dependencies: ['footer', 'hero', 'ghost'] }),
      section('about', 'about', 'about-a', {
        motion: {
          purpose: 'feedback',
          trigger: 'none',
          behavior: 'x',
          durationMs: 5000,
          easing: 'ease',
          reducedMotion: 'none',
        },
      }),
      { ...section('contact-us', 'contact', 'contact-a'), layoutFamily: undefined },
    ])
    const repaired = repairPageOutput(JSON.stringify(messy), context)
    expect(repaired).toBeDefined()
    const parsed = parsePagePhaseOutput(repaired!.text, deck, [], true)
    expect(parsed.sections.map(({ id }) => id)).toEqual(['hero', 'about', 'about-2', 'contact-us'])
    expect(parsed.sections[0]!.motion).toMatchObject({ trigger: 'none', durationMs: 0 })
    expect(parsed.sections[1]!.dependencies).toEqual(['hero'])
    expect(parsed.sections[2]!.motion).toMatchObject({ trigger: 'scroll_enter', durationMs: 1200 })
    expect(parsed.sections[3]!.layoutFamily).toBe('contact')
  })

  it('cleans the copy rules that stop a page', () => {
    const copy = page([
      section('hero', 'hero', 'hero-a', {
        copy: {
          heading: 'Pão quente',
          body: ['lorem ipsum dolor'],
          callsToAction: [{ label: 'click here', target: '#menu' }],
        },
      }),
      section('about', 'about', 'about-a'),
      section('menu', 'feature', 'feature-a'),
    ])
    expect(() => parsePagePhaseOutput(JSON.stringify(copy), deck, [], true)).toThrow(
      'page copy failed',
    )
    const repaired = repairPageOutput(JSON.stringify(copy), context)
    expect(repaired).toBeDefined()
    expect(repaired!.notes.map(({ code }) => code)).toContain('repair.page.copy')
    const parsed = parsePagePhaseOutput(repaired!.text, deck, [], true)
    expect(parsed.sections[0]!.copy.body).toEqual([])
    expect(parsed.sections[0]!.copy.callsToAction[0]!.label).not.toBe('click here')
  })

  it('leaves out a section it cannot make valid, never inventing one', () => {
    const broken = page([
      section('hero', 'hero', 'hero-a'),
      section('about', 'about', 'about-a'),
      section('menu', 'feature', 'feature-a'),
      section('contact', 'contact', 'contact-a'),
      {
        ...section('bad', 'footer', 'footer-a'),
        copy: { heading: 'Footer', body: 'not a list', callsToAction: [] },
      },
    ])
    const repaired = repairPageOutput(JSON.stringify(broken), context)
    expect(repaired).toBeDefined()
    expect(repaired!.notes).toContainEqual({ code: 'repair.page.dropped', params: { section: 5 } })
    expect(parsePagePhaseOutput(repaired!.text, deck, [], true).sections).toHaveLength(4)
  })

  it('returns nothing for text that is not a page', () => {
    expect(repairPageOutput('no json here', context)).toBeUndefined()
    expect(repairPageOutput('{"sections": "nope"}', context)).toBeUndefined()
  })
})

describe('brief repair', () => {
  it('fills what is missing from the request itself', () => {
    const request = 'Crie um site para a padaria Pão de Lenha'
    const fixed = repairBriefInput(
      { subject: 'Padaria Pão de Lenha', requiredContent: 'cardápio' },
      request,
    )
    expect(fixed).toBeDefined()
    expect(fixed!.brief.originalRequest).toBe(request)
    expect(fixed!.brief.subject).toBe('Padaria Pão de Lenha')
    expect(fixed!.brief.requiredContent).toEqual(['cardápio'])
    expect(fixed!.notes.map(({ params }) => params?.field)).toContain('primaryGoal')
  })
})

describe('brand repair', () => {
  const brief = {
    originalRequest: 'Crie um site para a padaria',
    subject: 'Padaria',
    pageType: 'landing_page',
    scope: 's',
    primaryGoal: 'g',
    audience: 'a',
    offer: 'o',
    primaryAction: 'p',
    requiredContent: [],
    constraints: [],
    brandInputs: [],
    creativeControl: 'c',
    explicitAnswers: [],
    assumptions: [],
    unresolved: [],
  }
  const candidates = {
    sans: ['Onest', 'DM Sans'],
    serif: ['Fraunces'],
    display: ['Unbounded'],
    mono: ['Geist Mono'],
  } as never

  it('replaces a typeface the run was not dealt and fills a missing field', () => {
    const answer = {
      version: 1,
      foundation: {
        strategy: 'create',
        existingAssets: [],
        assetActions: [],
        lockedDecisions: [],
        assumptions: [],
      },
      creativeDirection: {
        summary: 'Warm',
        traits: [{ quality: 'warm', boundary: 'not rustic' }],
        avoid: [],
      },
      paletteRecipe: {
        themes: {
          light: { accentSeed: '#C1492E', neutralSeed: '#665A50', surfaceContrast: 'quiet' },
        },
      },
      typefaces: [{ family: 'Inter', source: 'Google Fonts', roles: ['body'], weights: [400] }],
      interfaceDirection: 'Plain',
      imageDirection: { summary: 'Real', subjects: [], treatment: 'Natural', avoid: [] },
      motionDirection: { summary: 'Short', principles: ['Load in 200ms'], avoid: [] },
    }
    const repaired = repairBrandOutput(JSON.stringify(answer), { brief, candidates })
    expect(repaired).toBeDefined()
    expect(repaired!.notes).toContainEqual({
      code: 'repair.brand.typeface',
      params: { from: 'Inter', to: 'Onest' },
    })
    expect(repaired!.notes.map(({ params }) => params?.field)).toContain('voice.summary')
    expect(parseBrandPhaseOutput(repaired!.text).typefaces[0]!.family).toBe('Onest')
  })
})

describe('review repair', () => {
  it('turns a pass that lists findings into a repair verdict', () => {
    const { review, notes } = repairReviewOutput(
      JSON.stringify({
        version: 1,
        verdict: 'pass',
        summary: 'ok',
        findings: [{ id: 'a', severity: 'major', area: 'hero', evidence: 'e', repair: 'r' }],
      }),
    )
    expect(review.verdict).toBe('repair')
    expect(notes).toEqual([
      { code: 'repair.review.verdict', params: { from: 'pass', to: 'repair' } },
    ])
  })

  it('does not read a verdict that is neither pass nor repair', () => {
    expect(repairReviewOutput('{"verdict": "not a review"}').notes).toEqual([
      { code: 'repair.review.unreadable' },
    ])
  })

  it('fills a finding that lacks fields, and passes a repair with none', () => {
    const { review } = repairReviewOutput(
      JSON.stringify({ verdict: 'repair', summary: 's', findings: [{ evidence: 'x' }] }),
    )
    expect(review.findings[0]).toMatchObject({ id: 'finding_1', severity: 'major', area: 'page' })
    expect(
      repairReviewOutput(JSON.stringify({ verdict: 'repair', findings: [] })).review.verdict,
    ).toBe('pass')
  })

  it('leaves the judging to the measures when the answer cannot be read', () => {
    const { review, notes } = repairReviewOutput('The page looks fine to me.')
    expect(review.verdict).toBe('pass')
    expect(notes).toEqual([{ code: 'repair.review.unreadable' }])
  })
})

describe('briefing kind', () => {
  it('reads the kind, and lets a review or a change come without a brief', () => {
    const light = parseBriefingOutput(
      JSON.stringify({
        status: 'complete',
        kind: 'review',
        message: 'ok',
        questions: [],
        brief: null,
      }),
    )
    expect(light).toMatchObject({ status: 'complete', kind: 'review', brief: null })
  })

  it('does not accept a missing brief for a build', () => {
    expect(() =>
      parseBriefingOutput(
        JSON.stringify({
          status: 'complete',
          kind: 'build',
          message: 'ok',
          questions: [],
          brief: null,
        }),
      ),
    ).toThrow('must contain a brief')
  })
})
