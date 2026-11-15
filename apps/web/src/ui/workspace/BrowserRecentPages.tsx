import { useSyncExternalStore, type ReactNode } from 'react'
import { IconHistory as History } from '@tabler/icons-react'
import { useI18n, type I18n } from '../../i18n/index.js'
import { readSessionClock, subscribeSessionClock } from '../session-clock.js'
import {
  browserVisitAddress,
  readBrowserHistory,
  subscribeBrowserHistory,
} from './browser-history.js'
import { browserPageLabel } from './browser-page.js'

/** The compact steps of session-clock's relative time, said in the interface language. */
function visitedAgo({ t, tp }: Pick<I18n, 't' | 'tp'>, visitedAt: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - visitedAt) / 60_000)
  if (minutes < 1) return t('workspace.recent.now')
  if (minutes < 60) return t('workspace.recent.minutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('workspace.recent.hours', { count: hours })
  const days = Math.floor(hours / 24)
  if (days < 7) return t('workspace.recent.days', { count: days })
  if (days < 30) return t('workspace.recent.weeks', { count: Math.floor(days / 7) })
  if (days < 365) return tp('workspace.recent.months', Math.floor(days / 30))
  return tp('workspace.recent.years', Math.floor(days / 365))
}

/**
 * What an empty Browser tab offers: the pages opened before, each one click
 * from loading in this tab. The children show until there is a page to list.
 * Subscribes here, so a page saved elsewhere never re-renders a tab showing one.
 */
export function BrowserRecentPages(props: { onOpen: (url: string) => void; children: ReactNode }) {
  const i18n = useI18n()
  const { t } = i18n
  const visits = useSyncExternalStore(subscribeBrowserHistory, readBrowserHistory)
  const now = useSyncExternalStore(subscribeSessionClock, readSessionClock)
  if (visits.length === 0) return props.children
  return (
    <section className="workspace-browser__recent" aria-label={t('workspace.recent.label')}>
      <h3 className="workspace-browser__recent-heading">
        <History size={16} aria-hidden />
        {t('workspace.recent.heading')}
      </h3>
      <ul className="workspace-browser__recent-list">
        {visits.map((visit) => (
          <li key={visit.url}>
            <button type="button" title={visit.url} onClick={() => props.onOpen(visit.url)}>
              <span className="workspace-browser__recent-thumb" aria-hidden />
              <span className="workspace-browser__recent-text">
                <strong>{browserPageLabel(visit)}</strong>
                <span>
                  <span className="workspace-browser__recent-address">
                    {browserVisitAddress(visit.url)}
                  </span>
                  <span> · {visitedAgo(i18n, visit.visitedAt, now)}</span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
