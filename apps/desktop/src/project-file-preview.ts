import { createHmac, timingSafeEqual } from 'node:crypto'
import path from 'node:path'
import { ATTACHMENT_PREVIEW_SCHEME } from './attachment-preview.js'

/**
 * Signed, read-only URLs for the images, videos, audio and PDFs the Files tab shows: a project
 * file the renderer may not read itself. A PDF is shown by a guest of its own (see
 * pdf-guest.ts), not by the renderer. Same scheme and CSP allowance as attachment previews, a
 * different host and a different signing domain, so a picker URL never opens a project file
 * or the other way round.
 */
export const PROJECT_FILE_PREVIEW_HOST = 'file'

export type ProjectFileMedia = 'image' | 'video' | 'audio' | 'pdf'

type ProjectFilePreview = { path: string; mediaType: ProjectFileMedia; mimeType: string }

const MEDIA_BY_EXTENSION = new Map<string, Omit<ProjectFilePreview, 'path'>>([
  ['.apng', { mediaType: 'image', mimeType: 'image/apng' }],
  ['.avif', { mediaType: 'image', mimeType: 'image/avif' }],
  ['.bmp', { mediaType: 'image', mimeType: 'image/bmp' }],
  ['.gif', { mediaType: 'image', mimeType: 'image/gif' }],
  ['.ico', { mediaType: 'image', mimeType: 'image/x-icon' }],
  ['.jpeg', { mediaType: 'image', mimeType: 'image/jpeg' }],
  ['.jpg', { mediaType: 'image', mimeType: 'image/jpeg' }],
  ['.png', { mediaType: 'image', mimeType: 'image/png' }],
  ['.svg', { mediaType: 'image', mimeType: 'image/svg+xml' }],
  ['.webp', { mediaType: 'image', mimeType: 'image/webp' }],
  ['.m4v', { mediaType: 'video', mimeType: 'video/mp4' }],
  ['.mkv', { mediaType: 'video', mimeType: 'video/x-matroska' }],
  ['.mov', { mediaType: 'video', mimeType: 'video/quicktime' }],
  ['.mp4', { mediaType: 'video', mimeType: 'video/mp4' }],
  ['.ogv', { mediaType: 'video', mimeType: 'video/ogg' }],
  ['.webm', { mediaType: 'video', mimeType: 'video/webm' }],
  ['.aac', { mediaType: 'audio', mimeType: 'audio/aac' }],
  ['.flac', { mediaType: 'audio', mimeType: 'audio/flac' }],
  ['.m4a', { mediaType: 'audio', mimeType: 'audio/mp4' }],
  ['.mp3', { mediaType: 'audio', mimeType: 'audio/mpeg' }],
  ['.oga', { mediaType: 'audio', mimeType: 'audio/ogg' }],
  ['.ogg', { mediaType: 'audio', mimeType: 'audio/ogg' }],
  ['.opus', { mediaType: 'audio', mimeType: 'audio/ogg' }],
  ['.wav', { mediaType: 'audio', mimeType: 'audio/wav' }],
  ['.pdf', { mediaType: 'pdf', mimeType: 'application/pdf' }],
])

function projectFileMedia(filePath: string): ProjectFilePreview | undefined {
  const media = MEDIA_BY_EXTENSION.get(path.extname(filePath).toLowerCase())
  return media ? { path: filePath, ...media } : undefined
}

/** The signed URL and kind for an absolute project file, or undefined for any other type. */
export function projectFilePreview(
  filePath: string,
  secret: Buffer,
): { url: string; mediaType: ProjectFileMedia } | undefined {
  const media = projectFileMedia(filePath)
  if (!media) return undefined
  const encodedPath = Buffer.from(filePath, 'utf8').toString('base64url')
  const signature = sign(encodedPath, secret).toString('base64url')
  return {
    url: `${ATTACHMENT_PREVIEW_SCHEME}://${PROJECT_FILE_PREVIEW_HOST}/${signature}/${encodedPath}`,
    mediaType: media.mediaType,
  }
}

/** True for a URL this module signed for a project PDF. */
export function isProjectPdfUrl(value: string, secret: Buffer): boolean {
  return projectFilePreviewFromUrl(value, secret)?.mediaType === 'pdf'
}

/** Shaped like an attachment preview's `variant`, so the protocol handler serves both alike. */
export function projectFilePreviewFromUrl(
  value: string,
  secret: Buffer,
): (ProjectFilePreview & { variant: 'media' }) | undefined {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return undefined
  }
  if (
    url.protocol !== `${ATTACHMENT_PREVIEW_SCHEME}:` ||
    url.hostname !== PROJECT_FILE_PREVIEW_HOST ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== '' ||
    !(url.search === '' || /^\?v=\d{1,9}$/.test(url.search)) ||
    url.hash !== ''
  ) {
    return undefined
  }

  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length !== 2) return undefined
  const [signature, encodedPath] = parts
  if (!signature || !encodedPath) return undefined

  const actual = Buffer.from(signature, 'base64url')
  const expected = sign(encodedPath, secret)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return undefined

  const filePath = Buffer.from(encodedPath, 'base64url').toString('utf8')
  if (!path.isAbsolute(filePath) || filePath.includes('\0')) return undefined
  const media = projectFileMedia(filePath)
  return media ? { ...media, variant: 'media' } : undefined
}

function sign(encodedPath: string, secret: Buffer): Buffer {
  return createHmac('sha256', secret).update(`project-file\0${encodedPath}`).digest()
}
