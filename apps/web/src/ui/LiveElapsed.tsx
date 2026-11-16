import { useEffect, useRef } from 'react'
import { elapsedLabel, onClockTick } from './live-clock.js'
import '../styles/live-feedback.css'

/**
 * Time since `since`, kept current by the shared clock without a render: a tick
 * writes this one text node. With `after`, nothing shows until that much time
 * has passed, so a short step stays as quiet as it is today (the empty node
 * takes no room).
 */
export function LiveElapsed({
  since,
  after = 0,
  format = elapsedLabel,
  className = 'live-elapsed',
  silent = false,
}: {
  since: number
  /** Milliseconds a step must have run before its time shows. */
  after?: number
  /** Module-level function: a new one every render would restart the clock listener. */
  format?: (ms: number) => string
  className?: string
  /** A figure a screen reader should not read out each time it changes: it stays out of the row's name. */
  silent?: boolean
}) {
  const text = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const update = () => {
      if (text.current) text.current.textContent = elapsedText(since, after, format)
    }
    update()
    return onClockTick(update)
  }, [since, after, format])
  return (
    <span ref={text} className={className} aria-hidden={silent || undefined}>
      {elapsedText(since, after, format)}
    </span>
  )
}

function elapsedText(since: number, after: number, format: (ms: number) => string): string {
  const elapsed = Date.now() - since
  return elapsed < after ? '' : format(Math.max(0, elapsed))
}
