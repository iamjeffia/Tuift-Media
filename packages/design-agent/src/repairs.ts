import { generatePalette } from './palette.js'
import { type BoundaryRecord } from './parse.js'
import { parsePhaseJson } from './phase-json.js'
import { PAGE_LAYOUT_FAMILIES, WEBSITE_LAYOUT_FAMILIES } from './page.js'
import { parsePagePhaseOutput } from './page-phase.js'
import { parseBrandPhaseOutput } from './brand-phase.js'
import { type ReferenceDirection } from './reference-directions.js'
import { type DesignBrief } from './brief.js'
import { type AppDirection } from './app-screens.js'
import { parseReviewPhaseOutput, type VisualReview } from './review-phase.js'
import { type TypographyCandidates, validateTypographySelection } from './typography.js'
import { parseDesignBrief } from './brief.js'
import { lintPageCopy } from './copywriting.js'
import type { PageBlueprint } from './page.js'

/**
 * Deterministic repairs: what the server does when a model cannot satisfy a validation. A repair
 * never touches the validations that protect the person's files or the safety of preview
 * commands; it fixes the model's own plan or report so the run can go on. Every repair is
 * recorded as a note (a code and its values), and a run that needed any says so in its final
 * message with the model it ran on.
 */
export interface RepairNote {
  code: string
  params?: Record<string, string | number> | undefined
}

export interface RepairResult {
  /** The corrected output, as the JSON text the phase parser reads. */
  text: string
  notes: RepairNote[]
}

function lenient(text: string): BoundaryRecord | undefined {
  try {
    const value = parsePhaseJson(text)
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as BoundaryRecord)
      : undefined
  } catch {
    return undefined
  }
}

const isRecord = (value: unknown): value is BoundaryRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const words = (text: string, count: number): string =>
  text.replace(/\s+/g, ' ').trim().split(' ').slice(0, count).join(' ')

// ---------------------------------------------------------------------------------------------
// Brief
// ---------------------------------------------------------------------------------------------

const BRIEF_STRING_FIELDS = [
  'subject',
  'pageType',
  'scope',
  'primaryGoal',
  'audience',
  'offer',
  'primaryAction',
  'creativeControl',
] as const

/**
 * A brief with fields the model left out or emptied. Each is filled from the request itself, so
 * nothing is invented beyond what the person wrote; the rest is the model's own.
 */
export function repairBriefInput(
  value: BoundaryRecord,
  request: string,
): { brief: BoundaryRecord; notes: RepairNote[] } | undefined {
  const notes: RepairNote[] = []
  const brief: BoundaryRecord = { ...value, originalRequest: request, explicitAnswers: [] }
  const subject = words(request, 8)
  const defaults = {
    subject,
    pageType: 'landing_page',
    scope: 'One responsive page that answers the request.',
    primaryGoal: `Present ${subject} clearly and lead the visitor to one action.`,
    audience: 'The people the request is written for.',
    offer: subject,
    primaryAction: 'Contact',
    creativeControl: 'The agent decides, within the request.',
  } satisfies Record<(typeof BRIEF_STRING_FIELDS)[number], string>
  for (const field of BRIEF_STRING_FIELDS) {
    if (typeof brief[field] === 'string' && (brief[field] as string).trim()) continue
    brief[field] = defaults[field]
    notes.push({ code: 'repair.brief.filled', params: { field } })
  }
  for (const field of [
    'requiredContent',
    'constraints',
    'brandInputs',
    'assumptions',
    'unresolved',
  ]) {
    const current = brief[field]
    if (Array.isArray(current) && current.every((entry) => typeof entry === 'string')) continue
    brief[field] = Array.isArray(current)
      ? current.filter((entry): entry is string => typeof entry === 'string')
      : typeof current === 'string' && current.trim()
        ? [current]
        : []
    notes.push({ code: 'repair.brief.filled', params: { field } })
  }
  try {
    parseDesignBrief(brief)
  } catch {
    return undefined
  }
  return { brief, notes }
}

// ---------------------------------------------------------------------------------------------
// Brand
// ---------------------------------------------------------------------------------------------

export interface BrandRepairContext {
  brief: DesignBrief
  candidates?: TypographyCandidates | undefined
  appDirection?: AppDirection | undefined
}

