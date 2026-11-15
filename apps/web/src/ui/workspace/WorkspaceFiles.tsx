import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { ResultOf } from '@harness/contracts'
import {
  IconChevronDown as ChevronDown,
  IconChevronRight as ChevronRight,
  IconFileAlert as FileWarning,
  IconFolder as Folder,
  IconFolderOpen as FolderOpen,
  IconLoader2 as LoaderCircle,
  IconLock as LockKeyhole,
  IconSearch as Search,
  IconRefresh as Refresh,
} from '@tabler/icons-react'
import { canRevealProjectFile, revealProjectFile } from '../../bridge.js'
import { useI18n } from '../../i18n/index.js'
import { relativeToRoot } from '../../project-file-link.js'
import type { Transport } from '../../transport.js'
import { FileContextMenu } from '../FileContextMenu.js'
import { FileTypeIcon } from '../FileTypeIcon.js'
import { IconMorph } from '../IconMorph.js'
import { Skeleton, SkeletonCode, SkeletonRows, SkeletonStatus } from '../Skeleton.js'
import { FileViewer } from './FileViewer.js'
import { WorkspaceEmptyState } from './WorkspaceEmptyState.js'
import { fileViewerKind, isMediaKind } from './file-viewer-kind.js'
import { useWorkspaceRefresh } from './useWorkspaceRefresh.js'
import { lastPathPart, rootedPath } from './workspace-paths.js'

type Entry = ResultOf<'workspace.listDirectory'>['entries'][number]
type FileContents = ResultOf<'workspace.readFile'>
type FileSearch = {
  key: string
  result?: ResultOf<'workspace.searchFiles'>
  error?: string
}
/** A file the chat asked to open: the absolute path it cited, and which ask it is. */
export type WorkspaceFileOpenRequest = { request: number; path: string }
const EMPTY_WORKSPACE_ENTRIES: Entry[] = []
const EMPTY_WORKSPACE_DIRECTORIES = new Map<string, Entry[]>()
const WORKSPACE_TREE_INDENT = 18
// Name widths for placeholder rows, in pixels: the tree column is narrow and
// percentages of it would all look alike.
const TREE_SKELETON_WIDTHS = [96, 128, 72, 112, 88, 140, 64, 104, 120]

class FileSelectionStore {
  readonly #listeners = new Map<string, Set<() => void>>()
  #selectedPath: string | undefined

  select(path: string | undefined): void {
    const previous = this.#selectedPath
    if (previous === path) return
    this.#selectedPath = path
    this.#emit(previous)
    this.#emit(path)
  }

  selected(path: string): boolean {
    return this.#selectedPath === path
  }

  subscribe(path: string, listener: () => void): () => void {
    let listeners = this.#listeners.get(path)
    if (!listeners) {
      listeners = new Set()
      this.#listeners.set(path, listeners)
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) this.#listeners.delete(path)
    }
  }

  #emit(path: string | undefined): void {
    if (!path) return
    for (const listener of this.#listeners.get(path) ?? []) listener()
  }
}

/** What a row's context menu needs from the tab, so the memoized rows keep their props. */
type FileActions = {
  root: string | undefined
  open: (entry: Entry) => void
  reveal: ((relative: string) => void) | undefined
}
const FileActionsContext = createContext<FileActions | undefined>(undefined)

/** Changes when the file does, so an unchanged file is not read again. */
function entryStamp(entry: Entry): string {
  return `${entry.size}:${entry.modifiedAt}`
}

function parentPath(path: string): string {
  const end = path.lastIndexOf('/')
  return end < 0 ? '' : path.slice(0, end)
}

function sameFile(left: FileContents | undefined, right: FileContents): boolean {
  return (
    left !== undefined &&
    left.path === right.path &&
    left.size === right.size &&
    left.binary === right.binary &&
    left.truncated === right.truncated &&
    left.content === right.content
  )
}

