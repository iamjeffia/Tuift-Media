import { memo, useState, type ReactNode } from 'react'
import { useI18n } from '../i18n/index.js'
import { afterEffectsProblem, AFTER_EFFECTS_NOTE } from './after-effects.js'
import { useCastAnnouncement } from './cast-announcement.js'
import { CAST, STAGE_LABEL, STAGE_OWNER, type CastId } from './cast.js'
import { Member, type MotionCastProps } from './MotionCast.js'
import './motion-strip.css'

export type MotionStripProps = Omit<MotionCastProps, 'running'> & {
  /** A turn of the chat runs: the head of whoever works leads the status line. */
  running: boolean
  /**
   * The character a single running helper is named after, when it is one: it leads the
   * status line instead of the owner of the stage.
   */
  helper?: CastId | undefined
  /** What the status line says while a turn runs (the strip owns the heads, not the words). */
  children?: ReactNode
}

/**
 * The Motion team in the status strip above the prompt box of a chat that exists: the
 * same quiet row the strip always was, with small faces. Idle, the six heads with the
 * owner of the stage ringed and its name beside it. Running, the head of whoever works
 * takes the place of the dot and breathes, the status text follows, and the other
 * heads sit small and dim at the end, lit when a helper named after them runs. It
 * takes plain props and never reads the thread, so a streaming reply cannot render it.
 */
export const MotionStrip = memo(function MotionStrip(props: MotionStripProps) {
  const { t } = useI18n()
  const stage = props.stage ?? 'idea'
  const owner = CAST.find((member) => member.id === STAGE_OWNER[stage])
  const stageLabel = t(STAGE_LABEL[stage])
  const problem = afterEffectsProblem(props.afterEffects)
  const note = problem ? t(AFTER_EFFECTS_NOTE[problem]) : ''
  const waiting = props.waiting === true
  const running = props.running
  const announcement = useCastAnnouncement({
    mode: props.mode,
    leader: owner,
    stageLabel,
    note,
    waiting,
  })

  // Whoever leads the status line: a helper's character, else the owner of the stage,
  // else (the owner is not working but others are) the first of the helpers' characters.
  const working = props.working ?? []
  const lead =
    props.helper ??
    (owner && (working.length === 0 || working.includes(owner.id)) ? owner.id : working[0])

  // The head that led a moment ago fades out under the new one: opacity and transform only.
  const [shown, setShown] = useState(lead)
  const [leaving, setLeaving] = useState<CastId | undefined>(undefined)
  if (lead !== shown) {
    setShown(lead)
    setLeaving(running && shown !== undefined ? shown : undefined)
  }
  if (!running && leaving !== undefined) setLeaving(undefined)

  const member = (id: CastId) => CAST.find((entry) => entry.id === id)
  const memberOf = (cast: (typeof CAST)[number], index: number, leading: boolean) => {
    // The one the row is about: who leads the status line, or, idle, the owner of the stage.
    const main = leading || (!running && cast.id === owner?.id)
    return (
      <Member
        key={cast.id}
        member={cast}
        index={index}
        current={cast.id === owner?.id}
        ring={main}
        waiting={waiting && main}
        working={working.includes(cast.id)}
        stage={stage}
        onStageChange={props.onStageChange}
        locked={props.locked}
        problem={cast.id === 'cloud' ? problem : undefined}
        showLabel={!running}
        drop="up"
      />
    )
  }

  const leadMember = lead ? member(lead) : undefined
  const leaver = leaving ? member(leaving) : undefined
  return (
    <>
      <div
        // A new row for each state: the change between idle and running is a fade.
        key={running ? 'running' : 'idle'}
        className="work-status__row motion-strip"
        data-running={running && !waiting ? '' : undefined}
        data-state={running ? 'running' : 'idle'}
      >
        {running ? (
          <>
            <span className="motion-strip__lead">
              {leaver ? (
                <span
                  key={leaver.id}
                  className="motion-strip__leaving"
                  aria-hidden
                  onAnimationEnd={() => setLeaving(undefined)}
                >
                  <img src={leaver.image} alt="" draggable={false} />
                </span>
              ) : null}
              {leadMember ? (
                <span key={leadMember.id} className="motion-strip__arriving">
                  {memberOf(leadMember, CAST.indexOf(leadMember), true)}
                </span>
              ) : null}
            </span>
            {waiting ? (
              <span className="motion-strip__waiting">
                {t('chat.motion.labelWaiting', { stage: stageLabel })}
              </span>
            ) : null}
            {props.children}
            <span className="motion-strip__tail">
              {CAST.map((cast, index) => (cast.id === lead ? null : memberOf(cast, index, false)))}
            </span>
          </>
        ) : (
          <span className="motion-strip__heads">
            {CAST.map((cast, index) => memberOf(cast, index, false))}
          </span>
        )}
      </div>
      <span className="visually-hidden" role="status">
        {announcement}
      </span>
    </>
  )
})
