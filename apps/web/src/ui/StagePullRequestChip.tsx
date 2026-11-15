import type {
  CheckoutPullRequest,
  PullRequestChecksSummary,
  PullRequestTarget,
} from '@harness/contracts'
import {
  IconCircleCheck as CheckCircle,
  IconCircleX as XCircle,
  IconGitMerge as GitMerge,
  IconGitPullRequest as GitPullRequest,
  IconGitPullRequestClosed as GitPullRequestClosed,
  IconGitPullRequestDraft as GitPullRequestDraft,
  IconLoader2 as LoaderCircle,
  type TablerIcon,
} from '@tabler/icons-react'
import { useI18n, type MessageKey } from '../i18n/index.js'

type ChipPart = { label: MessageKey; icon: TablerIcon }
type ChipState = ChipPart & { tone: 'open' | 'draft' | 'merged' | 'closed' }

const CHECKS = {
  passing: { label: 'workspace.stagePr.checks.passing', icon: CheckCircle },
  failing: { label: 'workspace.stagePr.checks.failing', icon: XCircle },
  pending: { label: 'workspace.stagePr.checks.pending', icon: LoaderCircle },
  none: undefined,
} satisfies Record<PullRequestChecksSummary, ChipPart | undefined>

const STATES = {
  open: { label: 'workspace.stagePr.state.open', tone: 'open', icon: GitPullRequest },
  draft: { label: 'workspace.stagePr.state.draft', tone: 'draft', icon: GitPullRequestDraft },
  merged: { label: 'workspace.stagePr.state.merged', tone: 'merged', icon: GitMerge },
  closed: { label: 'workspace.stagePr.state.closed', tone: 'closed', icon: GitPullRequestClosed },
} satisfies Record<ChipState['tone'], ChipState>

/** The chat checkout's pull request: number, state and, while open, its checks. */
export function StagePullRequestChip(props: {
  pullRequest: CheckoutPullRequest
  onOpen: (target: PullRequestTarget) => void
}) {
  const { t } = useI18n()
  const { pullRequest } = props
  const state =
    pullRequest.state === 'MERGED'
      ? STATES.merged
      : pullRequest.state === 'CLOSED'
        ? STATES.closed
        : pullRequest.isDraft
          ? STATES.draft
          : STATES.open
  const StateIcon = state.icon
  // Checks of a merged or closed pull request no longer decide anything.
  const checks =
    pullRequest.state === 'OPEN' && pullRequest.checks ? CHECKS[pullRequest.checks] : undefined
  const ChecksIcon = checks?.icon
  const stateLabel = t(state.label)
  const summary = checks
    ? t('workspace.stagePr.summaryChecks', { state: stateLabel, checks: t(checks.label) })
    : stateLabel

  return (
    <button
      type="button"
      className={`stagehead__pr is-${state.tone}`}
      aria-label={t('workspace.stagePr.aria', { number: pullRequest.number, summary })}
      title={`${pullRequest.title}\n#${pullRequest.number} · ${summary}`}
      onClick={() =>
        props.onOpen({ repository: pullRequest.repository, number: pullRequest.number })
      }
    >
      <StateIcon className="stagehead__pr-state" size={14} aria-hidden />
      <span className="stagehead__pr-number">#{pullRequest.number}</span>
      <span className="stagehead__pr-label">{stateLabel}</span>
      {ChecksIcon ? (
        <ChecksIcon
          className={`stagehead__pr-checks is-${pullRequest.checks}`}
          size={13}
          aria-hidden
        />
      ) : null}
    </button>
  )
}
