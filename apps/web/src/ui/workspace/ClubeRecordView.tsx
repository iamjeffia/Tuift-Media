import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  IconArrowLeft as ArrowLeft,
  IconBookmark as Bookmark,
  IconCheck as Check,
  IconCopy as Copy,
  IconDownload as Download,
  IconExternalLink as ExternalLink,
  IconEyeOff as EyeOff,
  IconFolder as Folder,
  IconFolderOpen as FolderOpen,
  IconMovie as Movie,
  IconMusic as Music,
  IconPaperclip as Paperclip,
  IconPlayerPause as Pause,
  IconPlayerPlay as Play,
  IconPuzzle as Puzzle,
  type TablerIcon,
} from '@tabler/icons-react'
import type {
  ClubeItem,
  ClubeJob,
  ClubeKind,
  ClubeLibraryFailure,
  ClubePart,
  ClubeRecord,
  SoundFailure,
} from '@harness/contracts'
import { attachDeliveredFile, isDesktop, revealPath } from '../../bridge.js'
import {
  clubeFailureText,
  formatMb,
  isDownloadable,
  itemFolderName,
  KIND_WORDS,
  partsTotals,
  slugOf,
  withoutFrontMatter,
  type ClubeMedia,
} from '../../clube-library.js'
import { attachToComposer } from '../../composer-attach.js'
import { useI18n, type I18n, type MessageKey } from '../../i18n/index.js'
import { attachmentFor, formatSoundDuration } from '../../sounds.js'
import type { Transport } from '../../transport.js'
import { SkeletonRows, SkeletonStatus } from '../Skeleton.js'

// The chat's own Markdown renderer, loaded the first time a record has an analysis.
const CompletedMarkdown = lazy(() =>
  import('../CompletedMarkdown.js').then((module) => ({ default: module.CompletedMarkdown })),
)

export const KIND_ICONS = {
  animation: Movie,
  project: Folder,
  reference: Bookmark,
  skill: Puzzle,
  music: Music,
} as const satisfies Record<ClubeKind, TablerIcon>

const POLL_MS = 400

const ASPECTS = [
  ['animation', 'clubePanel.aspect.animation'],
  ['colors', 'clubePanel.aspect.colors'],
  ['typography', 'clubePanel.aspect.typography'],
  ['transition', 'clubePanel.aspect.transition'],
  ['sound', 'clubePanel.aspect.sound'],
] as const satisfies ReadonlyArray<readonly [keyof ClubeRecord['aspects'], MessageKey]>

type Props = {
  item: ClubeItem
  transport: Transport
  media: ClubeMedia
  threadId?: string | undefined
  projectPath?: string | undefined
  onBack: () => void
  /** The item was hidden for good: the list drops it. */
  onHidden: (id: string) => void
  /** Something that counts in the day's limits happened: the foot asks again. */
  onSpent: () => void
}

type Opened =
  | { state: 'confirm' }
  | { state: 'loading' }
  | { state: 'failed'; failure: ClubeLibraryFailure | undefined }
  | { state: 'ready'; record: ClubeRecord }

/**
 * One item of the library, opened. Opening is the person's act and nothing here is fetched ahead:
 * the Clube counts an opening as seen, and the first opening of a reference spends a credit, so a
 * reference asks first. Every action goes through the app's server; the page holds no token and
 * no link of the Clube's.
 */
