import {
  DESIGN_MESSAGES,
  designMessagePart,
  joinMessageParts,
  modelTextPart,
  type DesignMessageCode,
  type MessagePart,
} from '@harness/contracts'
import type { DesignRequestKind, RepairNote, VisualReview } from '@harness/design-agent'

/**
 * The messages the Design pipeline writes into the chat itself: its progress notes, the answer
 * to a review, and the closing summary of a build, a redesign or a change. Each piece is a
 * message of the app's own catalog with its values (so the page says it in the reader's
 * language) or text a model wrote for the person (shown as it is). See `DESIGN_MESSAGES`.
 */

export type DesignFinding = VisualReview['findings'][number]

export interface PageFinding {
  route: string
  finding: DesignFinding
}

export interface FinalInput {
  kind: DesignRequestKind
  dashboard: boolean
  previewUrl?: string | undefined
  /** The visual review did not run: why. `other` carries the reason's own words (English). */
  skipped?: { reason: 'no_images' | 'no_window' | 'other'; text?: string } | undefined
  repairAttempt: number
  repairLimit: number
  /** Every page that was reviewed, in order, with the findings still open on it. */
  pages: ReadonlyArray<{ route: string; open: number; summary?: string | undefined }>
  pageCeiling: number
  pagesFound: number
  pagesCut: readonly string[]
  openFindings: readonly PageFinding[]
  cropped: readonly string[]
  scanSkipped: boolean
  /** What Build reported, in the person's language (a model wrote it). */
  buildSummary?: string | undefined
  /** What the change agent reported, in the person's language (a model wrote it). */
  changeSummary?: string | undefined
  repairNotes: readonly RepairNote[]
  /** The model the run used, when the chat chose one. */
  model?: string | undefined
  motion?:
    | {
        moments: number
        animations: number
        reduced: number
        hovers: number
        limits: readonly string[]
      }
    | undefined
  /** Files that changed during a review, which may not change any. */
  filesChangedInReview?: readonly string[] | undefined
}

const SEVERITY_ORDER = {
  blocking: 0,
  major: 1,
  minor: 2,
} satisfies Record<DesignFinding['severity'], number>

/** The part for a count: `_one` when it is 1, `_other` otherwise. */
function counted(
  base:
    | 'final.notFinished'
    | 'final.reviewPassedAfter'
    | 'final.reviewStopped'
    | 'final.pagesChecked'
    | 'final.pageOpen'
    | 'review.reviewSummary'
    | 'note.pagesFound',
  count: number,
  params: Record<string, string | number> = {},
): MessagePart {
  const code = `${base}_${count === 1 ? 'one' : 'other'}` as DesignMessageCode
  return designMessagePart(code, { ...params, count })
}

/** A message part, from a code the table may not know (an older or newer finding's code). */
function knownPart(code: string, params: Record<string, string | number>): MessagePart | undefined {
  return Object.hasOwn(DESIGN_MESSAGES, code)
    ? designMessagePart(code as DesignMessageCode, params)
    : undefined
}

/** One finding as a numbered line of the chat. */
export function findingPart(n: number, route: string, finding: DesignFinding): MessagePart {
  if (finding.message) {
    const coded = knownPart(finding.message.code, { ...finding.message.params, n, page: route })
    if (coded) return coded
  }
  return designMessagePart('review.finding', {
    n,
    page: route,
    area: finding.area,
    evidence: finding.evidence,
    repair: finding.repair,
  })
}

/** Most important first; findings of one importance stay in page order. */
export function sortedFindings(findings: readonly PageFinding[]): PageFinding[] {
  return findings
    .map((entry, index) => ({ entry, index }))
    .sort(
      (left, right) =>
        SEVERITY_ORDER[left.entry.finding.severity] -
          SEVERITY_ORDER[right.entry.finding.severity] || left.index - right.index,
    )
    .map(({ entry }) => entry)
}

function repairParts(input: FinalInput): MessagePart[] {
  if (input.repairNotes.length === 0) return []
  const intro = input.model
    ? designMessagePart('final.repairs', { model: input.model })
    : designMessagePart('final.repairsDefaultModel')
  const lines = input.repairNotes.map((note) => {
    const coded = knownPart(note.code, note.params ?? {})
    return coded ?? modelTextPart(`\n- ${note.code}`)
  })
  return [intro, ...lines]
}

function pagesCutPart(input: FinalInput): MessagePart[] {
  if (input.pagesCut.length === 0) return []
  return [
    designMessagePart('final.pagesCut', {
      total: input.pagesFound,
      ceiling: input.pageCeiling,
      list: input.pagesCut.join(', '),
    }),
  ]
}

function motionParts(input: FinalInput): MessagePart[] {
  if (!input.motion) return []
  const parts: MessagePart[] = [
    designMessagePart('final.motionCaptured', {
      moments: input.motion.moments,
      animations: input.motion.animations,
      reduced: input.motion.reduced,
      hovers: input.motion.hovers,
    }),
  ]
  for (const limit of input.motion.limits) {
    const part = knownPart(`final.motionLimit.${limit}`, {})
    if (part) parts.push(part)
  }
  return parts
}

