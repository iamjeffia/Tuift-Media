import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { IconBooks as Books, IconSearch as Search } from '@tabler/icons-react'
import type {
  ClubeFacets,
  ClubeItem,
  ClubeKind,
  ClubeLibraryFailure,
  ClubeLimitsResult,
} from '@harness/contracts'
import { CLUBE_PLANS_LINK, useClube } from '../../clube.js'
import {
  CLUBE_KINDS,
  CLUBE_PAGE,
  ClubeMedia,
  KIND_PLURAL_WORDS,
  KIND_WORDS,
  NO_CLUBE_FILTERS,
  clubeFailureText,
  clubeSearchParams,
  type ClubeFilters,
} from '../../clube-library.js'
import { useI18n, type I18n } from '../../i18n/index.js'
import { formatSoundDuration } from '../../sounds.js'
import type { Transport } from '../../transport.js'
import { AppSelect } from '../AppSelect.js'
import { EmptyState } from '../EmptyState.js'
import { SkeletonRows, SkeletonStatus } from '../Skeleton.js'
import { ClubeRecordView, KIND_ICONS } from './ClubeRecordView.js'
import './workspace-clube.css'

const QUERY_DELAY_MS = 300

type Results =
  | { state: 'loading'; items: readonly ClubeItem[] }
  | { state: 'ready'; items: readonly ClubeItem[]; total: number; next: string | null }
  | { state: 'failed'; items: readonly ClubeItem[]; failure: ClubeLibraryFailure | undefined }

const LOADING: Results = { state: 'loading', items: [] }
const NO_FACETS: ClubeFacets = { kind: [], style: [], tool: [], scene: [], format: [] }
type Limits = Extract<ClubeLimitsResult, { ok: true }>

/**
 * The Clube's library beside a chat: search with the filters the answer brings, and an item that
 * opens in the panel to download it into the chat's project, install it, or send it to the chat.
 * Everything goes through the app's server, which holds the account's token and the files: this
 * page never calls the Clube, never holds a link of its own and never sees a token.
 */
