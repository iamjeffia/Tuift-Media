import { IconAlertTriangle, IconDots } from '@tabler/icons-react'
import { memo, useRef, type CSSProperties } from 'react'
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
  type CastId,
  type CastMember,
  type MotionStageId,
} from './cast.js'
import { useCastAnnouncement } from './cast-announcement.js'
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
  /**
   * The chat is stopped because it needs the person (an approval or a question
   * is open). The highlighted character stops breathing and says so.
   */
  waiting?: boolean | undefined
  /** The characters a helper agent of this chat, named after them, is running as. */
  working?: readonly CastId[] | undefined
}

type MemberStyle = CSSProperties & { '--cast-color': string; '--cast-index': number }

/**
 * The scene of the Motion team above the title of a new chat (a chat that exists has
 * the team in its status strip, see MotionStrip). It takes its props and never reads
 * the thread, so a streaming reply cannot re-render it.
 */
export const MotionCast = memo(function MotionCast(props: MotionCastProps) {
  const { t } = useI18n()
  const root = useRef<HTMLDivElement>(null)
  const present = usePopupPresence(props.mode, root)
  const stage = props.stage ?? 'idea'
  const leader = CAST.find((member) => member.id === STAGE_OWNER[stage])
  const stageLabel = t(STAGE_LABEL[stage])

  const problem = afterEffectsProblem(props.afterEffects)
  const note = problem ? t(AFTER_EFFECTS_NOTE[problem]) : ''
  const waiting = props.waiting === true
  const announcement = useCastAnnouncement({ mode: props.mode, leader, stageLabel, note, waiting })

  if (!present) return null
  return (
    <div
      ref={root}
      className="motion-cast"
      role="group"
      aria-label={t('chat.motion.group')}
      data-state={props.mode ? 'open' : 'closed'}
      data-running={props.running && !waiting ? '' : undefined}
    >
      {CAST.map((member, index) => (
        <Member
          key={member.id}
          member={member}
          index={index}
          current={member.id === leader?.id}
          waiting={waiting && member.id === leader?.id}
          working={props.working?.includes(member.id) === true}
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

export function Member(props: {
  member: CastMember
  index: number
  current: boolean
  /** The chat waits for the person: only the highlighted character says it. */
  waiting: boolean
  /** A helper agent named after this character is running. */
  working: boolean
  stage: MotionStageId
  onStageChange: MotionCastProps['onStageChange']
  locked: boolean | undefined
  /** After Effects cannot be used: only Cloud, who builds in it, carries it. */
  problem: AfterEffectsProblem | undefined
  /** The ring and the breath, when it is not the owner of the stage who has them (a running helper's character). */
  ring?: boolean | undefined
  /** The stage name beside the owner's head; the status strip says it elsewhere. Default: shown. */
  showLabel?: boolean | undefined
  /** Which way the character's menu opens; below the heads by default. */
  drop?: 'up' | 'down' | undefined
}) {
  const { t } = useI18n()
  const { member, current, waiting, working, problem, onStageChange } = props
  const role = t(member.role)
  const stageLabel = t(STAGE_LABEL[props.stage])
  const state = problem ? t(AFTER_EFFECTS_NAME[problem]) : ''
  const named = current
    ? t('chat.motion.memberCurrent', { name: member.name, role, stage: stageLabel })
    : t('chat.motion.member', { name: member.name, role })
  const label = problem ? t('chat.motion.memberAfterEffects', { label: named, state }) : named
  // What else is going on with this character, whole in the accessible name and short in the tooltip.
  const states = [
    ...(waiting ? [t('chat.motion.waiting')] : []),
    ...(working ? [t('chat.motion.working')] : []),
  ]
  const described = states.reduce(
    (text, line) => t('chat.motion.memberState', { label: text, state: line }),
    label,
  )
  const title = [member.name, role, ...(problem ? [state] : []), ...states].join(' · ')
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
        {waiting ? (
          <span className="motion-cast__wait" aria-hidden>
            <IconDots size={11} stroke={3} />
          </span>
        ) : null}
      </span>
      {current && props.showLabel !== false ? (
        <span className="motion-cast__label">
          {waiting ? t('chat.motion.labelWaiting', { stage: stageLabel }) : stageLabel}
        </span>
      ) : null}
    </span>
  )
  return (
    <span
      className="motion-cast__member"
      style={style}
      data-current={(props.ring ?? current) ? '' : undefined}
      data-waiting={waiting ? '' : undefined}
      data-working={working ? '' : undefined}
    >
      {onStageChange ? (
        <Menu
          label={described}
          triggerTitle={title}
          drop={props.drop ?? 'down'}
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
        <span role="img" aria-label={described} title={title}>
          {body}
        </span>
      )}
    </span>
  )
}
