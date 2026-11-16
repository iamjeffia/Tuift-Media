import {
  countDiff,
  DIFF_LIMIT,
  diffCutNote,
  itemTextLimit,
  MAX_DIFF_CHARS,
  MAX_ITEM_OUTPUT_CHARS,
  MAX_MESSAGE_CHARS,
  MAX_PLAN_CHARS,
  MAX_REASONING_CHARS,
  MAX_USER_MESSAGE_CHARS,
  PLAN_LIMIT,
  streamCutMarker,
  USER_MESSAGE_LIMIT,
  type DomainEvent,
  type Item,
  type ItemTextLimit,
  type PlanStep,
} from '@harness/contracts'

/**
 * The most text kept per item, in characters (UTF-16 code units, what `String.length` counts):
 * 64 KiB of machine output (a command's output, a tool's result, an error), 1 MiB of the
 * agent's message, 1 MiB of a diff, 256 KiB of its plan and 256 KiB of its reasoning. A build log, a dev server, a pasted file can go on without
 * end; the row that shows it opens to a `<pre>`, so the text is kept bounded here, before it is
 * stored or sent to a client. The table that says which item has which limit is in
 * `@harness/contracts`, which the renderer reads too.
 */
export {
  MAX_DIFF_CHARS,
  MAX_ITEM_OUTPUT_CHARS,
  MAX_MESSAGE_CHARS,
  MAX_PLAN_CHARS,
  MAX_REASONING_CHARS,
  MAX_USER_MESSAGE_CHARS,
}

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
 * dropped and what the whole diff changes (files, lines added and removed), so the edit card can
 * show the real totals. Whole lines keep every file and hunk header that stays well formed, so the diff still
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
  return `${diff.slice(0, end)}\n${diffCutNote(diff.length - end, countDiff(diff))}`
}

/**
 * The steps of a plan with their text kept inside `max` characters in all: the steps that fit,
 * and the one the limit falls in, cut where the marker says so. Later steps are not kept.
 */
export function elidePlanSteps(steps: readonly PlanStep[], max = MAX_PLAN_CHARS): PlanStep[] {
  let used = 0
  const kept: PlanStep[] = []
  for (const step of steps) {
    const room = max - used
    if (room <= 0) break
    if (step.text.length <= room) {
      kept.push(step)
      used += step.text.length
      continue
    }
    const keep = isHighSurrogate(step.text.charCodeAt(room - 1)) ? room - 1 : room
    kept.push({ ...step, text: step.text.slice(0, keep) + streamCutMarker('plan') })
    break
  }
  return kept
}

function planSize(steps: readonly PlanStep[]): number {
  let size = 0
  for (const step of steps) size += step.text.length
  return size
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
  if (event.type === 'plan.updated') {
    if (!include(PLAN_LIMIT) || planSize(event.steps) <= PLAN_LIMIT.max) return event
    return { ...event, steps: elidePlanSteps(event.steps) }
  }
  if (event.type !== 'item.started' && event.type !== 'item.completed') return event
  const item = boundWith(event.item, include)
  return item === event.item ? event : { ...event, item }
}

/** Whether an item is one of the three kinds that had no limit until the plan, reasoning and user ceilings. */
function isLateLimited(item: Pick<Item, 'type' | 'role'>): boolean {
  return (
    item.type === 'plan' ||
    item.type === 'reasoning' ||
    (item.type === 'message' && item.role === 'user')
  )
}

/**
 * A stored event read back for a client. A plan, a reasoning or a message of the person's saved
 * before those had a ceiling is cut here, with the same marker as a live one, so a chat that holds
 * a text of any size still opens. The database is never rewritten: the full text stays in the log,
 * and only machine output, the agent's message and diffs keep the way they were read before.
 */
export function boundStoredEvent<E extends DomainEvent>(event: E): E {
  if (event.type === 'plan.updated') {
    return planSize(event.steps) <= MAX_PLAN_CHARS
      ? event
      : { ...event, steps: elidePlanSteps(event.steps) }
  }
  if (event.type !== 'item.started' && event.type !== 'item.completed') return event
  const { item } = event
  if (item.text === undefined || !isLateLimited(item)) return event
  const limit = item.type === 'message' ? USER_MESSAGE_LIMIT : itemTextLimit(item)
  if (!limit || item.text.length <= limit.max) return event
  return { ...event, item: { ...item, text: elideText(item.text, limit) } }
}

/** An item with its text bounded; an item with no limit, or under it, is returned as it is. */
export function boundItem(item: Item): Item {
  return boundWith(item, everything)
}