export function WorkspaceClube(props: {
  active: boolean
  transport: Transport
  threadId?: string | undefined
  projectPath?: string | undefined
  /** Opens Settings on the Clube page, where the account is linked. */
  onOpenClubeSettings?: (() => void) | undefined
}) {
  const i18n = useI18n()
  const { t } = i18n
  const { transport, active } = props
  const clube = useClube(transport, active)
  const i18nRef = useRef(i18n)
  i18nRef.current = i18n
  const media = useMemo(() => new ClubeMedia(transport), [transport])
  useEffect(() => () => media.dispose(), [media])

  const [filters, setFilters] = useState<ClubeFilters>(NO_CLUBE_FILTERS)
  const [debounced, setDebounced] = useState<ClubeFilters>(NO_CLUBE_FILTERS)
  const [results, setResults] = useState<Results>(LOADING)
  const [facets, setFacets] = useState<ClubeFacets>(NO_FACETS)
  const [limits, setLimits] = useState<Limits>()
  const [attempt, setAttempt] = useState(0)
  const [notice, setNotice] = useState<string>()
  const [open, setOpen] = useState<ClubeItem>()
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set())

  const status = clube.status
  const link: 'loading' | 'unreachable' | 'not-linked' | 'no-subscription' | 'open' = !status
    ? clube.failed
      ? 'unreachable'
      : 'loading'
    : status.state !== 'connected'
      ? 'not-linked'
      : status.subscriber === false
        ? 'no-subscription'
        : 'open'
  // A search that came back refused wins over a status that is a minute old.
  const refused =
    results.state === 'failed' &&
    (results.failure?.reason === 'not-linked' || results.failure?.reason === 'no-subscription')
      ? results.failure.reason
      : undefined
  const effective = link === 'open' && refused ? refused : link

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(filters), QUERY_DELAY_MS)
    return () => clearTimeout(timer)
  }, [filters])

  /** The day's limits; a Clube without the route hides them. */
  const refreshLimits = useCallback(() => {
    transport
      .request('clube.library.limits', {})
      .then((result) => setLimits(result.ok ? result : undefined))
      .catch(() => setLimits(undefined))
  }, [transport])
  const refreshRef = useRef(refreshLimits)
  refreshRef.current = refreshLimits
  const onSpent = useCallback(() => refreshRef.current(), [])
  useEffect(() => {
    if (active && link === 'open') refreshRef.current()
  }, [active, link])

  const params = useMemo(() => clubeSearchParams(debounced), [debounced])
  useEffect(() => {
    if (!active || link !== 'open') return
    let current = true
    setResults(LOADING)
    setNotice(undefined)
    transport
      .request('clube.library.search', params)
      .then((result) => {
        if (!current) return
        if (result.ok) {
          setResults({
            state: 'ready',
            items: result.items,
            total: result.total,
            next: result.next,
          })
          setFacets(result.facets)
        } else {
          setResults({ state: 'failed', items: [], failure: result })
          if (result.reason === 'rate-limit') setNotice(clubeFailureText(result, i18nRef.current))
        }
      })
      .catch(() => {
        if (current) setResults({ state: 'failed', items: [], failure: undefined })
      })
    return () => {
      current = false
    }
  }, [active, link, transport, params, attempt])

  const showMore = () => {
    if (results.state !== 'ready' || !results.next) return
    void transport
      .request('clube.library.search', clubeSearchParams(debounced, results.next))
      .then((result) => {
        if (!result.ok) return
        setResults((now) =>
          now.state === 'ready'
            ? {
                state: 'ready',
                items: [...now.items, ...result.items],
                total: result.total,
                next: result.next,
              }
            : now,
        )
      })
      .catch(() => undefined)
  }

  const visible = results.items.filter((item) => !hidden.has(item.id))

  if (effective === 'loading') {
    return (
      <SkeletonStatus label={t('clubePanel.state.loading')} className="workspace-clube__skeleton">
        <SkeletonRows rows={7} icon detail density="tall" />
      </SkeletonStatus>
    )
  }
  if (effective === 'unreachable') {
    return (
      <EmptyState
        icon={<Books size={30} strokeWidth={1.6} aria-hidden />}
        title={t('clubePanel.state.error.title')}
        detail={t('clubePanel.state.error.detail')}
        role="alert"
      />
    )
  }
  if (effective === 'not-linked') {
    return (
      <EmptyState
        icon={<Books size={30} strokeWidth={1.6} aria-hidden />}
        title={t('clubePanel.state.notLinked.title')}
        detail={t('clubePanel.state.notLinked.detail')}
      >
        <button type="button" className="btn" onClick={props.onOpenClubeSettings}>
          {t('clubePanel.state.notLinked.action')}
        </button>
      </EmptyState>
    )
  }
  if (effective === 'no-subscription') {
    return (
      <EmptyState
        icon={<Books size={30} strokeWidth={1.6} aria-hidden />}
        title={t('clubePanel.state.noSubscription.title')}
        detail={t('clubePanel.state.noSubscription.detail')}
      >
        <a
          className="btn workspace-clube__link"
          href={CLUBE_PLANS_LINK}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('clubePanel.state.noSubscription.action')}
        </a>
      </EmptyState>
    )
  }

  return (
    <div className="workspace-clube" data-record={open ? '' : undefined}>
      <div className="workspace-clube__list">
        <div className="workspace-clube__head">
          <label className="workspace-tree-search workspace-clube__search">
            <Search size={14} aria-hidden />
            <input
              value={filters.query}
              maxLength={200}
              onChange={(event) => setFilters({ ...filters, query: event.target.value })}
              placeholder={t('clubePanel.search.placeholder')}
              aria-label={t('clubePanel.search.label')}
            />
          </label>
          <div className="workspace-clube__filters">
            <FacetSelect
              value={filters.kind}
              ariaLabel={t('clubePanel.filter.kind')}
              any={t('clubePanel.filter.allKinds')}
              values={CLUBE_KINDS.filter(
                (kind) =>
                  facets.kind.length === 0 || facets.kind.some((entry) => entry.value === kind),
              ).map((kind) => ({
                value: kind,
                label: t(KIND_PLURAL_WORDS[kind]),
                count: facets.kind.find((entry) => entry.value === kind)?.count,
              }))}
              onChange={(kind) => setFilters({ ...filters, kind: kind as ClubeKind | '' })}
            />
            <FacetSelect
              value={filters.style}
              ariaLabel={t('clubePanel.filter.style')}
              any={t('clubePanel.filter.anyStyle')}
              values={facets.style.map(plain)}
              onChange={(style) => setFilters({ ...filters, style })}
            />
            <FacetSelect
              value={filters.tool}
              ariaLabel={t('clubePanel.filter.tool')}
              any={t('clubePanel.filter.anyTool')}
              values={facets.tool.map(plain)}
              onChange={(tool) => setFilters({ ...filters, tool })}
            />
            <FacetSelect
              value={filters.scene}
              ariaLabel={t('clubePanel.filter.scene')}
              any={t('clubePanel.filter.anyScene')}
              values={facets.scene.map(plain)}
              onChange={(scene) => setFilters({ ...filters, scene })}
            />
            <FacetSelect
              value={filters.format}
              ariaLabel={t('clubePanel.filter.format')}
              any={t('clubePanel.filter.anyFormat')}
              values={facets.format.map(plain)}
              onChange={(format) => setFilters({ ...filters, format })}
            />
          </div>
        </div>

        <div className="workspace-clube__body">
          {results.state === 'loading' ? (
            <SkeletonStatus
              label={t('clubePanel.state.loading')}
              className="workspace-clube__skeleton"
            >
              <SkeletonRows rows={7} icon detail density="tall" />
            </SkeletonStatus>
          ) : results.state === 'failed' ? (
            <EmptyState
              icon={<Books size={30} strokeWidth={1.6} aria-hidden />}
              title={t('clubePanel.state.error.title')}
              detail={t('clubePanel.state.error.detail')}
              role="alert"
            >
              <button type="button" className="btn" onClick={() => setAttempt((now) => now + 1)}>
                {t('clubePanel.state.retry')}
              </button>
            </EmptyState>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<Books size={30} strokeWidth={1.6} aria-hidden />}
              title={t('clubePanel.state.empty.title')}
              detail={t('clubePanel.state.empty.detail')}
            />
          ) : (
            <>
              <ul className="workspace-clube__cards" aria-label={t('clubePanel.list.label')}>
                {visible.map((item) => (
                  <li key={item.id}>
                    <ClubeCard item={item} media={media} i18n={i18n} onOpen={() => setOpen(item)} />
                  </li>
                ))}
              </ul>
              {results.next && results.items.length >= CLUBE_PAGE ? (
                <button type="button" className="ghost workspace-clube__more" onClick={showMore}>
                  {t('clubePanel.more')}
                </button>
              ) : null}
            </>
          )}
        </div>

        {notice ? (
          <div className="workspace-clube__notice" data-tone="info" role="status">
            <span>{notice}</span>
          </div>
        ) : null}
        {!props.threadId ? (
          <div className="workspace-clube__notice" data-tone="info" role="status">
            <span>{t('clubePanel.noChat')}</span>
          </div>
        ) : null}
      </div>

      {open ? (
        <ClubeRecordView
          key={open.id}
          item={open}
          transport={transport}
          media={media}
          threadId={props.threadId}
          projectPath={props.projectPath}
          onBack={() => setOpen(undefined)}
          onHidden={(id) => {
            setHidden((now) => new Set(now).add(id))
            setOpen(undefined)
          }}
          onSpent={onSpent}
        />
      ) : null}
      {results.state === 'ready' || limits ? (
        <footer className="workspace-clube__foot">
          <span>
            {results.state === 'ready' && !open ? i18n.tp('clubePanel.results', results.total) : ''}
          </span>
          {limits ? <LimitsLine limits={limits} i18n={i18n} /> : null}
        </footer>
      ) : null}
    </div>
  )
}

