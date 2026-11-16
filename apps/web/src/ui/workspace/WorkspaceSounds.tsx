import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  IconCheck as Check,
  IconPaperclip as Paperclip,
  IconPlayerPause as Pause,
  IconPlayerPlay as Play,
  IconSearch as Search,
  IconWaveSine as WaveSine,
} from '@tabler/icons-react'
import type {
  MusicAvailable,
  SoundDaily,
  SoundFacetsResult,
  SoundFailure,
  SoundItem,
} from '@harness/contracts'
import { attachDeliveredFile, isDesktop } from '../../bridge.js'
import { CLUBE_PLANS_LINK, useClube } from '../../clube.js'
import { attachToComposer } from '../../composer-attach.js'
import { useI18n, type I18n, type MessageKey } from '../../i18n/index.js'
import {
  formatSoundDuration,
  kindOf,
  MUSIC_SOURCES,
  NO_FILTERS,
  SOUND_TABS,
  SOUNDS_PAGE,
  attachmentFor,
  searchParamsFor,
  type MusicSource,
  type SoundFilters,
  type SoundTab,
} from '../../sounds.js'
import type { Transport } from '../../transport.js'
import { AppSelect } from '../AppSelect.js'
import { EmptyState } from '../EmptyState.js'
import { SettingsSegmented } from '../settings/SettingsSegmented.js'
import { SkeletonRows, SkeletonStatus } from '../Skeleton.js'
import './workspace-sounds.css'

const QUERY_DELAY_MS = 300

type Facets = Extract<SoundFacetsResult, { ok: true }>

const TAB_LABELS = {
  tonal: 'sounds.type.tonal',
  efeito: 'sounds.type.efeito',
  music: 'sounds.type.music',
} as const satisfies Record<SoundTab, MessageKey>

const SOURCE_LABELS = {
  trilha: 'sounds.source.trilha',
  clube: 'sounds.source.clube',
} as const satisfies Record<MusicSource, MessageKey>

type Results =
  | { state: 'loading'; items: readonly SoundItem[] }
  | { state: 'ready'; items: readonly SoundItem[]; total: number }
  | { state: 'failed'; items: readonly SoundItem[]; failure: SoundFailure | undefined }

/** Why a row's send, or its preview, did not finish: the line the footer shows. */
type Notice = { tone: 'error' | 'info'; text: string }

const LOADING: Results = { state: 'loading', items: [] }

/**
 * The Clube's sound library, beside a Motion chat: search, filters from the library's facets, a
 * preview per row, and "Send", which fetches the sound into the chat's project and puts it in
 * the prompt box. Everything goes through the app's server, which holds the account's token and
 * counts the day: this page never calls the Clube and never sees a token.
 */
