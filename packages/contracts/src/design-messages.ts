import type { MessagePart } from './domain.js'

/**
 * Every message the Design pipeline writes into the chat itself (progress notes, the final
 * answer, the findings, the notices), in English, by code. The server sends the code and its
 * values beside this English text (`Item.parts`); the page translates the code from its own
 * catalog (keys `design.msg.<code>`), and a client that does not know a code shows the English.
 *
 * Placeholders are `{name}`. A message with a count has a `_one` and an `_other` code, and the
 * server picks the form, so the page needs no plural rule of its own. What a model writes for
 * the person (a finding's evidence, a build summary) is never in this table: it travels as a
 * part with no code.
 */
export const DESIGN_MESSAGES = {
  // Progress notes
  'note.briefLocked': 'Brief locked in. Starting the design.',
  'note.notDesign': 'Design mode was turned off because this request is not a website design task.',
  'note.kindReview':
    'This is a review: nothing in the project will be changed. I will open every page, look at the whole of it at desktop and phone widths, and answer with what I find.',
  'note.kindChange':
    'This is a change to what already exists, so I skip the brief, brand and page plan and make the change directly. I will check the result in the browser afterwards.',
  'note.kindLighter':
    'I could not tell whether you want a new design or a change to what is there, so I am taking the lighter path: changing what already exists. Say so if you wanted a new design.',
  'note.noProjectChange':
    'There is no page in this folder to change, so I will build a new one instead.',
  'note.pagesFound_one': 'Found {count} page to check: {list}.',
  'note.pagesFound_other': 'Found {count} pages to check: {list}.',
  'note.reviewing': 'Reviewing {page} ({index} of {count}).',

  // Final answer: how the run ended
  'final.websiteBuilt': 'Website built.',
  'final.dashboardBuilt': 'Dashboard built.',
  'final.changeDone': 'Change made.',
  'final.reviewDone': 'Review finished. Nothing in the project was changed.',
  'final.notFinished_one': 'Not finished: {count} problem remains.',
  'final.notFinished_other': 'Not finished: {count} problems remain.',
  'final.nothingToReview': 'There is no page in this folder to review.',
  'final.filesChangedInReview':
    'The agent changed files during this review although it was told not to: {list}. Check them with your version control before you keep them.',
  'final.previewReady': 'Preview ready at {url}.',
  'final.reviewPassed': 'Visual review passed.',
  'final.reviewPassedAfter_one': 'Visual review passed after {count} repair attempt.',
  'final.reviewPassedAfter_other': 'Visual review passed after {count} repair attempts.',
  'final.reviewPassedCropped':
    'Only the captured part of the page was reviewed: {viewports} ended before the page did, so review the rest yourself.',
  'final.reviewStopped_one':
    'Visual review stopped after {limit} repair attempts with {count} problem remaining.',
  'final.reviewStopped_other':
    'Visual review stopped after {limit} repair attempts with {count} problems remaining.',
  'final.reviewSkippedNoImages':
    'Visual review skipped because the selected provider does not declare image support.',
  'final.reviewSkippedNoWindow':
    'Visual review skipped because no TUIFT Code window was open to take the screenshots.',
  'final.reviewSkipped': 'Visual review skipped because {reason}.',
  'final.pagesChecked_one': 'Checked {count} page:',
  'final.pagesChecked_other': 'Checked {count} pages:',
  'final.pageOk': '\n- {page}: no problems.',
  'final.pageOpen_one': '\n- {page}: {count} problem remains.',
  'final.pageOpen_other': '\n- {page}: {count} problems remain.',
  'final.pagesCut':
    '{total} pages were found and one run checks at most {ceiling}, so these were not checked: {list}. Ask for them in a new request.',
  'final.stillOpen': 'Still open:',
  'final.fullList': 'The full list is in .taste/review.json.',
  'final.scanSkipped':
    'The code quality checks did not run because this folder has too many files to scan.',
  'final.repairs':
    'The model {model} could not satisfy some of the checks of this run, so TUIFT Code completed them itself. The result is what a model of that size could do. Completed by TUIFT Code:',
  'final.repairsDefaultModel':
    'The provider default model could not satisfy some of the checks of this run, so TUIFT Code completed them itself. The result is what a model of that size could do. Completed by TUIFT Code:',
  'final.motionCaptured':
    'To check the movement, TUIFT Code captured {moments} moments of the first screen after load, listed {animations} running animations ({reduced} still running with reduced motion on) and tried hover on {hovers} controls.',
  'final.motionLimit.script_animation':
    'Not verified: animation driven by script (requestAnimationFrame, GSAP) does not appear in the animation list; only the moments show it.',
  'final.motionLimit.click_not_captured':
    'Not verified: states after a click or a key press were not captured.',
  'final.motionLimit.hover_none': 'Not verified: no control on the first screen could be hovered.',
  'final.motionLimit.moments_failed': 'Not verified: the moments after load could not be captured.',

  // Findings
  'review.group.blocking': '\nBlocking:',
  'review.group.major': '\nMajor:',
  'review.group.minor': '\nMinor:',
  'review.reviewSummary_one':
    'Reviewed {pages} page(s) and found {count} problem, most important first.',
  'review.reviewSummary_other':
    'Reviewed {pages} page(s) and found {count} problems, most important first.',
  'review.clean': 'Reviewed {pages} page(s) and found no problems.',
  'review.finding': '\n{n}. {page}, {area}: {evidence} What to do: {repair}',
  'review.finding.empty_region':
    '\n{n}. {page}, {viewport} wide, near "{near}": a band {height}px tall ({percent}% of the window), from {top}px to {bottom}px of the page, has no text, image or control. What to do: make the section as tall as its content needs (remove the fixed or full-window height and the large padding), or bring the content into that space.',
  'review.finding.heading_out_of_scale':
    '\n{n}. {page}, {viewport} wide: "{text}" is set as a heading at {size}px over {lines} line(s), out of scale with its role. What to do: set it at body or label size (an address, hours or a contact line is information, not a heading), or write a short heading and keep the details small beneath it.',
  'review.finding.duplicate_cta':
    '\n{n}. {page}, {viewport} wide: the action "{text}" appears {count} times within one screen. What to do: keep one primary action per screen, or give each a different purpose.',
  'review.finding.horizontal_overflow':
    '\n{n}. {page}, {viewport} wide: the page is {by}px wider than the window. What to do: make the content fit the window width with fluid widths and wrapping.',
  'review.finding.text_clipped':
    '\n{n}. {page}, {viewport} wide: the text "{text}" is cut off by its own box. What to do: let the box grow with its text, or shorten the text.',
  'review.finding.text_overlap':
    '\n{n}. {page}, {viewport} wide: "{first}" lies over "{second}". What to do: give each block its own space in the layout.',
  'review.finding.image_alt_missing':
    '\n{n}. {page}, {viewport} wide: {count} image(s) have no alt text. What to do: give each meaningful image an alt text that says what it shows, and an empty alt to a decorative one.',
  'review.finding.low_contrast':
    '\n{n}. {page}, {viewport} wide: {count} text element(s) are below the contrast WCAG asks for; the worst is "{text}" at {ratio}:1 where {required}:1 is needed. What to do: darken the text or lighten its background.',
  'review.finding.interactive_target_size':
    '\n{n}. {page}: {count} visible control(s) are smaller than 44 by 44 px, for example {example}. What to do: make every visible control at least 44 by 44 px at every width.',
  'review.finding.document_h1_count':
    '\n{n}. {page}, {viewport} wide: the page has {count} h1 headings. What to do: use exactly one h1 per page.',
  'review.finding.font_family_drift':
    '\n{n}. {page}: the code uses fonts outside the approved ones: {list}. What to do: use only the approved typefaces.',
  'review.finding.radius_scale_drift':
    '\n{n}. {page}: the code uses corner radii outside the brand scale: {list}. What to do: use the brand radius tokens.',

  // Repairs the server made when a model could not satisfy a check
  'repair.brief.filled': '\n- Brief: the field "{field}" was filled from your request.',
  'repair.brand.filled': '\n- Brand: the field "{field}" was filled with a plain default.',
  'repair.brand.typeface':
    '\n- Brand: the typeface "{from}" was replaced by "{to}", the one this run was dealt.',
  'repair.brand.palette':
    '\n- Brand: the color palette was replaced by a safe one that passes the contrast checks.',
  'repair.page.reference':
    '\n- Page: section {section} ({family}) was given the reference {id} of its own family.',
  'repair.page.layout': '\n- Page: the {what} of the page plan was corrected.',
  'repair.page.copy': '\n- Page: the {what} copy of section {section} was cleaned.',
  'repair.page.fallback':
    '\n- Page: the model could not write a valid page plan, so TUIFT Code built one from the sections your brief asked for.',
  'repair.page.dropped': '\n- Page: section {section} could not be made valid and was left out.',
  'repair.review.verdict':
    '\n- Review: the verdict was corrected from "{from}" to "{to}" to match its findings.',
  'repair.review.unreadable':
    '\n- Review: the model did not return a readable review, so only the measures of the page itself judged it.',
  'repair.preview.plan':
    '\n- Preview: the model did not return a usable plan, so TUIFT Code started the project itself ({kind}).',
  'repair.build.report':
    '\n- Build: the model did not return its report, so TUIFT Code checked the project itself.',
  'repair.assets.demoted':
    '\n- Assets: {count} image(s) could not be found and were planned as native page elements instead.',
} as const