const FALLBACK_ACCENT = '#2F5D50'
const FALLBACK_NEUTRAL = '#5E5A55'

/**
 * A brand answer made valid: a typeface the run was not dealt becomes the first drawn family of
 * its category, a palette recipe the contrast checks block is replaced by a safe one, and a
 * missing text field is filled from the brief. A brand the model wrote with real choices keeps
 * them; only what failed changes.
 */
export function repairBrandOutput(
  text: string,
  context: BrandRepairContext,
): RepairResult | undefined {
  const value = lenient(text)
  if (!value) return undefined
  const notes: RepairNote[] = []
  const brand: BoundaryRecord = { ...value, version: 1 }
  const fill = (path: string[], fallback: string) => {
    let target: BoundaryRecord = brand
    for (const key of path.slice(0, -1)) {
      const next = target[key]
      if (isRecord(next)) target = next
      else {
        const created: BoundaryRecord = {}
        target[key] = created
        target = created
      }
    }
    const last = path.at(-1)!
    if (typeof target[last] === 'string' && (target[last] as string).trim()) return
    target[last] = fallback
    notes.push({ code: 'repair.brand.filled', params: { field: path.join('.') } })
  }
  const subject = context.brief.subject
  fill(['creativeDirection', 'summary'], `A clear, restrained identity for ${subject}.`)
  {
    const direction = brand.creativeDirection as BoundaryRecord
    const traits = direction.traits
    const valid =
      Array.isArray(traits) &&
      traits.length > 0 &&
      traits.every(
        (trait) =>
          isRecord(trait) &&
          typeof trait.quality === 'string' &&
          typeof trait.boundary === 'string',
      )
    if (!valid && !(Array.isArray(direction.keywords) && direction.keywords.length)) {
      direction.traits = [{ quality: 'clear', boundary: 'not generic or decorative' }]
      notes.push({ code: 'repair.brand.filled', params: { field: 'creativeDirection.traits' } })
    }
  }
  fill(['interfaceDirection'], 'Plain, readable interface with generous spacing and one accent.')
  fill(['imageDirection', 'summary'], `Real, honest imagery of ${subject}.`)
  fill(['imageDirection', 'treatment'], 'Natural, uncropped, consistent treatment.')
  fill(['motionDirection', 'summary'], 'Short, eased movement that explains state changes.')
  fill(['voice', 'summary'], 'Direct and plain, in the language of the request.')
  for (const [group, key] of [
    ['creativeDirection', 'avoid'],
    ['imageDirection', 'subjects'],
    ['imageDirection', 'avoid'],
    ['motionDirection', 'avoid'],
    ['voice', 'avoid'],
  ] as const) {
    const parent = isRecord(brand[group]) ? (brand[group] as BoundaryRecord) : {}
    if (!Array.isArray(parent[key])) {
      parent[key] = []
      brand[group] = parent
      notes.push({ code: 'repair.brand.filled', params: { field: `${group}.${key}` } })
    }
  }
  const direction = isRecord(brand.motionDirection) ? (brand.motionDirection as BoundaryRecord) : {}
  if (!(
    typeof direction.principles === 'string' ||
    (Array.isArray(direction.principles) && direction.principles.length)
  )) {
    direction.principles = ['Purpose and trigger; 160-220ms; strong ease-out']
    brand.motionDirection = direction
    notes.push({ code: 'repair.brand.filled', params: { field: 'motionDirection.principles' } })
  }

  // Typefaces: at most two, each from the run's draw unless the person named it.
  const strategy = isRecord(brand.foundation)
    ? (brand.foundation as BoundaryRecord).strategy
    : 'create'
  const candidates =
    strategy === 'create' || strategy === undefined ? context.candidates : undefined
  const faces = Array.isArray(brand.typefaces) ? brand.typefaces.filter(isRecord) : []
  const kept = faces.slice(0, 2).map((face) => ({ ...face }))
  if (candidates) {
    const drawn = new Set(Object.values(candidates).map((families) => families[0]))
    for (const face of kept) {
      const family = typeof face.family === 'string' ? face.family : ''
      if (family && drawn.has(family)) continue
      const rolesText = Array.isArray(face.roles) ? face.roles.join(' ').toLowerCase() : ''
      const category =
        /serif/.test(rolesText) && !/sans/.test(rolesText)
          ? 'serif'
          : /display|heading|title/.test(rolesText)
            ? 'display'
            : /mono|code/.test(rolesText)
              ? 'mono'
              : 'sans'
      const replacement = candidates[category]?.[0] ?? candidates.sans[0]!
      try {
        // The person's own typeface request is kept: the validator knows, so ask it.
        validateTypographySelection(
          context.brief,
          { foundation: { strategy: 'create' }, typefaces: [{ family }] } as never,
          candidates,
          context.appDirection,
        )
        continue
      } catch {
        // Not allowed: replace it.
      }
      notes.push({
        code: 'repair.brand.typeface',
        params: { from: family || '?', to: replacement },
      })
      face.family = replacement
    }
  }
  if (kept.length === 0 && candidates) {
    const family = candidates.sans[0]!
    kept.push({ family, source: 'Google Fonts', roles: ['heading', 'body'], weights: [400, 700] })
    notes.push({ code: 'repair.brand.typeface', params: { from: '-', to: family } })
  }
  for (const face of kept) {
    if (typeof face.source !== 'string' || !face.source.trim()) face.source = 'Google Fonts'
    if (!Array.isArray(face.roles) || face.roles.length === 0) face.roles = ['heading', 'body']
    if (!Array.isArray(face.weights) || face.weights.length === 0) face.weights = [400, 700]
  }
  brand.typefaces = kept

  // Palette: a recipe the checks block is replaced by a quiet, safe one.
  if (brand.paletteRecipe !== undefined && brand.colorPalette === undefined) {
    const result = generatePalette(brand.paletteRecipe)
    if (result.status === 'blocked') {
      const recipe = isRecord(brand.paletteRecipe) ? brand.paletteRecipe : {}
      const light =
        isRecord(recipe.themes) && isRecord((recipe.themes as BoundaryRecord).light)
          ? ((recipe.themes as BoundaryRecord).light as BoundaryRecord)
          : {}
      const accent = typeof light.accentSeed === 'string' ? light.accentSeed : FALLBACK_ACCENT
      const safe = {
        themes: {
          light: { accentSeed: accent, neutralSeed: FALLBACK_NEUTRAL, surfaceContrast: 'quiet' },
        },
      }
      const retry = generatePalette(safe)
      brand.paletteRecipe =
        retry.status === 'blocked'
          ? {
              themes: {
                light: {
                  accentSeed: FALLBACK_ACCENT,
                  neutralSeed: FALLBACK_NEUTRAL,
                  surfaceContrast: 'quiet',
                },
              },
            }
          : safe
      notes.push({ code: 'repair.brand.palette' })
    }
  } else if (brand.paletteRecipe === undefined && !Array.isArray(brand.colorPalette)) {
    brand.paletteRecipe = {
      themes: {
        light: {
          accentSeed: FALLBACK_ACCENT,
          neutralSeed: FALLBACK_NEUTRAL,
          surfaceContrast: 'quiet',
        },
      },
    }
    notes.push({ code: 'repair.brand.palette' })
  }
  try {
    parseBrandPhaseOutput(JSON.stringify(brand))
  } catch {
    return undefined
  }
  return notes.length ? { text: JSON.stringify(brand), notes } : undefined
}