const plain = (entry: { value: string; count: number }) => ({
  value: entry.value,
  label: entry.value,
  count: entry.count,
})

/** One filter: "any", then the values the answer brings with how many items each has; the chosen one stays listed. */
function FacetSelect(props: {
  value: string
  ariaLabel: string
  any: string
  values: ReadonlyArray<{ value: string; label: string; count: number | undefined }>
  onChange: (value: string) => void
}) {
  const options = props.values.map((entry) => ({
    value: entry.value,
    label: entry.count === undefined ? entry.label : `${entry.label} (${entry.count})`,
  }))
  if (props.value && !options.some((option) => option.value === props.value)) {
    options.push({ value: props.value, label: props.value })
  }
  if (options.length === 0 && !props.value) return null
  return (
    <AppSelect
      value={props.value}
      ariaLabel={props.ariaLabel}
      options={[{ value: '', label: props.any }, ...options]}
      onChange={props.onChange}
    />
  )
}

function LimitsLine(props: { limits: Limits; i18n: I18n }) {
  const { t } = props.i18n
  const { limits } = props
  if (limits.unlimited) return <span>{t('clubePanel.limits.unlimited')}</span>
  const entries = [
    limits.files
      ? {
          key: 'files',
          text: t('clubePanel.limits.files', limits.files),
          note: t('clubePanel.limits.filesNote'),
        }
      : undefined,
    limits.sounds
      ? {
          key: 'sounds',
          text: t('clubePanel.limits.sounds', limits.sounds),
          note: t('clubePanel.limits.soundsNote'),
        }
      : undefined,
    limits.references
      ? {
          key: 'references',
          text: t('clubePanel.limits.references', limits.references),
          note: t('clubePanel.limits.referencesNote'),
        }
      : undefined,
  ].filter((entry) => entry !== undefined)
  if (entries.length === 0) return null
  return (
    <ul className="workspace-clube__limits" aria-label={t('clubePanel.limits.label')}>
      {entries.map((entry) => (
        <li key={entry.key} title={entry.note}>
          {entry.text}
        </li>
      ))}
    </ul>
  )
}

