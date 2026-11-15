import { createContext, useContext, useSyncExternalStore } from 'react'
import { t, tp } from '../i18n/index.js'

/**
 * Multi-selection of chat rows in the classic sidebar. The selection lives in
 * one external store and each row subscribes to a single boolean, so changing
 * the selection re-renders only the rows whose state flipped, never the tree.
 */

export type SelectionClick = {
  /** Shift: select from the anchor to the clicked chat. */
  shift: boolean
  /** Ctrl or Cmd: add the chat to the selection, or take it out. */
  toggle: boolean
}

export type Selection = { ids: ReadonlySet<string>; anchor: string | undefined }

export const EMPTY_SELECTION: Selection = { ids: new Set(), anchor: undefined }

/** Every id from the anchor to the target, in the order the rows are shown. */
export function selectRange(
  order: readonly string[],
  anchor: string,
  target: string,
): string[] | undefined {
  const from = order.indexOf(anchor)
  const to = order.indexOf(target)
  if (from < 0 || to < 0) return undefined
  return order.slice(Math.min(from, to), Math.max(from, to) + 1)
}

/**
 * The selection after a modified click. A plain click is not handled here: it
 * clears the selection and opens the chat. Without a usable anchor, Shift
 * starts from the open chat, and failing that from the clicked one.
 */
export function applyClick(
  current: Selection,
  id: string,
  click: SelectionClick,
  order: readonly string[],
  fallbackAnchor?: string,
): Selection {
  if (click.shift) {
    const anchor = [current.anchor, fallbackAnchor].find(
      (candidate) => candidate !== undefined && order.includes(candidate),
    )
    const range = anchor === undefined ? undefined : selectRange(order, anchor, id)
    if (anchor !== undefined && range) {
      return {
        ids: new Set(click.toggle ? [...current.ids, ...range] : range),
        anchor,
      }
    }
    return { ids: new Set([id]), anchor: id }
  }
  const ids = new Set(current.ids)
  if (ids.has(id)) ids.delete(id)
  else ids.add(id)
  return ids.size === 0 ? EMPTY_SELECTION : { ids, anchor: id }
}

/** Keeps only the ids still on screen: a deleted or folded chat leaves the selection. */
export function pruneSelection(current: Selection, visible: ReadonlySet<string>): Selection {
  if (current.ids.size === 0) return current
  const kept = [...current.ids].filter((id) => visible.has(id))
  if (kept.length === current.ids.size) return current
  if (kept.length === 0) return EMPTY_SELECTION
  const anchor =
    current.anchor !== undefined && visible.has(current.anchor) ? current.anchor : undefined
  return { ids: new Set(kept), anchor }
}

export function createSessionSelection() {
  let state = EMPTY_SELECTION
  const listeners = new Set<() => void>()
  // Each rendered chat list reports the ids it shows, so a range follows the
  // order on screen across the pinned list and every project, folded rows and
  // virtualised rows included.
  const lists = new Map<Element, readonly string[]>()

  const set = (next: Selection) => {
    if (next === state) return
    state = next
    for (const listener of listeners) listener()
  }
  const visibleIds = (): string[] =>
    [...lists.entries()]
      .sort(([a], [b]) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
      )
      .flatMap(([, ids]) => ids)
  const prune = () => {
    if (state.ids.size > 0) set(pruneSelection(state, new Set(visibleIds())))
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    has: (id: string) => state.ids.has(id),
    count: () => state.ids.size,
    /** The selected ids in the order the rows are shown. */
    selectedIds: () => visibleIds().filter((id) => state.ids.has(id)),
    visibleIds,
    click(id: string, click: SelectionClick, fallbackAnchor?: string) {
      set(applyClick(state, id, click, visibleIds(), fallbackAnchor))
    },
    clear: () => set(EMPTY_SELECTION),
    setList(list: Element, ids: readonly string[]) {
      lists.set(list, ids)
      prune()
    },
    removeList(list: Element) {
      lists.delete(list)
      prune()
    },
  }
}

export type SessionSelectionStore = ReturnType<typeof createSessionSelection>

/** What a chat row needs from the sidebar to act on the whole selection. */
export type SessionSelectionActions = {
  store: SessionSelectionStore
  /** Where Shift+click starts when nothing has been clicked yet. */
  activeSessionId: () => string | undefined
  /** Chats the selection can archive: the running ones stay. */
  archivableCount: () => number
  archiveSelected: (() => void) | undefined
  /** Asks to delete the selection; the sidebar confirms first. */
  deleteSelected: () => void
}

export const SessionSelectionContext = createContext<SessionSelectionActions | undefined>(undefined)

const noopSubscribe = () => () => {}

/** One boolean per row: only a row whose own state flips re-renders. */
export function useSessionSelected(id: string): boolean {
  const store = useContext(SessionSelectionContext)?.store
  return useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    () => store?.has(id) ?? false,
    () => false,
  )
}

/** The chat that takes focus when the others go: the nearest one that stays, below first. */
export function nearestSurvivor(order: readonly string[], gone: ReadonlySet<string>) {
  const last = order.map((id) => gone.has(id)).lastIndexOf(true)
  const first = order.findIndex((id) => gone.has(id))
  return (
    order.slice(last + 1).find((id) => !gone.has(id)) ??
    order
      .slice(0, Math.max(first, 0))
      .reverse()
      .find((id) => !gone.has(id))
  )
}

export function selectedCountLabel(count: number): string {
  return tp('sidebar.chat.count', count)
}

/** "The running chat will stop." / "3 running chats will stop." */
export function runningStopLabel(running: number): string {
  return running === 1
    ? t('sidebar.runningStop.one')
    : t('sidebar.runningStop.many', { count: running })
}

/** The confirmation for deleting the selection, in the sidebar dialog's shape. */
export function bulkDeleteCopy(count: number, running: number) {
  const stop = running === 0 ? '' : ` ${runningStopLabel(running)}`
  return {
    title: tp('sidebar.bulkDelete.title', count),
    body: `${t('sidebar.bulkDelete.body')}${stop}`,
    action: tp('sidebar.selection.delete', count),
    destructive: true,
  }
}

/** Keys typed into a field belong to the field, not to the list around it. */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}