export function ClubeRecordView(props: Props) {
  const i18n = useI18n()
  const { t } = i18n
  const { item } = props
  const [opened, setOpened] = useState<Opened>(
    item.kind === 'reference' ? { state: 'confirm' } : { state: 'loading' },
  )
  const [attempt, setAttempt] = useState(0)
  const Icon = KIND_ICONS[item.kind]
  const spent = useRef(props.onSpent)
  spent.current = props.onSpent

  useEffect(() => {
    if (opened.state !== 'loading') return
    let current = true
    props.transport
      .request('clube.library.item', {
        id: item.id,
        ...(props.threadId ? { threadId: props.threadId } : {}),
      })
      .then((result) => {
        if (!current) return
        if (result.ok) {
          setOpened({ state: 'ready', record: result.record })
          // A reference opened for the first time spent a credit.
          if (item.kind === 'reference') spent.current()
        } else setOpened({ state: 'failed', failure: result })
      })
      .catch(() => {
        if (current) setOpened({ state: 'failed', failure: undefined })
      })
    return () => {
      current = false
    }
  }, [opened.state, item.id, item.kind, props.threadId, props.transport, attempt])

  const record = opened.state === 'ready' ? opened.record : undefined
  const meta = [
    t(KIND_WORDS[item.kind]),
    item.format,
    item.durationS === undefined ? undefined : formatSoundDuration(item.durationS, i18n.language),
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
  const tags = [...item.style, ...item.tool, ...item.scene]

  return (
    <div className="clube-record" data-kind={item.kind}>
      <div className="clube-record__bar">
        <button type="button" className="clube-record__back" onClick={props.onBack}>
          <ArrowLeft size={14} aria-hidden />
          {t('clubePanel.record.back')}
        </button>
      </div>

      <Cover item={item} media={props.media} i18n={i18n} icon={<Icon size={26} aria-hidden />} />
      <h2 className="clube-record__title">{item.title}</h2>
      <p className="clube-record__meta">{meta}</p>
      {item.summary ? <p className="clube-record__summary">{item.summary}</p> : null}
      {tags.length > 0 ? (
        <ul className="clube-record__tags">
          {tags.map((tag, index) => (
            <li key={`${tag}:${index}`}>{tag}</li>
          ))}
        </ul>
      ) : null}

      {opened.state === 'confirm' ? (
        <section className="clube-record__section" role="group">
          <h3>{t('clubePanel.reference.confirm.title')}</h3>
          <p>{t('clubePanel.reference.confirm.detail')}</p>
          <div className="clube-record__actions">
            <button
              type="button"
              className="clube-record__action"
              data-primary=""
              onClick={() => setOpened({ state: 'loading' })}
            >
              {t('clubePanel.reference.confirm.open')}
            </button>
            <button type="button" className="clube-record__action" onClick={props.onBack}>
              {t('clubePanel.reference.confirm.cancel')}
            </button>
          </div>
        </section>
      ) : null}

      {opened.state === 'loading' ? (
        <SkeletonStatus
          label={t('clubePanel.record.loading')}
          className="workspace-clube__skeleton"
        >
          <SkeletonRows rows={3} detail density="tall" />
        </SkeletonStatus>
      ) : null}

      {opened.state === 'failed' ? (
        <section className="clube-record__section" role="alert">
          <p className="clube-record__note" data-tone="error">
            {opened.failure
              ? clubeFailureText(opened.failure, i18n)
              : t('clubePanel.record.failed')}
          </p>
          <div className="clube-record__actions">
            <button
              type="button"
              className="clube-record__action"
              onClick={() => {
                setOpened({ state: 'loading' })
                setAttempt((now) => now + 1)
              }}
            >
              {t('clubePanel.state.retry')}
            </button>
          </div>
        </section>
      ) : null}

      {record ? (
        <>
          {record.notice ? (
            <p className="clube-record__note" data-tone="error" role="status">
              {record.notice}
            </p>
          ) : null}
          {record.credits ? (
            <p className="clube-record__note" role="status">
              {t('clubePanel.reference.credits', {
                used: record.credits.used,
                of: record.credits.of,
              })}
            </p>
          ) : null}
          <Actions {...props} record={record} />
          {record.analysis ? (
            <section className="clube-record__section">
              <h3>
                {t(
                  item.kind === 'skill'
                    ? 'clubePanel.record.skillFile'
                    : 'clubePanel.record.analysis',
                )}
              </h3>
              <div className="clube-record__markdown">
                <Suspense fallback={null}>
                  <CompletedMarkdown
                    text={
                      item.kind === 'skill' ? withoutFrontMatter(record.analysis) : record.analysis
                    }
                    projectPath={props.projectPath}
                    literalHtml
                  />
                </Suspense>
              </div>
            </section>
          ) : null}
          {ASPECTS.map(([key, word]) =>
            record.aspects[key] ? (
              <section className="clube-record__section" key={key}>
                <h3>{t(word)}</h3>
                <p>{record.aspects[key]}</p>
              </section>
            ) : null,
          )}
          {record.prompt ? <PromptBlock prompt={record.prompt} i18n={i18n} /> : null}
          <section className="clube-record__section">
            <div className="clube-record__actions">
              {item.page ? (
                <a
                  className="clube-record__action"
                  href={item.page}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={13} aria-hidden />
                  {t('clubePanel.record.page')}
                </a>
              ) : null}
              {record.original ? (
                <a
                  className="clube-record__action"
                  href={record.original}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={13} aria-hidden />
                  {t('clubePanel.record.original')}
                </a>
              ) : null}
            </div>
            <HideControl {...props} i18n={i18n} />
          </section>
        </>
      ) : null}
    </div>
  )
}

/** The cover, and for an animation or a project its preview video once the person asks to play it. */
function Cover(props: { item: ClubeItem; media: ClubeMedia; i18n: I18n; icon: React.ReactNode }) {
  const { t } = props.i18n
  const { item, media } = props
  const cover = useSyncExternalStore(media.subscribe, () =>
    item.cover ? media.state(item.cover) : null,
  )
  useEffect(() => {
    if (item.cover) void media.load(item.cover)
  }, [item.cover, media])
  const [video, setVideo] = useState<'idle' | 'loading' | 'failed' | string>('idle')
  const playable = Boolean(item.preview) && (item.kind === 'animation' || item.kind === 'project')
  const play = () => {
    if (!item.preview || video === 'loading') return
    setVideo('loading')
    void media.load(item.preview).then((url) => setVideo(url ?? 'failed'))
  }
  const src = video !== 'idle' && video !== 'loading' && video !== 'failed' ? video : undefined
  // An item with no cover (a skill, say) has nothing to show here: no empty frame.
  if (!item.cover && !item.preview) return null
  return (
    <>
      <div className="clube-record__media">
        {src ? (
          <video src={src} controls autoPlay muted loop playsInline aria-label={item.title} />
        ) : (
          <>
            {cover ? <img src={cover} alt="" /> : props.icon}
            {playable ? (
              <button
                type="button"
                className="clube-record__play"
                aria-label={t('clubePanel.preview.play', { title: item.title })}
                aria-busy={video === 'loading'}
                onClick={play}
              >
                <Play size={18} aria-hidden />
              </button>
            ) : null}
          </>
        )}
      </div>
      {video === 'failed' ? (
        <p className="clube-record__note" data-tone="error" role="status">
          {t('clubePanel.preview.failed')}
        </p>
      ) : null}
    </>
  )
}

function PromptBlock(props: { prompt: string; i18n: I18n }) {
  const { t } = props.i18n
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard
      ?.writeText(props.prompt)
      .then(() => setCopied(true))
      .catch(() => undefined)
  }
  return (
    <section className="clube-record__section">
      <h3>{t('clubePanel.record.prompt')}</h3>
      <pre className="clube-record__prompt">{props.prompt}</pre>
      <div className="clube-record__actions">
        <button type="button" className="clube-record__action" onClick={copy}>
          {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
          {copied ? t('clubePanel.record.copied') : t('clubePanel.record.copy')}
        </button>
      </div>
    </section>
  )
}

/** "Don't show this again": permanent for the account, so it asks first, in place. */
function HideControl(props: Props & { i18n: I18n }) {
  const { t } = props.i18n
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const hide = async () => {
    setBusy(true)
    setFailed(false)
    try {
      const result = await props.transport.request('clube.library.signal', {
        id: props.item.id,
        signal: 'hide',
      })
      if (result.ok) props.onHidden(props.item.id)
      else setFailed(true)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  if (!asking) {
    return (
      <div className="clube-record__actions">
        <button type="button" className="clube-record__action" onClick={() => setAsking(true)}>
          <EyeOff size={13} aria-hidden />
          {t('clubePanel.hide.action')}
        </button>
      </div>
    )
  }
  return (
    <>
      <p className="clube-record__note">{t('clubePanel.hide.note')}</p>
      <div className="clube-record__actions">
        <button
          type="button"
          className="clube-record__action"
          data-primary=""
          disabled={busy}
          onClick={() => void hide()}
        >
          {t('clubePanel.hide.confirm')}
        </button>
        <button
          type="button"
          className="clube-record__action"
          disabled={busy}
          onClick={() => setAsking(false)}
        >
          {t('clubePanel.hide.keep')}
        </button>
      </div>
      {failed ? (
        <p className="clube-record__note" data-tone="error" role="status">
          {t('clubePanel.hide.failed')}
        </p>
      ) : null}
    </>
  )
}

/** What each kind offers. */
function Actions(props: Props & { record: ClubeRecord }) {
  const i18n = useI18n()
  const { kind } = props.item
  if (isDownloadable(kind)) return <PartsDownload {...props} i18n={i18n} />
  if (kind === 'skill') return <SkillInstall {...props} i18n={i18n} />
  if (kind === 'music') return <MusicVersions {...props} i18n={i18n} />
  return <SendText {...props} i18n={i18n} />
}

// -------------------------------------------------------------------- download

function PartsDownload(props: Props & { record: ClubeRecord; i18n: I18n }) {
  const { t, tp, language } = props.i18n
  const { item, transport } = props
  const [parts, setParts] = useState<readonly ClubePart[]>(props.record.parts)
  const [chosen, setChosen] = useState<ReadonlySet<string>>(
    () => new Set(props.record.parts.map((part) => part.key)),
  )
  const [jobId, setJobId] = useState<string>()
  const [job, setJob] = useState<ClubeJob>()
  const [starting, setStarting] = useState(false)
  const [failure, setFailure] = useState<ClubeLibraryFailure>()
  const [sent, setSent] = useState(false)
  const [sendFailed, setSendFailed] = useState(false)
  const chosenWhenStarted = useRef<ReadonlySet<string>>(new Set())
  const spent = useRef(props.onSpent)
  spent.current = props.onSpent

  const running = starting || job?.state === 'queued' || job?.state === 'running'
  const totals = partsTotals(parts, chosen)
  const folder = itemFolderName(item)

  // The job is polled until it ends: the server holds it, so a closed panel loses nothing.
  useEffect(() => {
    if (!jobId) return
    let current = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = () => {
      transport
        .request('clube.library.job', { jobId })
        .then((result) => {
          if (!current) return
          if (!result.ok) {
            setFailure(result)
            setJobId(undefined)
            return
          }
          setJob(result.job)
          if (result.job.state === 'queued' || result.job.state === 'running') {
            timer = setTimeout(poll, POLL_MS)
            return
          }
          if (result.job.state === 'done') {
            const done = chosenWhenStarted.current
            setParts((now) =>
              now.map((part) => (done.has(part.key) ? { ...part, onDisk: true } : part)),
            )
          }
          if (result.job.failure) setFailure(result.job.failure)
          spent.current()
        })
        .catch(() => {
          if (current) timer = setTimeout(poll, POLL_MS * 4)
        })
    }
    poll()
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [jobId, transport])

  const start = async () => {
    if (!props.threadId || running) return
    setStarting(true)
    setFailure(undefined)
    setJob(undefined)
    setSent(false)
    chosenWhenStarted.current = chosen
    try {
      const result = await transport.request('clube.library.download', {
        threadId: props.threadId,
        id: item.id,
        parts: parts.filter((part) => chosen.has(part.key)).map((part) => part.key),
      })
      if (result.ok) setJobId(result.jobId)
      else setFailure(result)
    } catch {
      setFailure({ ok: false, reason: 'unreachable' })
    } finally {
      setStarting(false)
    }
  }

  const sendFolder = async (path: string) => {
    setSendFailed(false)
    const name = path.split(/[\\/]/).at(-1) ?? path
    // A folder is referenced by its path; the prompt box takes it as it takes a dropped one.
    if (attachToComposer([{ path, name }])) {
      setSent(true)
      void transport
        .request('clube.library.signal', { id: item.id, signal: 'used' })
        .catch(() => {})
    } else setSendFailed(true)
  }

  const result = job?.state === 'done' ? job.result : undefined
  const toggle = (key: string) =>
    setChosen((now) => {
      const next = new Set(now)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const totalMb = job?.totalBytes ? job.totalBytes / (1024 * 1024) : 0
  const receivedMb = (job?.receivedBytes ?? 0) / (1024 * 1024)

  if (parts.length === 0) {
    return (
      <section className="clube-record__section">
        <p className="clube-record__note">{t('clubePanel.parts.none')}</p>
      </section>
    )
  }
  return (
    <section className="clube-record__section">
      <h3>{t('clubePanel.parts.title')}</h3>
      <ul className="clube-parts">
        {parts.map((part) => (
          <li key={part.key}>
            <label className="clube-part">
              <input
                type="checkbox"
                className="clube-check"
                checked={chosen.has(part.key)}
                disabled={running}
                aria-label={t('clubePanel.parts.pick', { label: partName(part, props.i18n) })}
                onChange={() => toggle(part.key)}
              />
              <span className="clube-part__text">
                <span className="clube-part__name">{partName(part, props.i18n)}</span>
                <span className="clube-part__detail">
                  {part.onDisk
                    ? t('clubePanel.parts.onDisk')
                    : (part.description ?? tp('clubePanel.parts.files', part.files))}
                </span>
              </span>
              <span className="clube-part__size">
                {t('clubePanel.parts.size', { size: formatMb(part.sizeMb, language) })}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <p className="clube-record__note">
        {totals.nothingToFetch
          ? t('clubePanel.parts.nothing')
          : `${t('clubePanel.parts.total', { size: formatMb(totals.sizeMb, language) })} · ${tp('clubePanel.parts.count', totals.files)}`}
      </p>
      <p className="clube-record__note">{t('clubePanel.download.destination', { folder })}</p>

      {running ? (
        <div className="clube-progress">
          <div className="clube-progress__line">
            <span>
              {job?.state === 'queued'
                ? t('clubePanel.download.queued')
                : job?.file
                  ? t('clubePanel.download.running', { file: job.file })
                  : t('clubePanel.download.runningPlain')}
            </span>
            {totalMb > 0 ? (
              <span>
                {t('clubePanel.download.progress', {
                  received: formatMb(receivedMb, language),
                  total: formatMb(totalMb, language),
                })}
              </span>
            ) : null}
          </div>
          <progress
            className="clube-progress__bar"
            aria-label={t('clubePanel.download.progressLabel')}
            {...(totalMb > 0 ? { max: totalMb, value: Math.min(receivedMb, totalMb) } : {})}
          />
        </div>
      ) : null}

      <div className="clube-record__actions">
        {running ? (
          <button
            type="button"
            className="clube-record__action"
            disabled={!jobId}
            onClick={() => jobId && void transport.request('clube.library.cancel', { jobId })}
          >
            {t('clubePanel.download.cancel')}
          </button>
        ) : (
          <button
            type="button"
            className="clube-record__action"
            data-primary=""
            disabled={!props.threadId || chosen.size === 0}
            onClick={() => void start()}
          >
            <Download size={13} aria-hidden />
            {t('clubePanel.download.action')}
          </button>
        )}
      </div>
      {!props.threadId ? <p className="clube-record__note">{t('clubePanel.noChat')}</p> : null}

      {result ? (
        <>
          <p className="clube-record__note" role="status">
            {t('clubePanel.download.done', { folder })}{' '}
            {result.files > 0
              ? tp('clubePanel.download.doneFiles', result.files)
              : t('clubePanel.download.doneReused')}
          </p>
          <div className="clube-record__actions">
            {isDesktop ? (
              <button
                type="button"
                className="clube-record__action"
                onClick={() => void revealPath(result.folder).catch(() => undefined)}
              >
                <FolderOpen size={13} aria-hidden />
                {t('clubePanel.download.openFolder')}
              </button>
            ) : null}
            <button
              type="button"
              className="clube-record__action"
              disabled={sent}
              onClick={() => void sendFolder(result.folder)}
            >
              {sent ? <Check size={13} aria-hidden /> : <Paperclip size={13} aria-hidden />}
              {sent ? t('clubePanel.send.sent') : t('clubePanel.send.action')}
            </button>
          </div>
          {sendFailed ? (
            <p className="clube-record__note" data-tone="error" role="status">
              {t('clubePanel.send.failed')}
            </p>
          ) : null}
        </>
      ) : null}
      {job?.state === 'cancelled' ? (
        <p className="clube-record__note" role="status">
          {t('clubePanel.download.cancelled')}
        </p>
      ) : failure ? (
        <p className="clube-record__note" data-tone="error" role="alert">
          {clubeFailureText(failure, props.i18n)}
        </p>
      ) : null}
    </section>
  )
}

// ---------------------------------------------------------------------- skills

function SkillInstall(props: Props & { record: ClubeRecord; i18n: I18n }) {
  const { t } = props.i18n
  const [state, setState] = useState<'idle' | 'working' | { category: 'motion' | 'general' }>(
    'idle',
  )
  const [failure, setFailure] = useState<ClubeLibraryFailure>()
  const install = async () => {
    if (!props.threadId) return
    setState('working')
    setFailure(undefined)
    try {
      const result = await props.transport.request('clube.library.installSkill', {
        threadId: props.threadId,
        id: props.item.id,
      })
      if (result.ok) setState({ category: result.category })
      else {
        setState('idle')
        setFailure(result)
      }
    } catch {
      setState('idle')
      setFailure({ ok: false, reason: 'unreachable' })
    }
    props.onSpent()
  }
  const done = typeof state === 'object' ? state : undefined
  return (
    <section className="clube-record__section">
      <div className="clube-record__actions">
        <button
          type="button"
          className="clube-record__action"
          data-primary=""
          disabled={!props.threadId || state === 'working' || done !== undefined}
          onClick={() => void install()}
        >
          {done ? <Check size={13} aria-hidden /> : <Puzzle size={13} aria-hidden />}
          {state === 'working'
            ? t('clubePanel.skill.installing')
            : done
              ? t('clubePanel.skill.installed')
              : t('clubePanel.skill.install')}
        </button>
      </div>
      {done ? (
        <p className="clube-record__note" role="status">
          {t(
            done.category === 'motion'
              ? 'clubePanel.skill.scope.motion'
              : 'clubePanel.skill.scope.general',
          )}
        </p>
      ) : null}
      <p className="clube-record__note">{t('clubePanel.skill.note')}</p>
      {!props.threadId ? <p className="clube-record__note">{t('clubePanel.noChat')}</p> : null}
      {failure ? (
        <p className="clube-record__note" data-tone="error" role="alert">
          {clubeFailureText(failure, props.i18n)}
        </p>
      ) : null}
    </section>
  )
}

// ------------------------------------------------------------ text, to the chat

/** An item that is only text: its analysis and prompt become one Markdown file in the project, which goes to the chat. */
function SendText(props: Props & { record: ClubeRecord; i18n: I18n }) {
  const { t } = props.i18n
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [failure, setFailure] = useState<ClubeLibraryFailure>()
  const [attachFailed, setAttachFailed] = useState(false)
  const send = async () => {
    if (!props.threadId) return
    setState('sending')
    setFailure(undefined)
    setAttachFailed(false)
    try {
      const result = await props.transport.request('clube.library.exportText', {
        threadId: props.threadId,
        id: props.item.id,
      })
      if (!result.ok) {
        setState('idle')
        setFailure(result)
        return
      }
      const name = result.path.split(/[\\/]/).at(-1) ?? 'clube.md'
      const picked =
        isDesktop && props.projectPath
          ? await attachDeliveredFile(result.path, [props.projectPath])
          : { path: result.path, name }
      if (attachToComposer([picked])) setState('sent')
      else {
        setState('idle')
        setAttachFailed(true)
      }
    } catch {
      setState('idle')
      setAttachFailed(true)
    }
    props.onSpent()
  }
  return (
    <section className="clube-record__section">
      <div className="clube-record__actions">
        <button
          type="button"
          className="clube-record__action"
          data-primary=""
          disabled={!props.threadId || state !== 'idle'}
          onClick={() => void send()}
        >
          {state === 'sent' ? <Check size={13} aria-hidden /> : <Paperclip size={13} aria-hidden />}
          {state === 'sending'
            ? t('clubePanel.send.sending')
            : state === 'sent'
              ? t('clubePanel.send.sent')
              : t('clubePanel.send.action')}
        </button>
      </div>
      <p className="clube-record__note">{t('clubePanel.send.textNote')}</p>
      {!props.threadId ? <p className="clube-record__note">{t('clubePanel.noChat')}</p> : null}
      {failure ? (
        <p className="clube-record__note" data-tone="error" role="alert">
          {clubeFailureText(failure, props.i18n)}
        </p>
      ) : null}
      {attachFailed ? (
        <p className="clube-record__note" data-tone="error" role="alert">
          {t('clubePanel.send.failed')}
        </p>
      ) : null}
    </section>
  )
}

/** The Clube names a project's parts by key: the five it has get a name of ours, any other shows as it came. */
const PART_NAMES = {
  projeto: 'clubePanel.parts.name.project',
  guia: 'clubePanel.parts.name.guide',
  audio: 'clubePanel.parts.name.audio',
  referencias: 'clubePanel.parts.name.references',
  render: 'clubePanel.parts.name.render',
} as const satisfies Record<string, MessageKey>

function partName(part: { key: string; label: string }, i18n: I18n): string {
  return Object.hasOwn(PART_NAMES, part.key)
    ? i18n.t(PART_NAMES[part.key as keyof typeof PART_NAMES])
    : part.label
}

// ----------------------------------------------------------------------- music

const VERSION_WORDS = {
  full: 'clubePanel.music.full',
  instrumental: 'clubePanel.music.instrumental',
  vocal: 'clubePanel.music.vocal',
} as const satisfies Record<'full' | 'instrumental' | 'vocal', MessageKey>

function soundFailureText(failure: SoundFailure, i18n: I18n): string {
  const as = (reason: ClubeLibraryFailure['reason']): ClubeLibraryFailure => ({
    ok: false,
    reason,
    ...(failure.retryAfterS === undefined ? {} : { retryAfterS: failure.retryAfterS }),
    ...(failure.message ? { message: failure.message } : {}),
  })
  switch (failure.reason) {
    case 'daily-limit':
    case 'rate-limit':
    case 'no-subscription':
    case 'not-linked':
    case 'damaged':
    case 'no-project':
      return clubeFailureText(as(failure.reason), i18n)
    default:
      return i18n.t('clubePanel.send.failed')
  }
}

/** The three previews, and the sound library's own road for the track: `sounds.use`, as the Sounds tab does. */
function MusicVersions(props: Props & { record: ClubeRecord; i18n: I18n }) {
  const { t, language } = props.i18n
  const { item, record, media, transport } = props
  const audio = useRef<HTMLAudioElement | undefined>(undefined)
  const [playing, setPlaying] = useState<string>()
  const [loading, setLoading] = useState<string>()
  const [previewFailed, setPreviewFailed] = useState(false)
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [failure, setFailure] = useState<string>()

  useEffect(
    () => () => {
      audio.current?.pause()
    },
    [],
  )

  const toggle = useCallback(
    async (version: 'full' | 'instrumental' | 'vocal', link: string) => {
      if (playing === version) {
        audio.current?.pause()
        setPlaying(undefined)
        return
      }
      audio.current?.pause()
      setPlaying(undefined)
      setPreviewFailed(false)
      setLoading(version)
      const url = await media.load(link)
      setLoading(undefined)
      if (!url) {
        setPreviewFailed(true)
        return
      }
      const element = (audio.current ??= new Audio())
      element.onended = () => setPlaying((now) => (now === version ? undefined : now))
      element.onerror = () => {
        setPlaying(undefined)
        setPreviewFailed(true)
      }
      element.src = url
      setPlaying(version)
      await element.play().catch(() => {
        setPlaying(undefined)
        setPreviewFailed(true)
      })
    },
    [media, playing],
  )

  const send = async () => {
    if (!props.threadId) return
    setState('sending')
    setFailure(undefined)
    try {
      const result = await transport.request('sounds.use', {
        threadId: props.threadId,
        shelf: 'music',
        id: slugOf(item.id),
      })
      props.onSpent()
      if (!result.ok) {
        setState('idle')
        setFailure(soundFailureText(result, props.i18n))
        return
      }
      const attachment = attachmentFor(result.sound)
      const picked =
        isDesktop && props.projectPath
          ? await attachDeliveredFile(attachment.path, [props.projectPath])
          : attachment
      if (attachToComposer([picked])) {
        setState('sent')
        void transport
          .request('clube.library.signal', { id: item.id, signal: 'used' })
          .catch(() => {})
      } else {
        setState('idle')
        setFailure(t('clubePanel.send.failed'))
      }
    } catch {
      setState('idle')
      setFailure(t('clubePanel.send.failed'))
    }
  }

  const versions = (['full', 'instrumental', 'vocal'] as const).flatMap((version) => {
    const link = record.music?.previews[version]
    return link ? [{ version, link }] : []
  })
  const facts = [
    record.music?.key,
    record.music?.bpm === undefined
      ? undefined
      : t('sounds.row.bpm', { bpm: Math.round(record.music.bpm) }),
    record.music?.genre,
    record.music?.moods.length ? record.music.moods.join(', ') : undefined,
    item.durationS === undefined ? undefined : formatSoundDuration(item.durationS, language),
  ].filter((part): part is string => Boolean(part))
  return (
    <section className="clube-record__section">
      {facts.length > 0 ? <p className="clube-record__note">{facts.join(' · ')}</p> : null}
      <ul className="clube-versions">
        {versions.map(({ version, link }) => {
          const word = t(VERSION_WORDS[version])
          return (
            <li className="clube-version" key={version}>
              <button
                type="button"
                className="clube-version__play"
                aria-label={t(
                  playing === version ? 'clubePanel.music.pause' : 'clubePanel.music.play',
                  {
                    version: word,
                  },
                )}
                aria-pressed={playing === version}
                aria-busy={loading === version}
                onClick={() => void toggle(version, link)}
              >
                {playing === version ? (
                  <Pause size={14} aria-hidden />
                ) : (
                  <Play size={14} aria-hidden />
                )}
              </button>
              <span>{word}</span>
            </li>
          )
        })}
      </ul>
      {previewFailed ? (
        <p className="clube-record__note" data-tone="error" role="status">
          {t('clubePanel.preview.failed')}
        </p>
      ) : null}
      <div className="clube-record__actions">
        <button
          type="button"
          className="clube-record__action"
          data-primary=""
          disabled={!props.threadId || state !== 'idle'}
          onClick={() => void send()}
        >
          {state === 'sent' ? <Check size={13} aria-hidden /> : <Paperclip size={13} aria-hidden />}
          {state === 'sending'
            ? t('clubePanel.send.sending')
            : state === 'sent'
              ? t('clubePanel.send.sent')
              : t('clubePanel.music.send')}
        </button>
      </div>
      <p className="clube-record__note">{t('clubePanel.music.note')}</p>
      {!props.threadId ? <p className="clube-record__note">{t('clubePanel.noChat')}</p> : null}
      {failure ? (
        <p className="clube-record__note" data-tone="error" role="alert">
          {failure}
        </p>
      ) : null}
    </section>
  )
}