export function WorkspaceSounds(props: {
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
  const [tab, setTab] = useState<SoundTab>('tonal')
  const [source, setSource] = useState<MusicSource>('trilha')
  const kind = kindOf(tab, source)
  const [filters, setFilters] = useState<SoundFilters>(NO_FILTERS)
  const [debounced, setDebounced] = useState<SoundFilters>(NO_FILTERS)
  /** What the Clube music search says it can be filtered by; it sends that with an unfiltered search. */
  const [available, setAvailable] = useState<MusicAvailable>()
  const [results, setResults] = useState<Results>(LOADING)
  const [facets, setFacets] = useState<Facets>()
  const [daily, setDaily] = useState<Partial<Record<'sound' | 'music', SoundDaily>>>({})
  const [attempt, setAttempt] = useState(0)
  const [notice, setNotice] = useState<Notice>()
  const [spent, setSpent] = useState<Partial<Record<'sound' | 'music', boolean>>>({})
  const [sending, setSending] = useState<string>()
  const [sent, setSent] = useState<ReadonlySet<string>>(() => new Set())
  const preview = usePreview(transport, (failed) =>
    setNotice(failed ? { tone: 'error', text: t('sounds.row.previewFailed') } : undefined),
  )
  const shelf = kind === 'clube' ? 'music' : 'sound'

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

  const remember = useCallback((on: 'sound' | 'music', value: SoundDaily) => {
    setDaily((current) => ({ ...current, [on]: value }))
    if (value.used >= value.limit) setSpent((current) => ({ ...current, [on]: true }))
  }, [])

  // The library's categories and keys, once the account can open it.
  useEffect(() => {
    if (!active || link !== 'open') return
    let current = true
    transport
      .request('sounds.facets', {})
      .then((result) => {
        if (!current || !result.ok) return
        setFacets(result)
        remember('sound', result.daily)
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [active, link, transport, remember])

  const params = useMemo(() => searchParamsFor(kind, debounced), [kind, debounced])
  useEffect(() => {
    if (!active || link !== 'open') return
    let current = true
    setResults(LOADING)
    setNotice(undefined)
    transport
      .request('sounds.search', params)
      .then((result) => {
        if (!current) return
        if (result.ok) {
          setResults({ state: 'ready', items: result.items, total: result.total })
          remember(shelf, result.daily)
          if (result.available) setAvailable(result.available)
        } else {
          setResults({ state: 'failed', items: [], failure: result })
          if (result.reason === 'rate-limit') {
            setNotice({
              tone: 'info',
              text: result.retryAfterS
                ? t('sounds.rate.notice', { seconds: result.retryAfterS })
                : t('sounds.rate.noticeNow'),
            })
          }
        }
      })
      .catch(() => {
        if (current) setResults({ state: 'failed', items: [], failure: undefined })
      })
    return () => {
      current = false
    }
  }, [active, link, transport, params, attempt, shelf, remember, t])

  const showMore = () => {
    if (results.state !== 'ready') return
    const offset = results.items.length
    void transport
      .request('sounds.search', searchParamsFor(kind, debounced, offset))
      .then((result) => {
        if (!result.ok) return
        setResults((now) =>
          now.state === 'ready'
            ? { state: 'ready', items: [...now.items, ...result.items], total: result.total }
            : now,
        )
      })
      .catch(() => undefined)
  }

  const send = async (item: SoundItem) => {
    if (!props.threadId) return
    const key = `${item.shelf}:${item.id}`
    setSending(key)
    setNotice(undefined)
    try {
      const result = await transport.request('sounds.use', {
        threadId: props.threadId,
        shelf: item.shelf,
        id: item.id,
      })
      if (!result.ok) {
        setNotice(failureNotice(result, t))
        if (result.reason === 'daily-limit') setSpent((now) => ({ ...now, [item.shelf]: true }))
        if (result.daily) remember(item.shelf, result.daily)
        return
      }
      remember(item.shelf, result.daily)
      const attachment = attachmentFor(result.sound)
      const picked =
        isDesktop && props.projectPath
          ? await attachDeliveredFile(attachment.path, [props.projectPath])
          : attachment
      if (!attachToComposer([picked])) throw new Error('no composer')
      setSent((now) => new Set(now).add(key))
    } catch {
      setNotice({ tone: 'error', text: t('sounds.use.attachFailed') })
    } finally {
      setSending(undefined)
    }
  }

  const categories = useMemo(() => {
    if (kind === 'clube') return available?.category ?? []
    return (facets?.categories ?? [])
      .filter((entry) => entry.type === kind)
      .map((entry) => entry.category)
  }, [facets, available, kind])
  const keys =
    kind === 'clube' ? (available?.key ?? []) : kind === 'efeito' ? [] : (facets?.keys ?? [])
  const tempo = kind === 'trilha' || kind === 'clube'

  if (effective === 'loading') {
    return (
      <SkeletonStatus label={t('sounds.state.loading')} className="workspace-sounds__skeleton">
        <SkeletonRows rows={7} icon detail density="tall" />
      </SkeletonStatus>
    )
  }
  if (effective === 'unreachable') {
    return (
      <EmptyState
        icon={<WaveSine size={30} strokeWidth={1.6} aria-hidden />}
        title={t('sounds.state.error.title')}
        detail={t('sounds.state.error.detail')}
        role="alert"
      />
    )
  }
  if (effective === 'not-linked') {
    return (
      <EmptyState
        icon={<WaveSine size={30} strokeWidth={1.6} aria-hidden />}
        title={t('sounds.state.notLinked.title')}
        detail={t('sounds.state.notLinked.detail')}
      >
        <button type="button" className="btn" onClick={props.onOpenClubeSettings}>
          {t('sounds.state.notLinked.action')}
        </button>
      </EmptyState>
    )
  }
  if (effective === 'no-subscription') {
    return (
      <EmptyState
        icon={<WaveSine size={30} strokeWidth={1.6} aria-hidden />}
        title={t('sounds.state.noSubscription.title')}
        detail={t('sounds.state.noSubscription.detail')}
      >
        <a
          className="btn workspace-sounds__link"
          href={CLUBE_PLANS_LINK}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('sounds.state.noSubscription.action')}
        </a>
      </EmptyState>
    )
  }

  const today = daily[shelf]
  const isSpent = spent[shelf] === true
  return (
    <div className="workspace-sounds">
      <div className="workspace-sounds__head">
        <SettingsSegmented
          ariaLabel={t('sounds.type.label')}
          value={tab}
          options={SOUND_TABS.map((value) => ({ value, label: t(TAB_LABELS[value]) }))}
          onChange={(value) => {
            setTab(value as SoundTab)
            setFilters(NO_FILTERS)
            setDebounced(NO_FILTERS)
            preview.stop()
          }}
        />
        {tab === 'music' ? (
          <SettingsSegmented
            ariaLabel={t('sounds.source.label')}
            value={source}
            options={MUSIC_SOURCES.map((value) => ({ value, label: t(SOURCE_LABELS[value]) }))}
            onChange={(value) => {
              setSource(value as MusicSource)
              setFilters(NO_FILTERS)
              setDebounced(NO_FILTERS)
              preview.stop()
            }}
          />
        ) : null}
        <label className="workspace-tree-search workspace-sounds__search">
          <Search size={14} aria-hidden />
          <input
            value={filters.query}
            maxLength={200}
            onChange={(event) => setFilters({ ...filters, query: event.target.value })}
            placeholder={t(
              kind === 'clube'
                ? 'sounds.search.placeholder.music'
                : kind === 'trilha'
                  ? 'sounds.search.placeholder.trilha'
                  : 'sounds.search.placeholder.sound',
            )}
            aria-label={t('sounds.search.label')}
          />
        </label>
        {categories.length > 0 || keys.length > 0 ? (
          <div className="workspace-sounds__filters">
            {categories.length > 0 ? (
              <AppSelect
                value={filters.category}
                ariaLabel={t(
                  kind === 'clube' || kind === 'trilha'
                    ? 'sounds.filter.genre'
                    : 'sounds.filter.category',
                )}
                className="workspace-sounds__select"
                options={[
                  {
                    value: '',
                    label: t(
                      kind === 'clube' || kind === 'trilha'
                        ? 'sounds.filter.allGenres'
                        : 'sounds.filter.allCategories',
                    ),
                  },
                  ...categories.map((category) => ({ value: category, label: category })),
                ]}
                onChange={(category) => setFilters({ ...filters, category })}
              />
            ) : null}
            {keys.length > 0 ? (
              <AppSelect
                value={filters.key}
                ariaLabel={t('sounds.filter.key')}
                className="workspace-sounds__select"
                options={[
                  { value: '', label: t('sounds.filter.anyKey') },
                  ...keys.map((key) => ({ value: key, label: key })),
                ]}
                onChange={(key) => setFilters({ ...filters, key })}
              />
            ) : null}
          </div>
        ) : null}
        {tempo ? (
          <div className="workspace-sounds__filters workspace-sounds__tempo">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={400}
              value={filters.bpmMin}
              onChange={(event) => setFilters({ ...filters, bpmMin: event.target.value })}
              placeholder={t('sounds.filter.bpmMin')}
              aria-label={t('sounds.filter.bpmMin')}
            />
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={400}
              value={filters.bpmMax}
              onChange={(event) => setFilters({ ...filters, bpmMax: event.target.value })}
              placeholder={t('sounds.filter.bpmMax')}
              aria-label={t('sounds.filter.bpmMax')}
            />
          </div>
        ) : null}
      </div>

      {isSpent ? (
        <div className="workspace-sounds__notice" data-tone="info" role="status">
          <strong>{t('sounds.daily.spent.title')}</strong>
          <span>{t('sounds.daily.spent.detail')}</span>
        </div>
      ) : null}

      <div className="workspace-sounds__body">
        {results.state === 'loading' ? (
          <SkeletonStatus label={t('sounds.state.loading')} className="workspace-sounds__skeleton">
            <SkeletonRows rows={7} icon detail density="tall" />
          </SkeletonStatus>
        ) : results.state === 'failed' ? (
          <EmptyState
            icon={<WaveSine size={30} strokeWidth={1.6} aria-hidden />}
            title={t('sounds.state.error.title')}
            detail={t('sounds.state.error.detail')}
            role="alert"
          >
            <button type="button" className="btn" onClick={() => setAttempt((now) => now + 1)}>
              {t('sounds.state.retry')}
            </button>
          </EmptyState>
        ) : results.items.length === 0 ? (
          <EmptyState
            icon={<WaveSine size={30} strokeWidth={1.6} aria-hidden />}
            title={t('sounds.state.empty.title')}
            detail={t('sounds.state.empty.detail')}
          />
        ) : (
          <>
            <ul className="workspace-sounds__list" aria-label={t('sounds.list.label')}>
              {results.items.map((item) => {
                const key = `${item.shelf}:${item.id}`
                return (
                  <li key={key}>
                    <SoundRow
                      item={item}
                      i18n={i18n}
                      playing={preview.playing === key}
                      loadingPreview={preview.loading === key}
                      sending={sending === key}
                      sent={sent.has(key)}
                      canSend={Boolean(props.threadId) && !isSpent}
                      onPreview={() => preview.toggle(item)}
                      onSend={() => void send(item)}
                    />
                  </li>
                )
              })}
            </ul>
            {results.items.length < results.total && results.items.length >= SOUNDS_PAGE ? (
              <button type="button" className="ghost workspace-sounds__more" onClick={showMore}>
                {t('sounds.more')}
              </button>
            ) : null}
          </>
        )}
      </div>

      {notice ? (
        <div className="workspace-sounds__notice" data-tone={notice.tone} role="status">
          <span>{notice.text}</span>
        </div>
      ) : null}
      {!props.threadId ? (
        <div className="workspace-sounds__notice" data-tone="info" role="status">
          <span>{t('sounds.row.noChat')}</span>
        </div>
      ) : null}
      {results.state === 'ready' || today ? (
        <footer className="workspace-sounds__foot">
          <span>{results.state === 'ready' ? i18n.tp('sounds.results', results.total) : ''}</span>
          {today ? (
            <span title={t('sounds.daily.note')}>
              {t(shelf === 'music' ? 'sounds.daily.leftMusic' : 'sounds.daily.left', {
                left: Math.max(0, today.limit - today.used),
                limit: today.limit,
              })}
            </span>
          ) : null}
        </footer>
      ) : null}
    </div>
  )
}

/** The Clube names a mode in its own words; the two that have a translation are shown translated. */
function modeWord(mode: string | undefined, t: I18n['t']): string {
  const lower = mode?.toLowerCase()
  if (lower === 'maior') return t('sounds.row.mode.maior')
  if (lower === 'menor') return t('sounds.row.mode.menor')
  return mode ?? ''
}

function failureNotice(failure: SoundFailure, t: I18n['t']): Notice {
  switch (failure.reason) {
    case 'daily-limit':
      // The Clube's own sentence, when it gave one, is the truth of the day.
      return { tone: 'info', text: failure.message ?? t('sounds.daily.spent.title') }
    case 'no-subscription':
      return failure.message
        ? { tone: 'info', text: failure.message }
        : { tone: 'error', text: t('sounds.use.failed') }
    case 'rate-limit':
      return {
        tone: 'info',
        text: failure.retryAfterS
          ? t('sounds.rate.notice', { seconds: failure.retryAfterS })
          : t('sounds.rate.noticeNow'),
      }
    case 'damaged':
      return { tone: 'error', text: t('sounds.use.damaged') }
    default:
      return { tone: 'error', text: t('sounds.use.failed') }
  }
}

const SoundRow = memo(function SoundRow(props: {
  item: SoundItem
  i18n: I18n
  playing: boolean
  loadingPreview: boolean
  sending: boolean
  sent: boolean
  canSend: boolean
  onPreview: () => void
  onSend: () => void
}) {
  const { t, language } = props.i18n
  const { item } = props
  const music = item.shelf === 'music'
  const parts = [
    item.key
      ? music
        ? item.key
        : t('sounds.row.keyMode', { key: item.key, mode: modeWord(item.mode, t) }).trim()
      : undefined,
    item.bpm !== undefined ? t('sounds.row.bpm', { bpm: Math.round(item.bpm) }) : undefined,
    // Only a soundtrack's key and BPM are estimates; a Clube track's are catalogued.
    item.estimated && (item.key || item.bpm !== undefined) ? t('sounds.row.estimated') : undefined,
    item.durationS === undefined ? undefined : formatSoundDuration(item.durationS, language),
    !music ? item.category : (item.artist ?? item.category),
  ].filter((part): part is string => Boolean(part))
  return (
    <div className="sounds-row" data-playing={props.playing ? '' : undefined}>
      <button
        type="button"
        className="sounds-row__play"
        aria-label={t(props.playing ? 'sounds.row.pause' : 'sounds.row.play', { name: item.name })}
        aria-pressed={props.playing}
        aria-busy={props.loadingPreview}
        onClick={props.onPreview}
      >
        {props.playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
      </button>
      <span className="sounds-row__text">
        <span className="sounds-row__name" title={item.name}>
          {item.name}
        </span>
        <span className="sounds-row__detail">{parts.join(' · ')}</span>
      </span>
      <button
        type="button"
        className="sounds-row__send"
        aria-label={t('sounds.row.sendLabel', { name: item.name })}
        disabled={!props.canSend || props.sending}
        onClick={props.onSend}
      >
        {props.sent ? <Check size={13} aria-hidden /> : <Paperclip size={13} aria-hidden />}
        <span>
          {props.sending
            ? t('sounds.row.sending')
            : props.sent
              ? t('sounds.row.sent')
              : t('sounds.row.send')}
        </span>
      </button>
    </div>
  )
})

/**
 * One preview at a time, played by the page's own audio element from what the server fetched
 * with the account's token. A preview is kept for the tab's life, so playing it again asks nothing.
 */
function usePreview(transport: Transport, onFailed: (failed: boolean) => void) {
  const audio = useRef<HTMLAudioElement>(undefined)
  const urls = useRef(new Map<string, string>())
  const [playing, setPlaying] = useState<string>()
  const [loading, setLoading] = useState<string>()
  const failed = useRef(onFailed)
  failed.current = onFailed

  const stop = useCallback(() => {
    audio.current?.pause()
    setPlaying(undefined)
  }, [])

  useEffect(
    () => () => {
      audio.current?.pause()
      for (const url of urls.current.values()) URL.revokeObjectURL(url)
      urls.current.clear()
    },
    [],
  )

  const toggle = useCallback(
    async (item: SoundItem) => {
      const key = `${item.shelf}:${item.id}`
      if (playing === key) return stop()
      stop()
      failed.current(false)
      let url = urls.current.get(key)
      if (!url) {
        setLoading(key)
        try {
          const result = await transport.request('sounds.preview', {
            shelf: item.shelf,
            id: item.id,
          })
          if (!result.ok) throw new Error('no preview')
          const bytes = Uint8Array.from(atob(result.data), (character) => character.charCodeAt(0))
          url = URL.createObjectURL(new Blob([bytes], { type: result.mime }))
          urls.current.set(key, url)
        } catch {
          failed.current(true)
          return
        } finally {
          setLoading((now) => (now === key ? undefined : now))
        }
      }
      const element = (audio.current ??= new Audio())
      element.onended = () => setPlaying((now) => (now === key ? undefined : now))
      element.onerror = () => {
        setPlaying(undefined)
        failed.current(true)
      }
      element.src = url
      setPlaying(key)
      await element.play().catch(() => {
        setPlaying(undefined)
        failed.current(true)
      })
    },
    [playing, stop, transport],
  )

  return { playing, loading, stop, toggle: (item: SoundItem) => void toggle(item) }
}
