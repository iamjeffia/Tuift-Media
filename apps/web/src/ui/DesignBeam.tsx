import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'

type BeamPhase = 'idle' | 'active' | 'fading'
type BeamStyle = CSSProperties & { '--beam-strength': number }
let designBeamStyles: Promise<unknown> | undefined
let watchingVisibility = false

export function preloadDesignBeamStyles(): void {
  designBeamStyles ??= import('../styles/design-beam.css').catch((error: unknown) => {
    designBeamStyles = undefined
    throw error
  })
  void designBeamStyles.catch(() => undefined)
}

/**
 * Marks the document while it is hidden (window minimised or in the tray), so the
 * beam's stylesheet can pause its loops. One listener for every beam, kept for the
 * life of the page.
 */
function watchPageVisibility(): void {
  if (watchingVisibility) return
  watchingVisibility = true
  const sync = () =>
    document.documentElement.toggleAttribute(
      'data-page-hidden',
      document.visibilityState === 'hidden',
    )
  document.addEventListener('visibilitychange', sync)
  sync()
}

export function DesignBeam(props: {
  active: boolean
  className: string
  strength: number
  children: ReactNode
}) {
  const [phase, setPhase] = useState<BeamPhase>(props.active ? 'active' : 'idle')

  useEffect(() => {
    if (props.active) {
      preloadDesignBeamStyles()
      watchPageVisibility()
    }
    setPhase((current) => (props.active ? 'active' : current === 'active' ? 'fading' : 'idle'))
  }, [props.active])

  const style: BeamStyle = { '--beam-strength': props.strength }
  const lit = phase !== 'idle'
  // The light is built from layers that only rotate and fade (see design-beam.css). They
  // exist only while the beam does, so an idle composer carries none of them. The glow comes
  // first in the box: it must stay under the new-chat shelf as well as the prompt.
  return (
    <div
      className={props.className}
      data-active={phase === 'active' ? '' : undefined}
      data-fading={phase === 'fading' ? '' : undefined}
      style={style}
    >
      {lit ? (
        <div data-beam-glow>
          <div data-beam-turn>
            <div data-beam-still />
          </div>
        </div>
      ) : null}
      {props.children}
      {lit ? (
        <div
          data-beam-stroke
          onAnimationEnd={(event) => {
            if (event.animationName === 'composer-design-beam-fade-out')
              setPhase((current) => (current === 'fading' ? 'idle' : current))
          }}
        >
          <div data-beam-turn data-beam-window>
            <div data-beam-still />
          </div>
          <div data-beam-turn data-beam-sweep />
        </div>
      ) : null}
      {lit ? (
        <div data-beam-bloom>
          <div data-beam-turn />
        </div>
      ) : null}
    </div>
  )
}
