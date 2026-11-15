import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { createPortal } from 'react-dom'
import type {
  PullRequestAction,
  PullRequestComment,
  PullRequestDetail,
  PullRequestListItem,
  PullRequestMetadataOptions,
  PullRequestReview,
  PullRequestReviewThread,
} from '@harness/contracts'
import {
  IconArrowUp as ArrowUp,
  IconArrowUpRight as ArrowUpRight,
  IconRobot as Bot,
  IconCheck as Check,
  IconCircleCheck as CheckCircle2,
  IconChevronDown as ChevronDown,
  IconChevronRight as ChevronRight,
  IconAlertCircle as CircleAlert,
  IconCircleDot as CircleDot,
  IconClock as Clock3,
  IconDots as Ellipsis,
  IconGitBranch as GitBranch,
  IconGitMerge as GitMerge,
  IconGitPullRequest as GitPullRequest,
  IconGitPullRequestClosed as GitPullRequestClosed,
  IconGitPullRequestDraft as GitPullRequestDraft,
  IconLoader2 as LoaderCircle,
  IconMessage as MessageSquare,
  IconPencil as Pencil,
  IconRefresh as RefreshCw,
  IconRotate as RotateCcw,
  IconSearch as Search,
  IconTag as Tag,
  IconTrash as Trash2,
  IconUser as UserRound,
  IconUsers as Users,
  IconX as X,
  IconCircleX as XCircle,
} from '@tabler/icons-react'
import { t as tNow, tp as tpNow, useI18n } from '../../i18n/index.js'
import type { Transport } from '../../transport.js'
import { AppSelect } from '../AppSelect.js'
import { EmptyState } from '../EmptyState.js'
import { IconMorph } from '../IconMorph.js'
import { Markdown } from '../Markdown.js'
import { Menu, MenuItem } from '../Menu.js'
import { Skeleton, SkeletonRows, SkeletonStatus } from '../Skeleton.js'
import { PullRequestFiles } from './PullRequestFiles.js'
import { PullRequestImages } from './PullRequestImages.js'
import { comparePullRequestText } from './pull-request-text.js'
import { errorMessage as messageOf } from '../../boundary.js'
import { isConfirmEnter } from '../../shortcuts.js'

type DetailTab = 'summary' | 'files'
type ComposerMode = 'comment' | 'approve' | 'request_changes'

type Confirmation = {
  title: string
  detail: string
  confirmLabel: string
  action: PullRequestAction
  danger?: boolean
}

type DetailUpdater = (detail: PullRequestDetail) => PullRequestDetail
type MetadataUpdateContext = Pick<PullRequestMetadataOptions, 'reviewers' | 'assignees' | 'labels'>
type RunPullRequestAction = (action: PullRequestAction, update?: DetailUpdater) => Promise<boolean>
type LabelColorStyle = CSSProperties & { '--label-color': string }
type StoredMergeMethod = NonNullable<PullRequestDetail['autoMerge']>['mergeMethod']

function labelColorStyle(color: string): LabelColorStyle {
  return { '--label-color': `#${color}` }
}

