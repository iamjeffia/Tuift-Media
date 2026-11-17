import { useEffect, useRef, useState } from 'react'
import {
  IconFile as FileIcon,
  IconFolder as Folder,
  IconMusic as Music,
  IconPlayerPause as Pause,
  IconPlayerPlay as Play,
} from '@tabler/icons-react'
import { resolveDeliveredFiles, revealProjectFile, type DeliveredFile } from '../bridge.js'
import { canShowDeliveredFiles } from '../delivered-files.js'
import { useI18n } from '../i18n/index.js'
import { openProjectFileInPanel, useCanOpenProjectFileInPanel } from '../project-file-open.js'

/**
 * What a sent message shows for each thing attached to it. An image or a video is a tile with a
 * thumbnail (drawn by `ViewedImagePreview` in Thread.tsx); a sound or any other file is the chip
 * of this file.
 */
export type AttachmentKind = 'image' | 'video' | 'audio' | 'file'

const IMAGE_RE = /\.(?:apng|avif|bmp|gif|ico|jpe?g|png|webp)$/i
const VIDEO_RE = /\.(?:avi|m4v|mkv|mov|mp4|mpe?g|ogv|webm)$/i
const AUDIO_RE = /\.(?:aac|aiff?|flac|m4a|mp3|oga|ogg|opus|wav|wma)$/i

export function attachmentKind(reference: string): AttachmentKind {
  if (IMAGE_RE.test(reference) || /^data:image\/(?:png|jpeg|gif|webp|avif);base64,/.test(reference))
    return 'image'
  if (VIDEO_RE.test(reference)) return 'video'
  if (AUDIO_RE.test(reference)) return 'audio'
  return 'file'
}

/** Read when the chip draws, so a page without the desktop shell never reaches for the bridge. */
function canReveal(): boolean {
  return typeof window !== 'undefined' && window.harness?.revealProjectFile !== undefined
}

function nameOf(reference: string): string {
  return reference.split(/[\\/]/).filter(Boolean).at(-1) ?? reference
}

/**
 * The desktop's answer for a path inside the chat's project or the app's own attachment folders,
 * the road a delivered file in a reply takes: a signed URL to play, and the real path. Without
 * the desktop, or when the file is gone, it stays undefined and the chip is only a name.
 */
function useResolvedFile(
  reference: string,
  projectPath: string | undefined,
  wanted: boolean,
): DeliveredFile | undefined {
  const [file, setFile] = useState<DeliveredFile>()
  useEffect(() => {
    if (!wanted || !projectPath || !canShowDeliveredFiles()) return
    let current = true
    void resolveDeliveredFiles([reference], [projectPath])
      .then((files) => {
        if (current) setFile(files[0])
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [reference, projectPath, wanted])
  return file
}

/** A sound or any other file attached to a sent message: its icon and name, and what it can do. */
export function MessageFileChip(props: {
  reference: string
  kind: 'audio' | 'file'
  projectPath: string | undefined
}) {
  const { t } = useI18n()
  const { reference, kind, projectPath } = props
  const name = nameOf(reference)
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const pdf = kind === 'file' && /\.pdf$/i.test(reference)
  const file = useResolvedFile(reference, projectPath, kind === 'audio' || pdf)
  const inPanel = useCanOpenProjectFileInPanel()

  const Icon = kind === 'audio' ? Music : /[\\/]$/.test(reference) ? Folder : FileIcon
  const label = (
    <>
      <Icon size={14} aria-hidden />
      <span className="said__chip-name">{name}</span>
    </>
  )

  if (kind === 'audio') {
    return (
      <span className="said__chip said__chip--audio" title={name}>
        {label}
        {file ? (
          <>
            <button
              type="button"
              className="said__chip-play"
              aria-label={t(playing ? 'chat.said.pause' : 'chat.said.play', { name })}
              aria-pressed={playing}
              onClick={() => {
                const element = audio.current
                if (!element) return
                if (element.paused) void element.play().catch(() => setPlaying(false))
                else element.pause()
              }}
            >
              {playing ? <Pause size={12} aria-hidden /> : <Play size={12} aria-hidden />}
            </button>
            <audio
              ref={audio}
              src={file.url}
              preload="none"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onError={() => setPlaying(false)}
            />
          </>
        ) : null}
      </span>
    )
  }

  // What a delivered file's card does on click: a PDF opens in the side panel when it can, any
  // other file is shown in its folder. Outside the desktop shell there is nothing to ask.
  const open =
    pdf && inPanel && file && projectPath
      ? () => void openProjectFileInPanel({ path: file.path, projectPath })
      : canReveal() && projectPath
        ? () => void revealProjectFile(file?.path ?? reference, projectPath).catch(() => undefined)
        : undefined
  return open ? (
    <button
      type="button"
      className="said__chip said__chip--file said__chip--action"
      title={name}
      aria-label={t('chat.said.show', { name })}
      onClick={open}
    >
      {label}
    </button>
  ) : (
    <span className="said__chip said__chip--file" title={name}>
      {label}
    </span>
  )
}
