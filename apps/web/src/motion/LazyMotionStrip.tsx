import { lazy, Suspense, type ReactNode } from 'react'
import type { MotionStripProps } from './MotionStrip.js'

type Strip = typeof import('./MotionStrip.js')

/** The portraits are decoded before the strip mounts, so the heads never appear as empty circles. */
async function loadStrip(): Promise<{ default: Strip['MotionStrip'] }> {
  const [strip, cast] = await Promise.all([import('./MotionStrip.js'), import('./cast.js')])
  const decoded = cast.CAST.map((member) => {
    const image = new Image()
    image.src = member.image
    return image.decode?.().catch(() => undefined) ?? Promise.resolve()
  })
  // A slow disk must not hold the strip back for long.
  await Promise.race([Promise.all(decoded), new Promise((resolve) => setTimeout(resolve, 400))])
  return { default: strip.MotionStrip }
}
const MotionStrip = lazy(loadStrip)

/**
 * The strip's heads and their stylesheet load the first time a Motion chat shows the
 * strip, never at startup (the startup stylesheet has no room left). Until then the
 * row stands at its final height with the status text only, so nothing shifts when
 * the heads arrive.
 */
export function LazyMotionStrip(props: MotionStripProps & { fallback?: ReactNode }) {
  const { fallback, ...strip } = props
  return (
    <Suspense fallback={<div className="work-status__row">{fallback}</div>}>
      <MotionStrip {...strip} />
    </Suspense>
  )
}
