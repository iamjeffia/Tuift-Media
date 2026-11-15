import { lazy, Suspense, useEffect, useState } from 'react'
import {
  IconAlertTriangle as Warning,
  IconMaximize as Maximize,
  IconZoomIn as ZoomIn,
  IconZoomOut as ZoomOut,
} from '@tabler/icons-react'
import { useI18n } from '../../i18n/index.js'
import { previewProjectFile } from '../../bridge.js'
import { FileTypeIcon } from '../FileTypeIcon.js'
import { Skeleton, SkeletonStatus } from '../Skeleton.js'
import { WorkspaceEmptyState } from './WorkspaceEmptyState.js'
import type { FileMediaKind } from './file-viewer-kind.js'

// The full-screen viewer the chat opens its images in, loaded only when asked for.
const MediaViewer = lazy(() =>
  import('../MediaViewer.js').then((module) => ({ default: module.MediaViewer })),
)

type MediaSource = { state: 'loading' } | { state: 'ready'; url: string } | { state: 'unavailable' }

/**
 * The URL the desktop streams a project file from. It keeps the file out of the renderer's
 * memory (a video can be gigabytes) and gives `<video>` the range requests it seeks with.
 */
export function useProjectFileMedia(
  absolutePath: string | undefined,
  projectRoot: string | undefined,
  kind: FileMediaKind,
  revision: number,
): MediaSource {
  const [source, setSource] = useState<MediaSource>({ state: 'loading' })
  useEffect(() => {
    if (!absolutePath || !projectRoot || kind === 'pdf') {
      setSource({ state: 'unavailable' })
      return
    }
    let current = true
    setSource({ state: 'loading' })
    previewProjectFile(absolutePath, projectRoot).then(
      (preview) => {
        if (!current) return
        // The signed URL is the same for a replaced file; the number makes the player ask again.
        setSource(
          preview
            ? { state: 'ready', url: revision > 0 ? `${preview.url}?v=${revision}` : preview.url }
            : { state: 'unavailable' },
        )
      },
      () => {
        if (current) setSource({ state: 'unavailable' })
      },
    )
    return () => {
      current = false
    }
  }, [absolutePath, kind, projectRoot, revision])
  return source
}

/** An image, a video, a sound or a PDF, each in the way that suits it. */
export function MediaFileViewer(props: {
  name: string
  kind: FileMediaKind
  absolutePath: string | undefined
  projectRoot: string | undefined
  revision: number
  onDetail: (detail: string | undefined) => void
  onReveal?: (() => void) | undefined
}) {
  const { t } = useI18n()
  const source = useProjectFileMedia(
    props.absolutePath,
    props.projectRoot,
    props.kind,
    props.revision,
  )

  if (source.state === 'loading') {
    return (
      <SkeletonStatus label={t('workspace.media.opening')} className="workspace-media__loading">
        <Skeleton height="100%" />
      </SkeletonStatus>
    )
  }
  if (source.state === 'unavailable') {
    return (
      <WorkspaceEmptyState
        kind="files"
        title={
          props.kind === 'pdf'
            ? t('workspace.media.pdf.title')
            : t('workspace.media.unavailable.title')
        }
        detail={
          props.kind === 'pdf'
            ? t('workspace.media.pdf.detail', { name: props.name })
            : t('workspace.media.unavailable.detail', { name: props.name })
        }
      >
        {props.onReveal ? (
          <button type="button" className="btn" onClick={props.onReveal}>
            {t('workspace.common.openInExplorer')}
          </button>
        ) : null}
      </WorkspaceEmptyState>
    )
  }
  if (props.kind === 'image')
    return (
      <ImageStage
        url={source.url}
        name={props.name}
        onDetail={props.onDetail}
        onReveal={props.onReveal}
      />
    )
  if (props.kind === 'video')
    return <VideoStage url={source.url} name={props.name} onReveal={props.onReveal} />
  return <AudioStage url={source.url} name={props.name} onReveal={props.onReveal} />
}