/**
 * An item event, a plan update or a turn's diff, with its text bounded; any other event is returned
 * as it is. What the user typed is never cut here: a send over its ceiling is refused.
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

/**
 * The most one event may weigh once serialized, in bytes. The push channel closes a socket that is
 * sent a frame over 8 MiB, so no event is sent, or stored, above half of that: the other half is
 * the envelope, the sequence and the room for what is already queued.
 */
export const MAX_EVENT_BYTES = 4 * 1024 * 1024

/**
 * Characters up to which an event is not measured. A text at its own ceiling (a 1 MiB message or
 * diff) stays under it, so the hot path never serializes an event twice; past it the event is
 * measured, even though only a text of tabs and control characters weighs more than 4 MiB below it.
 */
const CHEAP_CHARS = 1280 * 1024

/** The longest strings an event is cut to, from the generous to the last resort. */
const STRING_CAPS = [1024 * 1024, 256 * 1024, 64 * 1024, 16 * 1024, 4 * 1024, 1024]

function chars(event: DomainEvent): number {
  switch (event.type) {
    case 'item.delta':
      return event.textDelta.length
    case 'item.started':
    case 'item.completed':
      return (event.item.text?.length ?? 0) + (event.item.command?.length ?? 0)
    case 'diff.updated':
      return event.diff.length
    case 'thread.error':
      return event.message.length
    case 'plan.updated':
      return event.steps.reduce((total, step) => total + step.text.length, 0)
    case 'approval.requested':
    case 'user_input.requested':
    case 'approval.review.started':
    case 'approval.review.completed':
      return JSON.stringify(event).length
    default:
      return 0
  }
}

function capStrings<T>(value: T, max: number, key?: string): T {
  if (typeof value === 'string') {
    if (value.length <= max) return value
    return (key === 'diff' ? elideDiff(value, max) : elideOutput(value, max)) as T
  }
  if (Array.isArray(value)) return value.map((entry: unknown) => capStrings(entry, max)) as T
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [name, entry] of Object.entries(value)) out[name] = capStrings(entry, max, name)
    return out as T
  }
  return value
}

/**
 * The event a frame can carry: the event itself when it fits, otherwise the same event with every
 * long text cut, from the start and the end with a note saying how much was dropped, as far as it
 * takes to fit. A diff keeps only its start. Undefined when nothing short of dropping the event
 * would make it fit (a list of a million entries); the caller then leaves it out.
 */
export function fitEvent(event: DomainEvent, maxBytes = MAX_EVENT_BYTES): DomainEvent | undefined {
  if (chars(event) <= CHEAP_CHARS) return event
  if (Buffer.byteLength(JSON.stringify(event)) <= maxBytes) return event
  for (const cap of STRING_CAPS) {
    const shrunk = capStrings(event, cap) as DomainEvent
    if (Buffer.byteLength(JSON.stringify(shrunk)) <= maxBytes) return shrunk
  }
  return undefined
}

type TrackedItem = { limit: ItemTextLimit | undefined; chars: number; closed: boolean }

/**
 * What stands between a provider's event stream and the log: text stays inside the item that
 * produced it, and stays bounded.
 *
 * - Text of an item that already finished is dropped. A server the agent left running keeps
 *   printing after its turn ends, and the adapter settles it with the turn.
 * - The text of a command, tool call or error is cut to {@link MAX_ITEM_OUTPUT_CHARS}, the
 *   agent's message to {@link MAX_MESSAGE_CHARS}, a diff to {@link MAX_DIFF_CHARS}, its plan to
 *   {@link MAX_PLAN_CHARS} and its reasoning to {@link MAX_REASONING_CHARS}, whether it
 *   arrives whole or as a stream. A stream keeps its start; the item that closes it carries the
 *   start and the end (a diff, only the start) when the provider sends the whole text again.
 *   A provider that resends the whole text so far on each update is bounded on each resend.
 *
 * It never touches what the user typed, nor notices.
 */
export class ItemOutputBounds {
  #items = new Map<string, Map<string, TrackedItem>>()

  /**
   * The event to record, or undefined when nothing of it should be kept. Whatever the kind, an
   * event too heavy for a frame is cut to fit ({@link fitEvent}), so the log never holds one.
   */
  apply(threadId: string, event: DomainEvent): DomainEvent | undefined {
    const bounded = this.#apply(threadId, event)
    return bounded && (fitEvent(bounded) ?? bounded)
  }

  #apply(threadId: string, event: DomainEvent): DomainEvent | undefined {
    if (event.type === 'item.delta') return this.#delta(threadId, event)
    if (event.type === 'diff.updated' || event.type === 'plan.updated') return boundItemEvent(event)
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