export function PullRequestDetailPane(props: {
  item: PullRequestListItem
  transport: Transport
  onOpenChat: () => void
  onChanged: (detail: PullRequestDetail) => void
}) {
  const { t } = useI18n()
  const [detail, setDetail] = useState<PullRequestDetail>()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<{
    kind: 'success' | 'error'
    text: string
    /** Set for a failed refresh, which Try again can repeat. */
    retry?: true
  }>()
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(() => new Set())
  const [tab, setTab] = useState<DetailTab>('summary')
  const [body, setBody] = useState('')
  const [mode, setMode] = useState<ComposerMode>('comment')
  const [filesRevision, setFilesRevision] = useState(0)
  const [confirmation, setConfirmation] = useState<Confirmation>()
  const request = useRef(0)
  const detailRef = useRef<PullRequestDetail | undefined>(undefined)
  const pendingKeysRef = useRef(new Set<string>())
  const needsRevalidation = useRef(false)
  const revalidationTimer = useRef<number | undefined>(undefined)
  const loadingRef = useRef(false)
  const onChangedRef = useRef(props.onChanged)
  onChangedRef.current = props.onChanged

  const load = useCallback(
    async (refresh = false, silent = false): Promise<PullRequestDetail | undefined> => {
      const id = ++request.current
      loadingRef.current = true
      if (!silent) {
        if (refresh) setRefreshing(true)
        else setLoading(true)
        setError(undefined)
        setNotice((current) => (current?.retry ? undefined : current))
      }
      try {
        const next = await props.transport.request('pullRequests.detail', {
          repository: props.item.repository,
          number: props.item.number,
          refresh,
        })
        if (id === request.current) {
          detailRef.current = next
          setDetail(next)
          if (refresh && !silent) setFilesRevision((current) => current + 1)
          return next
        }
      } catch (cause) {
        if (id === request.current && !silent) {
          if (detailRef.current) setNotice({ kind: 'error', text: messageOf(cause), retry: true })
          else setError(messageOf(cause))
        }
      } finally {
        if (id === request.current) {
          loadingRef.current = false
          setLoading(false)
          setRefreshing(false)
        }
      }
      return undefined
    },
    [props.item.number, props.item.repository, props.transport],
  )

  useEffect(() => {
    void load()
    return () => {
      request.current += 1
      if (revalidationTimer.current !== undefined) {
        window.clearTimeout(revalidationTimer.current)
      }
    }
  }, [load])

  useEffect(() => {
    let lastRefresh = 0
    const refresh = () => {
      if (
        document.hidden ||
        loadingRef.current ||
        pendingKeysRef.current.size > 0 ||
        Date.now() - lastRefresh < 30_000
      )
        return
      lastRefresh = Date.now()
      void load(true, true).then((next) => {
        if (next) onChangedRef.current(next)
      })
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [load])

  const runAction = useCallback<RunPullRequestAction>(
    async (action, update) => {
      const pendingKey = actionPendingKey(action)
      if (pendingKeysRef.current.has(pendingKey)) return false
      pendingKeysRef.current.add(pendingKey)
      setPendingKeys(new Set(pendingKeysRef.current))
      setNotice(undefined)
      let succeeded = false
      try {
        const result = await props.transport.request('pullRequests.action', {
          repository: props.item.repository,
          number: props.item.number,
          action,
        })
        // A load that started before this change can only return the old state.
        // The revalidation scheduled below owns the next read.
        request.current += 1
        loadingRef.current = false
        setLoading(false)
        setRefreshing(false)
        const current = detailRef.current
        if (current) {
          const next = (update ?? ((value) => applySuccessfulAction(value, action)))(current)
          detailRef.current = next
          setDetail(next)
          props.onChanged(next)
        }
        setNotice({ kind: 'success', text: result.message })
        succeeded = true
        return true
      } catch (cause) {
        setNotice({ kind: 'error', text: messageOf(cause) })
        if (action.type === 'merge' || action.type === 'enable_auto_merge') {
          setConfirmation(undefined)
          needsRevalidation.current = true
        }
        return false
      } finally {
        pendingKeysRef.current.delete(pendingKey)
        setPendingKeys(new Set(pendingKeysRef.current))
        if (succeeded) needsRevalidation.current = true
        if (pendingKeysRef.current.size === 0 && needsRevalidation.current) {
          if (revalidationTimer.current !== undefined) {
            window.clearTimeout(revalidationTimer.current)
          }
          revalidationTimer.current = window.setTimeout(() => {
            revalidationTimer.current = undefined
            if (pendingKeysRef.current.size > 0 || !needsRevalidation.current) return
            needsRevalidation.current = false
            void load(true, true).then((next) => {
              if (next) onChangedRef.current(next)
            })
          }, 50)
        }
      }
    },
    [load, props.item.number, props.item.repository, props.onChanged, props.transport],
  )

  if (loading && !detail) return <PullRequestDetailSkeleton />

  if (error && !detail) {
    return (
      <EmptyState
        className="pr-detail-error"
        role="alert"
        icon={<CircleAlert aria-hidden />}
        title={t('workspace.pr.detail.openFailed')}
        detail={error}
      >
        <button type="button" className="pr-button is-secondary" onClick={() => void load(true)}>
          {t('workspace.pr.tryAgain')}
        </button>
      </EmptyState>
    )
  }

  if (!detail) return null

  const canMerge = detail.state === 'OPEN' && !detail.isDraft && detail.mergeable !== 'CONFLICTING'
  const conversationBusy = hasPendingPrefix(pendingKeys, 'conversation:')

  return (
    <div className="pr-detail">
      <header className="pr-detail-toolbar">
        <div className="pr-detail-tabs" role="tablist" aria-label={t('workspace.pr.detail.tabs')}>
          <DetailTabButton active={tab === 'summary'} onClick={() => setTab('summary')}>
            {t('workspace.pr.detail.summary')}
          </DetailTabButton>
          <DetailTabButton active={tab === 'files'} onClick={() => setTab('files')}>
            {t('workspace.pr.detail.files')} <span>{detail.changedFiles}</span>
          </DetailTabButton>
        </div>

        <div className="pr-detail-actions">
          <button
            type="button"
            className="pr-icon-button"
            aria-label={t('workspace.pr.detail.refresh')}
            title={t('workspace.pr.detail.refresh')}
            disabled={refreshing}
            onClick={() => void load(true)}
          >
            <RefreshCw size={14} className={refreshing ? 'is-spinning' : undefined} aria-hidden />
          </button>
          <a
            className="pr-icon-button"
            href={detail.url}
            target="_blank"
            rel="noreferrer"
            aria-label={t('workspace.pr.detail.openOnGithub')}
            title={t('workspace.pr.detail.openOnGithub')}
          >
            <ArrowUpRight size={14} aria-hidden />
          </a>
          <button
            type="button"
            className="pr-button is-secondary pr-chat-button"
            disabled={!detail.localProjectPath}
            title={
              detail.localProjectPath
                ? t('workspace.pr.detail.chatLocal')
                : t('workspace.pr.detail.chatAdd')
            }
            onClick={props.onOpenChat}
          >
            <MessageSquare size={13} aria-hidden />
            {t('workspace.pr.detail.chat')}
          </button>
          <AutoMergeMenu
            detail={detail}
            busy={pendingKeys.has('auto-merge')}
            onAction={runAction}
          />
          <MergeMenu
            detail={detail}
            disabled={!canMerge || pendingKeys.has('merge')}
            onChoose={(method) =>
              setConfirmation({
                title: t('workspace.pr.merge.confirm.title', { number: detail.number }),
                detail:
                  t(`workspace.pr.merge.confirm.${method}`, {
                    head: detail.headRefName,
                    base: detail.baseRefName,
                  }) +
                  (detail.mergeMethods.deleteBranchOnMerge
                    ? ` ${t('workspace.pr.merge.confirm.deleteBranch')}`
                    : ''),
                confirmLabel: t('workspace.pr.merge.confirm.button'),
                action: {
                  type: 'merge',
                  method,
                  expectedHeadOid: detail.headRefOid,
                  // GitHub applies delete_branch_on_merge itself. Passing gh's
                  // --delete-branch would additionally touch a local checkout.
                  deleteBranch: false,
                },
              })
            }
          />
          {detail.state === 'OPEN' || detail.state === 'CLOSED' ? (
            <MoreMenu
              detail={detail}
              busy={
                pendingKeys.has('status') ||
                pendingKeys.has('branch-update') ||
                pendingKeys.has('checks')
              }
              onAction={runAction}
              onConfirm={setConfirmation}
            />
          ) : null}
        </div>
      </header>

      {notice ? (
        <div
          className={`pr-notice is-${notice.kind}`}
          role={notice.kind === 'error' ? 'alert' : 'status'}
        >
          {notice.kind === 'success' ? (
            <Check size={13} aria-hidden />
          ) : (
            <CircleAlert size={13} aria-hidden />
          )}
          <span>{notice.text}</span>
          {notice.retry ? (
            <button type="button" className="pr-notice-action" onClick={() => void load(true)}>
              {t('workspace.pr.tryAgain')}
            </button>
          ) : null}
          <button
            type="button"
            aria-label={t('workspace.pr.list.dismiss')}
            title={t('workspace.pr.list.dismiss')}
            onClick={() => setNotice(undefined)}
          >
            <X size={12} aria-hidden />
          </button>
        </div>
      ) : null}

      <div className={`pr-detail-body is-${tab}`}>
        <PullRequestImages
          transport={props.transport}
          repository={detail.repository}
          refOid={detail.headRefOid}
        >
          {tab === 'summary' ? (
            <PullRequestSummary
              detail={detail}
              transport={props.transport}
              pendingKeys={pendingKeys}
              conversationBusy={conversationBusy}
              onAction={runAction}
              onConfirm={setConfirmation}
            />
          ) : (
            <PullRequestFiles
              key={`${detail.headRefOid}:${detail.baseRefOid}:${detail.baseRefName}:${filesRevision}`}
              detail={detail}
              transport={props.transport}
              onAction={runAction}
              actionBusy={conversationBusy}
              onComparisonChanged={() => {
                void load(true)
              }}
              onConfirmAction={(action) =>
                setConfirmation({
                  title: t('workspace.pr.detail.deleteReview.title'),
                  detail: t('workspace.pr.detail.deleteReview.detail'),
                  confirmLabel: t('workspace.pr.files.deleteComment'),
                  danger: true,
                  action,
                })
              }
            />
          )}
        </PullRequestImages>
      </div>

      {tab === 'summary' && detail.state === 'OPEN' ? (
        <PullRequestComposer
          detail={detail}
          body={body}
          setBody={setBody}
          mode={mode}
          setMode={setMode}
          busy={pendingKeys.has('composer')}
          onAction={runAction}
        />
      ) : null}

      {confirmation ? (
        <ConfirmDialog
          confirmation={confirmation}
          busy={pendingKeys.has(actionPendingKey(confirmation.action))}
          onClose={() => setConfirmation(undefined)}
          onConfirm={async () => {
            if (await runAction(confirmation.action)) setConfirmation(undefined)
          }}
        />
      ) : null}
    </div>
  )
}

function PullRequestSummary(props: {
  detail: PullRequestDetail
  transport: Transport
  pendingKeys: ReadonlySet<string>
  conversationBusy: boolean
  onAction: RunPullRequestAction
  onConfirm: (confirmation: Confirmation) => void
}) {
  const { t, tp, language } = useI18n()
  const detail = props.detail
  const checks = checkSummary(detail)
  const status = pullRequestStatus(detail)
  const [descriptionOpen, setDescriptionOpen] = useState(true)
  const [titleEditing, setTitleEditing] = useState(false)
  const [descriptionEditing, setDescriptionEditing] = useState(false)
  const [editFocus, setEditFocus] = useState<'title' | 'description'>('title')
  const [metadataOptions, setMetadataOptions] = useState<PullRequestMetadataOptions>()
  const [metadataOptionsLoading, setMetadataOptionsLoading] = useState(false)
  const [metadataOptionsError, setMetadataOptionsError] = useState<string>()
  const metadataOptionsRef = useRef<PullRequestMetadataOptions | undefined>(undefined)
  const metadataRequest = useRef<Promise<void> | undefined>(undefined)
  const canManageMetadata =
    detail.relationship === 'authored' ||
    detail.relationship === 'both' ||
    detail.permissions.canPush

  const beginTitleEditing = () => {
    setEditFocus('title')
    setTitleEditing(true)
  }
  const beginDescriptionEditing = () => {
    setEditFocus('description')
    setDescriptionOpen(true)
    setDescriptionEditing(true)
  }

  const loadMetadataOptions = useCallback(
    async (refresh = false) => {
      if (!refresh && metadataOptionsRef.current) return
      if (!refresh && metadataRequest.current) return metadataRequest.current
      setMetadataOptionsLoading(true)
      setMetadataOptionsError(undefined)
      const pending = props.transport
        .request('pullRequests.metadataOptions', {
          repository: detail.repository,
          ...(refresh ? { refresh: true } : {}),
        })
        .then((next) => {
          metadataOptionsRef.current = next
          setMetadataOptions(next)
        })
        .catch((cause) => setMetadataOptionsError(messageOf(cause)))
        .finally(() => {
          metadataRequest.current = undefined
          setMetadataOptionsLoading(false)
        })
      metadataRequest.current = pending
      return pending
    },
    [detail.repository, props.transport],
  )

  const reviewers = mergeActors(
    metadataOptions?.reviewers ?? [],
    detail.reviewers.map((reviewer) => reviewer.actor),
    detail.requestedReviewers,
  ).filter((actorValue) => actorValue.login !== detail.author.login)
  const assignees = mergeActors(metadataOptions?.assignees ?? [], detail.assignees)
  const labels = mergeLabels(metadataOptions?.labels ?? [], detail.labels)
  const milestones = mergeMilestones(metadataOptions?.milestones ?? [], detail.milestone)
  const branches = mergeStrings(metadataOptions?.baseBranches ?? [], [detail.baseRefName])
  const requestedReviewers = lowerSet(
    detail.requestedReviewers.map((actorValue) => actorValue.login),
  )
  const currentAssignees = lowerSet(detail.assignees.map((actorValue) => actorValue.login))
  const currentLabels = lowerSet(detail.labels.map((label) => label.name))
  const reviewerStates = new Map(
    detail.reviewers.map((reviewer) => [reviewer.actor.login.toLowerCase(), reviewer.state]),
  )
  const runMetadataAction = (action: Extract<PullRequestAction, { type: 'update_metadata' }>) =>
    props.onAction(action, (current) =>
      applySuccessfulAction(current, action, { reviewers, assignees, labels }),
    )
  const pickerState = (source: PullRequestMetadataOptions['unavailable'][number]) => ({
    loading: metadataOptionsLoading,
    loaded: Boolean(metadataOptions),
    error: metadataOptionsError,
    unavailable: metadataOptions?.unavailable.includes(source) ?? false,
    truncated: metadataOptions?.truncated ?? false,
    onLoad: loadMetadataOptions,
  })

  const branchValue = (
    <span className="pr-branch-value">
      <strong>{detail.headRefName}</strong>
      <ChevronRight size={13} aria-hidden />
      <strong>{detail.baseRefName}</strong>
      <span className="pr-branch-stats">
        <span className="is-addition">+{detail.additions.toLocaleString(language)}</span>
        <span className="is-deletion">−{detail.deletions.toLocaleString(language)}</span>
      </span>
    </span>
  )
  const reviewerValue =
    detail.reviewers.length > 0 ? (
      <span className="pr-actor-stack">
        {detail.reviewers.slice(0, 5).map((reviewer) => (
          <Actor key={reviewer.actor.login} actor={reviewer.actor} state={reviewer.state} compact />
        ))}
        {detail.reviewers.length > 5 ? <span>+{detail.reviewers.length - 5}</span> : null}
      </span>
    ) : (
      <span className="is-muted">{t('workspace.pr.summary.noReviewers')}</span>
    )
  const assigneeValue =
    detail.assignees.length > 0 ? (
      <span className="pr-actor-stack">
        {detail.assignees.slice(0, 5).map((assignee) => (
          <Actor key={assignee.login} actor={assignee} compact />
        ))}
        {detail.assignees.length > 5 ? <span>+{detail.assignees.length - 5}</span> : null}
      </span>
    ) : (
      <span className="is-muted">{t('workspace.pr.summary.noAssignees')}</span>
    )

  return (
    <div className="pr-summary-scroll">
      <article className="pr-summary">
        <header className="pr-summary-head">
          <div className="pr-summary-title">
            {titleEditing ? (
              <PullRequestTitleEditor
                title={detail.title}
                busy={props.pendingKeys.has('edit')}
                autoFocus={editFocus === 'title'}
                onCancel={() => setTitleEditing(false)}
                onSave={async (title) => {
                  if (await props.onAction({ type: 'edit', title })) setTitleEditing(false)
                }}
              />
            ) : (
              <div>
                <h2>{detail.title}</h2>
                <button
                  type="button"
                  className="pr-inline-icon"
                  aria-label={t('workspace.pr.summary.editTitle')}
                  disabled={props.pendingKeys.has('edit')}
                  onClick={beginTitleEditing}
                >
                  <Pencil size={13} aria-hidden />
                </button>
              </div>
            )}
            <p>
              <Actor actor={detail.author} />
              <span>·</span>
              <time dateTime={detail.createdAt}>{longRelativeTime(detail.createdAt)}</time>
            </p>
          </div>
        </header>

        <section className="pr-facts" aria-label={t('workspace.pr.summary.metadata')}>
          <Fact
            icon={<GitBranch size={15} aria-hidden />}
            label={t('workspace.pr.summary.fact.branch')}
          >
            {canManageMetadata && detail.state === 'OPEN' ? (
              <PullRequestMetadataPicker
                label={t('workspace.pr.summary.branch.label')}
                placeholder={t('workspace.pr.summary.branch.find')}
                indicator="chevron"
                options={branches.map((branch) => ({
                  key: branch,
                  label: branch,
                  selected: branch === detail.baseRefName,
                  icon: <GitBranch size={14} aria-hidden />,
                }))}
                {...pickerState('baseBranches')}
                busy={
                  props.pendingKeys.has('metadata:branch') || props.pendingKeys.has('branch-update')
                }
                closeOnSelect
                onSelect={(branch) =>
                  branch === detail.baseRefName
                    ? Promise.resolve(true)
                    : runMetadataAction(metadataAction({ baseRefName: branch }))
                }
                trigger={branchValue}
              />
            ) : (
              branchValue
            )}
          </Fact>

          <Fact
            icon={<Users size={15} aria-hidden />}
            label={t('workspace.pr.summary.fact.reviewers')}
          >
            {canManageMetadata && detail.state === 'OPEN' ? (
              <PullRequestMetadataPicker
                label={t('workspace.pr.summary.reviewers.label')}
                placeholder={t('workspace.pr.summary.reviewers.find')}
                indicator="ellipsis"
                options={reviewers.map((actorValue) => {
                  const key = actorValue.login.toLowerCase()
                  const state = reviewerStates.get(key)
                  const requested = requestedReviewers.has(key)
                  return {
                    key: actorValue.login,
                    label: actorValue.login,
                    detail: requested
                      ? t('workspace.pr.summary.reviewers.requested')
                      : state
                        ? reviewerPickerStateLabel(state)
                        : actorValue.isBot
                          ? t('workspace.pr.summary.reviewers.bot')
                          : t('workspace.pr.summary.reviewers.collaborator'),
                    selected: requested || Boolean(state),
                    icon: <MetadataActorMark actor={actorValue} />,
                  }
                })}
                {...pickerState('reviewers')}
                busy={props.pendingKeys.has('metadata:reviewers')}
                preserveTriggerLayout
                onSelect={(login) =>
                  runMetadataAction(
                    metadataAction(
                      requestedReviewers.has(login.toLowerCase())
                        ? { removeReviewers: [login] }
                        : { addReviewers: [login] },
                    ),
                  )
                }
                trigger={reviewerValue}
              />
            ) : (
              reviewerValue
            )}
          </Fact>

          <Fact
            icon={<UserRound size={15} aria-hidden />}
            label={t('workspace.pr.summary.fact.assignees')}
          >
            {canManageMetadata ? (
              <PullRequestMetadataPicker
                label={t('workspace.pr.summary.assignees.label')}
                placeholder={t('workspace.pr.summary.assignees.find')}
                options={assignees.map((actorValue) => ({
                  key: actorValue.login,
                  label: actorValue.login,
                  detail: actorValue.isBot ? t('workspace.pr.summary.assignees.bot') : undefined,
                  selected: currentAssignees.has(actorValue.login.toLowerCase()),
                  icon: <MetadataActorMark actor={actorValue} />,
                }))}
                {...pickerState('assignees')}
                busy={props.pendingKeys.has('metadata:assignees')}
                preserveTriggerLayout
                onSelect={(login) =>
                  runMetadataAction(
                    metadataAction(
                      currentAssignees.has(login.toLowerCase())
                        ? { removeAssignees: [login] }
                        : { addAssignees: [login] },
                    ),
                  )
                }
                trigger={assigneeValue}
              />
            ) : (
              assigneeValue
            )}
          </Fact>

          <Fact icon={<Tag size={15} aria-hidden />} label={t('workspace.pr.summary.fact.labels')}>
            {canManageMetadata ? (
              <PullRequestMetadataPicker
                label={t('workspace.pr.summary.labels.label')}
                placeholder={t('workspace.pr.summary.labels.find')}
                options={labels.map((label) => ({
                  key: label.name,
                  label: label.name,
                  detail: label.description,
                  selected: currentLabels.has(label.name.toLowerCase()),
                  icon: (
                    <span className="pr-picker-label-color" style={labelColorStyle(label.color)} />
                  ),
                }))}
                {...pickerState('labels')}
                busy={props.pendingKeys.has('metadata:labels')}
                preserveTriggerLayout={detail.labels.length === 0}
                onSelect={(name) =>
                  runMetadataAction(
                    metadataAction(
                      currentLabels.has(name.toLowerCase())
                        ? { removeLabels: [name] }
                        : { addLabels: [name] },
                    ),
                  )
                }
                trigger={
                  detail.labels.length > 0 ? (
                    <span className="pr-label-stack">
                      {detail.labels.slice(0, 4).map((label) => (
                        <span
                          className="pr-label"
                          key={label.name}
                          style={labelColorStyle(label.color)}
                        >
                          {label.name}
                        </span>
                      ))}
                      {detail.labels.length > 4 ? <span>+{detail.labels.length - 4}</span> : null}
                    </span>
                  ) : (
                    <span className="is-muted">{t('workspace.pr.summary.noLabels')}</span>
                  )
                }
              />
            ) : detail.labels.length > 0 ? (
              <span className="pr-label-stack">
                {detail.labels.map((label) => (
                  <span className="pr-label" key={label.name} style={labelColorStyle(label.color)}>
                    {label.name}
                  </span>
                ))}
              </span>
            ) : (
              <span className="is-muted">{t('workspace.pr.summary.noLabels')}</span>
            )}
          </Fact>

          <Fact
            icon={<Clock3 size={15} aria-hidden />}
            label={t('workspace.pr.summary.fact.milestone')}
          >
            {canManageMetadata ? (
              <PullRequestMetadataPicker
                label={t('workspace.pr.summary.milestone.label')}
                placeholder={t('workspace.pr.summary.milestone.find')}
                indicator="chevron"
                options={[
                  {
                    key: '',
                    label: t('workspace.pr.summary.noMilestone'),
                    selected: !detail.milestone,
                    icon: <X size={13} aria-hidden />,
                  },
                  ...milestones.map((milestone) => ({
                    key: milestone.title,
                    label: milestone.title,
                    selected: milestone.title === detail.milestone,
                    icon: <Clock3 size={13} aria-hidden />,
                  })),
                ]}
                {...pickerState('milestones')}
                busy={props.pendingKeys.has('metadata:milestone')}
                closeOnSelect
                preserveTriggerLayout={!detail.milestone}
                onSelect={(title) =>
                  title === (detail.milestone ?? '')
                    ? Promise.resolve(true)
                    : runMetadataAction(metadataAction({ milestone: title || null }))
                }
                trigger={
                  detail.milestone ? (
                    <span className="pr-milestone">{detail.milestone}</span>
                  ) : (
                    <span className="is-muted">{t('workspace.pr.summary.noMilestone')}</span>
                  )
                }
              />
            ) : detail.milestone ? (
              <span className="pr-milestone">{detail.milestone}</span>
            ) : (
              <span className="is-muted">{t('workspace.pr.summary.noMilestone')}</span>
            )}
          </Fact>

          <Fact
            icon={<MessageSquare size={15} aria-hidden />}
            label={t('workspace.pr.summary.fact.comments')}
          >
            <span>{tp('workspace.pr.summary.comments', detail.comments.length)}</span>
            {detail.reviewThreads.some((thread) => !thread.resolved) ? (
              <span>
                {tp(
                  'workspace.pr.summary.openThreads',
                  detail.reviewThreads.filter((thread) => !thread.resolved).length,
                )}
              </span>
            ) : null}
          </Fact>
          <Fact icon={checks.icon} label={t('workspace.pr.summary.fact.checks')}>
            <span className={`pr-status-text is-${checks.tone}`}>
              {props.pendingKeys.has('checks') ? (
                <LoaderCircle size={13} className="is-spinning" aria-hidden />
              ) : null}
              {checks.label}
            </span>
          </Fact>
          <Fact icon={status.icon} label={t('workspace.pr.summary.fact.status')}>
            <PullRequestStatusPicker
              detail={detail}
              status={status}
              disabled={!canManageMetadata}
              busy={props.pendingKeys.has('status')}
              onAction={props.onAction}
              onConfirm={props.onConfirm}
            />
          </Fact>
        </section>

        <section className="pr-description">
          <div className="pr-section-title">
            <button
              type="button"
              className="pr-description-toggle"
              aria-expanded={descriptionOpen}
              onClick={() => setDescriptionOpen((current) => !current)}
            >
              {t('workspace.pr.summary.description')}
              <ChevronDown size={13} aria-hidden />
            </button>
            {!descriptionEditing ? (
              <button
                type="button"
                className="pr-inline-icon"
                aria-label={t('workspace.pr.summary.editDescription')}
                disabled={props.pendingKeys.has('edit')}
                onClick={beginDescriptionEditing}
              >
                <Pencil size={13} aria-hidden />
              </button>
            ) : null}
          </div>
          {descriptionOpen ? (
            descriptionEditing ? (
              <PullRequestDescriptionEditor
                body={detail.body}
                busy={props.pendingKeys.has('edit')}
                autoFocus={editFocus === 'description'}
                onCancel={() => setDescriptionEditing(false)}
                onSave={async (body) => {
                  if (await props.onAction({ type: 'edit', body })) setDescriptionEditing(false)
                }}
              />
            ) : detail.body.trim() ? (
              <div className="pr-description-preview">
                <Markdown text={detail.body} />
              </div>
            ) : (
              <button
                type="button"
                className="pr-empty-description"
                onClick={beginDescriptionEditing}
              >
                {t('workspace.pr.summary.addDescription')}
              </button>
            )
          ) : null}
        </section>

        <PullRequestActivity
          detail={detail}
          busy={props.conversationBusy}
          onAction={props.onAction}
          onConfirm={props.onConfirm}
        />

        {detail.checks.length > 0 ? <PullRequestChecks detail={detail} /> : null}
      </article>
    </div>
  )
}

function PullRequestTitleEditor(props: {
  title: string
  busy: boolean
  autoFocus: boolean
  onCancel: () => void
  onSave: (title: string) => Promise<void>
}) {
  const { t } = useI18n()
  const [title, setTitle] = useState(props.title)
  const cancelled = useRef(false)
  const submitting = useRef(false)

  const save = () => {
    const nextTitle = title.trim()
    if (props.busy || submitting.current || cancelled.current) return
    if (!nextTitle || nextTitle === props.title) {
      props.onCancel()
      return
    }
    submitting.current = true
    void props.onSave(nextTitle).finally(() => {
      submitting.current = false
    })
  }

  return (
    <input
      className="pr-title-editor"
      aria-label={t('workspace.reviewComposer.pr.titleLabel')}
      aria-busy={props.busy}
      value={title}
      readOnly={props.busy}
      autoFocus={props.autoFocus}
      onBlur={save}
      onChange={(event) => setTitle(event.target.value)}
      onKeyDown={(event) => {
        if (isConfirmEnter(event) && !props.busy) {
          event.preventDefault()
          event.currentTarget.blur()
          return
        }
        if (event.key !== 'Escape' || props.busy) return
        event.preventDefault()
        cancelled.current = true
        props.onCancel()
      }}
    />
  )
}

function PullRequestDescriptionEditor(props: {
  body: string
  busy: boolean
  autoFocus: boolean
  onCancel: () => void
  onSave: (body: string) => Promise<void>
}) {
  const { t } = useI18n()
  const [body, setBody] = useState(props.body)
  const input = useRef<HTMLTextAreaElement>(null)
  const cancelled = useRef(false)
  const submitting = useRef(false)

  useEffect(() => {
    const textarea = input.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [body])

  const save = () => {
    if (props.busy || submitting.current || cancelled.current) return
    if (body === props.body) {
      props.onCancel()
      return
    }
    submitting.current = true
    void props.onSave(body).finally(() => {
      submitting.current = false
    })
  }

  return (
    <textarea
      ref={input}
      className="pr-description-editor"
      aria-label={t('workspace.reviewComposer.pr.descriptionLabel')}
      aria-busy={props.busy}
      value={body}
      placeholder={t('workspace.pr.summary.addDescription')}
      readOnly={props.busy}
      autoFocus={props.autoFocus}
      onBlur={save}
      onChange={(event) => setBody(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !props.busy) {
          event.preventDefault()
          cancelled.current = true
          props.onCancel()
          return
        }
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !props.busy) {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
    />
  )
}

type PullRequestPickerOption = {
  key: string
  label: string
  detail?: string | undefined
  selected: boolean
  icon: ReactNode
}

type PullRequestMetadataPickerProps = {
  label: string
  placeholder: string
  indicator?: 'chevron' | 'ellipsis' | undefined
  trigger: ReactNode
  options: PullRequestPickerOption[]
  loading: boolean
  loaded: boolean
  error: string | undefined
  unavailable: boolean
  truncated: boolean
  busy: boolean
  closeOnSelect?: boolean | undefined
  preserveTriggerLayout?: boolean | undefined
  onLoad: (refresh?: boolean) => Promise<void>
  onSelect: (key: string) => Promise<boolean>
}

function PullRequestMetadataPicker(props: PullRequestMetadataPickerProps) {
  return (
    <Menu
      align="left"
      drop="down"
      disabled={props.busy}
      label={props.label}
      triggerClassName={`pr-fact-menu-trigger${props.preserveTriggerLayout ? ' is-shape-preserving' : ''}${props.busy ? ' is-pending' : ''}`}
      panelRole="dialog"
      panelLabel={props.label}
      panelClassName="pr-metadata-menu"
      trigger={() => (
        <span className="pr-fact-menu-value">
          <span>{props.trigger}</span>
          <span className="pr-fact-menu-indicator" aria-hidden>
            <IconMorph active={props.busy ? 2 : props.indicator === 'ellipsis' ? 1 : 0}>
              <ChevronDown size={13} />
              <Ellipsis size={15} />
              <LoaderCircle size={13} className="is-spinning" />
            </IconMorph>
          </span>
        </span>
      )}
    >
      {(close) => <PullRequestMetadataPickerPanel {...props} onClose={close} />}
    </Menu>
  )
}

function PullRequestMetadataPickerPanel(
  props: Omit<PullRequestMetadataPickerProps, 'trigger'> & { onClose: () => void },
) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [selectingKey, setSelectingKey] = useState<string>()
  useEffect(() => {
    void props.onLoad()
  }, [props.onLoad])

  const normalizedQuery = query.trim().toLowerCase()
  const options = props.options
    .filter((option) =>
      `${option.label} ${option.detail ?? ''}`.toLowerCase().includes(normalizedQuery),
    )
    .sort((left, right) => {
      if (left.selected !== right.selected) return left.selected ? -1 : 1
      return comparePullRequestText(left.label, right.label)
    })
  const waiting = !props.loaded || props.loading

  return (
    <div className="pr-picker">
      <label className="pr-picker-search">
        <Search size={14} aria-hidden />
        <input
          value={query}
          autoFocus
          aria-label={props.placeholder}
          placeholder={props.placeholder}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="pr-picker-options">
        {options.map((option) => (
          <button
            type="button"
            className={`pr-picker-option${option.selected ? ' is-selected' : ''}`}
            key={option.key || '__empty'}
            disabled={props.busy || selectingKey !== undefined}
            aria-busy={selectingKey === option.key}
            onClick={() => {
              setSelectingKey(option.key)
              void props
                .onSelect(option.key)
                .then((success) => {
                  if (success && props.closeOnSelect) props.onClose()
                })
                .finally(() => setSelectingKey(undefined))
            }}
          >
            <span className="pr-picker-option-icon">{option.icon}</span>
            <span className="pr-picker-option-copy">
              <strong>{option.label}</strong>
              {option.detail ? <small>{option.detail}</small> : null}
            </span>
            {selectingKey === option.key ? (
              <LoaderCircle size={14} className="is-spinning" aria-hidden />
            ) : option.selected ? (
              <Check size={14} aria-hidden />
            ) : null}
          </button>
        ))}
        {waiting ? (
          <SkeletonStatus label={t('workspace.pr.picker.loading')} className="pr-picker-loading">
            <SkeletonRows rows={options.length > 0 ? 2 : 4} icon="circle" detail />
          </SkeletonStatus>
        ) : null}
        {!waiting && options.length === 0 ? (
          <p className="pr-picker-empty">
            {normalizedQuery ? t('workspace.pr.picker.noMatch') : t('workspace.pr.picker.none')}
          </p>
        ) : null}
      </div>
      {props.error ? (
        <button type="button" className="pr-picker-retry" onClick={() => void props.onLoad(true)}>
          {t('workspace.pr.picker.retry', { error: props.error })}
        </button>
      ) : props.unavailable ? (
        <p className="pr-picker-note">{t('workspace.pr.picker.unavailable')}</p>
      ) : props.truncated ? (
        <p className="pr-picker-note">{t('workspace.pr.picker.truncated')}</p>
      ) : null}
    </div>
  )
}

function PullRequestStatusPicker(props: {
  detail: PullRequestDetail
  status: ReturnType<typeof pullRequestStatus>
  disabled: boolean
  busy: boolean
  onAction: RunPullRequestAction
  onConfirm: (confirmation: Confirmation) => void
}) {
  const { t } = useI18n()
  const content = (
    <span className={`pr-status-pill is-${props.status.tone}`}>
      {props.status.label}
      {props.busy ? (
        <LoaderCircle size={12} className="is-spinning" aria-hidden />
      ) : props.detail.state !== 'MERGED' && !props.disabled ? (
        <ChevronDown size={12} aria-hidden />
      ) : null}
    </span>
  )
  if (props.detail.state === 'MERGED' || props.disabled) return content

  const choose = async (target: 'draft' | 'ready') => {
    if (props.detail.state === 'CLOSED') {
      const reopened = await props.onAction({ type: 'reopen' })
      if (!reopened) return
    }
    if (target === 'draft' && !props.detail.isDraft) {
      await props.onAction({ type: 'set_draft', draft: true })
    } else if (target === 'ready' && props.detail.isDraft) {
      await props.onAction({ type: 'set_draft', draft: false })
    }
  }

  return (
    <Menu
      align="left"
      drop="down"
      disabled={props.busy}
      label={t('workspace.pr.status.label')}
      triggerClassName={`pr-status-menu-trigger${props.busy ? ' is-pending' : ''}`}
      panelClassName="pr-status-menu"
      trigger={() => content}
    >
      {(close) => (
        <>
          <MenuItem
            title={t('workspace.pr.state.draft')}
            icon={<GitPullRequestDraft size={14} aria-hidden />}
            active={props.detail.state === 'OPEN' && props.detail.isDraft}
            onClick={() => {
              close()
              void choose('draft')
            }}
          />
          <MenuItem
            title={t('workspace.pr.status.ready')}
            icon={<CheckCircle2 size={14} aria-hidden />}
            active={props.detail.state === 'OPEN' && !props.detail.isDraft}
            onClick={() => {
              close()
              void choose('ready')
            }}
          />
          <MenuItem
            title={t('workspace.pr.state.closed')}
            icon={<GitPullRequestClosed size={14} aria-hidden />}
            active={props.detail.state === 'CLOSED'}
            onClick={() => {
              close()
              if (props.detail.state === 'CLOSED') return
              props.onConfirm({
                title: t('workspace.pr.status.closeTitle', { number: props.detail.number }),
                detail: t('workspace.pr.status.closeDetail'),
                confirmLabel: t('workspace.pr.status.closeButton'),
                danger: true,
                action: { type: 'close' },
              })
            }}
          />
        </>
      )}
    </Menu>
  )
}

function MetadataActorMark(props: { actor: PullRequestDetail['author'] }) {
  return <GitHubAvatar actor={props.actor} className="pr-picker-avatar" botSize={12} />
}

function metadataAction(
  changes: Partial<Omit<Extract<PullRequestAction, { type: 'update_metadata' }>, 'type'>>,
): Extract<PullRequestAction, { type: 'update_metadata' }> {
  return {
    type: 'update_metadata',
    addReviewers: [],
    removeReviewers: [],
    addAssignees: [],
    removeAssignees: [],
    addLabels: [],
    removeLabels: [],
    ...changes,
  }
}

function actionPendingKey(action: PullRequestAction): string {
  switch (action.type) {
    case 'update_metadata': {
      const fields: string[] = []
      if (action.baseRefName !== undefined) fields.push('branch')
      if (action.addReviewers.length > 0 || action.removeReviewers.length > 0) {
        fields.push('reviewers')
      }
      if (action.addAssignees.length > 0 || action.removeAssignees.length > 0) {
        fields.push('assignees')
      }
      if (action.addLabels.length > 0 || action.removeLabels.length > 0) fields.push('labels')
      if (action.milestone !== undefined) fields.push('milestone')
      return `metadata:${fields.length === 1 ? fields[0] : 'all'}`
    }
    case 'comment':
    case 'review':
      return 'composer'
    case 'inline_comment':
      return `conversation:inline:${action.path}:${action.side}:${action.line}`
    case 'reply_to_review':
      return `conversation:reply:${action.commentId}`
    case 'update_comment':
    case 'delete_comment':
      return `conversation:${action.kind}:${action.commentId}`
    case 'resolve_thread':
      return `conversation:thread:${action.threadId}`
    case 'set_draft':
    case 'close':
    case 'reopen':
      return 'status'
    case 'edit':
      return 'edit'
    case 'update_branch':
      return 'branch-update'
    case 'rerun_checks':
      return 'checks'
    case 'merge':
      return 'merge'
    case 'enable_auto_merge':
    case 'disable_auto_merge':
      return 'auto-merge'
  }
}

function hasPendingPrefix(pending: ReadonlySet<string>, prefix: string): boolean {
  for (const key of pending) {
    if (key.startsWith(prefix)) return true
  }
  return false
}

function applySuccessfulAction(
  detail: PullRequestDetail,
  action: PullRequestAction,
  metadata?: MetadataUpdateContext,
): PullRequestDetail {
  switch (action.type) {
    case 'comment':
      return { ...detail, commentsCount: detail.commentsCount + 1 }
    case 'update_comment':
      return updateCommentBody(detail, action.kind, action.commentId, action.body)
    case 'delete_comment':
      return removeComment(detail, action.kind, action.commentId)
    case 'resolve_thread':
      return {
        ...detail,
        reviewThreads: detail.reviewThreads.map((thread) =>
          thread.id === action.threadId ? { ...thread, resolved: action.resolved } : thread,
        ),
      }
    case 'edit': {
      const edited = { ...detail }
      if (action.title !== undefined) edited.title = action.title
      if (action.body !== undefined) edited.body = action.body
      return edited
    }
    case 'update_metadata':
      return applyMetadataUpdate(detail, action, metadata)
    case 'set_draft':
      return { ...detail, state: 'OPEN', isDraft: action.draft }
    case 'close':
      return { ...detail, state: 'CLOSED' }
    case 'reopen': {
      const { closedAt: _closedAt, ...open } = detail
      return { ...open, state: 'OPEN' }
    }
    case 'merge':
      return { ...detail, state: 'MERGED', isDraft: false }
    case 'enable_auto_merge':
      return {
        ...detail,
        autoMerge: { mergeMethod: storedMergeMethod(action.method) },
      }
    case 'disable_auto_merge': {
      const { autoMerge: _autoMerge, ...withoutAutoMerge } = detail
      return withoutAutoMerge
    }
    default:
      return detail
  }
}

function applyMetadataUpdate(
  detail: PullRequestDetail,
  action: Extract<PullRequestAction, { type: 'update_metadata' }>,
  metadata?: MetadataUpdateContext,
): PullRequestDetail {
  const availableActors = mergeActors(
    metadata?.reviewers ?? [],
    metadata?.assignees ?? [],
    detail.requestedReviewers,
    detail.assignees,
    detail.reviewers.map((reviewer) => reviewer.actor),
  )
  const actorByLogin = new Map(
    availableActors.map((actorValue) => [actorValue.login.toLowerCase(), actorValue]),
  )
  const actorFor = (login: string) =>
    actorByLogin.get(login.toLowerCase()) ?? {
      login,
      isBot: /(?:\[bot\]|-bot$|bot$)/i.test(login),
    }
  const addReviewers = lowerSet(action.addReviewers)
  const removeReviewers = lowerSet(action.removeReviewers)
  const requestedReviewers = detail.requestedReviewers.filter(
    (actorValue) => !removeReviewers.has(actorValue.login.toLowerCase()),
  )
  for (const login of action.addReviewers) {
    if (
      !requestedReviewers.some(
        (actorValue) => actorValue.login.toLowerCase() === login.toLowerCase(),
      )
    ) {
      requestedReviewers.push(actorFor(login))
    }
  }
  const reviewers = detail.reviewers.filter((reviewer) => {
    const key = reviewer.actor.login.toLowerCase()
    if (addReviewers.has(key)) return false
    return !(removeReviewers.has(key) && reviewer.state === 'REQUESTED')
  })
  for (const login of action.addReviewers) {
    reviewers.push({ actor: actorFor(login), state: 'REQUESTED' })
  }

  const removeAssignees = lowerSet(action.removeAssignees)
  const assignees = detail.assignees.filter(
    (actorValue) => !removeAssignees.has(actorValue.login.toLowerCase()),
  )
  for (const login of action.addAssignees) {
    if (!assignees.some((actorValue) => actorValue.login.toLowerCase() === login.toLowerCase())) {
      assignees.push(actorFor(login))
    }
  }

  const removeLabels = lowerSet(action.removeLabels)
  const labels = detail.labels.filter((label) => !removeLabels.has(label.name.toLowerCase()))
  const availableLabels = new Map(
    (metadata?.labels ?? []).map((label) => [label.name.toLowerCase(), label]),
  )
  for (const name of action.addLabels) {
    if (labels.some((label) => label.name.toLowerCase() === name.toLowerCase())) continue
    const label = availableLabels.get(name.toLowerCase())
    if (label) labels.push({ name: label.name, color: label.color })
  }

  const next: PullRequestDetail = {
    ...detail,
    reviewers,
    requestedReviewers,
    assignees,
    labels,
  }
  if (action.baseRefName !== undefined) next.baseRefName = action.baseRefName
  if (action.milestone === undefined) return next
  if (action.milestone !== null) {
    next.milestone = action.milestone
    return next
  }
  const { milestone: _milestone, ...withoutMilestone } = next
  return withoutMilestone
}

function updateCommentBody(
  detail: PullRequestDetail,
  kind: 'issue' | 'review',
  commentId: number,
  body: string,
): PullRequestDetail {
  const update = (comment: PullRequestComment) =>
    comment.databaseId === commentId ? { ...comment, body } : comment
  return {
    ...detail,
    comments: kind === 'issue' ? detail.comments.map(update) : detail.comments,
    reviewThreads:
      kind === 'review'
        ? detail.reviewThreads.map((thread) => ({
            ...thread,
            comments: thread.comments.map(update),
          }))
        : detail.reviewThreads,
  }
}

function removeComment(
  detail: PullRequestDetail,
  kind: 'issue' | 'review',
  commentId: number,
): PullRequestDetail {
  return {
    ...detail,
    comments:
      kind === 'issue'
        ? detail.comments.filter((comment) => comment.databaseId !== commentId)
        : detail.comments,
    reviewThreads:
      kind === 'review'
        ? detail.reviewThreads.map((thread) => ({
            ...thread,
            comments: thread.comments.filter((comment) => comment.databaseId !== commentId),
          }))
        : detail.reviewThreads,
  }
}

function mergeActors(
  ...groups: Array<ReadonlyArray<PullRequestDetail['author']>>
): PullRequestDetail['author'][] {
  const actors = new Map<string, PullRequestDetail['author']>()
  for (const actorValue of groups.flat()) {
    const key = actorValue.login.toLowerCase()
    if (!actors.has(key)) actors.set(key, actorValue)
  }
  return [...actors.values()]
}

function mergeLabels(
  available: PullRequestMetadataOptions['labels'],
  current: PullRequestDetail['labels'],
): PullRequestMetadataOptions['labels'] {
  const labels = new Map<string, PullRequestMetadataOptions['labels'][number]>()
  for (const label of [...available, ...current]) {
    const key = label.name.toLowerCase()
    if (!labels.has(key)) labels.set(key, label)
  }
  return [...labels.values()]
}

function mergeMilestones(
  available: PullRequestMetadataOptions['milestones'],
  current: string | undefined,
): PullRequestMetadataOptions['milestones'] {
  if (!current || available.some((milestone) => milestone.title === current)) return available
  return [{ number: Number.MAX_SAFE_INTEGER, title: current }, ...available]
}

/** Git refs are case-sensitive: `release` and `Release` are different branches. */
function mergeStrings(available: string[], current: string[]): string[] {
  return [...new Set([...current, ...available])]
}

function lowerSet(values: string[]): Set<string> {
  return new Set(values.map((value) => value.toLowerCase()))
}

function reviewerPickerStateLabel(state: PullRequestDetail['reviewers'][number]['state']): string {
  if (state === 'REQUESTED') return tNow('workspace.pr.summary.reviewers.requested')
  if (state === 'APPROVED') return tNow('workspace.pr.reviewer.approved')
  if (state === 'CHANGES_REQUESTED') return tNow('workspace.pr.status.changes')
  if (state === 'DISMISSED') return tNow('workspace.pr.reviewer.dismissed')
  if (state === 'PENDING') return tNow('workspace.pr.reviewer.pending')
  return tNow('workspace.pr.reviewer.submitted')
}

function PullRequestChecks({ detail }: { detail: PullRequestDetail }) {
  const { t } = useI18n()
  return (
    <section className="pr-checks">
      <div className="pr-section-title">
        <h3>{t('workspace.pr.summary.fact.checks')}</h3>
        <span>{t('workspace.pr.checks.reported', { count: detail.checks.length })}</span>
      </div>
      <div className="pr-check-list">
        {detail.checks.map((check, index) => {
          const content = (
            <>
              <span className={`pr-check-state is-${check.state}`}>
                {check.state === 'success' ? (
                  <Check size={12} aria-hidden />
                ) : check.state === 'failure' || check.state === 'cancelled' ? (
                  <X size={12} aria-hidden />
                ) : check.state === 'pending' ? (
                  <LoaderCircle size={12} aria-hidden />
                ) : (
                  <CircleDot size={12} aria-hidden />
                )}
              </span>
              <span>
                <strong>{check.name}</strong>
                {check.workflowName ? <small>{check.workflowName}</small> : null}
              </span>
              <em>{checkStateLabel(check.state)}</em>
              {check.detailsUrl ? <ArrowUpRight size={12} aria-hidden /> : null}
            </>
          )
          return check.detailsUrl ? (
            <a
              key={`${check.workflowName ?? ''}:${check.name}:${index}`}
              href={check.detailsUrl}
              target="_blank"
              rel="noreferrer"
            >
              {content}
            </a>
          ) : (
            <div key={`${check.workflowName ?? ''}:${check.name}:${index}`}>{content}</div>
          )
        })}
      </div>
    </section>
  )
}

function PullRequestActivity(props: {
  detail: PullRequestDetail
  busy: boolean
  onAction: (action: PullRequestAction) => Promise<boolean>
  onConfirm: (confirmation: Confirmation) => void
}) {
  const { t, tp } = useI18n()
  const timeline = useMemo(
    () =>
      [
        ...props.detail.comments.map((comment) => ({ type: 'comment' as const, comment })),
        ...props.detail.reviews.map((review) => ({ type: 'review' as const, review })),
      ].sort((left, right) => Date.parse(activityDate(left)) - Date.parse(activityDate(right))),
    [props.detail.comments, props.detail.reviews],
  )

  return (
    <>
      {props.detail.reviewThreads.length > 0 ? (
        <section className="pr-review-conversations">
          <div className="pr-section-title">
            <h3>{t('workspace.pr.activity.threads')}</h3>
            <span>
              {tp(
                'workspace.pr.activity.threadsOpen',
                props.detail.reviewThreads.filter((thread) => !thread.resolved).length,
              )}
            </span>
          </div>
          {props.detail.reviewThreads.map((thread) => (
            <ReviewThreadCard
              key={thread.id}
              thread={thread}
              busy={props.busy}
              onAction={props.onAction}
              onConfirm={props.onConfirm}
            />
          ))}
          {props.detail.reviewThreadsTruncated ? (
            <p className="pr-list-note">{t('workspace.pr.activity.threadsTruncated')}</p>
          ) : null}
        </section>
      ) : null}
      {props.detail.reviewThreadsUnavailable ? (
        <p className="pr-list-note is-error" role="alert">
          {t('workspace.pr.activity.threadsUnavailable')}
        </p>
      ) : props.detail.reviewThreads.length === 0 && props.detail.reviewThreadsTruncated ? (
        <p className="pr-list-note">{t('workspace.pr.activity.threadsOnGithub')}</p>
      ) : null}

      <section className="pr-timeline">
        <div className="pr-section-title">
          <h3>{t('workspace.pr.activity.title')}</h3>
          <span>{tp('workspace.pr.activity.events', timeline.length)}</span>
        </div>
        {timeline.length === 0 ? (
          <p className="pr-activity-empty">{t('workspace.pr.activity.empty')}</p>
        ) : (
          <div className="pr-timeline-list">
            {timeline.map((entry) =>
              entry.type === 'comment' ? (
                <CommentCard
                  key={`comment:${entry.comment.id}`}
                  comment={entry.comment}
                  busy={props.busy}
                  onAction={props.onAction}
                  onDelete={() =>
                    entry.comment.databaseId
                      ? props.onConfirm({
                          title: t('workspace.pr.activity.deleteTitle'),
                          detail: t('workspace.pr.activity.deleteDetail'),
                          confirmLabel: t('workspace.pr.files.deleteComment'),
                          danger: true,
                          action: {
                            type: 'delete_comment',
                            kind: 'issue',
                            commentId: entry.comment.databaseId,
                          },
                        })
                      : undefined
                  }
                />
              ) : (
                <ReviewCard key={`review:${entry.review.id}`} review={entry.review} />
              ),
            )}
          </div>
        )}
      </section>
    </>
  )
}

function ReviewThreadCard(props: {
  thread: PullRequestReviewThread
  busy: boolean
  onAction: (action: PullRequestAction) => Promise<boolean>
  onConfirm: (confirmation: Confirmation) => void
}) {
  const { t } = useI18n()
  const [replying, setReplying] = useState(false)
  const [reply, setReply] = useState('')
  const rootComment = props.thread.comments[0]
  const replyRef = useRef(reply)
  replyRef.current = reply

  return (
    <article className={`pr-thread-card${props.thread.resolved ? ' is-resolved' : ''}`}>
      <header>
        <div>
          <code>{props.thread.path}</code>
          {props.thread.line ? (
            <span>{t('workspace.pr.thread.line', { number: props.thread.line })}</span>
          ) : null}
          {props.thread.outdated ? <span>{t('workspace.pr.thread.outdated')}</span> : null}
        </div>
        <button
          type="button"
          className="pr-thread-state"
          disabled={props.busy}
          onClick={() =>
            void props.onAction({
              type: 'resolve_thread',
              threadId: props.thread.id,
              resolved: !props.thread.resolved,
            })
          }
        >
          <IconMorph active={props.thread.resolved ? 1 : 0}>
            <Check size={12} aria-hidden />
            <RotateCcw size={12} aria-hidden />
          </IconMorph>
          {props.thread.resolved ? t('workspace.pr.files.reopen') : t('workspace.pr.files.resolve')}
        </button>
      </header>
      {props.thread.comments.map((comment) => (
        <ReviewThreadComment
          key={comment.id}
          comment={comment}
          busy={props.busy}
          onAction={props.onAction}
          onConfirm={props.onConfirm}
        />
      ))}
      {props.thread.commentsTruncated ? (
        <p className="pr-list-note">
          {t('workspace.pr.thread.truncated')}{' '}
          {rootComment ? (
            <a href={rootComment.url} target="_blank" rel="noreferrer">
              {t('workspace.pr.thread.readAll')}
            </a>
          ) : (
            t('workspace.pr.thread.readAllPlain')
          )}
        </p>
      ) : null}
      {replying ? (
        <div className="pr-thread-reply">
          <textarea value={reply} onChange={(event) => setReply(event.target.value)} autoFocus />
          <div>
            <button type="button" className="pr-button is-quiet" onClick={() => setReplying(false)}>
              {t('workspace.pr.cancel')}
            </button>
            <button
              type="button"
              className="pr-button is-primary"
              disabled={props.busy || !reply.trim() || !rootComment?.databaseId}
              onClick={() => {
                if (!rootComment?.databaseId) return
                const sentReply = reply
                void props
                  .onAction({
                    type: 'reply_to_review',
                    commentId: rootComment.databaseId,
                    body: reply.trim(),
                  })
                  .then((success) => {
                    if (success && replyRef.current === sentReply) {
                      setReply('')
                      setReplying(false)
                    }
                  })
              }}
            >
              {t('workspace.pr.reply')}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="pr-thread-reply-link" onClick={() => setReplying(true)}>
          {t('workspace.pr.reply')}
        </button>
      )}
    </article>
  )
}

function ReviewThreadComment(props: {
  comment: PullRequestComment
  busy: boolean
  onAction: (action: PullRequestAction) => Promise<boolean>
  onConfirm: (confirmation: Confirmation) => void
}) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(props.comment.body)

  return (
    <div className="pr-thread-comment">
      <header>
        <div className="pr-comment-byline">
          <Actor actor={props.comment.author} />
          <time dateTime={props.comment.createdAt}>
            {longRelativeTime(props.comment.createdAt)}
          </time>
        </div>
        {props.comment.viewerDidAuthor && props.comment.databaseId ? (
          <Menu
            align="right"
            drop="down"
            label={t('workspace.pr.files.commentActions')}
            trigger={() => <Ellipsis size={13} aria-hidden />}
          >
            {(close) => (
              <>
                <MenuItem
                  title={t('workspace.pr.files.editComment')}
                  icon={<Pencil size={13} aria-hidden />}
                  onClick={() => {
                    if (!editing) setBody(props.comment.body)
                    setEditing(true)
                    close()
                  }}
                />
                <MenuItem
                  title={t('workspace.pr.files.deleteComment')}
                  icon={<Trash2 size={13} aria-hidden />}
                  className="is-danger"
                  onClick={() => {
                    props.onConfirm({
                      title: t('workspace.pr.detail.deleteReview.title'),
                      detail: t('workspace.pr.detail.deleteReview.detail'),
                      confirmLabel: t('workspace.pr.files.deleteComment'),
                      danger: true,
                      action: {
                        type: 'delete_comment',
                        kind: 'review',
                        commentId: props.comment.databaseId!,
                      },
                    })
                    close()
                  }}
                />
              </>
            )}
          </Menu>
        ) : null}
      </header>
      {editing ? (
        <div className="pr-comment-editor">
          <textarea value={body} onChange={(event) => setBody(event.target.value)} autoFocus />
          <div>
            <button
              type="button"
              className="pr-button is-quiet"
              onClick={() => {
                setBody(props.comment.body)
                setEditing(false)
              }}
            >
              {t('workspace.pr.cancel')}
            </button>
            <button
              type="button"
              className="pr-button is-primary"
              disabled={props.busy || !body.trim()}
              onClick={() => {
                if (!props.comment.databaseId) return
                void props
                  .onAction({
                    type: 'update_comment',
                    kind: 'review',
                    commentId: props.comment.databaseId,
                    body: body.trim(),
                  })
                  .then((success) => success && setEditing(false))
              }}
            >
              {t('workspace.pr.save')}
            </button>
          </div>
        </div>
      ) : (
        <Markdown text={props.comment.body} />
      )}
    </div>
  )
}

function CommentCard(props: {
  comment: PullRequestComment
  busy: boolean
  onAction: (action: PullRequestAction) => Promise<boolean>
  onDelete: () => void
}) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(props.comment.body)

  return (
    <article className="pr-activity-card">
      <GitHubAvatar
        actor={props.comment.author}
        className="pr-avatar pr-activity-avatar"
        botSize={15}
      />
      <div className="pr-activity-comment">
        <header>
          <div className="pr-comment-byline">
            <strong>{props.comment.author.login}</strong>
            <span>{t('workspace.pr.comment.commented')}</span>
            <a
              className="pr-comment-permalink"
              href={props.comment.url}
              target="_blank"
              rel="noreferrer"
            >
              <time dateTime={props.comment.createdAt}>
                {longRelativeTime(props.comment.createdAt)}
              </time>
            </a>
          </div>
          {props.comment.viewerDidAuthor && props.comment.databaseId ? (
            <Menu
              align="right"
              drop="down"
              label={t('workspace.pr.comment.actions')}
              trigger={() => <Ellipsis size={14} aria-hidden />}
            >
              {(close) => (
                <>
                  <MenuItem
                    title={t('workspace.pr.files.editComment')}
                    icon={<Pencil size={13} aria-hidden />}
                    onClick={() => {
                      if (!editing) setBody(props.comment.body)
                      setEditing(true)
                      close()
                    }}
                  />
                  <MenuItem
                    title={t('workspace.pr.files.deleteComment')}
                    icon={<Trash2 size={13} aria-hidden />}
                    className="is-danger"
                    onClick={() => {
                      props.onDelete()
                      close()
                    }}
                  />
                </>
              )}
            </Menu>
          ) : null}
        </header>
        {editing ? (
          <div className="pr-comment-editor">
            <textarea value={body} onChange={(event) => setBody(event.target.value)} autoFocus />
            <div>
              <button
                type="button"
                className="pr-button is-quiet"
                onClick={() => {
                  setBody(props.comment.body)
                  setEditing(false)
                }}
              >
                {t('workspace.pr.cancel')}
              </button>
              <button
                type="button"
                className="pr-button is-primary"
                disabled={props.busy || !body.trim()}
                onClick={() => {
                  if (!props.comment.databaseId) return
                  void props
                    .onAction({
                      type: 'update_comment',
                      kind: 'issue',
                      commentId: props.comment.databaseId,
                      body: body.trim(),
                    })
                    .then((success) => success && setEditing(false))
                }}
              >
                {t('workspace.pr.save')}
              </button>
            </div>
          </div>
        ) : (
          <div className="pr-activity-comment-body">
            <Markdown text={props.comment.body} />
          </div>
        )}
      </div>
    </article>
  )
}

function ReviewCard({ review }: { review: PullRequestReview }) {
  const label = reviewStateLabel(review.state)
  return (
    <article className="pr-review-event">
      <span className={`pr-review-event-icon is-${reviewTone(review.state)}`}>
        {review.state === 'APPROVED' ? (
          <Check size={13} aria-hidden />
        ) : review.state === 'CHANGES_REQUESTED' ? (
          <X size={13} aria-hidden />
        ) : (
          <MessageSquare size={13} aria-hidden />
        )}
      </span>
      <div className="pr-review-event-copy">
        <p>
          <strong>{review.author.login}</strong> <span>{label}</span>{' '}
          <time dateTime={review.submittedAt}>{longRelativeTime(review.submittedAt)}</time>
        </p>
        {review.body.trim() ? (
          <div className="pr-review-event-body">
            <Markdown text={review.body} />
          </div>
        ) : null}
      </div>
    </article>
  )
}

function PullRequestComposer(props: {
  detail: PullRequestDetail
  body: string
  setBody: Dispatch<SetStateAction<string>>
  mode: ComposerMode
  setMode: Dispatch<SetStateAction<ComposerMode>>
  busy: boolean
  onAction: (action: PullRequestAction) => Promise<boolean>
}) {
  const { t } = useI18n()
  const { body, setBody, mode, setMode } = props
  const input = useRef<HTMLTextAreaElement>(null)
  const canReview = props.detail.relationship === 'reviewing'
  const needsBody = mode === 'comment' || mode === 'request_changes'

  useEffect(() => {
    const textarea = input.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`
  }, [body])

  const submit = async () => {
    const text = body.trim()
    const action: PullRequestAction =
      mode === 'comment'
        ? { type: 'comment', body: text }
        : {
            type: 'review',
            verdict: mode,
            body: text,
            commitId: props.detail.headRefOid,
          }
    if (await props.onAction(action)) setBody((current) => (current === body ? '' : current))
  }

  return (
    <div className="pr-composer">
      <textarea
        ref={input}
        rows={1}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={
          mode === 'comment'
            ? t('workspace.pr.composer.placeholderComment')
            : mode === 'approve'
              ? t('workspace.pr.composer.placeholderApprove')
              : t('workspace.pr.composer.placeholderChanges')
        }
        aria-label={t('workspace.pr.composer.label')}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault()
            if (!props.busy && (!needsBody || body.trim())) void submit()
          }
        }}
      />
      <div className="pr-composer-foot">
        {canReview ? (
          <AppSelect
            className="pr-composer-mode"
            ariaLabel={t('workspace.pr.composer.type')}
            value={mode}
            onChange={setMode}
            drop="up"
            options={[
              { value: 'comment', label: t('workspace.pr.composer.comment') },
              { value: 'approve', label: t('workspace.pr.composer.approve') },
              { value: 'request_changes', label: t('workspace.pr.composer.requestChanges') },
            ]}
          />
        ) : null}
        <button
          type="button"
          className={`pr-send-button is-${mode}`}
          aria-label={
            mode === 'comment'
              ? t('workspace.pr.composer.send')
              : reviewStateLabel(mode === 'approve' ? 'APPROVED' : 'CHANGES_REQUESTED')
          }
          disabled={props.busy || (needsBody && !body.trim())}
          onClick={() => void submit()}
        >
          <IconMorph
            active={props.busy ? 3 : mode === 'approve' ? 1 : mode === 'request_changes' ? 2 : 0}
          >
            <ArrowUp size={14} aria-hidden />
            <Check size={14} aria-hidden />
            <X size={14} aria-hidden />
            <LoaderCircle size={14} className="is-spinning" aria-hidden />
          </IconMorph>
        </button>
      </div>
    </div>
  )
}

function AutoMergeMenu(props: {
  detail: PullRequestDetail
  busy: boolean
  onAction: (action: PullRequestAction) => Promise<boolean>
}) {
  const { t } = useI18n()
  return (
    <Menu
      align="right"
      drop="down"
      disabled={props.busy || props.detail.state !== 'OPEN'}
      label={t('workspace.pr.autoMerge.label')}
      triggerClassName={`pr-toolbar-menu-trigger${props.busy ? ' is-pending' : ''}`}
      trigger={() => (
        <span className={`pr-toolbar-button${props.detail.autoMerge ? ' is-enabled' : ''}`}>
          {t('workspace.pr.autoMerge.button')}{' '}
          <IconMorph active={props.busy ? 1 : 0}>
            <ChevronDown size={12} aria-hidden />
            <LoaderCircle size={12} className="is-spinning" aria-hidden />
          </IconMorph>
        </span>
      )}
    >
      {(close) => (
        <>
          {props.detail.autoMerge ? (
            <MenuItem
              title={t('workspace.pr.autoMerge.disable')}
              detail={t('workspace.pr.autoMerge.queued', {
                method: mergeMethodLabel(editableMergeMethod(props.detail.autoMerge.mergeMethod)),
              })}
              icon={<XCircle size={13} aria-hidden />}
              onClick={() => {
                close()
                void props.onAction({ type: 'disable_auto_merge' })
              }}
            />
          ) : (
            mergeMethods(props.detail).map((method) => (
              <MenuItem
                key={method}
                title={t('workspace.pr.autoMerge.enable', { method: mergeMethodLabel(method) })}
                icon={<Clock3 size={13} aria-hidden />}
                onClick={() => {
                  close()
                  void props.onAction({
                    type: 'enable_auto_merge',
                    method,
                    expectedHeadOid: props.detail.headRefOid,
                  })
                }}
              />
            ))
          )}
        </>
      )}
    </Menu>
  )
}

type MergeMethod = 'merge' | 'rebase' | 'squash'

function MergeMenu(props: {
  detail: PullRequestDetail
  disabled: boolean
  onChoose: (method: MergeMethod) => void
}) {
  const { t } = useI18n()
  return (
    <Menu
      align="right"
      drop="down"
      disabled={props.disabled}
      label={t('workspace.pr.merge.confirm.button')}
      triggerClassName="pr-toolbar-menu-trigger"
      trigger={() => (
        <span className="pr-toolbar-button is-primary">
          {t('workspace.pr.merge.button')} <ChevronDown size={12} aria-hidden />
        </span>
      )}
    >
      {(close) => (
        <>
          {mergeMethods(props.detail).map((method) => (
            <MenuItem
              key={method}
              title={mergeMethodLabel(method)}
              icon={<GitMerge size={13} aria-hidden />}
              onClick={() => {
                close()
                props.onChoose(method)
              }}
            />
          ))}
          {props.detail.mergeable === 'CONFLICTING' ? (
            <p className="pr-menu-note">{t('workspace.pr.merge.conflicts')}</p>
          ) : null}
        </>
      )}
    </Menu>
  )
}

function MoreMenu(props: {
  detail: PullRequestDetail
  busy: boolean
  onAction: (action: PullRequestAction) => Promise<boolean>
  onConfirm: (confirmation: Confirmation) => void
}) {
  const { t } = useI18n()
  return (
    <Menu
      align="right"
      drop="down"
      disabled={props.busy}
      label={t('workspace.pr.more.label')}
      trigger={() => <Ellipsis size={15} aria-hidden />}
    >
      {(close) => (
        <>
          {props.detail.state === 'OPEN' ? (
            <>
              <MenuItem
                title={
                  props.detail.isDraft
                    ? t('workspace.pr.more.markReady')
                    : t('workspace.pr.more.convertDraft')
                }
                icon={
                  props.detail.isDraft ? (
                    <GitPullRequest size={13} aria-hidden />
                  ) : (
                    <GitPullRequestDraft size={13} aria-hidden />
                  )
                }
                onClick={() => {
                  close()
                  void props.onAction({ type: 'set_draft', draft: !props.detail.isDraft })
                }}
              />
              <MenuItem
                title={t('workspace.pr.more.updateMerge')}
                icon={<GitBranch size={13} aria-hidden />}
                onClick={() => {
                  close()
                  void props.onAction({ type: 'update_branch', rebase: false })
                }}
              />
              <MenuItem
                title={t('workspace.pr.more.updateRebase')}
                icon={<RefreshCw size={13} aria-hidden />}
                onClick={() => {
                  close()
                  void props.onAction({ type: 'update_branch', rebase: true })
                }}
              />
              {props.detail.checks.length > 0 ? (
                <>
                  <MenuItem
                    title={t('workspace.pr.more.rerunFailed')}
                    icon={<RotateCcw size={13} aria-hidden />}
                    onClick={() => {
                      close()
                      void props.onAction({ type: 'rerun_checks', failedOnly: true })
                    }}
                  />
                  <MenuItem
                    title={t('workspace.pr.more.rerunAll')}
                    icon={<RefreshCw size={13} aria-hidden />}
                    onClick={() => {
                      close()
                      void props.onAction({ type: 'rerun_checks', failedOnly: false })
                    }}
                  />
                </>
              ) : null}
              <MenuItem
                title={t('workspace.pr.status.closeButton')}
                icon={<GitPullRequestClosed size={13} aria-hidden />}
                className="is-danger"
                onClick={() => {
                  close()
                  props.onConfirm({
                    title: t('workspace.pr.status.closeTitle', { number: props.detail.number }),
                    detail: t('workspace.pr.status.closeDetail'),
                    confirmLabel: t('workspace.pr.status.closeButton'),
                    danger: true,
                    action: { type: 'close' },
                  })
                }}
              />
            </>
          ) : props.detail.state === 'CLOSED' ? (
            <MenuItem
              title={t('workspace.pr.more.reopen')}
              icon={<RotateCcw size={13} aria-hidden />}
              onClick={() => {
                close()
                void props.onAction({ type: 'reopen' })
              }}
            />
          ) : null}
        </>
      )}
    </Menu>
  )
}

function ConfirmDialog(props: {
  confirmation: Confirmation
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog title={props.confirmation.title} onClose={props.onClose} compact>
      <p className="pr-confirm-copy">{props.confirmation.detail}</p>
      <DialogActions onCancel={props.onClose}>
        <button
          type="button"
          className={`pr-button ${props.confirmation.danger ? 'is-danger' : 'is-primary'}`}
          disabled={props.busy}
          onClick={props.onConfirm}
        >
          {props.busy ? <LoaderCircle size={13} className="is-spinning" aria-hidden /> : null}
          {props.confirmation.confirmLabel}
        </button>
      </DialogActions>
    </Dialog>
  )
}

function Dialog(props: {
  title: string
  children: ReactNode
  onClose: () => void
  compact?: boolean
}) {
  const { t } = useI18n()
  const onClose = useRef(props.onClose)
  const panel = useRef<HTMLElement>(null)
  onClose.current = props.onClose
  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose.current()
        return
      }
      if (event.key !== 'Tab' || !panel.current) return
      const focusable = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
        (element) => !element.hasAttribute('disabled') && element.tabIndex !== -1,
      )
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) {
        event.preventDefault()
        panel.current.focus()
      } else if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === panel.current)
      ) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previousFocus?.focus()
    }
  }, [])

  return createPortal(
    <div
      className="pr-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}
    >
      <section
        ref={panel}
        className={`pr-dialog${props.compact ? ' is-compact' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pr-dialog-title"
        tabIndex={-1}
      >
        <header>
          <h2 id="pr-dialog-title">{props.title}</h2>
          <button
            type="button"
            className="pr-icon-button"
            aria-label={t('workspace.pr.dialog.close')}
            onClick={props.onClose}
          >
            <X size={14} aria-hidden />
          </button>
        </header>
        <div className="pr-dialog-body">{props.children}</div>
      </section>
    </div>,
    document.body,
  )
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

function DialogActions(props: { children: ReactNode; onCancel: () => void }) {
  const { t } = useI18n()
  return (
    <div className="pr-dialog-actions">
      <button type="button" className="pr-button is-secondary" onClick={props.onCancel}>
        {t('workspace.pr.cancel')}
      </button>
      {props.children}
    </div>
  )
}

function DetailTabButton(props: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={props.active}
      className={props.active ? 'is-active' : undefined}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}

function Fact(props: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="pr-fact">
      <span className="pr-fact-label">
        {props.icon}
        <span>{props.label}</span>
      </span>
      <div className="pr-fact-content">{props.children}</div>
    </div>
  )
}

function Actor(props: { actor: PullRequestDetail['author']; state?: string; compact?: boolean }) {
  return (
    <span className={`pr-actor${props.compact ? ' is-compact' : ''}`} title={props.actor.login}>
      <GitHubAvatar actor={props.actor} className="pr-avatar" botSize={11} />
      {!props.compact ? <strong>{props.actor.login}</strong> : null}
      {props.state ? <span className={`pr-review-dot is-${reviewTone(props.state)}`} /> : null}
    </span>
  )
}

function GitHubAvatar(props: {
  actor: PullRequestDetail['author']
  className: string
  botSize: number
}) {
  return (
    <span className={props.className}>
      <span className="pr-avatar-fallback" aria-hidden>
        {props.actor.isBot ? (
          <Bot size={props.botSize} />
        ) : (
          props.actor.login.slice(0, 1).toUpperCase()
        )}
      </span>
      <img
        src={`https://avatars.githubusercontent.com/${encodeURIComponent(props.actor.login)}?s=64`}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={(event) => {
          event.currentTarget.hidden = true
        }}
      />
    </span>
  )
}

function PullRequestDetailSkeleton() {
  const { t } = useI18n()
  return (
    <div
      className="pr-detail pr-detail-skeleton skeleton-group"
      role="status"
      aria-label={t('workspace.pr.detail.loading')}
      aria-busy="true"
    >
      <header className="pr-detail-toolbar">
        <div className="pr-detail-tabs">
          <Skeleton className="pr-skeleton-block" />
          <Skeleton className="pr-skeleton-block" />
        </div>
        <div className="pr-detail-actions">
          <Skeleton className="pr-skeleton-block is-square" />
          <Skeleton className="pr-skeleton-block is-square" />
          <Skeleton className="pr-skeleton-block" />
          <Skeleton className="pr-skeleton-block" />
        </div>
      </header>
      <div className="pr-detail-body">
        <div className="pr-summary">
          <Skeleton className="pr-detail-skeleton-title" />
          <Skeleton className="pr-detail-skeleton-meta" />
          <div className="pr-detail-skeleton-facts">
            {[0, 1, 2, 3, 4, 5, 6].map((index) => (
              <div className="pr-detail-skeleton-fact" key={index}>
                <Skeleton />
                <Skeleton />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

type PullRequestPresentation = {
  label: string
  tone: string
  icon: ReactNode
}

function pullRequestStatus(detail: PullRequestDetail): PullRequestPresentation {
  if (detail.state === 'MERGED')
    return {
      label: tNow('workspace.pr.state.merged'),
      tone: 'merged',
      icon: <GitMerge size={15} aria-hidden />,
    }
  if (detail.state === 'CLOSED')
    return {
      label: tNow('workspace.pr.state.closed'),
      tone: 'closed',
      icon: <GitPullRequestClosed size={15} aria-hidden />,
    }
  if (detail.isDraft)
    return {
      label: tNow('workspace.pr.state.draft'),
      tone: 'draft',
      icon: <GitPullRequestDraft size={15} aria-hidden />,
    }
  if (detail.mergeable === 'CONFLICTING')
    return {
      label: tNow('workspace.pr.status.conflicts'),
      tone: 'failure',
      icon: <CircleAlert size={15} aria-hidden />,
    }
  if (detail.reviewDecision === 'CHANGES_REQUESTED')
    return {
      label: tNow('workspace.pr.status.changes'),
      tone: 'failure',
      icon: <XCircle size={15} aria-hidden />,
    }
  if (detail.reviewDecision === 'APPROVED')
    return {
      label: tNow('workspace.pr.status.approved'),
      tone: 'success',
      icon: <CheckCircle2 size={15} aria-hidden />,
    }
  if (detail.reviewDecision === 'REVIEW_REQUIRED')
    return {
      label: tNow('workspace.pr.status.required'),
      tone: 'attention',
      icon: <Users size={15} aria-hidden />,
    }
  return {
    label: tNow('workspace.pr.status.ready'),
    tone: 'open',
    icon: <GitPullRequest size={15} aria-hidden />,
  }
}

function checkSummary(detail: PullRequestDetail): PullRequestPresentation {
  if (detail.checks.length === 0)
    return {
      label: tNow('workspace.pr.checks.none'),
      tone: 'muted',
      icon: <CircleDot size={15} aria-hidden />,
    }
  const failed = detail.checks.filter(
    (check) => check.state === 'failure' || check.state === 'cancelled',
  ).length
  if (failed > 0)
    return {
      label: tNow('workspace.pr.checks.failing', { count: failed }),
      tone: 'failure',
      icon: <XCircle size={15} aria-hidden />,
    }
  const pending = detail.checks.filter((check) => check.state === 'pending').length
  if (pending > 0)
    return {
      label: tNow('workspace.pr.checks.pending', { count: pending }),
      tone: 'attention',
      icon: <LoaderCircle size={15} aria-hidden />,
    }
  return {
    label: tNow('workspace.pr.checks.successful', { count: detail.checks.length }),
    tone: 'success',
    icon: <CheckCircle2 size={15} aria-hidden />,
  }
}

function checkStateLabel(state: PullRequestDetail['checks'][number]['state']): string {
  if (state === 'success') return tNow('workspace.pr.checks.state.success')
  if (state === 'failure') return tNow('workspace.pr.checks.state.failure')
  if (state === 'pending') return tNow('workspace.pr.checks.state.pending')
  if (state === 'cancelled') return tNow('workspace.pr.checks.state.cancelled')
  if (state === 'skipped') return tNow('workspace.pr.checks.state.skipped')
  return tNow('workspace.pr.checks.state.neutral')
}

function mergeMethods(detail: PullRequestDetail): MergeMethod[] {
  return (['merge', 'rebase', 'squash'] as const).filter((method) => detail.mergeMethods[method])
}

function mergeMethodLabel(method: MergeMethod): string {
  if (method === 'rebase') return tNow('workspace.pr.merge.rebase')
  if (method === 'squash') return tNow('workspace.pr.merge.squash')
  return tNow('workspace.pr.merge.commit')
}

function reviewStateLabel(state: PullRequestReviewStateLike): string {
  if (state === 'APPROVED') return tNow('workspace.pr.review.approved')
  if (state === 'CHANGES_REQUESTED') return tNow('workspace.pr.review.changes')
  if (state === 'DISMISSED') return tNow('workspace.pr.review.dismissed')
  if (state === 'PENDING') return tNow('workspace.pr.review.pending')
  return tNow('workspace.pr.review.reviewed')
}

type PullRequestReviewStateLike = PullRequestReview['state'] | 'APPROVED' | 'CHANGES_REQUESTED'

function reviewTone(state: string): string {
  if (state === 'APPROVED') return 'success'
  if (state === 'CHANGES_REQUESTED') return 'failure'
  if (state === 'REQUESTED' || state === 'PENDING') return 'attention'
  return 'neutral'
}

function activityDate(
  entry:
    | { type: 'comment'; comment: PullRequestComment }
    | { type: 'review'; review: PullRequestReview },
): string {
  return entry.type === 'comment' ? entry.comment.createdAt : entry.review.submittedAt
}

function longRelativeTime(value: string): string {
  const elapsed = Math.max(0, Date.now() - Date.parse(value))
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 1) return tNow('workspace.recent.now')
  if (minutes < 60) return tNow('workspace.recent.minutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return tNow('workspace.recent.hours', { count: hours })
  const days = Math.floor(hours / 24)
  if (days < 30) return tNow('workspace.recent.days', { count: days })
  const months = Math.floor(days / 30)
  if (months < 12) return tpNow('workspace.recent.months', months)
  return tpNow('workspace.recent.years', Math.floor(months / 12))
}

function storedMergeMethod(method: MergeMethod): StoredMergeMethod {
  if (method === 'merge') return 'MERGE'
  if (method === 'rebase') return 'REBASE'
  return 'SQUASH'
}

function editableMergeMethod(method: StoredMergeMethod): MergeMethod {
  if (method === 'MERGE') return 'merge'
  if (method === 'REBASE') return 'rebase'
  return 'squash'
}
