import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from 'react'
import {
  IconCopy as Copy,
  IconDownload as Download,
  IconFileText as FileText,
  IconFolderOpen as FolderOpen,
  IconLayoutSidebarRight as PanelRight,
  IconPaperclip as Paperclip,
  IconPhotoOff as PhotoOff,
} from '@tabler/icons-react'
import {
  attachDeliveredFile,
  copyDeliveredFile,
  isMacOS,
  resolveDeliveredFiles,
  revealProjectFile,
  saveDeliveredFile,
  writeClipboardText,
  type DeliveredFile,
} from '../bridge.js'
import { attachToComposer, canAttachToComposer } from '../composer-attach.js'
import { detectDeliveredPaths, MAX_DELIVERED_CARDS } from '../delivered-files.js'
import { useI18n, type MessageKey } from '../i18n/index.js'
import { openProjectFileInPanel, useCanOpenProjectFileInPanel } from '../project-file-open.js'
import { FileTypeIcon } from './FileTypeIcon.js'
import { LazyMediaViewer, preloadMediaViewer } from './LazyMediaViewer.js'
import { Menu, MenuItem } from './Menu.js'
import { formatBytes } from './workspace/workspace-paths.js'
import '../styles/delivered-files.css'

const RESOLVED_CACHE_LIMIT = 64
// A message that scrolls out and back in remounts; what the desktop already answered stays, so the
// cards come back in the same render instead of after another round trip.
const resolved = new Map<string, DeliveredFile[]>()

function remember(key: string, files: DeliveredFile[]): void {
  resolved.delete(key)
  resolved.set(key, files)
  if (resolved.size > RESOLVED_CACHE_LIMIT) {
    const oldest = resolved.keys().next().value
    if (oldest !== undefined) resolved.delete(oldest)
  }
}

/**
 * The media a finished reply names by path, as cards right under it. Rendered for completed
 * messages only: nothing here runs while a reply streams. The desktop resolves each path inside
 * the chat's project; a path that does not resolve stays plain text and says nothing.
 */
export const DeliveredFiles = memo(function DeliveredFiles(props: {
  text: string
  projectPath: string | undefined
}) {
  const { t } = useI18n()
  const { projectPath } = props
  const candidates = useMemo(() => detectDeliveredPaths(props.text), [props.text])
  const key = `${projectPath ?? ''}\0${candidates.join('\0')}`
  const [files, setFiles] = useState<DeliveredFile[] | undefined>(() => resolved.get(key))

  useEffect(() => {
    if (!projectPath || candidates.length === 0) return
    const known = resolved.get(key)
    if (known) {
      setFiles(known)
      return
    }
    let current = true
    void resolveDeliveredFiles(candidates, [projectPath])
      .catch(() => [])
      .then((answer) => {
        remember(key, answer)
        if (current) setFiles(answer)
      })
    return () => {
      current = false
    }
  }, [candidates, key, projectPath])

  if (!projectPath || !files || files.length === 0) return null
  const roots = [projectPath]
  const shown = files.slice(0, MAX_DELIVERED_CARDS)
  return (
    <div className="delivered" role="group" aria-label={t('chat.delivered.files')}>
      {shown.map((file) => (
        <DeliveredCard key={file.path} file={file} roots={roots} />
      ))}
      {files.length > shown.length ? (
        <p className="delivered__cap">
          {t('chat.delivered.capped', { shown: shown.length, total: files.length })}
        </p>
      ) : null}
    </div>
  )
})

// Width over height of each video and image already measured, by path: a card that scrolls out and
// back in starts with its real shape instead of changing height again.
const ratios = new Map<string, number>()