function ImageStage(props: {
  url: string
  name: string
  onDetail: (detail: string | undefined) => void
  onReveal?: (() => void) | undefined
}) {
  const { t } = useI18n()
  const [actualSize, setActualSize] = useState(false)
  const [fullView, setFullView] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => () => props.onDetail(undefined), [props.onDetail])

  if (failed) {
    return (
      <MediaFailure
        message={t('workspace.media.image.failed', { name: props.name })}
        onReveal={props.onReveal}
      />
    )
  }
  return (
    <div className="workspace-media workspace-media--image">
      <div className="workspace-media__stage" data-actual-size={actualSize || undefined}>
        <img
          src={props.url}
          alt={props.name}
          decoding="async"
          draggable={false}
          onClick={() => setActualSize((current) => !current)}
          onLoad={(event) =>
            props.onDetail(
              `${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight}`,
            )
          }
          onError={() => setFailed(true)}
        />
      </div>
      <div
        className="workspace-media__tools"
        role="toolbar"
        aria-label={t('workspace.media.image.actions')}
      >
        <button
          type="button"
          className="icon-btn icon-btn--always"
          aria-label={
            actualSize ? t('workspace.media.image.fit') : t('workspace.media.image.actual')
          }
          title={actualSize ? t('workspace.media.image.fit') : t('workspace.media.image.actual')}
          onClick={() => setActualSize((current) => !current)}
        >
          {actualSize ? <ZoomOut size={15} aria-hidden /> : <ZoomIn size={15} aria-hidden />}
        </button>
        <button
          type="button"
          className="icon-btn icon-btn--always"
          aria-label={t('workspace.media.image.fullView')}
          title={t('workspace.media.image.fullView')}
          onClick={() => setFullView(true)}
        >
          <Maximize size={15} aria-hidden />
        </button>
      </div>
      {fullView ? (
        <Suspense fallback={null}>
          <MediaViewer
            src={props.url}
            name={props.name}
            mediaType="image"
            onReveal={props.onReveal}
            onClose={() => setFullView(false)}
          />
        </Suspense>
      ) : null}
    </div>
  )
}

function VideoStage(props: { url: string; name: string; onReveal?: (() => void) | undefined }) {
  const { t } = useI18n()
  const [failed, setFailed] = useState(false)
  if (failed) {
    return <MediaFailure message={t('workspace.media.video.failed')} onReveal={props.onReveal} />
  }
  return (
    <div className="workspace-media workspace-media--video">
      <video
        src={props.url}
        aria-label={props.name}
        controls
        playsInline
        preload="metadata"
        onError={() => setFailed(true)}
      />
    </div>
  )
}

function AudioStage(props: { url: string; name: string; onReveal?: (() => void) | undefined }) {
  const { t } = useI18n()
  const [failed, setFailed] = useState(false)
  if (failed) {
    return <MediaFailure message={t('workspace.media.audio.failed')} onReveal={props.onReveal} />
  }
  return (
    <div className="workspace-media workspace-media--audio">
      <div className="workspace-media__sound">
        <span className="workspace-media__sound-icon" aria-hidden>
          <FileTypeIcon path={props.name} />
        </span>
        <strong title={props.name}>{props.name}</strong>
        <audio
          src={props.url}
          aria-label={props.name}
          controls
          preload="metadata"
          onError={() => setFailed(true)}
        />
      </div>
    </div>
  )
}

function MediaFailure(props: { message: string; onReveal?: (() => void) | undefined }) {
  const { t } = useI18n()
  return (
    <div className="workspace-files__loading" role="alert">
      <Warning size={18} aria-hidden /> {props.message}
      {props.onReveal ? (
        <button type="button" className="workspace-files__reveal" onClick={props.onReveal}>
          {t('workspace.common.openInExplorer')}
        </button>
      ) : null}
    </div>
  )
}
