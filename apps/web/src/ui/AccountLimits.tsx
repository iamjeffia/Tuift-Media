import { type CSSProperties, type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react'
import {
  DEFAULT_ACCOUNT_ID,
  type AccountId,
  type PoolWindowTotal,
  type ProviderId,
  type ProviderLimitSource,
  type ResultOf,
} from '@harness/contracts'
import { IconChevronRight as ChevronRight, IconRefresh as RefreshCw } from '@tabler/icons-react'
import { multipleText, poolSegments, type ProviderPool } from '../account-pool.js'
import type { AccountLabel } from '../provider-accounts-state.js'
import { providerDisplayName, providerMark } from '../provider-presentation.js'
import { limitKey, USAGE_LOW_PERCENT } from '../usage-limits-state.js'
import type { UsageSummaryState } from '../usage-summary-state.js'
import '../styles/account-limits.css'
import { ProviderIcon } from './ProviderIcon.js'
import { t as translateNow, useI18n, type I18n } from '../i18n/index.js'
import { compactRelativeTime } from './session-clock.js'
import { dateTimeText, resetText } from './usage/usage-format.js'

/** Values older than this say how old they are; younger ones read as current. */
const AGE_SHOWN_AFTER_MS = 10 * 60_000

type Limit = ResultOf<'usage.summary'>['limits'][number]
type ConsumeReset = (
  provider: ProviderId,
  idempotencyKey: string,
  creditId?: string,
  /** Absent means the default account. */
  accountId?: AccountId,
) => Promise<ResultOf<'usage.consumeReset'>>

export type AccountLimitsState = UsageSummaryState

/**
 * Plan limits, grouped by provider account, shown as soon as the account
 * popup opens. A provider that cannot report is one quiet line in its own
 * group, never an alert: it is a missing number, not a problem the person has
 * to act on. A provider shown with more than one account is named once, with
 * each account under it by its own name.
 */
export function AccountLimits(props: {
  states: AccountLimitsState[]
  /** Names a provider account; without it a further account reads as "Account". */
  accountLabel?: AccountLabel | undefined
  /**
   * The account a new chat with the provider starts on. Every account line now
   * starts closed, so nothing reads it; kept so the sidebar needs no change.
   */
  activeAccount?: ((provider: ProviderId) => AccountId) | undefined
  /** Each provider's accounts as one pool (account-pool.ts), summed above its accounts. */
  pools?: readonly ProviderPool[] | undefined
  /** Called once while the limits are on screen; returns the release for when they leave. */
  onShow?: (() => () => void) | undefined
  onRetry: (provider: ProviderId, accountId?: AccountId) => void
  /** Reads every source again; without it the popup offers no refresh. */
  onRefresh?: (() => void) | undefined
  onConsumeReset?: ConsumeReset | undefined
}) {
  const { t } = useI18n()
  const panel = useRef<HTMLElement>(null)
  const onShow = useRef(props.onShow)
  // A source without plan limits is left out; one that could not be read yet is not.
  const visibleStates = props.states.filter((state) => {
    const source = limitSource(state)
    return source?.status !== 'unavailable' || source.reason === 'failed'
  })

  // The popup lands on the list itself rather than on its first Retry or Use.
  useLayoutEffect(() => panel.current?.focus(), [])
  useLayoutEffect(() => {
    onShow.current = props.onShow
  })
  // Showing the limits is what lets the server read the sources it reads only
  // on view. Once per mount, so a new callback identity does not ask again,
  // and before paint, so a source not read yet already reads as checking.
  useLayoutEffect(() => onShow.current?.(), [])

  const retry = (provider: ProviderId, accountId: AccountId | undefined) => {
    // The Retry button unmounts while the source reloads; keep focus in the popup.
    panel.current?.focus()
    // The default account is asked for as the provider alone, as before accounts.
    if (accountId === undefined) props.onRetry(provider)
    else props.onRetry(provider, accountId)
  }

  if (visibleStates.length === 0) return null
  // Ages are read when the popup opens and when the values change; nothing
  // ticks while it stays open.
  const now = Date.now()
  const busy = visibleStates.some((state) => state.status === 'loading')
  const groups = groupByProvider(visibleStates)
  // Once any provider lists its accounts, every provider does, one compact line per account, so a
  // single Grok account reads like the nine Claude accounts above it.
  const compact = groups.some((group) => namesAccounts(group.states))

  return (
    <section
      ref={panel}
      className="account-menu__usage"
      aria-label={t('settings.accountLimits.planLimits')}
      aria-busy={busy}
      // A scroll container that keyboard users can reach and scroll.
      tabIndex={0}
    >
      {groups.map((group, index) => {
        const name = providerDisplayName(group.provider)
        // The refresh sits at the end of the first heading's line.
        const action =
          index === 0 && props.onRefresh ? (
            <RefreshLimits busy={busy} onRefresh={props.onRefresh} />
          ) : undefined
        const source = (state: AccountLimitsState, account?: string) => (
          <LimitSource
            key={limitKey(state.provider, state.accountId)}
            state={state}
            name={account === undefined ? name : `${name} · ${account}`}
            account={account}
            action={account === undefined ? action : undefined}
            now={now}
            onRetry={() => retry(state.provider, state.accountId)}
            onConsumeReset={props.onConsumeReset}
          />
        )
        if (!compact) return source(group.states[0]!)
        const label = (state: AccountLimitsState) =>
          props.accountLabel?.(state.provider, state.accountId) ??
          (further(state)
            ? t('settings.accountLimits.account')
            : t('settings.accountLimits.default'))
        // Alone in the popup, one further account keeps the full rows; beside others it is a line.
        if (group.states.length === 1 && groups.length === 1) {
          return (
            <div
              key={group.provider}
              className="account-menu__provider"
              role="group"
              aria-label={name}
            >
              <ProviderHeading provider={group.provider} action={action} />
              {source(group.states[0]!, label(group.states[0]!))}
            </div>
          )
        }
        return (
          <ProviderAccountLimits
            key={group.provider}
            provider={group.provider}
            states={group.states}
            label={label}
            pool={props.pools?.find((pool) => pool.provider === group.provider)}
            action={action}
            now={now}
            onRetry={(state) => retry(state.provider, state.accountId)}
            onConsumeReset={props.onConsumeReset}
          />
        )
      })}
    </section>
  )
}

/** A provider's name over its accounts, with anything else that belongs on its line. */
function ProviderHeading(props: { provider: ProviderId; action?: ReactNode }) {
  return (
    <div className="account-menu__provider-head">
      <h3 className="account-menu__provider-name">
        <ProviderIcon mark={providerMark(props.provider)} size={14} />
        <span>{providerDisplayName(props.provider)}</span>
      </h3>
      {props.action}
    </div>
  )
}

/**
 * Reads every source again. It turns while any of them is still reading, the
 * reads opening the popup started included, and asks nothing more meanwhile.
 */
function RefreshLimits(props: { busy: boolean; onRefresh: () => void }) {
  const { t } = useI18n()
  return (
    <button
      className={`account-menu__refresh${props.busy ? ' is-busy' : ''}`}
      type="button"
      aria-label={t('settings.accountLimits.refresh')}
      title={t('settings.accountLimits.refresh')}
      // Not disabled, so focus stays on it while it turns.
      aria-disabled={props.busy || undefined}
      onClick={() => {
        if (!props.busy) props.onRefresh()
      }}
    >
      <RefreshCw size={13} stroke={2} aria-hidden />
    </button>
  )
}

/**
 * A provider with several accounts: its name once, the accounts summed into
 * one pool line, then one compact line per account (its plan, and how much is
 * left of each window, Session and Weekly, as two short bars) that opens to
 * that account's full limits. Every line starts closed, so five accounts still
 * fit in a few rows; the one the pool recommends for the next chat is marked.
 */
function ProviderAccountLimits(props: {
  provider: ProviderId
  states: AccountLimitsState[]
  label: (state: AccountLimitsState) => string
  pool?: ProviderPool | undefined
  action?: ReactNode
  now: number
  onRetry: (state: AccountLimitsState) => void
  onConsumeReset?: ConsumeReset | undefined
}) {
  const name = providerDisplayName(props.provider)
  const pool = props.pool
  // A recommendation needs a choice: a single account carries no mark.
  const recommended = props.states.length > 1 ? pool?.recommended : undefined
  const [open, setOpen] = useState<ReadonlySet<AccountId>>(() => new Set())
  const toggle = (account: AccountId) =>
    setOpen((current) => {
      const next = new Set(current)
      if (!next.delete(account)) next.add(account)
      return next
    })
  return (
    <div className="account-menu__provider" role="group" aria-label={name}>
      <ProviderHeading provider={props.provider} action={props.action} />
      {pool && pool.windows.length > 0 && props.states.length > 1 ? (
        <AccountPool pool={pool} provider={name} now={props.now} />
      ) : null}
      {props.states.map((state) => (
        <AccountLine
          key={limitKey(state.provider, state.accountId)}
          state={state}
          provider={name}
          account={props.label(state)}
          plan={pool?.accounts.find((account) => account.accountId === accountOf(state))?.plan}
          recommended={recommended !== undefined && accountOf(state) === recommended}
          open={open.has(accountOf(state))}
          now={props.now}
          onToggle={() => toggle(accountOf(state))}
          onRetry={() => props.onRetry(state)}
          onConsumeReset={props.onConsumeReset}
        />
      ))}
    </div>
  )
}

/**
 * The provider's accounts summed into one pool, as one line above the
 * accounts: per window, how much of the pool is left on a bar with a segment
 * per account, sized by its plan, the one that resets soonest first. The
 * pool's size in the cheapest plan's units, how many accounts it counts and
 * which resets next are on hover. Accounts whose plan size is unknown stay
 * out of the sum.
 */
function AccountPool(props: { pool: ProviderPool; provider: string; now: number }) {
  const { t, tp } = useI18n()
  const accounts = tp('settings.accountLimits.accounts', props.pool.accounts.length)
  return (
    <section
      className="account-menu__pool"
      aria-label={t('settings.accountLimits.poolLabel', { provider: props.provider })}
    >
      <span className="account-menu__pool-name" title={accounts}>
        {t('settings.accountLimits.allAccounts')}
        <span className="visually-hidden">{` · ${accounts}`}</span>
      </span>
      <span className="account-menu__glance">
        {props.pool.windows.map((total) => (
          <PoolWindow
            key={total.id}
            pool={props.pool}
            total={total}
            provider={props.provider}
            now={props.now}
          />
        ))}
      </span>
    </section>
  )
}

function PoolWindow(props: {
  pool: ProviderPool
  total: PoolWindowTotal
  provider: string
  now: number
}) {
  const { t } = useI18n()
  const { pool, total } = props
  const left =
    total.capacity > 0
      ? Math.min(100, Math.max(0, Math.round((total.remaining / total.capacity) * 100)))
      : 0
  const unit = pool.unit ? ` ${pool.unit}` : ''
  const size = `${multipleText(total.capacity)}×${unit}`
  const amount = t('settings.accountLimits.amountLeft', {
    amount: `${multipleText(total.remaining, 1)}×${unit}`,
  })
  const segments = poolSegments(pool, total.kind, props.now)
  const next = segments.find((segment) => segment.resetsAt === total.nextResetAt)
  const reset = next?.resetsAt === undefined ? undefined : resetText(next.resetsAt, props.now)
  // Accounts without a plan size, or without this window, are not in the sum.
  const counted =
    total.accounts < pool.accounts.length
      ? t('settings.accountLimits.countedAccounts', {
          counted: total.accounts,
          total: pool.accounts.length,
        })
      : undefined
  return (
    <span
      className="account-menu__glance-item"
      title={[
        t('settings.accountLimits.poolWindowTitle', { label: total.label, size, left }),
        [amount, counted].filter(Boolean).join(' · '),
        next && reset ? `${next.label} ${reset.label}` : '',
      ]
        .filter(Boolean)
        .join('\n')}
    >
      <span
        className="account-menu__pool-bar"
        role="progressbar"
        aria-label={t('settings.accountLimits.poolBarLabel', {
          provider: props.provider,
          label: total.label,
        })}
        aria-valuenow={left}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={t('settings.accountLimits.poolBarValue', {
          left,
          amount: multipleText(total.remaining, 1),
          size,
        })}
      >
        {segments.map((segment) => {
          const segmentLeft = Math.round(segment.left * 100)
          const segmentReset =
            segment.resetsAt === undefined ? undefined : resetText(segment.resetsAt, props.now)
          return (
            <span
              key={segment.accountId}
              className="account-menu__pool-segment"
              data-low={segmentLeft <= USAGE_LOW_PERCENT ? '' : undefined}
              style={{ flexGrow: segment.weight, '--left': segment.left } as CSSProperties}
              title={[
                t('settings.accountLimits.segmentTitle', {
                  label: segment.label,
                  left: segmentLeft,
                }),
                segmentReset?.label,
              ]
                .filter(Boolean)
                .join(', ')}
            >
              <span />
            </span>
          )
        })}
      </span>
      <span className="account-menu__account-value">{left}%</span>
    </span>
  )
}

/** One account under its provider: a line that opens to its limits. */
function AccountLine(props: {
  state: AccountLimitsState
  provider: string
  account: string
  /** The account's plan, such as "Max x5", when the pool knows it. */
  plan?: string | undefined
  /** The account the pool recommends for the next chat. */
  recommended?: boolean | undefined
  open: boolean
  now: number
  onToggle: () => void
  onRetry: () => void
  onConsumeReset?: ConsumeReset | undefined
}) {
  const { t } = useI18n()
  const bodyId = useId()
  const { limits, status, retryable } = sourceView(props.state, props.now)
  const name = `${props.provider} · ${props.account}`
  const glanced = glanceLimits(limits)
  const glance = glanced
    .map(
      (limit) =>
        `${limit.label} ${limit.valueLabel ?? t('settings.accountLimits.percentLeft', { percent: remaining(limit) })}`,
    )
    .join(', ')
  const badge = (
    <>
      <span className="account-menu__account-name">{props.account}</span>
      {props.recommended ? (
        <span
          className="account-menu__account-badge"
          title={t('settings.accountLimits.recommendedTitle')}
        >
          <span className="visually-hidden">{t('settings.accountLimits.recommended')}</span>
        </span>
      ) : null}
    </>
  )
  const retry = retryable ? (
    <button
      className="account-menu__retry"
      type="button"
      aria-label={t('settings.accountLimits.retryAccount', { account: props.account })}
      onClick={props.onRetry}
    >
      {t('settings.accountLimits.retry')}
    </button>
  ) : null
  // Without limits there is nothing to open: the line says why.
  if (glanced.length === 0) {
    return (
      <div className="account-menu__account-head">
        <span className="account-menu__account-line" title={status?.detail}>
          {badge}
          <span className="account-menu__account-status">{status?.label}</span>
        </span>
        {retry}
      </div>
    )
  }
  return (
    <div className="account-menu__account">
      <div className="account-menu__account-head">
        <button
          className="account-menu__account-line"
          type="button"
          aria-expanded={props.open}
          aria-controls={props.open ? bodyId : undefined}
          aria-label={[
            props.account,
            props.recommended ? t('settings.accountLimits.recommendedLower') : '',
            props.open ? '' : glance,
          ]
            .filter(Boolean)
            .join(', ')}
          title={props.open ? status?.detail : [props.plan, glance].filter(Boolean).join(' · ')}
          onClick={props.onToggle}
        >
          <ChevronRight className="account-menu__chevron" size={12} aria-hidden />
          {badge}
          {props.open ? (
            status ? (
              <span className="account-menu__account-status">{status.label}</span>
            ) : null
          ) : (
            <span className="account-menu__glance">
              {glanced.map((limit, index) => (
                <span
                  key={`${limit.label}:${index}`}
                  className="account-menu__glance-item"
                  title={glanceTitle(t, limit, props.now)}
                >
                  <span className="visually-hidden">{limit.label} </span>
                  {limit.valueLabel === undefined ? (
                    <span
                      className="account-menu__account-gauge"
                      data-low={remaining(limit) <= USAGE_LOW_PERCENT ? '' : undefined}
                      style={{ '--left': remaining(limit) / 100 } as CSSProperties}
                    >
                      <span />
                    </span>
                  ) : null}
                  <span
                    className={`account-menu__account-value${limit.valueLabel === undefined ? '' : ' is-text'}`}
                  >
                    {limit.valueLabel ?? `${remaining(limit)}%`}
                  </span>
                </span>
              ))}
            </span>
          )}
        </button>
        {retry}
      </div>
      {props.open ? (
        <section className="account-menu__account-body" id={bodyId} aria-label={name}>
          {props.plan ? (
            <p className="account-menu__account-plan">
              {t('settings.accountLimits.plan', { plan: props.plan })}
            </p>
          ) : null}
          {limits.map((limit, index) => (
            <LimitRow
              key={`${limit.label}:${index}`}
              name={name}
              provider={props.state.provider}
              accountId={props.state.accountId}
              limit={limit}
              now={props.now}
              onConsumeReset={props.onConsumeReset}
            />
          ))}
        </section>
      ) : null}
    </div>
  )
}

/** A closed line's window on hover: what is left and when it resets. */
function glanceTitle(t: I18n['t'], limit: Limit, now: number): string {
  const value =
    limit.valueLabel ?? t('settings.accountLimits.percentLeft', { percent: remaining(limit) })
  const reset = limit.resetsAt === undefined ? undefined : resetText(limit.resetsAt, now)
  return [`${limit.label}: ${value}`, reset?.label].filter(Boolean).join(', ')
}

function accountOf(state: AccountLimitsState): AccountId {
  return state.accountId ?? DEFAULT_ACCOUNT_ID
}

/**
 * What a closed account line shows: the first share of each window length, in
 * the order reported, so Session and Weekly rather than a model's own weekly
 * limit; two at most, to fit the line. Without shares, the first limit.
 */
function glanceLimits(limits: readonly Limit[]): Limit[] {
  const shares = limits.filter((limit) => limit.valueLabel === undefined)
  if (shares.length === 0) return limits.slice(0, 1)
  const windows = new Set<number>()
  return shares
    .filter((limit) => {
      if (limit.windowMinutes === undefined) return true
      if (windows.has(limit.windowMinutes)) return false
      windows.add(limit.windowMinutes)
      return true
    })
    .slice(0, 2)
}

function further(state: AccountLimitsState): boolean {
  return state.accountId !== undefined && state.accountId !== DEFAULT_ACCOUNT_ID
}

/** A provider shown with more than one account, or with a further account alone, names them. */
function namesAccounts(states: readonly AccountLimitsState[]): boolean {
  return states.length > 1 || states.some(further)
}

/** The sources in their order, each provider's accounts together where its first one is. */
function groupByProvider(
  states: readonly AccountLimitsState[],
): Array<{ provider: ProviderId; states: AccountLimitsState[] }> {
  const groups: Array<{ provider: ProviderId; states: AccountLimitsState[] }> = []
  for (const state of states) {
    const group = groups.find((each) => each.provider === state.provider)
    if (group) group.states.push(state)
    else groups.push({ provider: state.provider, states: [state] })
  }
  return groups
}

function LimitSource(props: {
  state: AccountLimitsState
  /** The provider, and the account when the popup names it, as assistive tech reads it. */
  name: string
  /** Set under a provider heading: the source is titled by this account name alone. */
  account?: string | undefined
  /** Goes at the end of the source's heading line. */
  action?: ReactNode
  now: number
  onRetry: () => void
  onConsumeReset?: ConsumeReset | undefined
}) {
  const { t } = useI18n()
  const titleId = useId()
  const statusId = useId()
  const bodyId = useId()
  const [open, setOpen] = useState(false)
  const { limits, status, retryable } = sourceView(props.state, props.now)
  const name = props.name
  const summary = summaryLimit(limits)
  const title =
    props.account === undefined ? (
      <>
        <ProviderIcon mark={providerMark(props.state.provider)} size={14} />
        <span>{name}</span>
      </>
    ) : (
      <span>{props.account}</span>
    )
  // With values, the heading opens the full rows; closed, one line carries the
  // window with the least left, so the popup stays short with every provider.
  const heading =
    summary === undefined ? (
      title
    ) : (
      <button
        className="account-menu__source-toggle"
        type="button"
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        {title}
        <ChevronRight className="account-menu__source-chevron" size={12} aria-hidden />
      </button>
    )
  return (
    <section
      className={`account-menu__source${props.account === undefined ? '' : ' is-account'}${summary !== undefined && !open ? ' is-closed' : ''}`}
      {...(props.account === undefined ? { 'aria-labelledby': titleId } : { 'aria-label': name })}
      aria-busy={props.state.status === 'loading'}
    >
      <div className="account-menu__source-head">
        {props.account === undefined ? (
          <h3 id={titleId}>{heading}</h3>
        ) : (
          <h4 id={titleId}>{heading}</h4>
        )}
        {status ? (
          <span className="account-menu__source-status" id={statusId} title={status.detail}>
            {status.label}
            {status.detail ? <span className="visually-hidden">. {status.detail}</span> : null}
          </span>
        ) : null}
        {retryable ? (
          <button
            className="account-menu__retry"
            type="button"
            aria-describedby={statusId}
            onClick={props.onRetry}
          >
            {t('settings.accountLimits.retry')}
          </button>
        ) : null}
        {props.action}
      </div>
      {summary === undefined ? null : open ? (
        <div className="account-menu__source-body" id={bodyId}>
          {limits.map((limit, index) => (
            <LimitRow
              key={`${limit.label}:${index}`}
              name={name}
              provider={props.state.provider}
              accountId={props.state.accountId}
              limit={limit}
              now={props.now}
              onConsumeReset={props.onConsumeReset}
            />
          ))}
        </div>
      ) : (
        <LimitRow
          name={name}
          provider={props.state.provider}
          accountId={props.state.accountId}
          limit={summary}
          now={props.now}
          inline
        />
      )}
    </section>
  )
}

/**
 * The row a closed source shows: the share with the least left, the first of
 * equals, since that window runs out first; without shares, the first row.
 */
export function summaryLimit(limits: readonly Limit[]): Limit | undefined {
  let least: Limit | undefined
  for (const limit of limits) {
    if (limit.valueLabel !== undefined) continue
    if (least === undefined || remaining(limit) < remaining(least)) least = limit
  }
  return least ?? limits[0]
}

/** A source's limits, the phrase that goes beside its name, and whether it can be retried. */
function sourceView(state: AccountLimitsState, now: number) {
  const source = limitSource(state)
  const limits = source?.status === 'ready' ? source.limits : []
  const status = sourceStatus(state, source, limits.length > 0, now)
  // Automatic retries run on their own; the button returns once they stop.
  const retrying = state.status !== 'ready' && state.retry !== undefined
  const retryable =
    !retrying &&
    (state.status === 'error' || (state.status === 'ready' && source?.status === 'unavailable'))
  return { limits, status, retryable }
}

/**
 * The one muted phrase beside a provider's name, with any detail kept for
 * hover. Values that could not be refreshed say how old they are rather than
 * raising an error; values that are merely old say when they were updated.
 */
export function sourceStatus(
  state: AccountLimitsState,
  source: ProviderLimitSource | undefined,
  hasValues: boolean,
  now: number,
): { label: string; detail?: string | undefined } | undefined {
  if (state.status !== 'ready' && state.retry) {
    const { attempt, of, message } = state.retry
    return {
      label: translateNow('settings.accountLimits.retrying'),
      detail: translateNow('settings.accountLimits.retryingDetail', { message, attempt, of }),
    }
  }
  const checkedAt = source?.status === 'ready' ? source.checkedAt : undefined
  if (state.status === 'error') {
    return hasValues
      ? {
          label: lastKnownLabel(checkedAt, now),
          detail: translateNow('settings.accountLimits.refreshFailed', { message: state.message }),
        }
      : {
          label: translateNow('settings.accountLimits.unavailable'),
          detail: translateNow('settings.accountLimits.loadFailed', { message: state.message }),
        }
  }
  if (!source) return { label: translateNow('settings.accountLimits.checking') }
  // Only shown sources reach here unavailable: ones that could not be read yet.
  if (source.status === 'unavailable') {
    return state.status === 'loading'
      ? { label: translateNow('settings.accountLimits.checking') }
      : {
          label: translateNow('settings.accountLimits.unavailable'),
          detail: [translateNow('settings.accountLimits.loadFailedShort'), source.error]
            .filter(Boolean)
            .join(' '),
        }
  }
  // The server kept these values through a failed refresh and retries on its own.
  if (source.status === 'ready' && source.stale && hasValues) {
    return {
      label: lastKnownLabel(checkedAt, now),
      detail: [translateNow('settings.accountLimits.refreshFailedShort'), source.refreshError]
        .filter(Boolean)
        .join(' '),
    }
  }
  if (!hasValues)
    return {
      label: translateNow('settings.accountLimits.noneReported'),
      detail: translateNow('settings.accountLimits.noneReportedDetail'),
    }
  if (checkedAt !== undefined && now - checkedAt >= AGE_SHOWN_AFTER_MS) {
    return {
      label: translateNow('settings.accountLimits.updatedAgo', {
        age: compactRelativeTime(checkedAt, now),
      }),
    }
  }
  return undefined
}

/** "Last known · 2h ago"; under a minute, or without a read time, just "Last known". */
function lastKnownLabel(checkedAt: number | undefined, now: number): string {
  if (checkedAt === undefined || now - checkedAt < 60_000) {
    return translateNow('settings.accountLimits.lastKnown')
  }
  return translateNow('settings.accountLimits.lastKnownAgo', {
    age: compactRelativeTime(checkedAt, now),
  })
}

function LimitRow(props: {
  name: string
  provider: ProviderId
  accountId?: AccountId | undefined
  limit: Limit
  now: number
  onConsumeReset?: ConsumeReset | undefined
  /** One line: the bar between label and value, the reset time on hover, no actions. */
  inline?: boolean
}) {
  const { t } = useI18n()
  const inline = props.inline === true
  const consumable =
    !inline && props.limit.action === 'consume-reset' && props.onConsumeReset !== undefined
  const credits = props.limit.resetCredits
  const hasSelectableCredits = credits?.some((credit) => credit.id !== undefined)
  const left = remaining(props.limit)
  // An untouched allowance is one line: a full bar and its reset time say
  // nothing the number does not, and the rows that are being spent stand out.
  const full = props.limit.valueLabel === undefined && left === 100
  const gauge = props.limit.valueLabel === undefined && !full
  const value = props.limit.valueLabel ?? t('settings.accountLimits.percentLeft', { percent: left })
  const pace = evenPace(props.limit, props.now)
  const reset =
    props.limit.resetsAt === undefined || full
      ? undefined
      : resetLine(t, props.limit.resetsAt, props.now)
  const bar = gauge ? (
    <div
      className="account-menu__limit-bar"
      role="progressbar"
      aria-label={t('settings.accountLimits.limitBarLabel', {
        name: props.name,
        label: props.limit.label,
      })}
      aria-valuenow={left}
      aria-valuemin={0}
      aria-valuemax={100}
      title={
        pace === undefined
          ? undefined
          : t('settings.accountLimits.evenPace', { percent: Math.round(pace) })
      }
    >
      <span />
      {pace === undefined ? null : (
        <span className="account-menu__limit-pace" style={{ left: `${pace}%` }} />
      )}
    </div>
  ) : null

  return (
    <div
      className={`account-menu__limit${inline ? ' is-inline' : ''}`}
      data-gauge={gauge ? '' : undefined}
      data-full={full ? '' : undefined}
      data-low={gauge && left <= USAGE_LOW_PERCENT ? '' : undefined}
      // The bar takes its length from how much is left.
      style={gauge ? ({ '--left': left / 100 } as CSSProperties) : undefined}
      title={inline && reset ? [reset.label, reset.title].filter(Boolean).join(' · ') : undefined}
    >
      <div className="account-menu__limit-row">
        <span className="account-menu__limit-label">{props.limit.label}</span>
        {inline ? bar : null}
        <span className="account-menu__limit-value">{value}</span>
      </div>
      {inline ? null : bar}
      {reset && !inline ? (
        <span className="account-menu__limit-reset" title={reset.title}>
          {reset.label}
        </span>
      ) : null}
      {credits?.length && !inline ? (
        <ResetCreditExpiries
          credits={credits}
          provider={props.provider}
          accountId={props.accountId}
          now={props.now}
          onConsumeReset={consumable ? props.onConsumeReset : undefined}
        />
      ) : null}
      {consumable && !hasSelectableCredits ? (
        <ResetCreditRow
          provider={props.provider}
          accountId={props.accountId}
          onConsumeReset={props.onConsumeReset}
        >
          {t('settings.accountLimits.nextReset')}
        </ResetCreditRow>
      ) : null}
    </div>
  )
}

function ResetCreditRow(props: {
  children: ReactNode
  provider: ProviderId
  accountId?: AccountId | undefined
  creditId?: string | undefined
  onConsumeReset?: ConsumeReset | undefined
}) {
  const { t } = useI18n()
  const row = useRef<HTMLDivElement>(null)
  const expiryId = useId()
  const attemptKey = useRef<string | undefined>(undefined)
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string>()

  useLayoutEffect(() => {
    if (confirming && !pending) row.current?.focus()
  }, [confirming, pending])

  const consume = async () => {
    if (!props.onConsumeReset || pending) return
    const key = attemptKey.current ?? crypto.randomUUID()
    attemptKey.current = key
    setPending(true)
    setMessage(undefined)
    try {
      const { outcome } =
        props.accountId === undefined
          ? await props.onConsumeReset(props.provider, key, props.creditId)
          : await props.onConsumeReset(props.provider, key, props.creditId, props.accountId)
      attemptKey.current = undefined
      setConfirming(false)
      if (outcome === 'nothingToReset') setMessage(t('settings.accountLimits.resetNothing'))
      else if (outcome === 'noCredit') setMessage(t('settings.accountLimits.resetNone'))
      else if (outcome === 'alreadyRedeemed') setMessage(t('settings.accountLimits.resetUsed'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('settings.accountLimits.resetFailed'))
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      className={`account-menu__reset-credit${confirming ? ' is-confirming' : ''}`}
      ref={row}
      tabIndex={confirming ? -1 : undefined}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !confirming || pending) return
        event.preventDefault()
        event.stopPropagation()
        setConfirming(false)
      }}
    >
      <span className="account-menu__reset-expiry" id={expiryId}>
        {props.children}
      </span>
      {confirming ? (
        <>
          <button
            className="account-menu__limit-btn account-menu__limit-confirm"
            type="button"
            disabled={pending || !props.onConsumeReset}
            aria-label={t('settings.accountLimits.confirmLabel')}
            aria-describedby={expiryId}
            onClick={() => void consume()}
          >
            {pending ? t('settings.accountLimits.using') : t('settings.accountLimits.confirm')}
          </button>
          <button
            className="account-menu__limit-btn account-menu__limit-cancel"
            type="button"
            disabled={pending}
            aria-label={t('settings.accountLimits.cancelLabel')}
            onClick={() => setConfirming(false)}
          >
            {t('settings.accountLimits.cancel')}
          </button>
        </>
      ) : props.onConsumeReset ? (
        <button
          className="account-menu__limit-btn account-menu__limit-use"
          type="button"
          aria-label={t('settings.accountLimits.useLabel')}
          aria-describedby={expiryId}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setMessage(undefined)
            setConfirming(true)
          }}
        >
          {t('settings.accountLimits.use')}
        </button>
      ) : null}
      {message ? (
        <span className="account-menu__limit-note" role="status">
          {message}
        </span>
      ) : null}
    </div>
  )
}

