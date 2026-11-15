import { useCallback, useState } from 'react'
import type { ApprovalDecision, Subagent } from '@harness/contracts'
import {
  IconArrowUp as ArrowUp,
  IconChevronLeft as ChevronLeft,
  IconSquare as Square,
} from '@tabler/icons-react'
import { useI18n } from '../../i18n/index.js'
import { providerDisplayName } from '../../provider-presentation.js'
import type { Transport } from '../../transport.js'
import { SubagentStatus } from '../SubagentRow.js'
import { Thread } from '../Thread.js'
import type { AgentEntry } from './agents-list.js'
import { useChildTranscript } from './child-transcript.js'
import { NativeSubagentTranscript } from './NativeSubagentTranscript.js'
import { SubagentAvatar } from './SubagentAvatar.js'

/**
 * One sub-agent, opened from the Agents tab. A sub-agent TUIFT Code started
 * shows its own chat, read-only, where its approvals and questions can be
 * answered and its run stopped. An engine's own sub-agent shows its saved
 * transcript when available, otherwise its last snapshot.
 */
export function AgentDetail(props: {
  entry: AgentEntry
  active: boolean
  transport: Transport
  threadId?: string | undefined
  subagentTranscript?: boolean | undefined
  onBack: () => void
}) {
  const { t } = useI18n()
  const { entry, transport } = props
  const { subagent } = entry
  const childId = subagent.threadId
  const running = subagent.state === 'running'
  const engine = subagent.provider
    ? [providerDisplayName(subagent.provider), subagent.model].filter(Boolean).join(' · ')
    : undefined
  const [stop, setStop] = useState<{ pending: boolean; error?: string }>({ pending: false })

  const stopRun = () => {
    if (!childId) return
    setStop({ pending: true })
    transport
      .request('thread.interrupt', { threadId: childId })
      .then(() => setStop({ pending: false }))
      .catch((error: unknown) =>
        setStop({
          pending: false,
          error: error instanceof Error ? error.message : t('workspace.agentDetail.stopFailed'),
        }),
      )
  }

  return (
    <div className="agent-detail">
      <header className="agent-detail__head">
        <button
          type="button"
          className="agent-detail__back"
          aria-label={t('workspace.agentDetail.all')}
          title={t('workspace.agentDetail.all')}
          onClick={props.onBack}
        >
          <ChevronLeft size={14} aria-hidden />
        </button>
        <SubagentAvatar seed={entry.itemId} running={running} size={20} />
        <span className="agent-detail__title">
          <span className="agent-detail__name">
            {subagent.name ?? t('workspace.agents.subagent')}
          </span>
          {engine ? <span className="agent-detail__engine">{engine}</span> : null}
        </span>
        {running && childId ? (
          <button
            type="button"
            className="agent-detail__stop"
            disabled={stop.pending}
            onClick={stopRun}
          >
            <Square size={10} aria-hidden />
            {stop.pending ? t('workspace.agentDetail.stopping') : t('workspace.agentDetail.stop')}
          </button>
        ) : null}
      </header>
      <div className="agent-detail__status">
        <SubagentStatus subagent={subagent} startedAt={entry.createdAt} />
        {stop.error ? (
          <span className="agent-detail__error" role="alert">
            {stop.error}
          </span>
        ) : null}
      </div>
      {childId ? (
        props.active ? (
          <ChildThread key={childId} threadId={childId} transport={transport} />
        ) : null
      ) : props.subagentTranscript && props.threadId && !subagent.provider ? (
        props.active ? (
          <NativeSubagentTranscript
            key={`${props.threadId}:${entry.itemId}`}
            threadId={props.threadId}
            itemId={entry.itemId}
            subagent={subagent}
            transport={transport}
          >
            <SnapshotDetail subagent={subagent} transcriptSupported />
          </NativeSubagentTranscript>
        ) : null
      ) : (
        <SnapshotDetail subagent={subagent} />
      )}
    </div>
  )
}