export const WorkspaceFiles = memo(function WorkspaceFiles(props: {
  transport: Transport
  projectPath?: string | undefined
  projectName?: string | undefined
  threadId?: string | undefined
  /** A file the chat cited: it opens here, in its folder. */
  openRequest?: WorkspaceFileOpenRequest | undefined
}) {
  const { t } = useI18n()
  // The server does not know a chat's provisional id while its first message
  // creates it; stay in the project checkout until the real id arrives.
  const threadId = props.threadId?.startsWith('pending:') ? undefined : props.threadId
  const [directories, setDirectories] = useState<Map<string, Entry[]>>(new Map())
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['']))
  const [loadingDirectories, setLoadingDirectories] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState<FileSearch>()
  const [searchRevision, setSearchRevision] = useState(0)
  const [selectedPath, setSelectedPath] = useState<string>()
  const selectedPathRef = useRef<string>(undefined)
  const [file, setFile] = useState<FileContents>()
  const [loadingFile, setLoadingFile] = useState(false)
  const [error, setError] = useState<string>()
  /** The folder the listed paths belong to (the project or the chat's own checkout). */
  const [root, setRoot] = useState<string>()
  const [revealFailed, setRevealFailed] = useState<string>()
  /** Bumped when the open image or video changed on disk, so it is fetched again. */
  const [mediaRevision, setMediaRevision] = useState(0)
  const [fileSelection] = useState(() => new FileSelectionStore())
  const directoryGeneration = useRef(0)
  const directoryRequests = useRef(new Map<string, number>())
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded
  const fileGeneration = useRef(0)
  const fileRef = useRef<FileContents>(undefined)
  fileRef.current = file
  /** The open file's size and time when listed: a refresh reads it again only if they moved. */
  const selectedStamp = useRef<{ path: string; stamp: string }>(undefined)
  const handledOpenRequest = useRef(0)

  const context = useCallback(
    () => ({
      projectPath: props.projectPath!,
      ...(threadId ? { threadId } : {}),
    }),
    [props.projectPath, threadId],
  )

  const readFile = useCallback(
    async (path: string, reread = false, size?: number) => {
      if (!props.projectPath) return
      const mine = ++fileGeneration.current
      if (isMediaKind(fileViewerKind(path))) {
        // Images, video and audio stream from disk and a PDF is not shown: nothing to read as text.
        setError(undefined)
        setLoadingFile(false)
        setFile({
          name: lastPathPart(path),
          path,
          size: size ?? fileRef.current?.size ?? 0,
          binary: true,
          truncated: false,
        })
        return
      }
      // A reread keeps the open file, and with it the reader's scroll position, until it resolves.
      if (!reread) {
        setFile(undefined)
        setLoadingFile(true)
      }
      setError(undefined)
      try {
        const result = await props.transport.request('workspace.readFile', {
          ...context(),
          path,
        })
        // The same file again is not a new file: the viewer keeps its rows and highlighting.
        if (fileGeneration.current === mine)
          setFile((current) => (sameFile(current, result) ? current : result))
      } catch (cause) {
        if (fileGeneration.current === mine) {
          setFile(undefined)
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      } finally {
        if (fileGeneration.current === mine) setLoadingFile(false)
      }
    },
    [context, props.projectPath, props.transport],
  )

  // A listing says whether the open file changed on disk, which costs far less than reading it.
  const noteListedFile = useCallback(
    (directory: string, entries: Entry[]) => {
      const selected = selectedPathRef.current
      if (!selected || parentPath(selected) !== directory) return
      const media = isMediaKind(fileViewerKind(selected))
      const entry = entries.find((candidate) => candidate.path === selected)
      if (!entry) {
        // Deleted or renamed: say so instead of keeping a file that is gone on screen.
        if (media) {
          setFile(undefined)
          setError(t('workspace.files.error.gone'))
        } else void readFile(selected, true)
        return
      }
      const stamp = entryStamp(entry)
      const seen = selectedStamp.current
      selectedStamp.current = { path: selected, stamp }
      if (seen?.path !== selected || seen.stamp === stamp) return
      if (media) setMediaRevision((current) => current + 1)
      void readFile(selected, true, entry.size)
    },
    [readFile, t],
  )

  const loadDirectory = useCallback(
    async (directory: string): Promise<Entry[] | undefined> => {
      if (!props.projectPath) return undefined
      const mine = directoryGeneration.current
      const request = (directoryRequests.current.get(directory) ?? 0) + 1
      directoryRequests.current.set(directory, request)
      const isCurrent = () =>
        directoryGeneration.current === mine && directoryRequests.current.get(directory) === request
      setLoadingDirectories((current) => new Set(current).add(directory))
      try {
        const result = await props.transport.request('workspace.listDirectory', {
          ...context(),
          ...(directory ? { directory } : {}),
        })
        if (isCurrent()) {
          if (result.root) setRoot(result.root)
          setDirectories((current) => new Map(current).set(directory, result.entries))
          noteListedFile(directory, result.entries)
          return result.entries
        }
      } catch (cause) {
        if (isCurrent()) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      } finally {
        if (isCurrent()) {
          setLoadingDirectories((current) => {
            const next = new Set(current)
            next.delete(directory)
            return next
          })
        }
      }
      return undefined
    },
    [context, noteListedFile, props.projectPath, props.transport],
  )

  useEffect(() => {
    directoryGeneration.current += 1
    directoryRequests.current.clear()
    fileGeneration.current += 1
    setDirectories(new Map())
    setRoot(undefined)
    setRevealFailed(undefined)
    setLoadingDirectories(new Set())
    setExpanded(new Set(['']))
    fileSelection.select(undefined)
    selectedPathRef.current = undefined
    setSelectedPath(undefined)
    setFile(undefined)
    setLoadingFile(false)
    setError(undefined)
    if (props.projectPath) void loadDirectory('')
    return () => {
      directoryGeneration.current += 1
      fileGeneration.current += 1
    }
  }, [fileSelection, loadDirectory, props.projectPath, threadId])

  const query = filter.trim()
  const searchKey = JSON.stringify([props.projectPath, threadId, query])
  useEffect(() => {
    if (!props.projectPath || !query) {
      setSearch(undefined)
      return
    }
    let cancelled = false
    // A refresh repeats the same search; its results stay up until the new ones arrive.
    setSearch((current) => (current?.key === searchKey ? current : { key: searchKey }))
    const timer = setTimeout(() => {
      void props.transport
        .request('workspace.searchFiles', {
          ...context(),
          query,
          limit: 500,
        })
        .then((result) => {
          if (!cancelled)
            setSearch({
              key: searchKey,
              result: {
                ...result,
                entries: result.entries.map((entry) => ({ ...entry, name: entry.path })),
              },
            })
        })
        .catch((cause) => {
          if (!cancelled)
            setSearch({
              key: searchKey,
              error: cause instanceof Error ? cause.message : String(cause),
            })
        })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [context, props.projectPath, props.transport, query, searchKey, searchRevision])
  const currentSearch = search?.key === searchKey ? search : undefined
  const searchResult = currentSearch?.result

  const toggleDirectory = useCallback(
    (entry: Entry) => {
      if (entry.restricted) return
      const opening = !expanded.has(entry.path)
      setExpanded((current) => {
        const next = new Set(current)
        if (opening) next.add(entry.path)
        else next.delete(entry.path)
        return next
      })
      if (opening) void loadDirectory(entry.path)
    },
    [expanded, loadDirectory],
  )

  const openSearchDirectory = useCallback(
    (entry: Entry) => {
      if (entry.restricted) return
      const ancestors = ['', entry.path]
      // Workspace entry paths are slash-separated protocol paths on every platform.
      for (
        let end = entry.path.lastIndexOf('/');
        end > 0;
        end = entry.path.lastIndexOf('/', end - 1)
      )
        ancestors.push(entry.path.slice(0, end))
      setFilter('')
      setExpanded((current) => new Set([...current, ...ancestors]))
      for (const directory of ancestors) void loadDirectory(directory)
    },
    [loadDirectory],
  )

  const selectPath = useCallback(
    (path: string, entry?: Entry) => {
      selectedPathRef.current = path
      selectedStamp.current = entry ? { path, stamp: entryStamp(entry) } : undefined
      fileSelection.select(path)
      setSelectedPath(path)
      setMediaRevision(0)
      void readFile(path, false, entry?.size)
    },
    [fileSelection, readFile],
  )
  const selectTreeFile = useCallback(
    (entry: Entry) => {
      if (entry.restricted) return
      selectPath(entry.path, entry)
    },
    [selectPath],
  )

  // `force` is the Refresh button: it reads the open file again whatever its listing says.
  const refreshDirectories = useCallback(
    (force = false) => {
      setError(undefined)
      // A folder left open inside a collapsed one still refreshes, so its ancestors do too.
      const open = new Set([''])
      for (const directory of expandedRef.current)
        for (let end = directory.length; end > 0; end = directory.lastIndexOf('/', end - 1))
          open.add(directory.slice(0, end))
      const generation = directoryGeneration.current
      // Parents refresh before their children. A folder missing from its parent's new
      // listing was deleted or replaced: it is closed rather than requested, since
      // listing it would only fail and keep reporting the error on every refresh.
      const refresh = async (directory: string) => {
        const entries = await loadDirectory(directory)
        if (!entries || directoryGeneration.current !== generation) return
        const folders = new Set<string>()
        for (const entry of entries)
          if (entry.kind === 'directory' && !entry.restricted) folders.add(entry.path)
        const prefix = directory ? `${directory}/` : ''
        const gone = new Set<string>()
        for (const path of open) {
          if (path === directory || !path.startsWith(prefix)) continue
          const end = path.indexOf('/', prefix.length)
          if (!folders.has(end < 0 ? path : path.slice(0, end))) gone.add(path)
        }
        if (gone.size > 0) {
          setExpanded((current) => new Set([...current].filter((path) => !gone.has(path))))
          setDirectories((current) => {
            const next = new Map(current)
            for (const path of gone) next.delete(path)
            return next
          })
        }
        for (const folder of folders) if (open.has(folder)) void refresh(folder)
      }
      void refresh('')
      // A file in an open folder is read again only when its listing says it changed (see
      // noteListedFile). One outside them, or one that failed to open, has no listing to ask.
      const selected = selectedPathRef.current
      if (selected && (force || !open.has(parentPath(selected)) || !fileRef.current))
        void readFile(selected, true)
      setSearchRevision((current) => current + 1)
    },
    [loadDirectory, readFile],
  )

  useWorkspaceRefresh(props.transport, threadId, refreshDirectories)

  // A file the chat cited: open its folders, then select it, or say why it cannot be shown.
  const openRelative = useCallback(
    async (relative: string) => {
      const folders: string[] = []
      // Workspace entry paths are slash-separated protocol paths on every platform.
      for (let end = relative.lastIndexOf('/'); end > 0; end = relative.lastIndexOf('/', end - 1))
        folders.unshift(relative.slice(0, end))
      setFilter('')
      setExpanded((current) => new Set([...current, ...folders]))
      const listings = await Promise.all(['', ...folders].map((folder) => loadDirectory(folder)))
      const entry = listings.at(-1)?.find((candidate) => candidate.path === relative)
      fileSelection.select(undefined)
      selectedPathRef.current = relative
      setSelectedPath(relative)
      setFile(undefined)
      if (!entry || entry.restricted) {
        setError(entry ? t('workspace.files.error.protected') : t('workspace.files.error.removed'))
        return
      }
      if (entry.kind === 'directory') {
        setExpanded((current) => new Set(current).add(relative))
        void loadDirectory(relative)
        selectedPathRef.current = undefined
        setSelectedPath(undefined)
        setError(undefined)
        return
      }
      selectPath(relative, entry)
    },
    [fileSelection, loadDirectory, selectPath, t],
  )
  const request = props.openRequest
  const listed = directories.has('')
  useEffect(() => {
    if (!request || !listed || request.request === handledOpenRequest.current) return
    handledOpenRequest.current = request.request
    // The listing's folder is the chat's own checkout when it has one; the cited path may
    // name the project's copy instead.
    const relative = [root, props.projectPath]
      .map((folder) => (folder ? relativeToRoot(request.path, folder) : undefined))
      .find((candidate) => candidate !== undefined)
    if (relative) void openRelative(relative)
    else {
      setSelectedPath(request.path)
      setFile(undefined)
      setError(t('workspace.files.error.outside'))
    }
  }, [listed, openRelative, props.projectPath, request, root, t])

  const rootEntries = directories.get('') ?? EMPTY_WORKSPACE_ENTRIES
  const visibleRoot = useMemo(
    () => filterEntries(rootEntries, directories, filter),
    [directories, filter, rootEntries],
  )
  const virtualFileTree = useMemo(
    () =>
      rootEntries.length >= WORKSPACE_TREE_VIRTUAL_ROW_THRESHOLD ||
      exceedsWorkspaceFileTreeRowLimit(
        rootEntries,
        directories,
        expanded,
        '',
        WORKSPACE_TREE_VIRTUAL_ROW_THRESHOLD,
      ),
    [directories, expanded, rootEntries],
  )

  // Explorer or Finder shows a listed file or folder where it really is: the project, or the
  // chat's own checkout. Only the desktop app can; the shell checks the path stays inside root.
  const reveal = useMemo(
    () =>
      canRevealProjectFile && root
        ? (relative: string) => {
            setRevealFailed(undefined)
            void revealProjectFile(rootedPath(root, relative), root).catch(() =>
              setRevealFailed(relative || lastPathPart(root)),
            )
          }
        : undefined,
    [root],
  )

  const fileActions = useMemo<FileActions>(
    () => ({ root, open: selectTreeFile, reveal }),
    [reveal, root, selectTreeFile],
  )

  if (!props.projectPath) {
    return (
      <WorkspaceEmptyState
        kind="files"
        title={t('workspace.files.chooseProject.title')}
        detail={t('workspace.files.chooseProject.detail')}
      />
    )
  }

  return (
    <div className="workspace-files">
      <header className="workspace-files__toolbar">
        <FolderOpen size={15} aria-hidden />
        <span>
          <RevealText reveal={reveal} path="">
            {props.projectName ?? lastPathPart(props.projectPath)}
          </RevealText>
        </span>
        {selectedPath ? (
          <span className="workspace-files__crumb">
            ›{' '}
            <RevealText reveal={reveal} path={selectedPath}>
              {selectedPath}
            </RevealText>
          </span>
        ) : null}
        <button
          type="button"
          className="icon-btn icon-btn--always"
          aria-label={t('workspace.files.refresh')}
          onClick={() => refreshDirectories(true)}
        >
          <Refresh size={14} aria-hidden />
        </button>
      </header>

      <div className="workspace-files__split">
        <main className="workspace-files__viewer">
          {loadingFile ? (
            <SkeletonStatus
              label={t('workspace.files.opening')}
              className="workspace-files__document workspace-files__document-skeleton"
            >
              <header>
                <Skeleton className="skeleton--icon" />
                <Skeleton width={164} height={9} />
              </header>
              <SkeletonCode lines={26} gutter />
            </SkeletonStatus>
          ) : file ? (
            <FileViewer
              file={file}
              projectPath={props.projectPath}
              root={root}
              revision={mediaRevision}
              onReveal={reveal ? () => reveal(file.path) : undefined}
            />
          ) : error && selectedPath ? (
            <div className="workspace-files__loading" role="alert">
              <FileWarning size={18} aria-hidden /> {error}
            </div>
          ) : (
            <WorkspaceEmptyState
              kind="files"
              title={t('workspace.files.openFile.title')}
              detail={t('workspace.files.openFile.detail')}
            />
          )}
        </main>

        <aside className="workspace-files__tree" aria-label={t('workspace.files.tree')}>
          <label className="workspace-tree-search">
            <Search size={14} aria-hidden />
            <input
              value={filter}
              maxLength={256}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t('workspace.files.filter.placeholder')}
              aria-label={t('workspace.files.filter.label')}
            />
          </label>

          {revealFailed ? (
            <div className="workspace-files__tree-error" role="alert">
              {t('workspace.files.revealFailed', { path: revealFailed })}
            </div>
          ) : null}

          {error && !selectedPath ? (
            <div className="workspace-files__tree-error" role="alert">
              {error}
            </div>
          ) : null}

          {query ? (
            <div className="workspace-files__tree-error" role="status">
              {currentSearch?.error
                ? t('workspace.files.search.unavailable', { error: currentSearch.error })
                : !searchResult
                  ? t('workspace.files.search.searching')
                  : searchResult.truncated
                    ? t('workspace.files.search.more')
                    : searchResult.entries.length === 0
                      ? t('workspace.files.search.none')
                      : null}
            </div>
          ) : null}

          <FileActionsContext.Provider value={fileActions}>
            <WorkspaceFileTree
              entries={searchResult?.entries ?? visibleRoot}
              directories={searchResult ? EMPTY_WORKSPACE_DIRECTORIES : directories}
              expanded={expanded}
              loadingDirectories={loadingDirectories}
              filter={filter}
              virtual={
                searchResult
                  ? searchResult.entries.length >= WORKSPACE_TREE_VIRTUAL_ROW_THRESHOLD
                  : virtualFileTree
              }
              selection={fileSelection}
              onToggle={searchResult ? openSearchDirectory : toggleDirectory}
              onSelect={selectTreeFile}
            />
          </FileActionsContext.Provider>
        </aside>
      </div>
    </div>
  )
})

const WorkspaceFileTree = memo(function WorkspaceFileTree(props: {
  entries: Entry[]
  directories: Map<string, Entry[]>
  expanded: Set<string>
  loadingDirectories: Set<string>
  filter: string
  virtual: boolean
  selection: FileSelectionStore
  onToggle: (entry: Entry) => void
  onSelect: (entry: Entry) => void
}) {
  const { t } = useI18n()
  const rows = useMemo(
    () =>
      props.virtual
        ? workspaceFileTreeRows(props.entries, props.directories, props.expanded, props.filter)
        : EMPTY_WORKSPACE_FILE_TREE_ROWS,
    [props.directories, props.entries, props.expanded, props.filter, props.virtual],
  )

  if (props.virtual) {
    return (
      <VirtualWorkspaceFileTree
        rows={rows}
        expanded={props.expanded}
        loadingDirectories={props.loadingDirectories}
        selection={props.selection}
        onToggle={props.onToggle}
        onSelect={props.onSelect}
      />
    )
  }

  return (
    <div className="workspace-files__tree-list">
      {props.entries.map((entry) => (
        <FileTreeEntry
          key={entry.path}
          entry={entry}
          depth={0}
          directories={props.directories}
          expanded={props.expanded}
          loadingDirectories={props.loadingDirectories}
          filter={props.filter}
          selection={props.selection}
          onToggle={props.onToggle}
          onSelect={props.onSelect}
        />
      ))}
      {/* As for a folder, only a first listing gets placeholder rows; a refresh keeps the rows. */}
      {props.loadingDirectories.has('') && props.entries.length === 0 ? (
        <SkeletonStatus
          label={t('workspace.files.loading')}
          className="workspace-files__tree-skeleton"
        >
          <SkeletonRows rows={9} icon widths={TREE_SKELETON_WIDTHS} />
        </SkeletonStatus>
      ) : null}
    </div>
  )
})

const WORKSPACE_TREE_VIRTUAL_ROW_THRESHOLD = 200
const WORKSPACE_TREE_ROW_HEIGHT = 29

type WorkspaceFileTreeRows = {
  entries: Entry[]
  depths?: number[] | undefined
}

type FlattenedWorkspaceFileTreeRows = {
  entries: Entry[]
  depths: number[]
}

const EMPTY_WORKSPACE_FILE_TREE_ROWS: WorkspaceFileTreeRows = { entries: [] }

function VirtualWorkspaceFileTree(props: {
  rows: WorkspaceFileTreeRows
  expanded: Set<string>
  loadingDirectories: Set<string>
  selection: FileSelectionStore
  onToggle: (entry: Entry) => void
  onSelect: (entry: Entry) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const getItemKey = useCallback(
    (index: number) => props.rows.entries[index]?.path ?? `missing-workspace-file-row-${index}`,
    [props.rows],
  )
  const virtualizer = useVirtualizer({
    count: props.rows.entries.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => WORKSPACE_TREE_ROW_HEIGHT,
    getItemKey,
    overscan: 12,
  })

  return (
    <div ref={scroller} className="workspace-files__tree-list is-virtual">
      <div className="workspace-files__tree-canvas" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const entry = props.rows.entries[virtualRow.index]
          if (!entry) return null
          const depth = props.rows.depths?.[virtualRow.index] ?? 0
          return (
            <div
              className="workspace-files__tree-row"
              key={virtualRow.key}
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              {entry.kind === 'file' ? (
                <FileTreeFile
                  entry={entry}
                  depth={depth}
                  selection={props.selection}
                  onSelect={props.onSelect}
                />
              ) : (
                <FileTreeDirectoryButton
                  entry={entry}
                  depth={depth}
                  open={props.expanded.has(entry.path)}
                  loading={props.loadingDirectories.has(entry.path)}
                  onToggle={props.onToggle}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

type FileTreeEntryProps = {
  entry: Entry
  depth: number
  directories: Map<string, Entry[]>
  expanded: Set<string>
  loadingDirectories: Set<string>
  filter: string
  selection: FileSelectionStore
  onToggle: (entry: Entry) => void
  onSelect: (entry: Entry) => void
}

const FileTreeEntry = memo(function FileTreeEntry(props: FileTreeEntryProps) {
  const { entry } = props
  if (entry.kind === 'file') {
    return (
      <FileTreeFile
        entry={entry}
        depth={props.depth}
        selection={props.selection}
        onSelect={props.onSelect}
      />
    )
  }

  const open = props.expanded.has(entry.path)
  const loading = props.loadingDirectories.has(entry.path)
  const children = filterEntries(
    props.directories.get(entry.path) ?? [],
    props.directories,
    props.filter,
  )
  // A first listing gets placeholder rows where its children will appear; a
  // refresh of a listed folder keeps the rows and spins on the folder instead.
  const pending = open && loading && children.length === 0
  return (
    <div className="workspace-files__directory">
      <FileTreeDirectoryButton
        entry={entry}
        depth={props.depth}
        open={open}
        loading={loading && !pending}
        onToggle={props.onToggle}
      />
      {pending ? (
        <SkeletonRows
          rows={3}
          icon
          widths={TREE_SKELETON_WIDTHS}
          indents={[12 + (props.depth + 1) * WORKSPACE_TREE_INDENT]}
          className="workspace-files__tree-skeleton skeleton-group"
        />
      ) : null}
      {open
        ? children.map((child) => (
            <FileTreeEntry {...props} key={child.path} entry={child} depth={props.depth + 1} />
          ))
        : null}
    </div>
  )
}, sameFileTreeEntryProps)

function FileTreeDirectoryButton(props: {
  entry: Entry
  depth: number
  open: boolean
  loading: boolean
  onToggle: (entry: Entry) => void
}) {
  const { t } = useI18n()
  const target = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={target}
        type="button"
        className="workspace-files__entry is-directory"
        style={{ paddingLeft: 9 + props.depth * WORKSPACE_TREE_INDENT }}
        aria-expanded={props.entry.restricted ? undefined : props.open}
        title={
          props.entry.restricted
            ? t('workspace.files.protected', { name: props.entry.name })
            : props.entry.path
        }
        onClick={() => props.onToggle(props.entry)}
      >
        <IconMorph active={props.entry.restricted ? 2 : props.open ? 1 : 0}>
          <ChevronRight size={14} aria-hidden />
          <ChevronDown size={14} aria-hidden />
          <LockKeyhole size={13} aria-hidden />
        </IconMorph>
        <IconMorph active={props.open ? 1 : 0}>
          <Folder size={14} aria-hidden />
          <FolderOpen size={14} aria-hidden />
        </IconMorph>
        <span>{props.entry.name}</span>
        {props.loading ? <LoaderCircle className="spinner" size={12} aria-hidden /> : null}
      </button>
      <FileRowMenu targetRef={target} entry={props.entry} />
    </>
  )
}

/** The right-click menu of a row. A protected entry is not offered one. */
function FileRowMenu(props: { targetRef: RefObject<HTMLElement | null>; entry: Entry }) {
  const { t } = useI18n()
  const actions = useContext(FileActionsContext)
  const { entry } = props
  if (!actions || entry.restricted) return null
  return (
    <FileContextMenu
      targetRef={props.targetRef}
      label={t('workspace.files.options', { name: entry.name })}
      path={actions.root ? rootedPath(actions.root, entry.path) : entry.path}
      onOpenInPanel={entry.kind === 'file' ? () => actions.open(entry) : undefined}
      onOpenInExplorer={actions.reveal ? () => actions.reveal?.(entry.path) : undefined}
    />
  )
}

function sameFileTreeEntryProps(
  previous: Readonly<FileTreeEntryProps>,
  next: Readonly<FileTreeEntryProps>,
): boolean {
  if (previous.entry.kind !== 'file' || next.entry.kind !== 'file') return false
  return (
    previous.entry === next.entry &&
    previous.depth === next.depth &&
    previous.selection === next.selection &&
    previous.onSelect === next.onSelect
  )
}

function FileTreeFile(props: {
  entry: Entry
  depth: number
  selection: FileSelectionStore
  onSelect: (entry: Entry) => void
}) {
  const subscribe = useCallback(
    (listener: () => void) => props.selection.subscribe(props.entry.path, listener),
    [props.entry.path, props.selection],
  )
  const { t } = useI18n()
  const selected = useSyncExternalStore(
    subscribe,
    () => props.selection.selected(props.entry.path),
    () => props.selection.selected(props.entry.path),
  )

  const target = useRef<HTMLButtonElement>(null)

  return (
    <>
      <button
        ref={target}
        type="button"
        className={`workspace-files__entry is-file${selected ? ' is-selected' : ''}`}
        style={{ paddingLeft: 12 + props.depth * WORKSPACE_TREE_INDENT }}
        title={
          props.entry.restricted
            ? t('workspace.files.protected', { name: props.entry.name })
            : props.entry.path
        }
        disabled={props.entry.restricted}
        onClick={() => props.onSelect(props.entry)}
      >
        <FileTypeIcon path={props.entry.path} />
        <MiddleEllipsis text={props.entry.name} />
        {props.entry.restricted ? <LockKeyhole size={12} aria-hidden /> : null}
      </button>
      <FileRowMenu targetRef={target} entry={props.entry} />
    </>
  )
}

/** A path in the toolbar that opens its folder in Explorer or Finder, where the app can. */
function RevealText(props: {
  reveal: ((path: string) => void) | undefined
  path: string
  children: string
}) {
  const { t } = useI18n()
  if (!props.reveal) return props.children
  const reveal = props.reveal
  return (
    <button
      type="button"
      className="workspace-files__reveal"
      title={t('workspace.files.showInFolder', { path: props.path || props.children })}
      onClick={() => reveal(props.path)}
    >
      {props.children}
    </button>
  )
}

function MiddleEllipsis({ text }: { text: string }) {
  const characters = Array.from(text)
  const suffixLength = Math.min(10, Math.max(1, Math.floor(characters.length * 0.45)))
  const splitAt = characters.length - suffixLength

  return (
    <span className="workspace-files__name" aria-label={text}>
      <span className="workspace-files__name-start" aria-hidden>
        {characters.slice(0, splitAt).join('')}
      </span>
      <span className="workspace-files__name-end" aria-hidden>
        {characters.slice(splitAt).join('')}
      </span>
    </span>
  )
}

function filterEntries(
  entries: Entry[],
  directories: Map<string, Entry[]>,
  filter: string,
): Entry[] {
  const query = filter.trim().toLocaleLowerCase()
  if (!query) return entries
  return entries.filter(
    (entry) =>
      normalizedWorkspaceEntryName(entry).includes(query) ||
      (entry.kind === 'directory' &&
        hasWorkspaceEntryMatch(directories.get(entry.path) ?? [], directories, query)),
  )
}

const normalizedWorkspaceEntryNames = new WeakMap<Entry, string>()

function normalizedWorkspaceEntryName(entry: Entry): string {
  let normalized = normalizedWorkspaceEntryNames.get(entry)
  if (normalized === undefined) {
    normalized = entry.name.toLocaleLowerCase()
    normalizedWorkspaceEntryNames.set(entry, normalized)
  }
  return normalized
}

function hasWorkspaceEntryMatch(
  entries: Entry[],
  directories: Map<string, Entry[]>,
  query: string,
): boolean {
  for (const entry of entries) {
    if (normalizedWorkspaceEntryName(entry).includes(query)) return true
    if (
      entry.kind === 'directory' &&
      hasWorkspaceEntryMatch(directories.get(entry.path) ?? [], directories, query)
    ) {
      return true
    }
  }
  return false
}

function workspaceFileTreeRows(
  entries: Entry[],
  directories: Map<string, Entry[]>,
  expanded: Set<string>,
  filter: string,
): WorkspaceFileTreeRows {
  if (expanded.size === 1 && expanded.has('')) return { entries }
  return flattenWorkspaceFileTree(entries, directories, expanded, filter)
}

function flattenWorkspaceFileTree(
  entries: Entry[],
  directories: Map<string, Entry[]>,
  expanded: Set<string>,
  filter: string,
  depth = 0,
  rows: FlattenedWorkspaceFileTreeRows = { entries: [], depths: [] },
): WorkspaceFileTreeRows {
  for (const entry of entries) {
    rows.entries.push(entry)
    rows.depths.push(depth)
    if (entry.kind !== 'directory' || entry.restricted || !expanded.has(entry.path)) continue
    flattenWorkspaceFileTree(
      filterEntries(directories.get(entry.path) ?? [], directories, filter),
      directories,
      expanded,
      filter,
      depth + 1,
      rows,
    )
  }
  return rows
}

function exceedsWorkspaceFileTreeRowLimit(
  entries: Entry[],
  directories: Map<string, Entry[]>,
  expanded: Set<string>,
  filter: string,
  limit: number,
): boolean {
  let count = 0
  const visit = (visibleEntries: Entry[]): boolean => {
    for (const entry of visibleEntries) {
      count += 1
      if (count >= limit) return true
      if (entry.kind !== 'directory' || entry.restricted || !expanded.has(entry.path)) continue
      if (visit(filterEntries(directories.get(entry.path) ?? [], directories, filter))) return true
    }
    return false
  }
  return visit(entries)
}
