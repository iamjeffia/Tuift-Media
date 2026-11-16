import type { ReviewScreenshot, VisualReview } from './review-phase.js'

/** What the capture measured in the page itself (the shape of the contract's `PreviewMeasures`). */
export interface PageMeasures {
  documentWidth: number
  documentHeight: number
  bodyFontSize: number
  emptyRegions: Array<{
    top: number
    height: number
    before?: string | undefined
    after?: string | undefined
  }>
  headings: Array<{
    selector: string
    tag: string
    text: string
    fontSize: number
    lines: number
    inFooter: boolean
    top: number
  }>
  duplicateCtas: Array<{ text: string; count: number; top: number }>
  horizontalOverflow?:
    { overflowBy: number; elements: Array<{ selector: string; right: number }> } | undefined
  clippedText: Array<{ selector: string; text: string }>
  overlappingText: Array<{
    first: { selector: string; text: string }
    second: { selector: string; text: string }
  }>
  imagesMissingAlt: { count: number; examples: string[] }
  lowContrast: {
    count: number
    worst: Array<{ selector: string; text: string; ratio: number; required: number }>
  }
  coverage?: 'complete' | 'partial' | undefined
}

type Finding = VisualReview['findings'][number]

/** The ids the measures own: a model's finding with one of them is replaced by the measured one. */
export const MEASURE_FINDING_IDS = [
  'empty_region',
  'heading_out_of_scale',
  'duplicate_cta',
  'horizontal_overflow',
  'text_clipped',
  'text_overlap',
  'image_alt_missing',
  'low_contrast',
] as const

/** A heading in a footer is a label; past this size it is no longer one. */
const FOOTER_HEADING_MAX_PX = 28
/** Any heading but the page title this large, with this many lines, is a sentence set as display. */
const DISPLAY_HEADING_MIN_PX = 40
const LONG_HEADING_LINES = 3
const LONG_HEADING_CHARS = 60

const ADDRESS_LIKE =
  /\b(?:rua|avenida|av\.|alameda|travessa|rodovia|estrada|street|st\.|avenue|ave\.|road|rd\.|calle|carrer|strasse|straße)\b[^,\n]{0,40},?\s*\d{1,5}\b|\b\d{1,5}\b[^,\n]{0,30}\b(?:street|avenue|road)\b|,\s*\d{1,5}\s*[-–]\s*\p{L}/iu

function viewportLabel(screenshot: ReviewScreenshot): string {
  return `${screenshot.width}px`
}

function quote(text: string): string {
  return `"${text.length > 70 ? `${text.slice(0, 67)}...` : text}"`
}

/**
 * The findings the measures of one page prove, with no model in the loop. Thresholds are chosen
 * so that a page a person would call finished does not trip them: the empty band is the one the
 * capture reports (at least 45% of the window, 360 px at the least), a footer heading is a label,
 * and so on. Each finding says where it is and what to do.
 */
