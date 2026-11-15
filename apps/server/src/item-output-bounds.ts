import {
  DIFF_LIMIT,
  itemTextLimit,
  MAX_DIFF_CHARS,
  MAX_ITEM_OUTPUT_CHARS,
  MAX_MESSAGE_CHARS,
  streamCutMarker,
  type DomainEvent,
  type Item,
  type ItemTextLimit,
} from '@harness/contracts'

/**
 * The most text kept per item, in characters (UTF-16 code units, what `String.length` counts):
 * 64 KiB of machine output (a command's output, a tool's result, an error), 1 MiB of the
 * agent's message, 1 MiB of a diff. A build log, a dev server, a pasted file can go on without
 * end; the row that shows it opens to a `<pre>`, so the text is kept bounded here, before it is
 * stored or sent to a client. The table that says which item has which limit is in
 * `@harness/contracts`, which the renderer reads too.
 */
export { MAX_DIFF_CHARS, MAX_ITEM_OUTPUT_CHARS, MAX_MESSAGE_CHARS }

/** Items remembered per chat, so one that finished long ago still refuses late output. */
const TRACKED_ITEMS = 2048

/**
 * Keeps the start and the end of a long text, with a line saying how much was dropped.
 * A quarter is the start, which names the command, the tool and its arguments; the rest
 * is the end, where a failure usually is, and where a message usually has its conclusion.
 */
export function elideOutput(text: string, max = MAX_ITEM_OUTPUT_CHARS): string {
  if (text.length <= max) return text
  let headEnd = Math.floor(max / 4)
  let tailStart = text.length - (max - headEnd)
  // Never cut a surrogate pair in half.
  if (isHighSurrogate(text.charCodeAt(headEnd - 1))) headEnd -= 1
  if (isLowSurrogate(text.charCodeAt(tailStart))) tailStart += 1
  return `${text.slice(0, headEnd)}\n… ${tailStart - headEnd} characters omitted …\n${text.slice(tailStart)}`
}

/**
 * Keeps the start of a long diff, cut at the end of a line, with a last line saying how much was
 * dropped. Whole lines keep every file and hunk header that stays well formed, so the diff still
 * parses; the hunk the cut falls in just ends early. No tail: it would begin inside a file and
 * count its lines for the file before it.
 */
export function elideDiff(diff: string, max = MAX_DIFF_CHARS): string {
  if (diff.length <= max) return diff
  let end = diff.lastIndexOf('\n', max)
  if (end <= 0) {
    // One line longer than the whole limit. Never cut a surrogate pair in half.
    end = max
    if (isHighSurrogate(diff.charCodeAt(end - 1))) end -= 1
  }
  return `${diff.slice(0, end)}\n… ${diff.length - end} characters omitted …`
}

function elideText(text: string, limit: ItemTextLimit): string {
  return limit.keepEnd ? elideOutput(text, limit.max) : elideDiff(text, limit.max)
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff
}

type Include = (limit: ItemTextLimit) => boolean
const everything: Include = () => true
const machineOutput: Include = (limit) => limit.noun === 'output'

function boundWith(item: Item, include: Include): Item {
  const limit = itemTextLimit(item)
  if (!limit || !include(limit) || item.text === undefined) return item
  if (item.text.length <= limit.max) return item
  return { ...item, text: elideText(item.text, limit) }
}

function boundEventWith<E extends DomainEvent>(event: E, include: Include): E {
  if (event.type === 'diff.updated') {
    if (!include(DIFF_LIMIT) || event.diff.length <= DIFF_LIMIT.max) return event
    return { ...event, diff: elideDiff(event.diff) }
  }
  if (event.type !== 'item.started' && event.type !== 'item.completed') return event
  const item = boundWith(event.item, include)
  return item === event.item ? event : { ...event, item }
}

/** An item with its text bounded; an item with no limit, or under it, is returned as it is. */
export function boundItem(item: Item): Item {
  return boundWith(item, everything)
}

/**
 * An item event, or a turn's diff, with its text bounded; any other event is returned as it is.
 * User messages, reasoning and plans have no limit.
 */
export function boundItemEvent<E extends DomainEvent>(event: E): E {
  return boundEventWith(event, everything)
}

/**
 * Only the machine output of {@link boundItemEvent}: what was bounded before messages and diffs
 * were. A saved chat that already holds a longer message or diff is compared against this, so a
 * sync does not rewrite it.
 */
export function boundOutputEvent<E extends DomainEvent>(event: E): E {
  return boundEventWith(event, machineOutput)
}

type TrackedItem = { limit: ItemTextLimit | undefined; chars: number; closed: boolean }

/**
 * What stands between a provider's event stream and the log: text stays inside the item that
 * produced it, and stays bounded.
 *
 * - Text of an item that already finished is dropped. A server the agent left running keeps
 *   printing after its turn ends, and the adapter settles it with the turn.
 * - The text of a command, tool call or error is cut to {@link MAX_ITEM_OUTPUT_CHARS}, the
 *   agent's message to {@link MAX_MESSAGE_CHARS}, a diff to {@link MAX_DIFF_CHARS}, whether it
 *   arrives whole or as a stream. A stream keeps its start; the item that closes it carries the
 *   start and the end (a diff, only the start) when the provider sends the whole text again.
 *   A provider that resends the whole text so far on each update is bounded on each resend.
 *
 * It never touches what the user typed, nor reasoning, plans and notices.
 */
export class ItemOutputBounds {
  #items = new Map<string, Map<string, TrackedItem>>()

  /** The event to record, or undefined when nothing of it should be kept. */
  apply(threadId: string, event: DomainEvent): DomainEvent | undefined {
    if (event.type === 'item.delta') return this.#delta(threadId, event)
    if (event.type === 'diff.updated') return boundItemEvent(event)
    if (event.type !== 'item.started' && event.type !== 'item.completed') return event
    const bounded = boundItemEvent(event)
    const { item } = bounded
    const items = this.#itemsOf(threadId)
    const previous = items.get(item.id)
    items.delete(item.id)
    items.set(item.id, {
      limit: itemTextLimit(item),
      chars: item.text === undefined ? (previous?.chars ?? 0) : item.text.length,
      closed:
        previous?.closed === true || (event.type === 'item.completed' && item.status !== 'started'),
    })
    if (items.size > TRACKED_ITEMS) items.delete(items.keys().next().value!)
    return bounded
  }

  /** Drops what is remembered of a chat that no longer exists. */
  forget(threadId: string): void {
    this.#items.delete(threadId)
  }

  #delta(
    threadId: string,
    event: Extract<DomainEvent, { type: 'item.delta' }>,
  ): DomainEvent | undefined {
    const tracked = this.#items.get(threadId)?.get(event.itemId)
    if (!tracked) return event
    if (tracked.closed) return undefined
    const { limit } = tracked
    if (!limit) return event
    if (tracked.chars >= limit.max) return undefined
    const room = limit.max - tracked.chars
    if (event.textDelta.length < room) {
      tracked.chars += event.textDelta.length
      return event
    }
    tracked.chars = limit.max
    const keep = isHighSurrogate(event.textDelta.charCodeAt(room - 1)) ? room - 1 : room
    return { ...event, textDelta: event.textDelta.slice(0, keep) + streamCutMarker(limit.noun) }
  }

  #itemsOf(threadId: string): Map<string, TrackedItem> {
    let items = this.#items.get(threadId)
    if (!items) {
      items = new Map()
      this.#items.set(threadId, items)
    }
    return items
  }
}
