import type { DomainEvent, Item } from '@harness/contracts'

/**
 * The most machine output kept per item: a command's output, a tool's result, an error.
 * A build log or a dev server can print without end; the row that shows it opens to a
 * `<pre>`, so the log is kept bounded here, before it is stored or sent to a client.
 */
export const MAX_ITEM_OUTPUT_CHARS = 64 * 1024
/** Items remembered per chat, so one that finished long ago still refuses late output. */
const TRACKED_ITEMS = 2048
const STREAM_CUT_MARKER = '\n… output truncated …\n'

/** Types whose text is something a machine printed, never the agent's own words. */
const OUTPUT_TYPES: ReadonlySet<Item['type']> = new Set(['command', 'tool_call', 'error'])

/**
 * Keeps the start and the end of a long text, with a line saying how much was dropped.
 * A quarter is the start, which names the command, the tool and its arguments; the rest
 * is the end, where a failure usually is.
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

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff
}

/** An item with its machine output bounded; any other item is returned as it is. */
export function boundItem(item: Item): Item {
  if (!OUTPUT_TYPES.has(item.type) || item.text === undefined) return item
  if (item.text.length <= MAX_ITEM_OUTPUT_CHARS) return item
  return { ...item, text: elideOutput(item.text) }
}

/** An item event with its machine output bounded; any other event is returned as it is. */
export function boundItemEvent<E extends DomainEvent>(event: E): E {
  if (event.type !== 'item.started' && event.type !== 'item.completed') return event
  const item = boundItem(event.item)
  return item === event.item ? event : { ...event, item }
}

type TrackedItem = { type: Item['type']; chars: number; closed: boolean }

/**
 * What stands between a provider's event stream and the log: output stays inside the
 * item that printed it, and stays bounded.
 *
 * - Output of an item that already finished is dropped. A server the agent left running
 *   keeps printing after its turn ends, and the adapter settles it with the turn.
 * - The text of a command, tool call or error is cut to {@link MAX_ITEM_OUTPUT_CHARS},
 *   whether it arrives whole or as a stream. A stream keeps its start; the item that
 *   closes it carries the start and the end.
 *
 * It never touches what the agent says: message and reasoning text pass whole.
 */
export class ItemOutputBounds {
  #items = new Map<string, Map<string, TrackedItem>>()

  /** The event to record, or undefined when nothing of it should be kept. */
  apply(threadId: string, event: DomainEvent): DomainEvent | undefined {
    if (event.type === 'item.delta') return this.#delta(threadId, event)
    if (event.type !== 'item.started' && event.type !== 'item.completed') return event
    const bounded = boundItemEvent(event)
    const { item } = bounded
    const items = this.#itemsOf(threadId)
    const previous = items.get(item.id)
    items.delete(item.id)
    items.set(item.id, {
      type: item.type,
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
    if (!OUTPUT_TYPES.has(tracked.type)) return event
    if (tracked.chars >= MAX_ITEM_OUTPUT_CHARS) return undefined
    const room = MAX_ITEM_OUTPUT_CHARS - tracked.chars
    if (event.textDelta.length < room) {
      tracked.chars += event.textDelta.length
      return event
    }
    tracked.chars = MAX_ITEM_OUTPUT_CHARS
    const keep = isHighSurrogate(event.textDelta.charCodeAt(room - 1)) ? room - 1 : room
    return { ...event, textDelta: event.textDelta.slice(0, keep) + STREAM_CUT_MARKER }
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
