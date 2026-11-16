import { useEffect, useRef } from 'react'
import type { ThreadFrameStore } from '../thread-frame-store.js'
import { idleLevel, idleReaches, type IdleLevel } from './idle.js'
import { onClockTick } from './live-clock.js'
import '../styles/live-feedback.css'

/**
 * A line that appears once the running chat has heard nothing from its agent for
 * `showAt`, and goes away the moment any event arrives. The shared clock decides
 * it by writing this one node, so a quiet chat costs nothing between ticks and
 * the transcript is never rendered for it. A chat with no recorded event says
 * nothing: unknown is not quiet.
 */
export function IdleText({
  frameStore,
  format,
  showAt = 'quiet',
  className = 'idle-text',
}: {
  frameStore: ThreadFrameStore
  /** The wording for the current idle time; it may read the app language. */
  format: (idleMs: number, level: IdleLevel) => string
  showAt?: 'quiet' | 'calm'
  className?: string
}) {
  const node = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const update = () => {
      const target = node.current
      if (!target) return
      const lastEventAt = frameStore.lastEventAt()
      const idle = lastEventAt === undefined ? 0 : Date.now() - lastEventAt
      const level = idleLevel(idle)
      const show = lastEventAt !== undefined && idleReaches(level, showAt)
      target.textContent = show ? format(idle, level) : ''
      target.hidden = !show
    }
    update()
    return onClockTick(update)
  }, [frameStore, format, showAt])
  return <span ref={node} className={className} hidden />
}
