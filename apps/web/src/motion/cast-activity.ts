import type { Item } from '@harness/contracts'
import { useMemo, useSyncExternalStore } from 'react'
import { sessionAttention } from '../sidebar-order.js'
import type { ThreadFrameStore } from '../thread-frame-store.js'
import type { Session } from '../ui/Sidebar.js'
import type { CastId } from './cast.js'
import { CAST_NAMES, castIdOfName } from './cast-names.js'

/*
 * What the scene shows about the chat besides its stage, derived from state the
 * app already keeps and handed to the scene as plain props: the scene itself
 * never reads the thread.
 */

/**
 * Whether the chat is stopped because it needs the person: an approval or a
 * question is open. This is the sidebar's own definition (`sessionAttention`,
 * the same one the "Needs you" band and the notifications use); a failure not
 * yet read is not a request, and an idle chat whose turn ended is not waiting.
 */
export function waitingForPerson(session: Session | undefined): boolean {
  const attention = session ? sessionAttention(session) : undefined
  return attention === 'approval' || attention === 'input'
}

/**
 * The characters that have a helper agent running in the transcript: a helper
 * whose name is a cast name lights that character. In the order of the scene.
 */
export function workingCast(items: readonly Item[]): CastId[] {
  const lit = new Set<CastId>()
  for (const item of items) {
    const helper = item.subagent
    if (helper?.state !== 'running') continue
    const id = castIdOfName(helper.name)
    if (id) lit.add(id)
  }
  return CAST_NAMES.map(([id]) => id).filter((id) => lit.has(id))
}

const NONE: readonly CastId[] = []
const noSubscription = () => () => {}
const never = () => ''

/** One scan per structural snapshot, however many times React asks for it. */
const keys = new WeakMap<readonly Item[], string>()
function keyOf(items: readonly Item[]): string {
  let key = keys.get(items)
  if (key === undefined) {
    key = workingCast(items).join(',')
    keys.set(items, key)
  }
  return key
}

/**
 * The characters lit by a running helper in the chat a column shows, as a list
 * that keeps its identity until it changes. It follows the structure of the
 * transcript (item boundaries), never the streamed text, and a chat without
 * Motion neither subscribes nor scans.
 */
export function useWorkingCast(store: ThreadFrameStore, enabled: boolean): readonly CastId[] {
  const key = useSyncExternalStore(
    enabled ? store.subscribeStructure : noSubscription,
    enabled ? () => keyOf(store.getStructureSnapshot().items) : never,
  )
  return useMemo(() => (key ? (key.split(',') as CastId[]) : NONE), [key])
}
