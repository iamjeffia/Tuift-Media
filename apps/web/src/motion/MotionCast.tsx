import { memo, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useI18n } from '../i18n/index.js'
import { Menu, MenuItem } from '../ui/Menu.js'
import { usePopupPresence } from '../ui/use-popup-presence.js'
import {
  CAST,
  STAGE_LABEL,
  STAGE_OWNER,
  stagesOf,
  type CastMember,
  type MotionStageId,
} from './cast.js'
import './motion-cast.css'

export type MotionCastProps = {
  /** The Motion toggle of this chat. */
  mode: boolean
  /** The stage the chat's server settings name; absent means the first one. */
  stage?: MotionStageId | undefined
  /** A turn is running: only the highlighted character breathes. */
  running?: boolean
  /**
   * Choosing a stage in a character's menu. Absent where the chat has no
   * server stage to set (a new chat, or a pane that is not the focused one):
   * the characters then only show it.
   */
  onStageChange?: ((stage: MotionStageId) => void) | undefined
  /** The server would refuse a change of stage now (a turn of the chat runs). */
  locked?: boolean | undefined
}

type MemberStyle = CSSProperties & { '--cast-color': string; '--cast-index': number }

/**
 * The scene of the Motion team above the chat. It takes its props and never
 * reads the thread, so a streaming reply cannot re-render it.
 */
export const MotionCast = memo(function MotionCast(props: MotionCastProps) {
  const { t } = useI18n()
  const root = useRef<HTMLDivElement>(null)
  const present = usePopupPresence(props.mode, root)
  const [announcement, setAnnouncement] = useState('')
  const introduced = useRef(false)
  const stage = props.stage ?? 'idea'
  const leader = CAST.find((member) => member.id === STAGE_OWNER[stage])
  const stageLabel = t(STAGE_LABEL[stage])

  // A live region only speaks about changes made after it exists, so the text
  // goes in one render after the scene appears. The first text says the mode
  // is on; after that every new stage, chosen here or pushed by the server, is
  // said once with its character.
  useEffect(() => {
    if (!props.mode || !leader) {
      introduced.current = false
      return
    }
    const key = introduced.current ? 'chat.motion.announceStage' : 'chat.motion.announce'
    introduced.current = true
    setAnnouncement(t(key, { stage: stageLabel, name: leader.name }))
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
      {CAST.map((member, index) => (
        <Member
          key={member.id}
          member={member}
          index={index}
          current={member.id === leader?.id}
          stage={stage}
          onStageChange={props.onStageChange}
          locked={props.locked}
        />
      ))}
      <span className="visually-hidden" role="status">
        {announcement}
      </span>
    </div>
  )
})

function Member(props: {
  member: CastMember
  index: number
  current: boolean
  stage: MotionStageId
  onStageChange: MotionCastProps['onStageChange']
  locked: boolean | undefined
}) {
  const { t } = useI18n()
  const { member, current, onStageChange } = props
  const role = t(member.role)
  const stageLabel = t(STAGE_LABEL[props.stage])
  const label = current
    ? t('chat.motion.memberCurrent', { name: member.name, role, stage: stageLabel })
    : t('chat.motion.member', { name: member.name, role })
  const title = `${member.name} · ${role}`
  const style: MemberStyle = {
    '--cast-color': `var(--composer-motion-${member.color})`,
    '--cast-index': props.index,
  }
  const body = (
    <span className="motion-cast__body">
      <span className="motion-cast__head">
        <img src={member.image} alt="" draggable={false} />
      </span>
      {current ? <span className="motion-cast__label">{stageLabel}</span> : null}
    </span>
  )
  return (
    <span className="motion-cast__member" style={style} data-current={current ? '' : undefined}>
      {onStageChange ? (
        <Menu
          label={label}
          triggerTitle={title}
          drop="down"
          triggerClassName="motion-cast__trigger"
          panelClassName="menu--compact menu--cast"
          panelLabel={t('chat.motion.stageMenu', { name: member.name })}
          trigger={() => body}
        >
          {(close) => (
            <>
              {props.locked ? <p className="menu__group">{t('chat.motion.stageLocked')}</p> : null}
              {stagesOf(member.id).map((stage) => (
                <MenuItem
                  key={stage}
                  title={t(STAGE_LABEL[stage])}
                  icon={null}
                  active={stage === props.stage}
                  checked={stage === props.stage}
                  disabled={props.locked === true}
                  onClick={() => {
                    close()
                    if (stage !== props.stage) onStageChange(stage)
                  }}
                />
              ))}
            </>
          )}
        </Menu>
      ) : (
        <span role="img" aria-label={label} title={title}>
          {body}
        </span>
      )}
    </span>
  )
}
