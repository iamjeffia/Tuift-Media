import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { useI18n } from '../i18n/index.js'
import type { ThreadFrameStore } from '../thread-frame-store.js'
import { IdleText } from './IdleText.js'
import { LiveElapsed } from './LiveElapsed.js'
import { elapsedLabel } from './live-clock.js'
import { runningNow, type RunningNow } from './work-status.js'
import '../styles/live-feedback.css'

/**
 * One line above the prompt box while a turn runs, so the answer to "is it still
 * working, and on what?" is in view wherever the transcript is scrolled: how long
 * the turn has run, the step it waits on, and, once the agent has been silent for a
 * while, how long ago it last did anything. It sits in the slot of the notice strip
 * and wears its look. It reads the structure snapshot, which streamed text never
 * changes, and its clock writes text nodes: a tick renders nothing.
 */
export function ComposerWorkStatus({ frameStore }: { frameStore: ThreadFrameStore }) {
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
  if (!thread.running || !thread.activeTurn) return null
  const doing = now ? describe(now, t, tp) : undefined

  return (
    <div
      className="composer__shelf composer__provider-shelf composer__provider-shelf--info composer__work-status"
      role="group"
      aria-label={t('chat.work.region')}
    >
      <div className="work-status__row">
        <span className="activity__glyph" aria-hidden>
          <span className="activity__pulse" />
        </span>
        <span className="work-status__label">{t('chat.work.working')}</span>
        <LiveElapsed since={thread.activeTurn.startedAt} className="work-status__time" />
        {doing ? (
          <span className="work-status__doing" title={doing}>
            {doing}
          </span>
        ) : null}
        <IdleText frameStore={frameStore} format={idleNote} className="work-status__idle" />
      </div>
      <IdleText
        frameStore={frameStore}
        format={calmNote}
        showAt="calm"
        className="work-status__calm"
      />
    </div>
  )
}

function describe(
  now: RunningNow,
  t: ReturnType<typeof useI18n>['t'],
  tp: ReturnType<typeof useI18n>['tp'],
): string {
  switch (now.kind) {
    case 'subagent':
      if (now.count > 1) return tp('chat.work.helpers', now.count)
      if (now.name && now.title) return t('chat.work.helper', { name: now.name, title: now.title })
      if (now.name) return t('chat.work.helperNamed', { name: now.name })
      return tp('chat.work.helpers', 1)
    case 'command':
      return t('chat.work.command', { command: now.command })
    case 'edit':
      return t('chat.work.edit', { target: now.target })
    case 'tool':
      return t('chat.work.tool', { tool: now.name })
  }
}
