import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { useI18n } from '../i18n/index.js'
import type { ThreadFrameStore } from '../thread-frame-store.js'
import { CAST_NAMES as CAST_NAME_LIST, castIdOfName } from '../motion/cast-names.js'
import { LazyMotionStrip } from '../motion/LazyMotionStrip.js'
import type { MotionCastProps } from '../motion/MotionCast.js'
import { IdleText } from './IdleText.js'
import { LiveElapsed } from './LiveElapsed.js'
import { elapsedLabel } from './live-clock.js'
import { runningNow, type RunningNow } from './work-status.js'
import '../styles/live-feedback.css'

const CAST_NAMES = new Map(CAST_NAME_LIST)

/** The Motion team of a chat, as the status strip takes it (see MotionStrip). */
export type ComposerMotion = Omit<MotionCastProps, 'running'>

/**
 * One line above the prompt box while a turn runs, so the answer to "is it still
 * working, and on what?" is in view wherever the transcript is scrolled: how long
 * the turn has run, the step it waits on, and, once the agent has been silent for a
 * while, how long ago it last did anything. It sits in the slot of the notice strip
 * and wears its look. It reads the structure snapshot, which streamed text never
 * changes, and its clock writes text nodes: a tick renders nothing.
 *
 * In a chat with Motion on the strip is there whether a turn runs or not, at one
 * height, and carries the Motion team (see MotionStrip): the dot gives way to the
 * head of whoever works.
 */
export function ComposerWorkStatus({
  frameStore,
  motion,
}: {
  frameStore: ThreadFrameStore
  /** The Motion team of this chat; absent, or `mode` off, the strip is the plain one. */
  motion?: ComposerMotion | undefined
}) {
  const { t, tp } = useI18n()
  const thread = useSyncExternalStore(
    frameStore.subscribeStructure,
    frameStore.getStructureSnapshot,
  )
  const turnId = thread.activeTurn?.id
  const now = useMemo(
    () => (thread.running && turnId ? runningNow(thread.items, turnId) : undefined),
    [thread.running, thread.items, turnId],
  )
  const idleNote = useCallback(
    (idleMs: number) => t('chat.work.idle', { time: elapsedLabel(idleMs) }),
    [t],
  )
  const calmNote = useCallback(() => t('chat.work.calm'), [t])
  const running = thread.running && thread.activeTurn !== undefined
  const team = motion?.mode === true ? motion : undefined
  if (!running && !team) return null
  // A helper named after a character is that character in the text too ("Penny").
  const helper = now?.kind === 'subagent' && now.count <= 1 ? castIdOfName(now.name) : undefined
  const doing = now ? describe(now, t, tp, helper ? CAST_NAMES.get(helper) : undefined) : undefined
  const waiting = team?.waiting === true

  const status = thread.activeTurn ? (
    <>
      {waiting ? null : <span className="work-status__label">{t('chat.work.working')}</span>}
      <LiveElapsed since={thread.activeTurn.startedAt} className="work-status__time" />
      {doing ? (
        <span className="work-status__doing" title={doing}>
          {doing}
        </span>
      ) : null}
      <IdleText frameStore={frameStore} format={idleNote} className="work-status__idle" />
    </>
  ) : null

  return (
    <div
      className="composer__shelf composer__provider-shelf composer__provider-shelf--info composer__work-status"
      role="group"
      aria-label={running ? t('chat.work.region') : t('chat.motion.group')}
      data-motion={team ? '' : undefined}
    >
      {team ? (
        <LazyMotionStrip
          {...team}
          running={running}
          helper={helper}
          fallback={running ? status : null}
        >
          {status}
        </LazyMotionStrip>
      ) : (
        <div className="work-status__row">
          <span className="activity__glyph" aria-hidden>
            <span className="activity__pulse" />
          </span>
          {status}
        </div>
      )}
      {running ? (
        <IdleText
          frameStore={frameStore}
          format={calmNote}
          showAt="calm"
          className="work-status__calm"
        />
      ) : null}
    </div>
  )
}

function describe(
  now: RunningNow,
  t: ReturnType<typeof useI18n>['t'],
  tp: ReturnType<typeof useI18n>['tp'],
  character?: string,
): string {
  switch (now.kind) {
    case 'subagent': {
      if (now.count > 1) return tp('chat.work.helpers', now.count)
      const name = character ?? now.name
      if (name && now.title) return t('chat.work.helper', { name, title: now.title })
      if (name) return t('chat.work.helperNamed', { name })
      return tp('chat.work.helpers', 1)
    }
    case 'command':
      return t('chat.work.command', { command: now.command })
    case 'edit':
      return t('chat.work.edit', { target: now.target })
    case 'tool':
      return t('chat.work.tool', { tool: now.name })
  }
}
