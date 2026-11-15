import { t, tp } from '../i18n/index.js'

/**
 * One shared clock for the relative times on chat rows. A single interval
 * serves every visible row and only runs while a row is listening, so a rail
 * with nothing to date costs nothing. Rows read it through
 * useSyncExternalStore, so a tick re-renders the time labels and nothing else.
 */
const TICK_MS = 30_000

let now = Date.now()
let timer: ReturnType<typeof setInterval> | undefined
const listeners = new Set<() => void>()

function tick(): void {
  // A hidden window has nobody to show the time to; visibilitychange catches up.
  if (document.visibilityState === 'hidden') return
  now = Date.now()
  for (const listener of listeners) listener()
}

function onVisibilityChange(): void {
  if (document.visibilityState !== 'hidden') tick()
}

export function subscribeSessionClock(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1) {
    now = Date.now()
    timer = setInterval(tick, TICK_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size > 0) return
    clearInterval(timer)
    timer = undefined
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}

export function readSessionClock(): number {
  return now
}

/** "now", "5m", "3h", "2d", "3w", "4mo", "1y": short enough to sit beside a title. */
export function compactRelativeTime(at: number, current: number): string {
  const minutes = Math.floor(Math.max(0, current - at) / 60_000)
  if (minutes < 1) return t('sidebar.time.now')
  if (minutes < 60) return t('sidebar.time.minutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('sidebar.time.hours', { count: hours })
  const days = Math.floor(hours / 24)
  if (days < 7) return t('sidebar.time.days', { count: days })
  if (days < 30) return t('sidebar.time.weeks', { count: Math.floor(days / 7) })
  if (days < 365) return tp('sidebar.time.months', Math.floor(days / 30))
  return tp('sidebar.time.years', Math.floor(days / 365))
}