function ResetCreditExpiries(props: {
  credits: NonNullable<Limit['resetCredits']>
  provider: ProviderId
  accountId?: AccountId | undefined
  now: number
  onConsumeReset?: ConsumeReset | undefined
}) {
  const { t } = useI18n()
  const now = props.now
  const ordered = [...props.credits].sort(
    (a, b) => (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity),
  )
  return (
    <ul
      className="account-menu__reset-expiries"
      aria-label={t('settings.accountLimits.expiriesLabel')}
    >
      {ordered.map(({ id, expiresAt }, index) => {
        const date = expiresAt === null ? undefined : new Date(expiresAt)
        const validDate = date && !Number.isNaN(date.getTime()) ? date : undefined
        const untilExpiry = expiresAt === null ? Infinity : expiresAt - now
        const usable = id !== undefined && (expiresAt === null || (validDate && untilExpiry > 0))
        return (
          <li key={id ?? `${expiresAt}:${index}`}>
            <ResetCreditRow
              provider={props.provider}
              accountId={props.accountId}
              creditId={id}
              onConsumeReset={usable ? props.onConsumeReset : undefined}
            >
              {validDate ? (
                <time
                  dateTime={validDate.toISOString()}
                  data-expiring-soon={untilExpiry > 0 && untilExpiry < 86_400_000 ? '' : undefined}
                >
                  {t(
                    untilExpiry <= 0
                      ? 'settings.accountLimits.expired'
                      : 'settings.accountLimits.expires',
                    { date: dateTimeText(validDate.getTime(), now) ?? '' },
                  )}
                </time>
              ) : expiresAt === null ? (
                t('settings.accountLimits.noExpiry')
              ) : (
                t('settings.accountLimits.expiryUnavailable')
              )}
            </ResetCreditRow>
          </li>
        )
      })}
    </ul>
  )
}

