import type { MotionStage, ThreadMode, ThreadSettings } from '@harness/contracts'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Transport } from '../transport.js'

/** What the server says about a chat's mode: the only truth for a chat that exists. */
type Entry = { mode?: ThreadMode | undefined; stage?: MotionStage | undefined }

/**
 * The Motion flag this window kept per chat before the server did. It is read
 * once to hand a chat over to the server, then removed.
 */
export type LegacyMotionFlag = {
  has(threadId: string): boolean
  clear(threadId: string): void
}

export type ThreadMotionDeps = {
  setMode(params: { threadId: string; mode: ThreadMode | null }): Promise<ThreadSettings>
  legacy: LegacyMotionFlag
  onError(message: string): void
}

const sameEntry = (a: Entry | undefined, b: Entry) =>
  a !== undefined && a.mode === b.mode && a.stage === b.stage

/**
 * The Motion mode and stage of every chat this window has heard about, as the
 * server keeps them. A chat is unknown until the server's settings arrive (read
 * on open, or pushed after a change anywhere).
 */
export class ThreadMotionStore {
  #entries: ReadonlyMap<string, Entry> = new Map()
  #listeners = new Set<() => void>()
  #active: string | undefined
  #running = false
  #migrating = new Set<string>()

  constructor(private readonly deps: ThreadMotionDeps) {}

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  /** A new map on every change, so it is a stable snapshot between changes. */
  snapshot = (): ReadonlyMap<string, Entry> => this.#entries

  /**
   * What the chat shows, as a string, so a listener re-renders only when the
   * toggle or the stage would look different: settings that say nothing new
   * about Motion (most of them) cost no render. A chat this window knew as
   * Motion shows as such until the server answers.
   */
  view = (threadId: string | undefined): string => {
    const entry = threadId ? this.#entries.get(threadId) : undefined
    const mode = entry
      ? entry.mode
      : threadId && this.deps.legacy.has(threadId)
        ? 'motion'
        : undefined
    return `${mode ?? ''}|${entry?.stage ?? ''}`
  }

  #write(threadId: string, entry: Entry | undefined): void {
    const next = new Map(this.#entries)
    if (entry) next.set(threadId, entry)
    else next.delete(threadId)
    this.#entries = next
    this.#notify()
  }

  #notify(): void {
    for (const listener of this.#listeners) listener()
  }

  /** The chat's settings arrived from the server. */
  adopt(threadId: string, settings: ThreadSettings): void {
    const entry = { mode: settings.mode, stage: settings.motionStage }
    if (!sameEntry(this.#entries.get(threadId), entry)) this.#write(threadId, entry)
    this.#settle(threadId)
  }

  /** A chat just started with Motion on: shown as such until the server says more. */
  seed(threadId: string): void {
    this.#write(threadId, { mode: 'motion', stage: 'idea' })
  }

  /** The chat on screen and whether a turn of it runs; a chat is handed over only when idle. */
  watch(threadId: string | undefined, running: boolean): void {
    this.#active = threadId
    this.#running = running
    if (threadId) this.#settle(threadId)
  }

  /**
   * Turns Motion on or off in a chat that exists. Refused while it runs, as the
   * server does. A change the server refuses anyway returns the chat to what the
   * server last said and reports why.
   */
  async set(threadId: string, enabled: boolean): Promise<void> {
    this.deps.legacy.clear(threadId)
    this.#notify()
    if (threadId === this.#active && this.#running) return
    const before = this.#entries.get(threadId)
    if ((before?.mode === 'motion') === enabled) return
    const optimistic: Entry = enabled
      ? { mode: 'motion', stage: before?.stage ?? 'idea' }
      : { mode: undefined, stage: before?.stage }
    this.#write(threadId, optimistic)
    try {
      this.adopt(threadId, await this.deps.setMode({ threadId, mode: enabled ? 'motion' : null }))
    } catch (error) {
      // A push that arrived meanwhile is newer than the state to go back to.
      if (this.#entries.get(threadId) === optimistic) this.#write(threadId, before)
      this.deps.onError(error instanceof Error ? error.message : String(error))
    }
  }

  /** One hand-over per chat, the first time it is open, known and idle. */
  #settle(threadId: string): void {
    const entry = this.#entries.get(threadId)
    if (!entry || threadId !== this.#active || this.#running) return
    if (!this.deps.legacy.has(threadId)) return
    // The server already has a mode: its word stands and the local flag goes.
    if (entry.mode) return this.deps.legacy.clear(threadId)
    if (this.#migrating.has(threadId)) return
    this.#migrating.add(threadId)
    this.deps
      .setMode({ threadId, mode: 'motion' })
      .then((settings) => {
        this.deps.legacy.clear(threadId)
        this.adopt(threadId, settings)
      })
      // The flag stays, so the next time the chat is opened it tries again.
      .catch(() => undefined)
      .finally(() => this.#migrating.delete(threadId))
  }
}

export type ThreadMotion = {
  /** Motion is on for the chat on screen (or for the draft of a new chat). */
  motionMode: boolean
  motionStage: MotionStage | undefined
  /** A turn of the chat on screen runs: the server would refuse the change. */
  motionLocked: boolean
  /** Turns Motion on or off; `undefined` is the draft of a new chat. */
  setThreadMotionMode: (threadId: string | undefined, enabled: boolean) => void
  adoptMotion: (threadId: string, settings: ThreadSettings) => void
  seedMotion: (threadId: string) => void
}

export function useThreadMotion(options: {
  transport: Pick<Transport, 'request'>
  activeId: string | undefined
  running: boolean
  legacy: LegacyMotionFlag
  onError: (message: string) => void
}): ThreadMotion {
  const { transport, activeId, running, legacy } = options
  const onError = useRef(options.onError)
  onError.current = options.onError
  const store = useMemo(
    () =>
      new ThreadMotionStore({
        setMode: (params) => transport.request('thread.setMode', params),
        legacy,
        onError: (message) => onError.current(message),
      }),
    [transport, legacy],
  )
  const view = useSyncExternalStore(store.subscribe, () => store.view(activeId))
  // A new chat has no thread to ask: its choice is the draft, sent with the first message.
  const [draft, setDraft] = useState(false)
  useEffect(() => store.watch(activeId, running), [store, activeId, running])

  const [shownMode, shownStage] = view.split('|')
  const motionMode = activeId ? shownMode === 'motion' : draft
  const setThreadMotionMode = useCallback(
    (threadId: string | undefined, enabled: boolean) => {
      if (threadId) void store.set(threadId, enabled)
      else setDraft(enabled)
    },
    [store],
  )
  return {
    motionMode,
    motionStage: (shownStage || undefined) as MotionStage | undefined,
    motionLocked: running && activeId !== undefined,
    setThreadMotionMode,
    adoptMotion: store.adopt.bind(store),
    seedMotion: store.seed.bind(store),
  }
}
