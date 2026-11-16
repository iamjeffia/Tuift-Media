import { useEffect, useState, type CSSProperties, type FocusEvent, type ReactNode } from 'react'

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
  /** A turn is running. The beam travels once when it starts, then rests. */
  running?: boolean
  /** The beam also travels when focus enters the box from outside it. */
  travelOnFocus?: boolean
  children: ReactNode
}) {
  const [phase, setPhase] = useState<BeamPhase>(props.active ? 'active' : 'idle')
  // The light travels only when it has something to say (the mode turns on, a turn starts,
  // the box gets focus), for a few laps that ease to a stop, and then it rests: the same
  // picture, held, with nothing animating and so no frame produced for it. A beam that went
  // round for ever kept a 360 Hz display drawing frames for it all day.
  const [resting, setResting] = useState(false)

  useEffect(() => {
    if (props.active) {
      preloadDesignBeamStyles()
      watchPageVisibility()
      setResting(false)
    }
    setPhase((current) => (props.active ? 'active' : current === 'active' ? 'fading' : 'idle'))
  }, [props.active])

  useEffect(() => {
    if (props.running) setResting(false)
  }, [props.running])

  const style: BeamStyle = { '--beam-strength': props.strength }
  const lit = phase !== 'idle'
  const rest = resting ? '' : undefined
  // The light is built from layers that only rotate and fade (see design-beam.css). They
  // exist only while the beam does, so an idle composer carries none of them. The glow comes
  // first in the box: it must stay under the new-chat shelf as well as the prompt.
  return (
    <div
      className={props.className}
      data-active={phase === 'active' ? '' : undefined}
      data-fading={phase === 'fading' ? '' : undefined}
      style={style}
      onFocus={
        props.travelOnFocus
          ? (event: FocusEvent<HTMLDivElement>) => {
              // Moving between the box's own controls says nothing new.
              if (!event.currentTarget.contains(event.relatedTarget)) setResting(false)
            }
          : undefined
      }
    >
      {lit ? (
        <div data-beam-glow data-resting={rest}>
          <div data-beam-turn>
            <div data-beam-still />
          </div>
        </div>
      ) : null}
      {props.children}
      {lit ? (
        <div
          data-beam-stroke
          data-resting={rest}
          onAnimationEnd={(event) => {
            if (event.animationName === 'composer-design-beam-fade-out') {
              setPhase((current) => (current === 'fading' ? 'idle' : current))
              setResting(false)
            } else if (event.animationName === 'composer-design-beam-settle') {
              setResting(true)
            }
          }}
        >
          <div data-beam-turn data-beam-window>
            <div data-beam-still />
          </div>
          <div data-beam-turn data-beam-sweep />
        </div>
      ) : null}
      {lit ? (
        <div data-beam-bloom data-resting={rest}>
          <div data-beam-turn />
        </div>
      ) : null}
    </div>
  )
}