/** The answer to a review request: no file changed, the findings most important first. */
function reviewAnswer(input: FinalInput): MessagePart[] {
  const parts: MessagePart[] = [designMessagePart('final.reviewDone')]
  if (input.filesChangedInReview?.length) {
    parts.push(
      designMessagePart('final.filesChangedInReview', {
        list: input.filesChangedInReview.slice(0, 12).join(', '),
      }),
    )
  }
  const findings = sortedFindings(input.openFindings)
  const pages = input.pages.length
  if (findings.length === 0) {
    parts.push(designMessagePart('review.clean', { pages }))
  } else {
    parts.push(counted('review.reviewSummary', findings.length, { pages }))
    let group: DesignFinding['severity'] | undefined
    findings.forEach(({ route, finding }, index) => {
      if (finding.severity !== group) {
        group = finding.severity
        parts.push(designMessagePart(`review.group.${group}` as DesignMessageCode))
      }
      parts.push(findingPart(index + 1, route, finding))
    })
  }
  // What each page's review said about what the screenshots could and could not show.
  for (const page of input.pages) {
    if (page.summary) parts.push(modelTextPart(`\n- ${page.route}: ${page.summary}`))
  }
  parts.push(...pagesCutPart(input), ...repairParts(input))
  return parts
}

/** The closing message of a build, a redesign or a change. */
function builtAnswer(input: FinalInput): MessagePart[] {
  const parts: MessagePart[] = []
  const open = input.openFindings.length
  parts.push(
    designMessagePart(
      input.kind === 'change'
        ? 'final.changeDone'
        : input.dashboard
          ? 'final.dashboardBuilt'
          : 'final.websiteBuilt',
    ),
  )
  // A page is never called finished while findings remain: the count follows at once.
  if (open > 0) parts.push(counted('final.notFinished', open))
  if (input.previewUrl)
    parts.push(designMessagePart('final.previewReady', { url: input.previewUrl }))
  if (input.skipped) {
    parts.push(
      input.skipped.reason === 'no_images'
        ? designMessagePart('final.reviewSkippedNoImages')
        : input.skipped.reason === 'no_window'
          ? designMessagePart('final.reviewSkippedNoWindow')
          : designMessagePart('final.reviewSkipped', { reason: input.skipped.text ?? '' }),
    )
  } else if (open === 0) {
    parts.push(
      input.repairAttempt > 0
        ? counted('final.reviewPassedAfter', input.repairAttempt)
        : designMessagePart('final.reviewPassed'),
    )
    if (input.cropped.length) {
      parts.push(
        designMessagePart('final.reviewPassedCropped', { viewports: input.cropped.join(', ') }),
      )
    }
  } else if (input.repairAttempt >= input.repairLimit) {
    parts.push(counted('final.reviewStopped', open, { limit: input.repairLimit }))
  }
  if (input.pages.length > 1) {
    parts.push(counted('final.pagesChecked', input.pages.length))
    for (const page of input.pages) {
      parts.push(
        page.open === 0
          ? designMessagePart('final.pageOk', { page: page.route })
          : counted('final.pageOpen', page.open, { page: page.route }),
      )
    }
  }
  parts.push(...pagesCutPart(input))
  if (open > 0) {
    parts.push(designMessagePart('final.stillOpen'))
    sortedFindings(input.openFindings)
      .slice(0, 8)
      .forEach(({ route, finding }, index) => parts.push(findingPart(index + 1, route, finding)))
    parts.push(designMessagePart('final.fullList'))
  }
  parts.push(...motionParts(input))
  if (input.scanSkipped) parts.push(designMessagePart('final.scanSkipped'))
  parts.push(...repairParts(input))
  const summary = input.kind === 'change' ? input.changeSummary : input.buildSummary
  if (summary) parts.push(modelTextPart(summary))
  return parts
}

export function finalMessageParts(input: FinalInput): MessagePart[] {
  // A review that could not look at the page has no findings to give, and says why.
  if (input.kind === 'review' && input.skipped) {
    return [
      input.skipped.reason === 'no_images'
        ? designMessagePart('final.reviewSkippedNoImages')
        : input.skipped.reason === 'no_window'
          ? designMessagePart('final.reviewSkippedNoWindow')
          : designMessagePart('final.reviewSkipped', { reason: input.skipped.text ?? '' }),
      ...repairParts(input),
    ]
  }
  return input.kind === 'review' ? reviewAnswer(input) : builtAnswer(input)
}

export function finalMessageText(input: FinalInput): string {
  return joinMessageParts(finalMessageParts(input))
}

/** A progress note: one catalog message. */
export interface DesignNote {
  text: string
  parts: MessagePart[]
}

export function designNote(
  code: DesignMessageCode,
  params: Record<string, string | number> = {},
): DesignNote {
  const part = designMessagePart(code, params)
  return { text: part.text, parts: [part] }
}