function useNearViewport(target: RefObject<Element | null>): boolean {
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const element = target.current
    if (!element || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      ([entry]) => setNear(entry?.isIntersecting ?? false),
      { rootMargin: '400px 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [target])
  return near
}

function duration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

type Failure = 'copy' | 'save' | 'attach'
const FAILURE_KEY = {
  copy: 'chat.delivered.copyFailed',
  save: 'chat.delivered.saveFailed',
  attach: 'chat.delivered.attachFailed',
} as const satisfies Record<Failure, MessageKey>

function DeliveredCard({ file, roots }: { file: DeliveredFile; roots: string[] }) {
  const { t } = useI18n()
  const card = useRef<HTMLDivElement>(null)
  const near = useNearViewport(card)
  const inPanel = useCanOpenProjectFileInPanel()
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const [measured, setMeasured] = useState<string>()
  const [ratio, setRatio] = useState(() => ratios.get(file.path))
  const measure = (width: number, height: number) => {
    if (!(width > 0 && height > 0)) return
    ratios.set(file.path, width / height)
    setRatio(width / height)
  }
  const [failure, setFailure] = useState<Failure>()
  const [viewer, setViewer] = useState(false)
  const projectPath = roots[0]!
  // A card that is off screen holds no decoded media; one that is playing keeps its player.
  const live = near || playing

  useEffect(() => {
    if (!failure) return
    const timer = window.setTimeout(() => setFailure(undefined), 4_000)
    return () => window.clearTimeout(timer)
  }, [failure])

  const reveal = () => void revealProjectFile(file.path, projectPath).catch(() => undefined)
  const openInPanel = inPanel
    ? () => void openProjectFileInPanel({ path: file.path, projectPath })
    : undefined
  const detail = failure
    ? t(FAILURE_KEY[failure])
    : [
        file.mediaType === 'pdf' ? t('chat.delivered.pdf') : undefined,
        measured,
        formatBytes(file.size),
      ]
        .filter(Boolean)
        .join(' · ')
  const mediaEvents = {
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
    onError: () => {
      setPlaying(false)
      setFailed(true)
    },
  }

  let body: ReactNode
  if (file.mediaType === 'video') {
    body = (
      <div className="delivered__frame">
        {failed ? (
          <Unavailable name={file.name} />
        ) : live ? (
          <video
            src={file.url}
            aria-label={file.name}
            controls
            playsInline
            preload="metadata"
            onLoadedMetadata={(event: SyntheticEvent<HTMLVideoElement>) => {
              const video = event.currentTarget
              measure(video.videoWidth, video.videoHeight)
              setMeasured(
                [
                  Number.isFinite(video.duration) ? duration(video.duration) : undefined,
                  video.videoWidth ? `${video.videoWidth} × ${video.videoHeight}` : undefined,
                ]
                  .filter(Boolean)
                  .join(' · '),
              )
            }}
            {...mediaEvents}
          />
        ) : (
          <FileTypeIcon path={file.name} />
        )}
      </div>
    )
  } else if (file.mediaType === 'image') {
    body = (
      <button
        type="button"
        className="delivered__frame delivered__open"
        aria-label={t('chat.delivered.openImage', { name: file.name })}
        onPointerEnter={preloadMediaViewer}
        onFocus={preloadMediaViewer}
        onClick={() => setViewer(true)}
      >
        {failed ? (
          <Unavailable name={file.name} />
        ) : live ? (
          <img
            src={file.url}
            alt=""
            decoding="async"
            draggable={false}
            onLoad={(event) => {
              const image = event.currentTarget
              measure(image.naturalWidth, image.naturalHeight)
              setMeasured(`${image.naturalWidth} × ${image.naturalHeight}`)
            }}
            onError={() => setFailed(true)}
          />
        ) : (
          <FileTypeIcon path={file.name} />
        )}
      </button>
    )
  } else if (file.mediaType === 'audio') {
    body = (
      <>
        <div className="delivered__row">
          <span className="delivered__icon" aria-hidden>
            <FileTypeIcon path={file.name} />
          </span>
          <Meta
            name={file.name}
            path={file.path}
            detail={failed ? t('chat.delivered.unavailable', { name: file.name }) : detail}
            notice={Boolean(failure) || failed}
          />
        </div>
        {/* Under the name, the width of the card: beside it the scrubber had no room. */}
        {live && !failed ? (
          <audio
            className="delivered__player"
            src={file.url}
            aria-label={file.name}
            controls
            preload="metadata"
            {...mediaEvents}
          />
        ) : null}
      </>
    )
  } else {
    body = (
      <button
        type="button"
        className="delivered__row delivered__open"
        aria-label={t('chat.delivered.openPdf', { name: file.name })}
        onClick={() => (openInPanel ?? reveal)()}
      >
        <span className="delivered__icon" aria-hidden>
          <FileTypeIcon path={file.name} />
        </span>
        <Meta name={file.name} path={file.path} detail={detail} notice={Boolean(failure)} />
      </button>
    )
  }

  return (
    <>
      <div
        ref={card}
        className={`delivered__card delivered__card--${file.mediaType}`}
        role="group"
        aria-label={file.name}
        tabIndex={0}
        data-narrow={ratio !== undefined && ratio < 0.8 ? '' : undefined}
        style={ratio === undefined ? undefined : ({ '--delivered-ratio': ratio } as CSSProperties)}
      >
        {body}
        {file.mediaType === 'video' || file.mediaType === 'image' ? (
          <Meta name={file.name} path={file.path} detail={detail} notice={Boolean(failure)} />
        ) : null}
        {viewer ? (
          <LazyMediaViewer
            src={file.url}
            name={file.name}
            mediaType="image"
            onReveal={reveal}
            onClose={() => setViewer(false)}
          />
        ) : null}
      </div>
      {/* After the card, never inside it: the menu finds its target through the ref when it mounts. */}
      <DeliveredFileMenu
        targetRef={card}
        file={file}
        roots={roots}
        onOpenInPanel={openInPanel}
        onReveal={reveal}
        onFailure={setFailure}
      />
    </>
  )
}

function Meta(props: { name: string; path: string; detail: string; notice?: boolean }) {
  return (
    <span className="delivered__meta">
      <span className="delivered__name" title={props.path}>
        {props.name}
      </span>
      <span className="delivered__detail" role={props.notice ? 'status' : undefined}>
        {props.detail}
      </span>
    </span>
  )
}

function Unavailable({ name }: { name: string }) {
  const { t } = useI18n()
  return (
    <span className="delivered__unavailable" role="alert">
      <PhotoOff size={18} aria-hidden />
      {t('chat.delivered.unavailable', { name })}
    </span>
  )
}

/**
 * The right-click menu of a delivered file, from the keyboard too (the menu key or Shift+F10 on
 * the focused card). An action the place cannot do is left out, not disabled. `actionPath` is what
 * the desktop is asked about when it differs from the path shown (an attachment's reference).
 */
export function DeliveredFileMenu(props: {
  targetRef: RefObject<HTMLElement | null>
  file: Pick<DeliveredFile, 'path' | 'name' | 'mediaType' | 'copyable'>
  roots: string[]
  actionPath?: string | undefined
  onOpenInPanel?: (() => void) | undefined
  onReveal?: (() => void) | undefined
  onFailure?: ((failure: Failure) => void) | undefined
}) {
  const { t } = useI18n()
  const { file, roots } = props
  const actionPath = props.actionPath ?? file.path
  const fail = (failure: Failure) => () => props.onFailure?.(failure)
  return (
    <Menu
      contextMenuOnly
      contextMenuTargetRef={props.targetRef}
      drop="down"
      label={t('chat.fileOptions')}
    >
      {(close) => (
        <>
          {file.copyable ? (
            <MenuItem
              title={t(
                file.mediaType === 'image' ? 'chat.delivered.copyImage' : 'chat.delivered.copyFile',
              )}
              icon={<Copy size={14} aria-hidden />}
              onClick={() => {
                void copyDeliveredFile(actionPath, roots).catch(fail('copy'))
                close()
              }}
            />
          ) : null}
          <MenuItem
            title={t('chat.delivered.saveAs')}
            icon={<Download size={14} aria-hidden />}
            onClick={() => {
              void saveDeliveredFile(actionPath, roots).catch(fail('save'))
              close()
            }}
          />
          {canAttachToComposer() ? (
            <MenuItem
              title={t('chat.delivered.attach')}
              icon={<Paperclip size={14} aria-hidden />}
              onClick={() => {
                void attachDeliveredFile(actionPath, roots)
                  .then((attachment) => attachToComposer([attachment]))
                  .catch(fail('attach'))
                close()
              }}
            />
          ) : null}
          <MenuItem
            title={t('workspace.fileMenu.copyPath')}
            icon={<Copy size={14} aria-hidden />}
            onClick={() => {
              void writeClipboardText(file.path).catch(() => undefined)
              close()
            }}
          />
          <MenuItem
            title={t('chat.delivered.copyName')}
            icon={<FileText size={14} aria-hidden />}
            onClick={() => {
              void writeClipboardText(file.name).catch(() => undefined)
              close()
            }}
          />
          {props.onOpenInPanel ? (
            <MenuItem
              title={t('workspace.fileMenu.openInPanel')}
              icon={<PanelRight size={14} aria-hidden />}
              onClick={() => {
                props.onOpenInPanel?.()
                close()
              }}
            />
          ) : null}
          {props.onReveal ? (
            <MenuItem
              title={t(isMacOS() ? 'chat.delivered.showInFinder' : 'chat.delivered.showInExplorer')}
              icon={<FolderOpen size={14} aria-hidden />}
              onClick={() => {
                props.onReveal?.()
                close()
              }}
            />
          ) : null}
        </>
      )}
    </Menu>
  )
}