// ---------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------

export interface PageRepairContext {
  deck: readonly ReferenceDirection[]
  suppliedReferenceIds: readonly string[]
  referenceDriven: boolean
  appDirection?: AppDirection | undefined
}

function inferFamily(section: BoundaryRecord, index: number, total: number): string {
  const hint = `${String(section.id ?? '')} ${String(section.purpose ?? '')}`.toLowerCase()
  const table: Array<[RegExp, string]> = [
    [/hero|intro|home|abertura|in[ií]cio/, 'hero'],
    [/footer|rodap/, 'footer'],
    [/contact|contato|visit|visita|local|address|endere/, 'contact'],
    [/faq|pergunta|question/, 'faq'],
    [/price|pricing|pre[cç]o|plano/, 'pricing'],
    [/stat|number|n[uú]mero|dados/, 'stats'],
    [/proof|testimon|depoiment|review|avalia/, 'social_proof'],
    [/step|how|process|como funciona|passo/, 'how_it_works'],
    [/about|sobre|hist[oó]ria|story|quem/, 'about'],
    [/cta|action|encomend|order|agend|book|reserva/, 'cta'],
  ]
  for (const [pattern, family] of table) if (pattern.test(hint)) return family
  if (index === 0) return 'hero'
  if (index === total - 1) return 'footer'
  return 'feature'
}

