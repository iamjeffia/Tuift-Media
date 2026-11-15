import { IconAlertTriangle } from '@tabler/icons-react'
import { memo, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useI18n } from '../i18n/index.js'
import { Menu, MenuItem } from '../ui/Menu.js'
import { usePopupPresence } from '../ui/use-popup-presence.js'
import {
  AFTER_EFFECTS_NAME,
  AFTER_EFFECTS_NOTE,
  afterEffectsProblem,
  type AfterEffectsProblem,
  type AfterEffectsState,
} from './after-effects.js'
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
  /**
   * Whether After Effects can be used from this chat, as its settings say.
   * Cloud shows a notice when it cannot; `ready` and absent say nothing.
   */
  afterEffects?: AfterEffectsState | undefined
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
  const stage = props.stage ?? 'idea'
  const leader = CAST.find((member) => member.id === STAGE_OWNER[stage])
  const stageLabel = t(STAGE_LABEL[stage])

  const problem = afterEffectsProblem(props.afterEffects)
  const note = problem ? t(AFTER_EFFECTS_NOTE[problem]) : ''
  const said = useRef<{ stage: string; note: string } | undefined>(undefined)

  // A live region only speaks about changes made after it exists, so the text
  // goes in one render after the scene appears. The first text says the mode
  // is on; after that every new stage, chosen here or pushed by the server, is
  // said once with its character. The After Effects notice is said once when
  // the scene appears with it and again each time it changes.
  useEffect(() => {
    if (!props.mode || !leader) {
      said.current = undefined
      return
    }
    const before = said.current
    const stageText = `${leader.name}|${stageLabel}`
    const lines: string[] = []
    if (before?.stage !== stageText) {
      const key = before ? 'chat.motion.announceStage' : 'chat.motion.announce'
      lines.push(t(key, { stage: stageLabel, name: leader.name }))
    }
    if (note && before?.note !== note) lines.push(note)
    said.current = { stage: stageText, note }
    setAnnouncement(lines.join(' '))
    return () => setAnnouncement('')
  }, [props.mode, leader, stageLabel, note, t])

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
          problem={member.id === 'cloud' ? problem : undefined}
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
  /** After Effects cannot be used: only Cloud, who builds in it, carries it. */
  problem: AfterEffectsProblem | undefined
}) {
  const { t } = useI18n()
  const { member, current, problem, onStageChange } = props
  const role = t(member.role)
  const stageLabel = t(STAGE_LABEL[props.stage])
  const state = problem ? t(AFTER_EFFECTS_NAME[problem]) : ''
  const named = current
    ? t('chat.motion.memberCurrent', { name: member.name, role, stage: stageLabel })
    : t('chat.motion.member', { name: member.name, role })
  const label = problem ? t('chat.motion.memberAfterEffects', { label: named, state }) : named
  const title = problem ? `${member.name} · ${role} · ${state}` : `${member.name} · ${role}`
  const style: MemberStyle = {
    '--cast-color': `var(--composer-motion-${member.color})`,
    '--cast-index': props.index,
  }
  const body = (
    <span className="motion-cast__body">
      <span className="motion-cast__head">
        <img src={member.image} alt="" draggable={false} />
        {problem ? (
          <span className="motion-cast__mark" aria-hidden>
            <IconAlertTriangle size={11} stroke={2.25} />
          </span>
        ) : null}
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
          panelClassName={`menu--compact menu--cast${problem ? ' menu--cast-note' : ''}`}
          panelLabel={t('chat.motion.stageMenu', { name: member.name })}
          trigger={() => body}
        >
          {(close) => (
            <>
              {problem ? <p className="menu__group">{t(AFTER_EFFECTS_NOTE[problem])}</p> : null}
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
