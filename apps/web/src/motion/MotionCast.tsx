import { memo, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useI18n } from '../i18n/index.js'
import { usePopupPresence } from '../ui/use-popup-presence.js'
import { CAST, STAGE_LABEL, STAGE_OWNER, type MotionStageId } from './cast.js'
import './motion-cast.css'

export type MotionCastProps = {
  /** The Motion toggle of this chat. */
  mode: boolean
  /** The current stage of the video project. Phase 1 is always the first one. */
  stage?: MotionStageId
  /** A turn is running: only the highlighted character breathes. */
  running?: boolean
}

type MemberStyle = CSSProperties & { '--cast-color': string; '--cast-index': number }

/**
 * The scene of the Motion team above the chat. Purely visual: it takes three
 * props and never reads the thread, so a streaming reply cannot re-render it.
 */
export const MotionCast = memo(function MotionCast(props: MotionCastProps) {
  const { t } = useI18n()
  const root = useRef<HTMLDivElement>(null)
  const present = usePopupPresence(props.mode, root)
  const [announcement, setAnnouncement] = useState('')
  const stage = props.stage ?? 'idea'
  const leader = CAST.find((member) => member.id === STAGE_OWNER[stage])
  const stageLabel = t(STAGE_LABEL[stage])

  // A live region only speaks about changes made after it exists, so the text
  // goes in one render after the scene appears.
  useEffect(() => {
    if (!props.mode || !leader) return
    setAnnouncement(t('chat.motion.announce', { stage: stageLabel, name: leader.name }))
    return () => setAnnouncement('')
  }, [props.mode, leader, stageLabel, t])

  if (!present) return null
  return (
    <div
      ref={root}
      className="motion-cast"
      role="group"
      aria-label={t('chat.motion.group')}
      data-state={props.mode ? 'open' : 'closed'}
      data-running={props.running ? '' : undefined}
    >
      {CAST.map((member, index) => {
        const current = member.id === leader?.id
        const role = t(member.role)
        const style: MemberStyle = {
          '--cast-color': `var(--composer-motion-${member.color})`,
          '--cast-index': index,
        }
        return (
          <button
            key={member.id}
            type="button"
            className="motion-cast__member"
            style={style}
            title={`${member.name} · ${role}`}
            aria-label={
              current
                ? t('chat.motion.memberCurrent', { name: member.name, role, stage: stageLabel })
                : t('chat.motion.member', { name: member.name, role })
            }
            aria-current={current ? 'step' : undefined}
          >
            <span className="motion-cast__head">
              <img src={member.image} alt="" draggable={false} />
            </span>
            {current ? <span className="motion-cast__label">{stageLabel}</span> : null}
          </button>
        )
      })}
      <span className="visually-hidden" role="status">
        {announcement}
      </span>
    </div>
  )
})