function ChildThread({ threadId, transport }: { threadId: string; transport: Transport }) {
  const transcript = useChildTranscript(transport, threadId)
  const decide = useCallback(
    (approvalId: string, decision: ApprovalDecision) => {
      void transport
        .request('thread.respondToApproval', { threadId, approvalId, decision })
        .catch(() => undefined)
    },
    [threadId, transport],
  )
  const answer = useCallback(
    async (requestId: string, answers: Record<string, string[]>) => {
      await transport.request('thread.respondToUserInput', { threadId, requestId, answers })
    },
    [threadId, transport],
  )
  return (
    <>
      <div className="agent-detail__transcript">
        <Thread
          frameStore={transcript.frameStore}
          threadId={threadId}
          transport={transport}
          keyboardActive={false}
          loading={transcript.loading}
          loadFailure={transcript.failure}
          onRetryLoad={transcript.retry}
          onDecide={decide}
          onAnswerUserInput={answer}
          inlineUserInput
        />
      </div>
      <ChildComposer threadId={threadId} transport={transport} />
    </>
  )
}

/** What the parent's row knows; the whole story for a sub-agent without a chat of its own. */
function SnapshotDetail({
  subagent,
  transcriptSupported,
}: {
  subagent: Subagent
  /** The engine saves its sub-agents' conversations, but this one's was not found. */
  transcriptSupported?: boolean
}) {
  const { t } = useI18n()
  const running = subagent.state === 'running'
  // A TUIFT Code sub-agent gets its chat once it starts; one that never started has none.
  // A running native one may not have written its file yet.
  const note = subagent.provider
    ? running
      ? t('workspace.agentDetail.note.starting')
      : undefined
    : transcriptSupported
      ? running
        ? undefined
        : t('workspace.agentDetail.note.notSaved')
      : t('workspace.agentDetail.note.unsupported')
  return (
    <div className="agent-detail__snapshot">
      {subagent.description ? (
        <section className="agent-detail__section">
          <h4 className="agent-detail__label">{t('workspace.agentDetail.task')}</h4>
          <p className="agent-detail__text">{subagent.description}</p>
        </section>
      ) : null}
      {running && subagent.lastTool ? (
        <section className="agent-detail__section">
          <h4 className="agent-detail__label">{t('workspace.agentDetail.now')}</h4>
          <p className="agent-detail__text">{subagent.lastTool}</p>
        </section>
      ) : null}
      {subagent.summary ? (
        <section className="agent-detail__section">
          <h4 className="agent-detail__label">{t('workspace.agentDetail.report')}</h4>
          <p className="agent-detail__text agent-detail__text--report">{subagent.summary}</p>
        </section>
      ) : null}
      {note ? <p className="agent-detail__note">{note}</p> : null}
    </div>
  )
}

/**
 * A follow-up for a sub-agent TUIFT Code started, written like a Side chat
 * message. While the sub-agent works the prompt waits behind its turn, as in any chat.
 */
function ChildComposer({ threadId, transport }: { threadId: string; transport: Transport }) {
  const { t } = useI18n()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string>()

  const send = () => {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setError(undefined)
    setDraft('')
    transport
      .request('thread.sendTurn', {
        threadId,
        text,
        clientSubmissionId: `agent-detail-${crypto.randomUUID()}`,
      })
      .catch((reason: unknown) => {
        setDraft((current) => current || text)
        setError(reason instanceof Error ? reason.message : t('workspace.agentDetail.sendFailed'))
      })
      .finally(() => setSending(false))
  }

  return (
    <>
      {error ? (
        <span className="agent-detail__error" role="alert">
          {error}
        </span>
      ) : null}
      <div className="workspace-side-chat__composer">
        <textarea
          rows={3}
          value={draft}
          aria-label={t('workspace.agentDetail.message')}
          placeholder={t('workspace.agentDetail.placeholder')}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
            event.preventDefault()
            send()
          }}
        />
        <button
          type="button"
          aria-label={t('workspace.common.sendMessage')}
          disabled={!draft.trim() || sending}
          onClick={send}
        >
          <ArrowUp size={15} aria-hidden />
        </button>
      </div>
    </>
  )
}
