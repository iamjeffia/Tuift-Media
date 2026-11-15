import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type {
  ChatImportChat,
  ChatImportJob,
  ChatImportScan,
  ChatImportSource,
} from '@harness/contracts'
import {
  IconChevronRight as ChevronRight,
  IconFileImport as FileImport,
  IconRefresh as Refresh,
  IconSearch as Search,
} from '@tabler/icons-react'
import { providerMark, type ProviderMark } from '../model-catalog.js'
import { getLanguage, useI18n, type I18n } from '../i18n/index.js'
import type { Transport } from '../transport.js'
import {
  ALL_SOURCES,
  archivedCount,
  checkState,
  folderGroups,
  lastUsed,
  selectionSummary,
  sourceCounts,
  toggled,
  type ImportFolderGroup,
} from './import-chats.js'
import { ProviderIcon } from './ProviderIcon.js'
import { Skeleton } from './Skeleton.js'
import {
  SettingsEmpty,
  SettingsEntitySkeleton,
  SettingsNotice,
  SettingsPage,
} from './settings/SettingsLayout.js'
import '../styles/import-settings.css'

/** A source still scanning is asked again this often. */
const RESCAN_MS = 2_000

function sourceMark(source: ChatImportSource | undefined): ProviderMark | undefined {
  if (source?.provider) return providerMark(source.provider)
  return source?.id === 't3-code' ? 't3code' : undefined
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

export function ImportSettings(props: {
  transport: Transport
  onOpenChat: (threadId: string) => void
}) {
  const { t } = useI18n()
  const { transport } = props
  const [scan, setScan] = useState<ChatImportScan>()
  const [failure, setFailure] = useState<string>()
  const [rescanning, setRescanning] = useState(false)
  const [source, setSource] = useState(ALL_SOURCES)
  const [query, setQuery] = useState('')
  const [archived, setArchived] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  const [job, setJob] = useState<ChatImportJob>()
  const [startFailure, setStartFailure] = useState<string>()
  const [now] = useState(() => Date.now())

  const load = useCallback(async () => {
    try {
      const next = await transport.request('chatImport.scan', {})
      setScan(next)
      setFailure(undefined)
      // A finished import from an earlier visit is not news on this one.
      if (next.job?.state === 'running') setJob(next.job)
    } catch (cause) {
      setFailure(message(cause))
    }
  }, [transport])

  useEffect(() => {
    void load()
  }, [load])

  const scanning = scan?.sources.some(({ state }) => state === 'scanning') ?? false
  useEffect(() => {
    if (!scanning) return
    const timer = setTimeout(() => void load(), RESCAN_MS)
    return () => clearTimeout(timer)
  }, [scan, scanning, load])

  useEffect(
    () =>
      transport.on('chatImport.progress', (next) => {
        setJob(next)
        if (next.state !== 'finished') return
        setSelected(new Set())
        void load()
      }),
    [transport, load],
  )

  const rescan = async () => {
    setRescanning(true)
    setJob(undefined)
    await load()
    setRescanning(false)
  }

  const start = async (ids: string[]) => {
    setStartFailure(undefined)
    setJob(undefined)
    try {
      const started = await transport.request('chatImport.start', { chats: ids })
      // The last report can arrive before this reply on a small import.
      setJob((current) => current ?? started)
    } catch (cause) {
      setStartFailure(message(cause))
    }
  }

  const running = job?.state === 'running'
  const refresh = (
    <button
      className="set-button set-button--quiet"
      type="button"
      disabled={rescanning || running || scan === undefined}
      onClick={() => void rescan()}
    >
      <Refresh size={14} aria-hidden />
      {t('settings.import.scanAgain')}
    </button>
  )

  return (
    <SettingsPage
      className="import-page"
      title={t('settings.import.title')}
      description={t('settings.import.description')}
      actions={refresh}
    >
      {failure ? (
        <SettingsNotice
          tone="error"
          action={
            <button className="set-button" type="button" onClick={() => void rescan()}>
              {t('settings.import.tryAgain')}
            </button>
          }
        >
          {t('settings.import.scanFailed', { error: failure })}
        </SettingsNotice>
      ) : null}
      {scan === undefined && !failure ? (
        <SettingsEntitySkeleton label={t('settings.import.looking')} rows={4} />
      ) : null}
      {scan ? (
        <ImportList
          scan={scan}
          scanning={scanning}
          source={source}
          query={query}
          archived={archived}
          selected={selected}
          open={open}
          job={job}
          startFailure={startFailure}
          now={now}
          onSource={setSource}
          onQuery={setQuery}
          onArchived={setArchived}
          onSelected={setSelected}
          onOpen={setOpen}
          onStart={(ids) => void start(ids)}
          onOpenChat={props.onOpenChat}
        />
      ) : null}
    </SettingsPage>
  )
}

function ImportList(props: {
  scan: ChatImportScan
  scanning: boolean
  source: string
  query: string
  archived: boolean
  selected: ReadonlySet<string>
  open: ReadonlySet<string>
  job: ChatImportJob | undefined
  startFailure: string | undefined
  now: number
  onSource: (source: string) => void
  onQuery: (query: string) => void
  onArchived: (archived: boolean) => void
  onSelected: (selected: ReadonlySet<string>) => void
  onOpen: (open: ReadonlySet<string>) => void
  onStart: (ids: string[]) => void
  onOpenChat: (threadId: string) => void
}) {
  const { t, tp } = useI18n()
  const { scan, selected, open, job } = props
  // A source that left the list since it was picked falls back to all of them.
  const source = scan.sources.some(({ id }) => id === props.source) ? props.source : ALL_SOURCES
  const counts = useMemo(() => sourceCounts(scan, props.archived), [scan, props.archived])
  const groups = useMemo(
    () => folderGroups(scan, { source, query: props.query, archived: props.archived }),
    [scan, source, props.query, props.archived],
  )
  const shown = useMemo(() => groups.flatMap(({ chats }) => chats), [groups])
  const summary = useMemo(() => selectionSummary(scan, selected), [scan, selected])
  const sources = useMemo(() => new Map(scan.sources.map((item) => [item.id, item])), [scan])
  const hidden = archivedCount(scan)
  const searching = props.query.trim().length > 0
  const running = job?.state === 'running'
  const failed = scan.sources.filter(({ state }) => state === 'failed')
  const copies = shown.some(({ continuation }) => continuation === 'copy')
  const nothingLeft = !counts.get(ALL_SOURCES) && !job && !summary.chats

  if (!scan.sources.length) {
    return (
      <SettingsEmpty
        icon={<FileImport size={20} aria-hidden />}
        title={t('settings.import.empty.title')}
        detail={t('settings.import.empty.detail')}
      />
    )
  }

  const toggleOpen = (folder: string) => {
    const next = new Set(open)
    if (!next.delete(folder)) next.add(folder)
    props.onOpen(next)
  }

  return (
    <div className="import-list">
      {props.startFailure ? (
        <SettingsNotice tone="error">{props.startFailure}</SettingsNotice>
      ) : null}
      {failed.length ? (
        <SettingsNotice tone="error">
          {t('settings.import.sourcesFailed', {
            names: failed.map(({ name }) => name).join(` ${t('settings.import.and')} `),
          })}
        </SettingsNotice>
      ) : null}

      <div className="import-tools">
        <SourceStrip
          sources={scan.sources}
          value={source}
          counts={counts}
          onChange={props.onSource}
        />
        <div className="import-search">
          <Search size={14} aria-hidden />
          <input
            className="set-input"
            type="search"
            placeholder={t('settings.import.search.placeholder')}
            aria-label={t('settings.import.search.label')}
            value={props.query}
            onChange={(event) => props.onQuery(event.target.value)}
          />
          {searching ? (
            <button
              className="set-button set-button--quiet import-search__clear"
              type="button"
              aria-label={t('settings.import.search.clearLabel')}
              onClick={(event) => {
                props.onQuery('')
                event.currentTarget.parentElement?.querySelector('input')?.focus()
              }}
            >
              {t('settings.import.search.clear')}
            </button>
          ) : null}
        </div>
        {hidden ? (
          <label className="import-archived">
            <input
              className="import-check"
              type="checkbox"
              checked={props.archived}
              onChange={(event) => props.onArchived(event.target.checked)}
            />
            {tp('settings.import.includeArchived', hidden)}
          </label>
        ) : null}
      </div>

      {groups.length ? (
        <div className="import-table">
          <SelectAll
            chats={shown}
            selected={selected}
            disabled={running}
            onChange={props.onSelected}
          />
          <ul className="import-folders" aria-label={t('settings.import.foldersLabel')}>
            {groups.map((group) => (
              <FolderRow
                key={group.folder.path}
                group={group}
                open={searching || open.has(group.folder.path)}
                searching={searching}
                selected={selected}
                sources={sources}
                now={props.now}
                disabled={running}
                onToggleOpen={() => toggleOpen(group.folder.path)}
                onChange={props.onSelected}
              />
            ))}
          </ul>
        </div>
      ) : (
        <p className="import-none" role="status">
          {searching
            ? t('settings.import.noMatch')
            : props.scanning
              ? t('settings.import.stillLooking')
              : t('settings.import.allImported')}
        </p>
      )}

      {nothingLeft ? null : (
        <ImportBar
          job={job}
          chats={summary.chats}
          folders={summary.folders}
          newProjects={summary.newProjects}
          note={copies ? t('settings.import.copyNote') : undefined}
          onStart={() => props.onStart(summary.ids)}
          onOpenChat={props.onOpenChat}
        />
      )}
    </div>
  )
}

function finishedLine(job: ChatImportJob, { t, tp }: I18n): string {
  const unread = job.failed ? tp('settings.import.unread', job.failed) : ''
  if (!job.imported) return unread
  const projects = job.projects.length
  const chats = tp('settings.import.count.chats', job.imported)
  const imported = projects
    ? t('settings.import.finishedWithProjects', {
        chats,
        projects: tp('settings.import.count.projects', projects),
      })
    : t('settings.import.finished', { chats })
  return `${imported}${unread ? ` ${unread}` : ''}`
}

/** What is on this computer, and the list's filter: one figure per app. */
function SourceStrip(props: {
  sources: readonly ChatImportSource[]
  value: string
  counts: ReadonlyMap<string, number>
  onChange: (source: string) => void
}) {
  const { t } = useI18n()
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  const options = [
    { id: ALL_SOURCES, name: t('settings.import.allApps') } as const,
    ...props.sources,
  ]
  const chosen = Math.max(
    0,
    options.findIndex(({ id }) => id === props.value),
  )
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const count = options.length
    let next: number
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % count
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (index - 1 + count) % count
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = count - 1
    else return
    event.preventDefault()
    buttons.current[next]?.focus()
    props.onChange(options[next]!.id)
  }
  return (
    <div
      className="set-segmented import-sources"
      role="radiogroup"
      aria-label={t('settings.import.filterLabel')}
    >
      {options.map((option, index) => {
        const state = 'state' in option ? option.state : 'ready'
        const mark = 'state' in option ? sourceMark(option) : undefined
        return (
          <button
            key={option.id}
            ref={(element) => {
              buttons.current[index] = element
            }}
            className="set-segmented__option import-source"
            type="button"
            role="radio"
            aria-checked={index === chosen}
            tabIndex={index === chosen ? 0 : -1}
            onClick={() => props.onChange(option.id)}
            onKeyDown={(event) => move(event, index)}
          >
            <span className="import-source__name">
              {mark ? <ProviderIcon mark={mark} size={13} /> : null}
              {option.name}
            </span>
            {state === 'scanning' ? (
              <Skeleton className="import-source__pending" width={20} height={9} />
            ) : (
              <span className="import-source__count" data-failed={state === 'failed' || undefined}>
                {state === 'failed'
                  ? '–'
                  : (props.counts.get(option.id) ?? 0).toLocaleString(getLanguage())}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function TriCheck(props: {
  label: string
  state: 'none' | 'some' | 'all'
  disabled?: boolean | undefined
  onChange: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (input.current) input.current.indeterminate = props.state === 'some'
  }, [props.state])
  return (
    <input
      ref={input}
      className="import-check"
      type="checkbox"
      aria-label={props.label}
      checked={props.state === 'all'}
      disabled={props.disabled}
      onChange={props.onChange}
    />
  )
}

function SelectAll(props: {
  chats: readonly ChatImportChat[]
  selected: ReadonlySet<string>
  disabled: boolean
  onChange: (selected: ReadonlySet<string>) => void
}) {
  const { t, tp } = useI18n()
  const { state, chosen } = checkState(props.chats, props.selected)
  return (
    <label className="import-row import-all">
      <TriCheck
        label={t('settings.import.selectAllLabel', {
          chats: tp('settings.import.count.chats', props.chats.length),
        })}
        state={state}
        disabled={props.disabled}
        onChange={() => props.onChange(toggled(props.selected, props.chats))}
      />
      <span className="import-all__label">{t('settings.import.selectAll')}</span>
      <span className="import-row__count import-all__count">
        {chosen
          ? t('settings.import.chosenOf', {
              chosen: chosen.toLocaleString(getLanguage()),
              chats: tp('settings.import.count.chats', props.chats.length),
            })
          : tp('settings.import.count.chats', props.chats.length)}
      </span>
    </label>
  )
}

function folderState(group: ImportFolderGroup, { t }: I18n): string {
  if (group.folder.missing) return t('settings.import.folder.gone')
  return group.folder.isProject
    ? t('settings.import.folder.inProjects')
    : t('settings.import.folder.new')
}

function FolderRow(props: {
  group: ImportFolderGroup
  open: boolean
  searching: boolean
  selected: ReadonlySet<string>
  sources: ReadonlyMap<string, ChatImportSource>
  now: number
  disabled: boolean
  onToggleOpen: () => void
  onChange: (selected: ReadonlySet<string>) => void
}) {
  const i18n = useI18n()
  const { t, tp } = i18n
  const { group, open, selected } = props
  const { state, chosen } = checkState(group.chats, selected)
  const panel = useId()
  // Said once on the folder rather than on every chat, unless its chats differ.
  const kinds = new Set(group.chats.map(({ source }) => source))
  const mixed = kinds.size > 1
  const marks = [...kinds].flatMap((id) => {
    const source = props.sources.get(id)
    const mark = sourceMark(source)
    return mark ? [{ id, mark, name: source?.name ?? id }] : []
  })
  const allCopies = group.chats.every(({ continuation }) => continuation === 'copy')
  return (
    <li className="import-folder" data-open={open || undefined}>
      <div className="import-row import-folder__row">
        <ChevronRight className="import-folder__chevron" size={14} aria-hidden />
        <TriCheck
          label={t('settings.import.selectAllIn', { name: group.folder.name })}
          state={state}
          disabled={props.disabled}
          onChange={() => props.onChange(toggled(selected, group.chats))}
        />
        <button
          className="import-folder__toggle"
          type="button"
          aria-expanded={open}
          aria-controls={panel}
          disabled={props.searching}
          onClick={props.onToggleOpen}
        >
          <span className="import-folder__name">{group.folder.name}</span>
          <span className="import-folder__meta">
            <span className="import-folder__path" title={group.folder.path}>
              {group.folder.label}
            </span>
            <span
              className="import-folder__state"
              data-state={group.folder.missing ? 'missing' : undefined}
            >
              {folderState(group, i18n)}
            </span>
            {allCopies ? (
              <span className="import-folder__state">{t('settings.import.copy')}</span>
            ) : null}
            {marks.length ? (
              <span
                className="import-folder__marks"
                title={marks.map(({ name }) => name).join(', ')}
              >
                {marks.map(({ id, mark }) => (
                  <ProviderIcon key={id} mark={mark} size={12} />
                ))}
              </span>
            ) : null}
          </span>
        </button>
        <span className="import-row__count import-folder__count">
          {chosen
            ? t('settings.import.chosenOf', {
                chosen: chosen.toLocaleString(getLanguage()),
                chats: tp('settings.import.count.chats', group.chats.length),
              })
            : tp('settings.import.count.chats', group.chats.length)}
        </span>
        <span className="import-row__when">{lastUsed(group.updatedAt, props.now)}</span>
      </div>
      {open ? (
        <ul className="import-chats" id={panel}>
          {group.chats.map((chat) => (
            <ChatRow
              key={chat.id}
              chat={chat}
              checked={selected.has(chat.id)}
              source={props.sources.get(chat.source)}
              alsoIn={chat.alsoIn?.map((id) => props.sources.get(id)?.name ?? id)}
              showSource={mixed}
              showCopy={!allCopies}
              now={props.now}
              disabled={props.disabled}
              onChange={() => props.onChange(toggled(selected, [chat]))}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function ChatRow(props: {
  chat: ChatImportChat
  checked: boolean
  source: ChatImportSource | undefined
  alsoIn: string[] | undefined
  showSource: boolean
  showCopy: boolean
  now: number
  disabled: boolean
  onChange: () => void
}) {
  const { t } = useI18n()
  const { chat } = props
  // The folder names its app once; a chat says so itself when its folder mixes
  // apps or another app saved it too.
  const mark = props.showSource || chat.alsoIn?.length ? sourceMark(props.source) : undefined
  const title = chat.title || t('settings.import.untitled')
  const savedBy = [props.source?.name, ...(props.alsoIn ?? [])]
    .filter(Boolean)
    .join(` ${t('settings.import.and')} `)
  const tags = [
    ...(chat.archived ? [t('settings.import.archived')] : []),
    ...(props.showCopy && chat.continuation === 'copy' ? [t('settings.import.copy')] : []),
  ]
  const when = lastUsed(chat.updatedAt, props.now)
  // What the row shows besides the title, said once for a screen reader; the folder's
  // own app and Copy count too when the row leaves them to the folder.
  const description = [
    savedBy,
    ...(chat.archived ? [t('settings.import.archived')] : []),
    ...(chat.continuation === 'copy' ? [t('settings.import.copy')] : []),
    when,
  ]
    .filter(Boolean)
    .join(', ')
  const describedBy = useId()
  return (
    <li>
      <label className="import-row import-chat">
        <input
          className="import-check"
          type="checkbox"
          aria-label={title}
          aria-describedby={describedBy}
          checked={props.checked}
          disabled={props.disabled}
          onChange={props.onChange}
        />
        <span className="import-chat__text">
          <span className="import-chat__title">{title}</span>
          {tags.map((tag) => (
            <span className="import-chat__tag" key={tag}>
              {tag}
            </span>
          ))}
        </span>
        <span className="import-row__count" title={savedBy || undefined}>
          {mark ? <ProviderIcon mark={mark} size={13} /> : null}
        </span>
        <span className="import-row__when">{when}</span>
        <span className="visually-hidden" id={describedBy}>
          {description}
        </span>
      </label>
    </li>
  )
}

function ImportBar(props: {
  job: ChatImportJob | undefined
  chats: number
  folders: number
  newProjects: number
  note: string | undefined
  onStart: () => void
  onOpenChat: (threadId: string) => void
}) {
  const i18n = useI18n()
  const { t, tp } = i18n
  const { job } = props
  if (job?.state === 'running') {
    return (
      <div className="import-bar" role="status">
        <span className="import-bar__summary">
          {t('settings.import.importing', {
            done: job.done.toLocaleString(getLanguage()),
            chats: tp('settings.import.count.chats', job.total),
          })}
        </span>
        <span
          className="import-bar__track"
          role="progressbar"
          aria-label={t('settings.import.progressLabel')}
          aria-valuemin={0}
          aria-valuemax={job.total}
          aria-valuenow={job.done}
        >
          <span
            className="import-bar__fill"
            style={{ transform: `scaleX(${job.total ? job.done / job.total : 0})` }}
          />
        </span>
      </div>
    )
  }
  if (job?.state === 'finished' && !props.chats) {
    const thread = job.thread
    return (
      <div className="import-bar" role="status">
        <span className="import-bar__summary">{finishedLine(job, i18n)}</span>
        {thread ? (
          <button
            className="set-button set-button--primary"
            type="button"
            onClick={() => props.onOpenChat(thread)}
          >
            {t('settings.import.openNewest')}
          </button>
        ) : null}
      </div>
    )
  }
  const parts = props.chats
    ? [
        t('settings.import.summary', {
          chats: tp('settings.import.count.chats', props.chats),
          folders: tp('settings.import.count.folders', props.folders),
        }),
        ...(props.newProjects ? [tp('settings.import.count.newProjects', props.newProjects)] : []),
      ]
    : [t('settings.import.choose')]
  return (
    <div className="import-bar">
      <div className="import-bar__text">
        <span className="import-bar__summary" data-empty={!props.chats || undefined}>
          {parts.join(' · ')}
        </span>
        {props.note ? <p className="import-bar__note">{props.note}</p> : null}
      </div>
      <button
        className="set-button set-button--primary"
        type="button"
        disabled={!props.chats}
        onClick={props.onStart}
      >
        {props.chats
          ? t('settings.import.start', { chats: tp('settings.import.count.chats', props.chats) })
          : t('settings.import.startEmpty')}
      </button>
    </div>
  )
}
