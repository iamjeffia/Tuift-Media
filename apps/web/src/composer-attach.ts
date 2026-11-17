import { useSyncExternalStore } from 'react'
import type { PickedAttachment } from './bridge.js'

/**
 * Lets a file shown in the chat ("Attach as context" in its menu) go into the prompt box through
 * the same intake a dropped file takes, without the transcript knowing about the composer: the
 * composer registers the one handler, the menu only asks.
 */
type Attacher = (files: PickedAttachment[]) => void

let attacher: Attacher | undefined
// What each registered composer holds now, by path. The one that takes the files is the one that
// counts, so a mark that says "in the prompt box" follows the box a file would land in.
const held = new Map<Attacher, ReadonlySet<string>>()
const NOTHING: ReadonlySet<string> = new Set()
let snapshot: ReadonlySet<string> = NOTHING
const listeners = new Set<() => void>()

function refresh(): void {
  const next = (attacher && held.get(attacher)) ?? NOTHING
  if (next.size === snapshot.size && [...next].every((path) => snapshot.has(path))) return
  snapshot = next
  for (const listener of listeners) listener()
}

export function registerComposerAttacher(next: Attacher): () => void {
  attacher = next
  refresh()
  return () => {
    held.delete(next)
    if (attacher === next) attacher = undefined
    refresh()
  }
}

export function canAttachToComposer(): boolean {
  return attacher !== undefined
}

export function attachToComposer(files: PickedAttachment[]): boolean {
  if (!attacher) return false
  attacher(files)
  return true
}

/** The composer says which paths it holds, each time they change. A composer that is not the registered one is ignored. */
export function reportComposerAttachments(owner: Attacher, paths: readonly string[]): void {
  if (owner !== attacher) return
  held.set(owner, new Set(paths))
  refresh()
}

/** Whether the prompt box the next attached file lands in holds this path right now. */
export function useAttachedToComposer(path: string | undefined): boolean {
  const paths = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => snapshot,
    () => NOTHING,
  )
  return path !== undefined && paths.has(path)
}
