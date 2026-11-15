import { lazy, Suspense, useState } from 'react'
import type { MotionCastProps } from './MotionCast.js'

type Scene = typeof import('./MotionCast.js')

/** The portraits are decoded before the scene mounts, so the entrance never starts on empty circles. */
async function loadScene(): Promise<{ default: Scene['MotionCast'] }> {
  const [scene, cast] = await Promise.all([import('./MotionCast.js'), import('./cast.js')])
  const decoded = cast.CAST.map((member) => {
    const image = new Image()
    image.src = member.image
    return image.decode?.().catch(() => undefined) ?? Promise.resolve()
  })
  // A slow disk must not hold the scene back for long: the entrance still plays.
  await Promise.race([Promise.all(decoded), new Promise((resolve) => setTimeout(resolve, 400))])
  return { default: scene.MotionCast }
}
const MotionCast = lazy(loadScene)

/**
 * The scene and its stylesheet load the first time Motion is turned on, never
 * at startup (the startup stylesheet has no room left). After that it stays
 * mounted so the exit can play when Motion is turned off.
 */
export function LazyMotionCast(props: MotionCastProps) {
  const [wanted, setWanted] = useState(props.mode)
  if (props.mode && !wanted) setWanted(true)
  if (!wanted) return null
  return (
    <Suspense fallback={null}>
      <MotionCast {...props} />
    </Suspense>
  )
}
