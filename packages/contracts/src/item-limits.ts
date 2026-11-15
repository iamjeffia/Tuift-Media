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

export type ItemTextLimit = {
  max: number
  /** Names what was cut in the marker: `… output truncated …`. */
  noun: 'output' | 'message' | 'diff'
  /**
   * Keep the start and the end of what is over the limit, or the start only. A diff keeps only
   * its start, cut at a line: a tail would begin inside a file and be counted for another one.
   */
  keepEnd: boolean
}

const OUTPUT_LIMIT: ItemTextLimit = { max: MAX_ITEM_OUTPUT_CHARS, noun: 'output', keepEnd: true }
const MESSAGE_LIMIT: ItemTextLimit = { max: MAX_MESSAGE_CHARS, noun: 'message', keepEnd: true }
export const DIFF_LIMIT: ItemTextLimit = { max: MAX_DIFF_CHARS, noun: 'diff', keepEnd: false }

/**
 * The limit on an item's text, or undefined when it has none: what the user typed, the agent's
 * reasoning and plan, notices.
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
    text.endsWith(streamCutMarker('diff'))
  )
}

const CUT_DIFF_LAST_LINE = /^… \d+ characters omitted …$/

/**
 * A diff that was cut to its limit: its last line says how much was dropped. Every line of a
 * real unified diff starts with a space, +, -, \ or a header, so that line is never a diff's own.
 * What a cut diff leaves is a part of the change, never to be applied or reversed.
 */
export function isCutDiff(diff: string): boolean {
  return CUT_DIFF_LAST_LINE.test(diff.slice(diff.lastIndexOf('\n') + 1))
}