export function measureFindings(screenshots: readonly ReviewScreenshot[]): Finding[] {
  const found = new Map<
    string,
    {
      severity: Finding['severity']
      evidence: string[]
      repair: string
      area: string[]
      message: NonNullable<Finding['message']>
    }
  >()
  const add = (
    id: (typeof MEASURE_FINDING_IDS)[number],
    severity: Finding['severity'],
    area: string,
    evidence: string,
    repair: string,
    params: Record<string, string | number>,
  ) => {
    // The first occurrence (the desktop width, first in the list) speaks for the finding.
    const entry = found.get(id) ?? {
      severity,
      evidence: [],
      repair,
      area: [],
      message: { code: `review.finding.${id}`, params },
    }
    if (severity === 'blocking') entry.severity = 'blocking'
    entry.evidence.push(evidence)
    if (!entry.area.includes(area)) entry.area.push(area)
    found.set(id, entry)
  }

  for (const screenshot of screenshots) {
    const measures = screenshot.measures
    if (!measures) continue
    const at = viewportLabel(screenshot)

    for (const region of measures.emptyRegions) {
      const bottom = region.top + region.height
      const context = region.before
        ? ` below ${quote(region.before)}`
        : region.after
          ? ` above ${quote(region.after)}`
          : ''
      add(
        'empty_region',
        region.height >= screenshot.height ? 'blocking' : 'major',
        `${at}, ${region.top}px to ${bottom}px of the page${context}`,
        `${at}: a band ${region.height}px tall (${Math.round((region.height / screenshot.height) * 100)}% of the window) from ${region.top}px to ${bottom}px has no text, image or control${context}`,
        'Make the section as tall as its content needs: remove the fixed or full-window height and the large padding, or bring the content into the empty band, or fill it with the real content the section is for.',
        {
          viewport: at,
          near: region.before ?? region.after ?? '-',
          height: region.height,
          percent: Math.round((region.height / screenshot.height) * 100),
          top: region.top,
          bottom,
        },
      )
    }

    for (const heading of measures.headings) {
      const reasons: string[] = []
      const body = measures.bodyFontSize || 16
      if (heading.inFooter && heading.fontSize > Math.max(FOOTER_HEADING_MAX_PX, body * 1.75)) {
        reasons.push(`a heading in the footer set at ${heading.fontSize}px`)
      }
      if (heading.tag !== 'h1') {
        if (heading.lines >= LONG_HEADING_LINES && heading.fontSize >= DISPLAY_HEADING_MIN_PX) {
          reasons.push(`a ${heading.lines}-line heading set at ${heading.fontSize}px`)
        } else if (
          heading.text.length > LONG_HEADING_CHARS &&
          heading.fontSize >= DISPLAY_HEADING_MIN_PX
        ) {
          reasons.push(
            `a ${heading.text.length}-character sentence set at ${heading.fontSize}px as a heading`,
          )
        }
      }
      if (ADDRESS_LIKE.test(heading.text) && heading.fontSize > FOOTER_HEADING_MAX_PX) {
        reasons.push(`an address set at ${heading.fontSize}px as a heading`)
      }
      if (reasons.length === 0) continue
      add(
        'heading_out_of_scale',
        'major',
        `${at}, ${heading.selector} at ${heading.top}px`,
        `${at}: ${quote(heading.text)} is ${[...new Set(reasons)].join(' and ')}, out of scale with the role it has`,
        'Set this text at body or label size (an address, hours or a contact line is information, not a heading), or write a short heading for the section and keep the details small beneath it.',
        {
          viewport: at,
          text: heading.text.slice(0, 70),
          size: heading.fontSize,
          lines: heading.lines,
        },
      )
    }

    for (const cta of measures.duplicateCtas) {
      add(
        'duplicate_cta',
        'minor',
        `${at}, around ${cta.top}px`,
        `${at}: the action ${quote(cta.text)} appears ${cta.count} times within one screen`,
        'Keep one primary action per screen: remove the repeats or give each a different purpose.',
        { viewport: at, text: cta.text, count: cta.count },
      )
    }

    if (measures.horizontalOverflow) {
      const { overflowBy, elements } = measures.horizontalOverflow
      add(
        'horizontal_overflow',
        'blocking',
        `${at}, page width`,
        `${at}: the page is ${overflowBy}px wider than the window${
          elements.length
            ? `; widest: ${elements
                .slice(0, 3)
                .map((element) => `${element.selector} (to ${element.right}px)`)
                .join(', ')}`
            : ''
        }`,
        'Make the content fit the window width: fluid widths, wrapping, and no fixed widths wider than the screen.',
        { viewport: at, by: overflowBy },
      )
    }

    for (const item of measures.clippedText) {
      add(
        'text_clipped',
        'major',
        `${at}, ${item.selector}`,
        `${at}: the text ${quote(item.text)} is cut off by its own box`,
        'Let the box grow with its text, or shorten the text, so nothing is hidden.',
        { viewport: at, text: item.text.slice(0, 70) },
      )
    }

    for (const pair of measures.overlappingText) {
      add(
        'text_overlap',
        'major',
        `${at}, ${pair.first.selector}`,
        `${at}: ${quote(pair.first.text)} lies over ${quote(pair.second.text)}`,
        'Separate the two blocks: give them their own space in the layout instead of stacking them.',
        {
          viewport: at,
          first: pair.first.text.slice(0, 70),
          second: pair.second.text.slice(0, 70),
        },
      )
    }

    if (measures.imagesMissingAlt.count > 0) {
      add(
        'image_alt_missing',
        'major',
        `${at}, images`,
        `${at}: ${measures.imagesMissingAlt.count} image${measures.imagesMissingAlt.count === 1 ? '' : 's'} with no alt attribute${measures.imagesMissingAlt.examples.length ? ` (${measures.imagesMissingAlt.examples.slice(0, 3).join(', ')})` : ''}`,
        'Give each meaningful image an alt text that says what it shows, and an empty alt for a decorative one.',
        { viewport: at, count: measures.imagesMissingAlt.count },
      )
    }

    if (measures.lowContrast.count > 0) {
      const worst = measures.lowContrast.worst
        .slice(0, 3)
        .map((item) => `${quote(item.text)} ${item.ratio}:1 (needs ${item.required}:1)`)
        .join(', ')
      add(
        'low_contrast',
        'major',
        `${at}, text colors`,
        `${at}: ${measures.lowContrast.count} text element${measures.lowContrast.count === 1 ? '' : 's'} below the contrast WCAG asks for; worst: ${worst}`,
        'Darken the text or lighten its background until body text reaches 4.5:1 and large text 3:1.',
        {
          viewport: at,
          count: measures.lowContrast.count,
          text: measures.lowContrast.worst[0]?.text.slice(0, 70) ?? '',
          ratio: measures.lowContrast.worst[0]?.ratio ?? 0,
          required: measures.lowContrast.worst[0]?.required ?? 4.5,
        },
      )
    }
  }

  return [...found.entries()].map(([id, entry]) => ({
    id,
    severity: entry.severity,
    area: entry.area.slice(0, 3).join('; '),
    evidenceType: 'automated' as const,
    confidence: 'high' as const,
    evidence: entry.evidence.slice(0, 6).join('. '),
    repair: entry.repair,
    message: entry.message,
  }))
}

/**
 * Fails a page on what was measured: the measured findings replace any a model reported under
 * the same id, and a "pass" becomes "repair" when any remain. A model that approved the empty
 * hero or the giant footer heading cannot keep that verdict.
 */
export function enforceMeasureFindings(
  review: VisualReview,
  screenshots: readonly ReviewScreenshot[],
): VisualReview {
  const measured = measureFindings(screenshots)
  const owned = new Set<string>(MEASURE_FINDING_IDS)
  const findings = [...review.findings.filter(({ id }) => !owned.has(id)), ...measured]
  if (measured.length === 0) return review
  return {
    ...review,
    verdict: 'repair',
    summary: `${review.summary} TUIFT Code measured the page itself and found ${measured.length} problem${measured.length === 1 ? '' : 's'}.`,
    findings,
  }
}
