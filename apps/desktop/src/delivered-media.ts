import { execFile } from 'node:child_process'
import { copyFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { projectFilePath } from './project-file-path.js'
import { projectFilePreview, type ProjectFileMedia } from './project-file-preview.js'
import { viewedImagePath, type PickedImagePaths } from './viewed-image-path.js'

/**
 * Media a reply names by path, shown as a card in the chat. The reply's text comes from a model,
 * so a path in it is only a claim: it is resolved here, inside the chat's project or the app's own
 * attachment folders, and only then does it get a signed, read-only URL. Anything else comes
 * back absent, and the chat leaves the text as it was.
 */
const DELIVERED_EXTENSIONS: ReadonlySet<string> = new Set([
  '.mp4',
  '.webm',
  '.mov',
  '.m4v',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.avif',
  '.bmp',
  '.apng',
  '.mp3',
  '.wav',
  '.flac',
  '.m4a',
  '.ogg',
  '.pdf',
])

const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.avif',
  '.bmp',
  '.apng',
])
export const MAX_DELIVERED_CANDIDATES = 40
const MAX_CANDIDATE_LENGTH = 1024
const MAX_ROOTS = 8
const MAX_CLIPBOARD_IMAGE_BYTES = 64 * 1024 * 1024
// Windows opens these names as devices whatever the folder or extension.
const DEVICE_NAME = /^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])$/i

export type DeliveredFile = {
  path: string
  name: string
  size: number
  mediaType: ProjectFileMedia
  url: string
  /** Whether "Copy" can put this file on the clipboard here: an image anywhere, other files on Windows. */
  copyable: boolean
}

/** Where a delivered file may live besides the chat's project: what the person attached. */
export type DeliveredScope = {
  attachmentFolders: readonly string[]
  grants: PickedImagePaths
}

function candidateText(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_CANDIDATE_LENGTH) {
    return undefined
  }
  // Control characters, the characters Windows forbids in a name, and a stream suffix
  // (`file.txt:stream.mp4`) after the drive letter.
  const hasControl = Array.from(value).some((character) => character.charCodeAt(0) < 32)
  if (hasControl || /[<>"|?*]/.test(value) || value.indexOf(':', 2) !== -1) return undefined
  if (!DELIVERED_EXTENSIONS.has(path.extname(value).toLowerCase())) return undefined
  const name = value.split(/[\\/]/).at(-1) ?? ''
  if (DEVICE_NAME.test(name.split('.')[0] ?? '')) return undefined
  return value
}

function rootList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((root): root is string => typeof root === 'string' && root.length <= 4096)
    .slice(0, MAX_ROOTS)
}

/** The real path of a delivered file, or undefined when it is not one the chat may show. */
export async function confineDeliveredFile(
  candidateValue: unknown,
  rootsValue: unknown,
  scope: DeliveredScope,
): Promise<string | undefined> {
  const candidate = candidateText(candidateValue)
  if (!candidate) return undefined
  const absolute = path.win32.isAbsolute(candidate) || path.posix.isAbsolute(candidate)
  for (const root of rootList(rootsValue)) {
    const flavor = /^[a-z]:[\\/]/i.test(root) ? path.win32 : path.posix
    try {
      const file = await projectFilePath(absolute ? candidate : flavor.join(root, candidate), root)
      if ((await stat(file)).isFile()) return file
    } catch {
      // Outside this root, missing, or not a file: try the next one.
    }
  }
  const attached = await viewedImagePath(candidate, scope.attachmentFolders, scope.grants)
  return attached && DELIVERED_EXTENSIONS.has(path.extname(attached).toLowerCase())
    ? attached
    : undefined
}

/** Every candidate the chat may show, in the order the reply named them. */
export async function resolveDeliveredFiles(
  candidatesValue: unknown,
  rootsValue: unknown,
  scope: DeliveredScope,
  secret: Buffer,
  platform: NodeJS.Platform = process.platform,
): Promise<DeliveredFile[]> {
  if (!Array.isArray(candidatesValue)) return []
  const resolved = await Promise.all(
    candidatesValue
      .slice(0, MAX_DELIVERED_CANDIDATES)
      .map((candidate) => confineDeliveredFile(candidate, rootsValue, scope)),
  )
  const seen = new Set<string>()
  const files: DeliveredFile[] = []
  for (const file of resolved) {
    if (!file || seen.has(file)) continue
    seen.add(file)
    const preview = projectFilePreview(file, secret)
    if (!preview) continue
    let size: number
    try {
      size = (await stat(file)).size
    } catch {
      continue
    }
    files.push({
      path: file,
      name: path.basename(file),
      size,
      mediaType: preview.mediaType,
      url: preview.url,
      copyable: preview.mediaType === 'image' || platform === 'win32',
    })
  }
  return files
}

/** Copies the file to a place the person chooses in the native dialog; undefined when they cancel. */
export async function saveDeliveredFileAs(
  file: string,
  chooseDestination: (defaultName: string) => Promise<string | undefined>,
): Promise<string | undefined> {
  const destination = await chooseDestination(path.basename(file))
  if (!destination) return undefined
  if (path.resolve(destination).toLowerCase() !== path.resolve(file).toLowerCase()) {
    await copyFile(file, destination)
  }
  return destination
}

type ClipboardTools = {
  writeImage: (file: string) => void
  /** Puts a file, as a file, on the clipboard. Only Windows has a way. */
  writeFile: (file: string) => Promise<void>
}

/** An image goes on the clipboard as an image, any other file as a file. */
export async function copyDeliveredFile(
  file: string,
  tools: ClipboardTools,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  if (IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase())) {
    if ((await stat(file)).size > MAX_CLIPBOARD_IMAGE_BYTES) throw new Error('Image too large')
    tools.writeImage(file)
    return
  }
  if (platform !== 'win32') throw new Error('Copying a file is not available here')
  await tools.writeFile(file)
}

/** The path travels in the environment, never in the command text. */
export function copyFileToWindowsClipboard(file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Set-Clipboard -LiteralPath $env:TUIFT_COPY_FILE',
      ],
      { env: { ...process.env, TUIFT_COPY_FILE: file }, windowsHide: true, timeout: 15_000 },
      (error) => (error ? reject(error) : resolve()),
    )
  })
}