const ClubeCard = memo(function ClubeCard(props: {
  item: ClubeItem
  media: ClubeMedia
  i18n: I18n
  onOpen: () => void
}) {
  const { t, language } = props.i18n
  const { item, media } = props
  const Icon = KIND_ICONS[item.kind]
  const cover = useSyncExternalStore(media.subscribe, () =>
    item.cover ? media.state(item.cover) : null,
  )
  useEffect(() => {
    if (item.cover) void media.load(item.cover)
  }, [item.cover, media])
  const detail = [
    t(KIND_WORDS[item.kind]),
    item.format,
    item.durationS === undefined ? undefined : formatSoundDuration(item.durationS, language),
    item.access === 'free' ? t('clubePanel.row.free') : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
  return (
    <button
      type="button"
      className="clube-card"
      aria-label={t('clubePanel.row.open', { title: item.title })}
      onClick={props.onOpen}
    >
      <span className="clube-thumb" aria-hidden>
        {cover ? <img src={cover} alt="" /> : <Icon size={20} />}
      </span>
      <span className="clube-card__text">
        <span className="clube-card__name" title={item.title}>
          {item.title}
        </span>
        <span className="clube-card__detail">{detail}</span>
        {item.summary ? <span className="clube-card__summary">{item.summary}</span> : null}
      </span>
    </button>
  )
})
