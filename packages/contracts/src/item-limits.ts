import type { Item } from './domain.js'

/**
 * How much text one item keeps. Counted in characters (UTF-16 code units, what `String.length`
 * reports), the same way for every kind.
 *
 * The server applies these before an item is stored or sent (`item-output-bounds.ts`), and the
 * renderer reads the same table, so the two cannot drift apart.
 */

/** A command's output, a tool's result, an error: what a machine printed. */
export const MAX_ITEM_OUTPUT_CHARS = 64 * 1024
/** The agent's own words in one message. */
export const MAX_MESSAGE_CHARS = 1024 * 1024
/** One diff: a file change item's patch, or a turn's patch. */
export const MAX_DIFF_CHARS = 1024 * 1024
/**
 * The agent's plan, whether it is an item or the steps of a plan update. It is a document the
 * person reads whole; 256 KiB is about 60,000 words.
 */
export const MAX_PLAN_CHARS = 256 * 1024
/**
 * The agent's reasoning in one item. It is drawn as Markdown behind a disclosure and nobody reads
 * a megabyte of it, while every replay of the chat pays for each character.
 */
export const MAX_REASONING_CHARS = 256 * 1024
/**
 * What the person sends in one message, typed or pasted: about 64,000 tokens, more than anyone
 * types and past what a model reads well in one message. Text above it belongs in a file the agent
 * opens itself. Unlike the limits above this one never cuts: the prompt box refuses to send, and
 * the server refuses the call (`userMessageTooLong`).
 */
export const MAX_USER_MESSAGE_CHARS = 256 * 1024

export type ItemTextLimit = {
  max: number
  /** Names what was cut in the marker: `… output truncated …`. */
  noun: 'output' | 'message' | 'diff' | 'plan' | 'reasoning'
  /**
   * Keep the start and the end of what is over the limit, or the start only. A diff keeps only
   * its start, cut at a line: a tail would begin inside a file and be counted for another one.
   */
  keepEnd: boolean
}

const OUTPUT_LIMIT: ItemTextLimit = { max: MAX_ITEM_OUTPUT_CHARS, noun: 'output', keepEnd: true }
const MESSAGE_LIMIT: ItemTextLimit = { max: MAX_MESSAGE_CHARS, noun: 'message', keepEnd: true }
export const DIFF_LIMIT: ItemTextLimit = { max: MAX_DIFF_CHARS, noun: 'diff', keepEnd: false }
export const PLAN_LIMIT: ItemTextLimit = { max: MAX_PLAN_CHARS, noun: 'plan', keepEnd: true }
const REASONING_LIMIT: ItemTextLimit = {
  max: MAX_REASONING_CHARS,
  noun: 'reasoning',
  keepEnd: true,
}
/** Only for a message already stored above the ceiling: a send above it is refused, not cut. */
export const USER_MESSAGE_LIMIT: ItemTextLimit = {
  max: MAX_USER_MESSAGE_CHARS,
  noun: 'message',
  keepEnd: true,
}

/**
 * The limit on an item's text that cuts it, or undefined when it has none: what the user typed
 * (refused above `MAX_USER_MESSAGE_CHARS`, never cut), notices.
 */
export function itemTextLimit(item: Pick<Item, 'type' | 'role'>): ItemTextLimit | undefined {
  switch (item.type) {
    case 'command':
    case 'tool_call':
    case 'error':
      return OUTPUT_LIMIT
    case 'message':
      return item.role === 'user' ? undefined : MESSAGE_LIMIT
    case 'file_change':
      return DIFF_LIMIT
    case 'plan':
      return PLAN_LIMIT
    case 'reasoning':
      return REASONING_LIMIT
    default:
      return undefined
  }
}

/** The line a stream ends with when it reached its limit; the rest of it is not kept. */
export function streamCutMarker(noun: ItemTextLimit['noun']): string {
  return `\n… ${noun} truncated …\n`
}

/** Whether a text ends with a stream's cut marker: the item reached its limit. */
export function endsWithStreamCut(text: string): boolean {
  return (
    text.endsWith(streamCutMarker('output')) ||
    text.endsWith(streamCutMarker('message')) ||
    text.endsWith(streamCutMarker('diff')) ||
    text.endsWith(streamCutMarker('plan')) ||
    text.endsWith(streamCutMarker('reasoning'))
  )
}

/** What a whole diff changes, counted the way the edit card counts the lines it shows. */
export type DiffTotals = { files: number; added: number; removed: number }

/**
 * Counts a diff the way the edit card reads one: a file for each `diff --git` line (one when
 * there is none), a line added or removed for each `+` or `-` that is not a file header. The
 * card reads the diff it is shown, so this must follow its rules line for line.
 */
export function countDiff(diff: string): DiffTotals {
  let files = 0
  let added = 0
  let removed = 0
  let hasFile = false
  // Headers only appear before a file's first hunk; inside a hunk a leading +/- is a change.
  let inHunk = false
  let start = 0
  while (start <= diff.length) {
    let end = diff.indexOf('\n', start)
    if (end < 0) end = diff.length
    if (diff.startsWith('diff --git', start)) {
      files += 1
      hasFile = true
      inHunk = false
    } else if (
      !inHunk &&
      (diff.startsWith('new file mode', start) ||
        diff.startsWith('+++ ', start) ||
        diff.startsWith('--- ', start) ||
        diff.startsWith('index ', start))
    ) {
      // A header line.
    } else if (diff.startsWith('@@', start)) {
      inHunk = true
    } else if (diff.startsWith('+', start) || diff.startsWith('-', start)) {
      if (diff.startsWith('+', start)) added += 1
      else removed += 1
      if (!hasFile) {
        files += 1
        hasFile = true
      }
    }
    start = end + 1
  }
  return { files: files === 0 ? 1 : files, added, removed }
}

/** The last line of a cut diff: how much was dropped, and what the whole diff changes. */
export function diffCutNote(omitted: number, totals: DiffTotals): string {
  const files = `${totals.files} ${totals.files === 1 ? 'file' : 'files'}`
  return `… ${omitted} characters omitted (${files}, +${totals.added} -${totals.removed} in all) …`
}

const CUT_DIFF_LAST_LINE =
  /^… (\d+) characters omitted(?: \((\d+) files?, \+(\d+) -(\d+) in all\))? …$/

/**
 * Reads the note a cut diff ends with: how many characters were dropped and, when the note
 * carries them, the totals of the whole diff. Every line of a real unified diff starts with a
 * space, +, -, \ or a header, so that last line is never a diff's own. Undefined for a diff that
 * was not cut.
 */
export function readDiffCut(diff: string): { omitted: number; totals?: DiffTotals } | undefined {
  const match = CUT_DIFF_LAST_LINE.exec(diff.slice(diff.lastIndexOf('\n') + 1))
  if (!match) return undefined
  const omitted = Number(match[1])
  if (match[2] === undefined) return { omitted }
  return {
    omitted,
    totals: { files: Number(match[2]), added: Number(match[3]), removed: Number(match[4]) },
  }
}

/** A diff cut to its limit: a part of the change, to be shown and never applied. */
export function isCutDiff(diff: string): boolean {
  return readDiffCut(diff) !== undefined
}
