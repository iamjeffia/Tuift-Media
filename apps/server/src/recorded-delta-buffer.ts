import type { DomainEvent } from '@harness/contracts'
import { classifyWriteFailure } from './write-failure.js'

const DEFAULT_DELAY_MS = 4
const DEFAULT_MAXIMUM_TEXT_LENGTH = 64 * 1024
const DEFAULT_MAXIMUM_EVENT_COUNT = 256
const RETRY_DELAY_MS = 1_000
/** A locked file is tried again this many times, a second apart, before the text is given up. */
const DEFAULT_MAXIMUM_RETRIES = 3

export type ItemDeltaEvent = Extract<DomainEvent, { type: 'item.delta' }>
export type RecordedDelta = { threadId: string; event: ItemDeltaEvent }

type RecordedDeltaBufferOptions = {
  delayMs?: number
  maximumTextLength?: number
  maximumEventCount?: number
  /** Must commit atomically: a failed batch stays buffered for retry. */
  commitBatch?: (records: RecordedDelta[]) => void
  /**
   * Called when a failed write is not worth another try: the disk is full, something else is
   * wrong, or a lock outlasted `maximumRetries`. The buffered text of those chats is dropped
   * first, so the caller can end their turns. Without it, a failed write is retried for ever.
   */
  onGiveUp?: (threadIds: string[], error: unknown) => void
  maximumRetries?: number
}

type PendingDelta = {
  turnId: string
  itemId: string
  text: string
  eventCount: number
}

/**
 * Coalesce adjacent provider text deltas before they reach SQLite and the
 * WebSocket. The renderer already paints at frame cadence, so persisting and
 * sending every provider fragment only adds work and makes histories larger.
 */
export class RecordedDeltaBuffer {
  #pending = new Map<string, PendingDelta>()
  #timer: ReturnType<typeof setTimeout> | undefined
  readonly #delayMs: number
  readonly #maximumTextLength: number
  readonly #maximumEventCount: number
  readonly #commitBatch: ((records: RecordedDelta[]) => void) | undefined
  readonly #onGiveUp: ((threadIds: string[], error: unknown) => void) | undefined
  readonly #maximumRetries: number
  #failures = 0

  constructor(
    private readonly commit: (threadId: string, event: ItemDeltaEvent) => void,
    options: RecordedDeltaBufferOptions = {},
  ) {
    this.#delayMs = options.delayMs ?? DEFAULT_DELAY_MS
    this.#maximumTextLength = options.maximumTextLength ?? DEFAULT_MAXIMUM_TEXT_LENGTH
    this.#maximumEventCount = options.maximumEventCount ?? DEFAULT_MAXIMUM_EVENT_COUNT
    this.#commitBatch = options.commitBatch
    this.#onGiveUp = options.onGiveUp
    this.#maximumRetries = options.maximumRetries ?? DEFAULT_MAXIMUM_RETRIES
  }

  push(threadId: string, event: ItemDeltaEvent): void {
    let pending = this.#pending.get(threadId)
    if (pending && (pending.turnId !== event.turnId || pending.itemId !== event.itemId)) {
      this.flush(threadId)
      pending = undefined
    }

    if (!pending) {
      pending = {
        turnId: event.turnId,
        itemId: event.itemId,
        text: event.textDelta,
        eventCount: 1,
      }
      this.#pending.set(threadId, pending)
      this.#schedule()
    } else {
      pending.text += event.textDelta
      pending.eventCount += 1
    }

    if (
      pending.text.length >= this.#maximumTextLength ||
      pending.eventCount >= this.#maximumEventCount
    ) {
      // The stream goes on: a failed write keeps the text and is retried from the timer, which
      // does not hold up the events that follow.
      try {
        this.flush(threadId)
      } catch (error) {
        this.#failedWindow(error)
      }
    }
  }

  flush(threadId: string): void {
    const pending = this.#pending.get(threadId)
    if (!pending) return
    this.#commit(threadId, pending)
    this.#pending.delete(threadId)
    if (this.#pending.size === 0) this.#clearTimer()
  }

  flushAll(): void {
    this.#clearTimer()
    try {
      this.#commitPending()
    } catch (error) {
      this.#schedule(RETRY_DELAY_MS)
      throw error
    }
  }

  discard(threadId: string): void {
    if (!this.#pending.delete(threadId)) return
    if (this.#pending.size === 0) this.#clearTimer()
  }

  discardAll(): void {
    this.#pending.clear()
    this.#clearTimer()
  }

  #schedule(delay = this.#delayMs): void {
    this.#timer ??= setTimeout(() => this.#flushWindow(), delay)
  }

  #flushWindow(): void {
    this.#timer = undefined
    try {
      this.#commitPending()
      this.#failures = 0
    } catch (error) {
      this.#failedWindow(error)
    }
  }

  #failedWindow(error: unknown): void {
    this.#failures += 1
    const onGiveUp = this.#onGiveUp
    if (
      onGiveUp &&
      (classifyWriteFailure(error) !== 'locked' || this.#failures > this.#maximumRetries)
    ) {
      const threadIds = [...this.#pending.keys()]
      this.discardAll()
      this.#failures = 0
      try {
        onGiveUp(threadIds, error)
      } catch (failure) {
        console.error('Could not end the turns whose streamed text was not saved.', failure)
      }
      return
    }
    console.error('Could not save streamed text; buffered changes will be retried.', error)
    this.#schedule(RETRY_DELAY_MS)
  }

  #commit(threadId: string, pending: PendingDelta): void {
    this.commit(threadId, {
      type: 'item.delta',
      turnId: pending.turnId,
      itemId: pending.itemId,
      textDelta: pending.text,
    })
  }

  #commitPending(): void {
    const pending = this.#pending
    if (pending.size === 0) return
    if (pending.size === 1 || !this.#commitBatch) {
      for (const [threadId] of pending) this.flush(threadId)
      return
    }
    const records: RecordedDelta[] = []
    for (const [threadId, delta] of pending) {
      records.push({
        threadId,
        event: {
          type: 'item.delta',
          turnId: delta.turnId,
          itemId: delta.itemId,
          textDelta: delta.text,
        },
      })
    }
    this.#commitBatch(records)
    pending.clear()
  }

  #clearTimer(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer)
    this.#timer = undefined
  }
}