export function limitSource(state: AccountLimitsState): ProviderLimitSource | undefined {
  // Retries that all failed leave the source out, as if it reported nothing.
  if (state.status !== 'ready' && state.gaveUp)
    return { provider: state.provider, status: 'unavailable' }
  const summary = state.summary
  if (!summary) return undefined
  if (summary.limitSource) return summary.limitSource
  return summary.limits.length > 0
    ? { provider: state.provider, status: 'ready', limits: summary.limits }
    : { provider: state.provider, status: 'unavailable' }
}

export function remaining(limit: Limit): number {
  return Math.min(100, Math.max(0, Math.round(100 - limit.usedPercent)))
}

/**
 * Where the bar would end if the window were spent evenly: the share of the
 * window still ahead, in percent. Absent without a window length and reset
 * time, or when the mark would sit on the bar's rounded ends.
 */
export function evenPace(limit: Limit, now: number): number | undefined {
  if (limit.windowMinutes === undefined || limit.resetsAt === undefined) return undefined
  const ahead = ((limit.resetsAt - now) / (limit.windowMinutes * 60_000)) * 100
  return ahead >= 2 && ahead <= 98 ? ahead : undefined
}

/**
 * The Usage page's words on a line of their own: "Resets in 3h 12m" within a
 * day, the weekday and time within the week, the date after that, with the
 * exact time on hover.
 */
function resetLine(t: I18n['t'], at: number, now: number) {
  const reset = resetText(at, now)
  if (!reset) return { label: t('settings.accountLimits.resetUnavailable'), title: undefined }
  return { label: reset.label.charAt(0).toUpperCase() + reset.label.slice(1), title: reset.title }
}