export type DesignMessageCode = keyof typeof DESIGN_MESSAGES
export type DesignMessageParams = Record<string, string | number>

function format(template: string, params: DesignMessageParams): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : whole,
  )
}

/** The English text of a message with its values filled in. */
export function designMessageText(
  code: DesignMessageCode,
  params: DesignMessageParams = {},
): string {
  return format(DESIGN_MESSAGES[code], params)
}

/** A part of a server-written message: the code, its values and the English text. */
export function designMessagePart(
  code: DesignMessageCode,
  params: DesignMessageParams = {},
): MessagePart {
  return {
    code,
    ...(Object.keys(params).length ? { params } : {}),
    text: designMessageText(code, params),
  }
}

/** Pieces of one message joined by a space; a piece that starts a new line needs no space before it. */
export function joinMessageTexts(texts: readonly string[]): string {
  return texts.reduce(
    (joined, text) =>
      joined === '' || text.startsWith('\n') ? joined + text : `${joined} ${text}`,
    '',
  )
}

/** The text of a message made of parts: each part's text, joined. */
export function joinMessageParts(parts: readonly MessagePart[]): string {
  return joinMessageTexts(parts.map((part) => part.text))
}

/** A part that carries text a model wrote for the person: shown as it is, never translated. */
export function modelTextPart(text: string): MessagePart {
  return { text }
}
