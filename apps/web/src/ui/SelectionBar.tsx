import { useContext, useSyncExternalStore } from 'react'
import { IconTrash as Trash2, IconX as X } from '@tabler/icons-react'
import { useI18n } from '../i18n/index.js'
import { SessionSelectionContext } from './session-selection.js'
import '../styles/session-selection.css'

/**
 * Two or more chats selected: the count, the delete action and a way out, in
 * the rail's raised surface. It is the last child of the scrolling list, stuck
 * to its bottom edge, so it never moves a row when it appears.
 */
export function SelectionBar(props: { count: number; onDelete: () => void; onClear: () => void }) {
  const { t, tp } = useI18n()
  return (
    <div className="selection-bar" role="group" aria-label={t('sidebar.selection.bar')}>
      <span className="selection-bar__count">{tp('sidebar.selection.count', props.count)}</span>
      <button
        type="button"
        className="selection-bar__delete"
        onClick={props.onDelete}
        aria-label={tp('sidebar.selection.delete', props.count)}
      >
        <Trash2 size={14} aria-hidden />
        <span>{t('sidebar.selection.deleteShort')}</span>
      </button>
      <button
        type="button"
        className="sess__action"
        onClick={props.onClear}
        aria-label={t('sidebar.selection.clear')}
        title={t('sidebar.selection.clear')}
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  )
}

const noopSubscribe = () => () => {}

/** The classic sidebar's bar: it follows the selection store and acts through its context. */
export function SessionSelectionBar() {
  const selection = useContext(SessionSelectionContext)
  const store = selection?.store
  const count = useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    () => store?.count() ?? 0,
    () => 0,
  )
  if (!selection || !store || count < 2) return null
  return (
    <SelectionBar
      count={count}
      onDelete={selection.deleteSelected}
      onClear={() => {
        const first = store.selectedIds()[0]
        store.clear()
        // The button leaves with the bar: keyboard focus goes back to the chats.
        if (first) focusChat(first)
      }}
    />
  )
}

function focusChat(id: string) {
  const rows = document.querySelectorAll<HTMLElement>('[data-archive-session-id]')
  const row = Array.from(rows).find((node) => node.dataset['archiveSessionId'] === id)
  row?.querySelector<HTMLElement>('.sess')?.focus()
}