/**
 * A page blueprint the model got a little wrong, made valid: the reference of the right family
 * is chosen by the server, ids are made unique, dependencies and motion are clamped, a missing
 * route or layout family is inferred, and copy that fails the error-level gate is cleaned. A
 * section that still cannot be made valid is dropped with a note. Never invents a section.
 */
export function repairPageOutput(
  text: string,
  context: PageRepairContext,
): RepairResult | undefined {
  const value = lenient(text)
  if (!value || !Array.isArray(value.sections)) return undefined
  const notes: RepairNote[] = []
  const page: BoundaryRecord = { ...value }
  const pageInfo = isRecord(page.page) ? { ...page.page } : {}
  if (typeof pageInfo.route === 'string' && !pageInfo.route.startsWith('/')) {
    pageInfo.route = `/${pageInfo.route}`
    notes.push({ code: 'repair.page.layout', params: { what: 'route' } })
  }
  page.page = pageInfo

  const deckByFamily = new Map<string, ReferenceDirection>()
  for (const direction of context.deck) {
    if (!deckByFamily.has(direction.family)) deckByFamily.set(direction.family, direction)
  }
  const deckById = new Map(context.deck.map((direction) => [direction.id, direction]))
  const supplied = new Set(context.suppliedReferenceIds)
  const families = context.appDirection ? PAGE_LAYOUT_FAMILIES : WEBSITE_LAYOUT_FAMILIES

  const seen = new Set<string>()
  const sections = (page.sections as unknown[]).filter(isRecord).map((original, index, all) => {
    const section: BoundaryRecord = { ...original }
    // Unique ids.
    let id =
      typeof section.id === 'string' && section.id.trim() ? section.id : `section-${index + 1}`
    if (seen.has(id)) {
      let suffix = 2
      while (seen.has(`${id}-${suffix}`)) suffix += 1
      id = `${id}-${suffix}`
      notes.push({ code: 'repair.page.layout', params: { what: 'ids', section: index + 1 } })
    }
    seen.add(id)
    section.id = id

    if (context.appDirection) {
      section.layoutFamily = 'dashboard'
      if (
        typeof section.referenceDirectionId === 'string' &&
        !supplied.has(section.referenceDirectionId)
      ) {
        delete section.referenceDirectionId
        notes.push({
          code: 'repair.page.reference',
          params: { section: index + 1, family: 'dashboard', id: '-' },
        })
      }
      return section
    }

    // Layout family, then the reference of that family.
    if (!(
      typeof section.layoutFamily === 'string' &&
      (families as readonly string[]).includes(section.layoutFamily)
    )) {
      section.layoutFamily = inferFamily(section, index, all.length)
      notes.push({
        code: 'repair.page.layout',
        params: { what: 'layoutFamily', section: index + 1, family: String(section.layoutFamily) },
      })
    }
    const family = String(section.layoutFamily)
    const current =
      typeof section.referenceDirectionId === 'string' ? section.referenceDirectionId : undefined
    const currentDirection = current ? deckById.get(current) : undefined
    const keepsSupplied = current !== undefined && supplied.has(current)
    if (!keepsSupplied && (!currentDirection || currentDirection.family !== family)) {
      const choice = deckByFamily.get(family)
      if (choice) {
        section.referenceDirectionId = choice.id
        notes.push({
          code: 'repair.page.reference',
          params: { section: index + 1, family, id: choice.id },
        })
      } else if (currentDirection) {
        // The deck has no reference of the family the section claims: the reference the model
        // chose decides the composition, and the family label follows it.
        section.layoutFamily = currentDirection.family
        notes.push({
          code: 'repair.page.layout',
          params: { what: 'layoutFamily', section: index + 1, family: currentDirection.family },
        })
      } else {
        const fallback = deckByFamily.get('feature') ?? context.deck[0]
        if (fallback) {
          section.referenceDirectionId = fallback.id
          section.layoutFamily = fallback.family
          notes.push({
            code: 'repair.page.reference',
            params: { section: index + 1, family: fallback.family, id: fallback.id },
          })
        }
      }
    }
    if (typeof section.referenceDirectionId === 'string' && context.referenceDriven) {
      section.layoutCases = [section.referenceDirectionId]
    }
    return section
  })

  // Dependencies point only at earlier sections.
  const order = sections.map((section) => String(section.id))
  for (const [index, section] of sections.entries()) {
    if (section.dependencies !== undefined) {
      const before = Array.isArray(section.dependencies) ? section.dependencies : []
      const valid = before.filter(
        (dependency): dependency is string =>
          typeof dependency === 'string' &&
          order.indexOf(dependency) >= 0 &&
          order.indexOf(dependency) < index,
      )
      if (valid.length !== before.length || !Array.isArray(section.dependencies)) {
        section.dependencies = valid
        notes.push({
          code: 'repair.page.layout',
          params: { what: 'dependencies', section: index + 1 },
        })
      }
    }
    // Motion: none means no trigger and no time; anything else needs both within bounds.
    if (isRecord(section.motion)) {
      const motion: BoundaryRecord = { ...section.motion }
      const none = motion.purpose === 'none'
      const duration = typeof motion.durationMs === 'number' ? Math.round(motion.durationMs) : 0
      let changed = false
      if (none && (motion.trigger !== 'none' || duration !== 0)) {
        motion.trigger = 'none'
        motion.durationMs = 0
        changed = true
      } else if (!none) {
        if (!motion.trigger || motion.trigger === 'none') {
          motion.trigger = 'scroll_enter'
          changed = true
        }
        const clamped = Math.min(1200, Math.max(80, duration || 320))
        if (clamped !== motion.durationMs) {
          motion.durationMs = clamped
          changed = true
        }
      }
      if (changed) {
        section.motion = motion
        notes.push({ code: 'repair.page.layout', params: { what: 'motion', section: index + 1 } })
      }
    }
  }
  page.sections = sections

  const attempt = (candidate: BoundaryRecord): PageBlueprint | undefined => {
    try {
      return parsePagePhaseOutput(
        JSON.stringify(candidate),
        context.deck,
        [...context.suppliedReferenceIds],
        context.referenceDriven,
        context.appDirection,
      )
    } catch {
      return undefined
    }
  }
  let candidate = page
  let parsed = attempt(candidate)
  // Copy that fails the error gate: clean the exact strings, then try again.
  if (!parsed) {
    const cleaned = cleanCopy(candidate, notes)
    if (cleaned) {
      candidate = cleaned
      parsed = attempt(candidate)
    }
  }
  // A section that cannot be made valid is dropped, never invented around.
  for (let guard = 0; !parsed && guard < 6; guard += 1) {
    let message = ''
    try {
      parsePagePhaseOutput(
        JSON.stringify(candidate),
        context.deck,
        [...context.suppliedReferenceIds],
        context.referenceDriven,
        context.appDirection,
      )
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    const index = /sections\[(\d+)\]/.exec(message)?.[1]
    const list = Array.isArray(candidate.sections) ? (candidate.sections as unknown[]) : []
    if (index === undefined || list.length <= 3) return undefined
    const drop = Number(index)
    candidate = { ...candidate, sections: list.filter((_, position) => position !== drop) }
    notes.push({ code: 'repair.page.dropped', params: { section: drop + 1 } })
    parsed = attempt(candidate)
  }
  if (!parsed || notes.length === 0) return undefined
  return { text: JSON.stringify(candidate), notes }
}

/** Fixes the three copy rules that stop a page: an unevidenced claim, a placeholder, "click here". */
function cleanCopy(page: BoundaryRecord, notes: RepairNote[]): BoundaryRecord | undefined {
  try {
    const blueprint = JSON.parse(JSON.stringify(page)) as PageBlueprint
    const findings = lintPageCopy(blueprint).filter(({ severity }) => severity === 'error')
    if (findings.length === 0) return undefined
    const sections: BoundaryRecord[] = (page.sections as BoundaryRecord[]).map((section) => ({
      ...section,
      copy: isRecord(section.copy) ? { ...section.copy } : section.copy,
    }))
    for (const finding of findings) {
      const match = /^sections\[(\d+)\]\.copy\.(\w+)(?:\[(\d+)\])?/.exec(finding.path)
      if (!match) continue
      const section = sections[Number(match[1])]
      if (!section || !isRecord(section.copy)) continue
      const copy = section.copy
      const field = match[2]
      const position = match[3] === undefined ? undefined : Number(match[3])
      if (finding.rule === 'copy/objective-claim') {
        const evidence = Array.isArray(section.evidence) ? [...section.evidence] : []
        evidence.push('Unverified claim written by the model; confirm it before publishing.')
        section.evidence = evidence
        notes.push({
          code: 'repair.page.copy',
          params: { what: 'claim', section: Number(match[1]) + 1 },
        })
      } else if (finding.rule === 'copy/internal-placeholder') {
        if (field === 'body' && position !== undefined && Array.isArray(copy.body)) {
          copy.body = copy.body.filter((_, entry) => entry !== position)
        } else if (field === 'eyebrow') delete copy.eyebrow
        else if (field === 'heading') copy.heading = words(String(section.purpose ?? 'Section'), 6)
        notes.push({
          code: 'repair.page.copy',
          params: { what: 'placeholder', section: Number(match[1]) + 1 },
        })
      } else if (
        finding.rule === 'copy/generic-cta' &&
        Array.isArray(copy.callsToAction) &&
        position !== undefined
      ) {
        const actions = copy.callsToAction.map((entry) => (isRecord(entry) ? { ...entry } : entry))
        const action = actions[position]
        if (isRecord(action)) action.label = words(String(copy.heading ?? 'Open'), 3)
        copy.callsToAction = actions
        notes.push({
          code: 'repair.page.copy',
          params: { what: 'cta', section: Number(match[1]) + 1 },
        })
      }
    }
    return { ...page, sections }
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------------------------

const SEVERITIES = new Set(['blocking', 'major', 'minor'])

/**
 * A review the model wrote half-right: a pass that lists findings is a repair verdict, a repair
 * with none is a pass, a finding missing a field gets the plain default. An answer that cannot be
 * read at all is "not seen by the model": the measures and the DOM audit still judge the page.
 */
export interface ReviewRepair {
  review: VisualReview
  notes: RepairNote[]
}

export function repairReviewOutput(text: string): ReviewRepair {
  const value = lenient(text)
  const notes: RepairNote[] = []
  // A verdict that is neither pass nor repair says nothing about the page: it is not repaired,
  // it is unreadable, and the retry or the measures take over.
  if (!value || (value.verdict !== 'pass' && value.verdict !== 'repair')) {
    notes.push({ code: 'repair.review.unreadable' })
    return {
      review: {
        version: 1,
        verdict: 'pass',
        summary:
          'The model did not return a readable review; only the measures of the page itself judged it.',
        findings: [],
      },
      notes,
    }
  }
  const rawFindings = Array.isArray(value.findings) ? value.findings.filter(isRecord) : []
  const findings = rawFindings.map((finding, index) => {
    const severity =
      typeof finding.severity === 'string' && SEVERITIES.has(finding.severity)
        ? (finding.severity as 'blocking' | 'major' | 'minor')
        : 'major'
    return {
      id: typeof finding.id === 'string' && finding.id.trim() ? finding.id : `finding_${index + 1}`,
      severity,
      area: typeof finding.area === 'string' && finding.area.trim() ? finding.area : 'page',
      evidenceType:
        finding.evidenceType === 'automated'
          ? ('automated' as const)
          : ('visual_inspection' as const),
      confidence:
        (['high', 'medium', 'low', 'unknown'] as const).find(
          (level) => level === finding.confidence,
        ) ?? 'medium',
      evidence:
        typeof finding.evidence === 'string' && finding.evidence.trim()
          ? finding.evidence
          : 'See the screenshots.',
      repair:
        typeof finding.repair === 'string' && finding.repair.trim()
          ? finding.repair
          : 'Fix what the evidence describes.',
    }
  })
  const verdict = findings.length > 0 ? 'repair' : 'pass'
  if (value.verdict !== verdict) {
    notes.push({
      code: 'repair.review.verdict',
      params: { from: String(value.verdict ?? '-'), to: verdict },
    })
  }
  const review: VisualReview = {
    version: 1,
    verdict,
    summary:
      typeof value.summary === 'string' && value.summary.trim()
        ? value.summary
        : 'Review of the captured screenshots.',
    findings,
  }
  // Round-trip through the strict parser so the result is exactly what the pipeline stores.
  return { review: parseReviewPhaseOutput(JSON.stringify(review)), notes }
}

/**
 * The last resort for a Page phase the model could not complete: a plan built from the sections
 * the brief asked for, each with the reference of its own family. Plain and complete, never
 * clever. Only for runs that use the reviewed reference deck (every new run does).
 */
export function fallbackPageOutput(
  brief: DesignBrief,
  context: PageRepairContext,
): RepairResult | undefined {
  if (context.appDirection || !context.referenceDriven || context.deck.length === 0)
    return undefined
  const wanted = brief.requiredContent.length ? brief.requiredContent.slice(0, 8) : []
  const entries = wanted.length >= 3 ? wanted : ['Introduction', 'About', 'Contact', 'Footer']
  const byFamily = new Map<string, ReferenceDirection>()
  for (const direction of context.deck)
    if (!byFamily.has(direction.family)) byFamily.set(direction.family, direction)
  const sections = entries.map((entry, index) => {
    const family = inferFamily({ id: entry, purpose: entry }, index, entries.length)
    const direction = byFamily.get(family) ?? byFamily.get('feature') ?? context.deck[0]!
    const [heading = entry, ...rest] = entry.split(/[:\u2013-]\s+/u)
    return {
      id: `section-${index + 1}`,
      layoutFamily: direction.family,
      layoutCases: [direction.id],
      referenceDirectionId: direction.id,
      purpose: entry.slice(0, 200),
      userQuestion: entry.slice(0, 200),
      stage: index === 0 ? 'orient' : 'explain',
      dependencies: [],
      evidence: [],
      copy: {
        heading: words(heading, 8),
        body: rest.length ? [words(rest.join(' '), 30)] : [],
        callsToAction:
          index === 0 && brief.primaryAction
            ? [{ label: words(brief.primaryAction, 4), target: '#contact' }]
            : [],
      },
      layout: 'Follow the selected reference.',
      componentNeeds: [],
      assetNeeds: [],
      transformation: {
        compact: 'Single column in source order.',
        medium: 'Reduced simultaneity.',
        expanded: 'The selected reference composition.',
      },
    }
  })
  const plan = {
    version: 1,
    page: {
      title: words(brief.subject, 8),
      route: '/',
      description: words(brief.primaryGoal, 24),
    },
    architecture: {
      contract: words(brief.primaryGoal, 24),
      mode: 'persuade_convert',
      novelty: 'low',
      grid: 'Follow the selected references.',
      signatureRule: 'No signature composition recorded.',
      rhythm: 'Preserve the recorded section order.',
    },
    navigation: [],
    navigationDesign: {
      layoutCase: 'reference-navigation',
      layout: 'Logo at the left, direct links, one primary action.',
      behavior: [],
      transformation: {
        compact: 'Menu button.',
        medium: 'Priority links.',
        expanded: 'All links.',
      },
    },
    sections,
    responsive: [],
    interactions: [],
    acceptanceCriteria: [],
  }
  const text = JSON.stringify(plan)
  try {
    parsePagePhaseOutput(text, context.deck, [...context.suppliedReferenceIds], true)
  } catch {
    // A copy rule or a layout rule still stops it: the model's own answer decides what to do next.
    const repaired = repairPageOutput(text, context)
    return repaired
      ? { text: repaired.text, notes: [{ code: 'repair.page.fallback' }, ...repaired.notes] }
      : undefined
  }
  return { text, notes: [{ code: 'repair.page.fallback' }] }
}
