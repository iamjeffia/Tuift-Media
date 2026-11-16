import { createHash } from 'node:crypto'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { inside } from './skill-install.js'

/**
 * Where a third-party skill comes from: one commit of the author's repository,
 * and the facts the download must match before anything is unpacked.
 */
export type ArchiveSource = {
  /** The code host that serves archives, as a bare host name. */
  host: string
  /** `owner/name` on that host. */
  repository: string
  /** The full 40-character commit. */
  commit: string
  /** The skill's folder inside the repository, with `/` separators and no edge slashes. */
  path: string
  archiveSha256: string
  /** The exact size of the gzip archive; it is also the most the download may read. */
  archiveBytes: number
}

/** Which hosts and scheme a download may use. Production allows only GitHub over https. */
export type DownloadPolicy = {
  protocol: 'https:' | 'http:'
  hosts: ReadonlySet<string>
  timeoutMs: number
}

export const DEFAULT_DOWNLOAD_POLICY: DownloadPolicy = {
  protocol: 'https:',
  hosts: new Set(['codeload.github.com']),
  timeoutMs: 180_000,
}

/** Even a manifest cannot ask for more than this much to be downloaded. */
const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024
/** Gzip bombs stop here, whatever the archive claims. */
const MAX_UNPACKED_BYTES = 384 * 1024 * 1024
/** One skill is text and a few images; far more than that is not a skill. */
const MAX_SKILL_BYTES = 64 * 1024 * 1024
const MAX_SKILL_FILES = 2_000

const REPOSITORY = /^[\w.-]+\/[\w.-]+$/
const COMMIT = /^[0-9a-f]{40}$/
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

/** The archive's URL, or an error when the source is not one this policy may fetch. */
export function archiveUrl(source: ArchiveSource, policy: DownloadPolicy): URL {
  if (!policy.hosts.has(source.host)) {
    throw new Error(`"${source.host}" is not a code host TUIFT Code downloads skills from`)
  }
  if (!REPOSITORY.test(source.repository) || !COMMIT.test(source.commit)) {
    throw new Error('The skill source names an invalid repository or commit')
  }
  const url = new URL(
    `${policy.protocol}//${source.host}/${source.repository}/tar.gz/${source.commit}`,
  )
  if (url.protocol !== policy.protocol || !policy.hosts.has(url.host)) {
    throw new Error(`"${source.host}" is not a code host TUIFT Code downloads skills from`)
  }
  return url
}

/**
 * Downloads the archive of the pinned commit and checks its SHA-256. A redirect
 * is an error, never followed: the manifest names the one host the bytes may
 * come from. The download stops at the size the manifest declares and at the
 * policy's time limit.
 */
export async function downloadArchive(
  source: ArchiveSource,
  policy: DownloadPolicy = DEFAULT_DOWNLOAD_POLICY,
): Promise<Buffer> {
  const url = archiveUrl(source, policy)
  const limit = Math.min(source.archiveBytes, MAX_ARCHIVE_BYTES)
  const tooLarge = new Error('The download is larger than the size TUIFT Code expects')
  let response: Response
  try {
    response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(policy.timeoutMs),
      headers: { accept: 'application/gzip, application/octet-stream' },
    })
  } catch (error) {
    throw downloadFailure(error)
  }
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel()
    throw new Error('The code host answered with a redirect, which TUIFT Code does not follow')
  }
  if (response.status !== 200) {
    await response.body?.cancel()
    throw new Error(`The code host answered ${response.status} for the skill archive`)
  }
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) {
    await response.body?.cancel()
    throw tooLarge
  }
  if (!response.body) throw new Error('The code host sent an empty answer')

  const chunks: Uint8Array[] = []
  let total = 0
  try {
    const reader = response.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > limit) {
        await reader.cancel()
        throw tooLarge
      }
      chunks.push(value)
    }
  } catch (error) {
    if (error === tooLarge) throw error
    throw downloadFailure(error)
  }
  const archive = Buffer.concat(chunks, total)
  const digest = createHash('sha256').update(archive).digest('hex')
  if (digest !== source.archiveSha256) {
    throw new Error(
      'The download does not match the checksum pinned in TUIFT Code, so it was discarded',
    )
  }
  return archive
}

function downloadFailure(error: unknown): Error {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return new Error('The download took too long and was stopped')
  }
  return new Error(
    `Could not download the skill: ${error instanceof Error ? error.message : String(error)}`,
  )
}

type TarEntry = { name: string; type: string; body: Buffer }

/**
 * Reads a tar archive (ustar with pax or GNU long names, as GitHub writes them)
 * entry by entry. Nothing is written here; the caller decides what to keep.
 */
export function* tarEntries(archive: Buffer): Generator<TarEntry> {
  let offset = 0
  let longName: string | undefined
  let paxPath: string | undefined
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) return
    const field = (start: number, length: number): string => {
      const raw = header.subarray(start, start + length)
      const end = raw.indexOf(0)
      return raw.subarray(0, end === -1 ? length : end).toString('utf8')
    }
    const size = Number.parseInt(field(124, 12).trim() || '0', 8)
    if (!Number.isFinite(size) || size < 0) throw new Error('The skill archive is damaged')
    const type = field(156, 1) || '0'
    const prefix = field(257, 6).startsWith('ustar') ? field(345, 155) : ''
    const body = archive.subarray(offset + 512, offset + 512 + size)
    if (body.length !== size) throw new Error('The skill archive is truncated')
    offset += 512 + Math.ceil(size / 512) * 512
    if (type === 'g') continue
    if (type === 'x') {
      paxPath = paxRecords(body).get('path')
      continue
    }
    if (type === 'L') {
      longName = body.toString('utf8').replace(/\0+$/, '')
      continue
    }
    const name = paxPath ?? longName ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100))
    paxPath = undefined
    longName = undefined
    yield { name, type, body }
  }
}

function paxRecords(body: Buffer): Map<string, string> {
  const records = new Map<string, string>()
  const text = body.toString('utf8')
  let at = 0
  while (at < text.length) {
    const space = text.indexOf(' ', at)
    if (space === -1) break
    const length = Number.parseInt(text.slice(at, space), 10)
    if (!Number.isFinite(length) || length <= 0) break
    const record = text.slice(space + 1, at + length - 1)
    const equals = record.indexOf('=')
    if (equals > 0) records.set(record.slice(0, equals), record.slice(equals + 1))
    at += length
  }
  return records
}

/** The segments of a path inside a skill, or an error for anything that could leave its folder. */
function confinedSegments(relative: string): string[] {
  const segments = relative.split('/')
  const unsafe = segments.some(
    (segment) =>
      segment === '' ||
      segment === '.' ||
      segment === '..' ||
      // Not a separator on POSIX, one on Windows; a drive letter or a data stream needs a colon.
      /[\\:\0]/.test(segment) ||
      WINDOWS_RESERVED.test(segment) ||
      /[. ]$/.test(segment),
  )
  if (unsafe) throw new Error(`The skill archive holds a path that is not allowed: ${relative}`)
  return segments
}

/**
 * Writes the files of one skill folder from the gzip archive into `destination`
 * (a new, empty folder). Only that folder is read out of the archive. Every
 * path is confined to `destination`; a link anywhere inside the skill, a path
 * that climbs out, a drive letter, a repeated file, too many files or too many
 * bytes refuses the whole skill. Nothing in the archive is run.
 */
export async function unpackSkill(
  archive: Buffer,
  skillPath: string,
  destination: string,
): Promise<{ files: number; bytes: number }> {
  let raw: Buffer
  try {
    raw = gunzipSync(archive, { maxOutputLength: MAX_UNPACKED_BYTES })
  } catch {
    throw new Error('The skill archive could not be unpacked, or it is larger than allowed')
  }
  const base = skillPath.replace(/^\/+|\/+$/g, '')
  if (!base) throw new Error('The skill source names no folder')
  let files = 0
  let bytes = 0
  await mkdir(destination, { recursive: true })
  for (const entry of tarEntries(raw)) {
    const slash = entry.name.indexOf('/')
    // Entries are `<repository>-<commit>/<path in the repository>`.
    if (slash <= 0) continue
    const inRepository = entry.name.slice(slash + 1).replace(/\/+$/, '')
    if (inRepository !== base && !inRepository.startsWith(`${base}/`)) continue
    if (entry.type === '5') continue
    if (entry.type !== '0' && entry.type !== '7') {
      throw new Error(
        `The skill archive holds a link or a special file, which is not allowed: ${inRepository}`,
      )
    }
    const segments = confinedSegments(inRepository.slice(base.length + 1))
    files += 1
    bytes += entry.body.length
    if (files > MAX_SKILL_FILES || bytes > MAX_SKILL_BYTES) {
      throw new Error('The skill is larger than TUIFT Code accepts')
    }
    const target = path.join(destination, ...segments)
    if (!inside(destination, target)) {
      throw new Error(`The skill archive holds a path that is not allowed: ${inRepository}`)
    }
    await mkdir(path.dirname(target), { recursive: true })
    // `wx`: a second entry for the same file is refused instead of overwriting the first.
    await writeFile(target, entry.body, { flag: 'wx' })
  }
  const skillFile = await stat(path.join(destination, 'SKILL.md')).catch(() => undefined)
  if (!skillFile?.isFile()) {
    throw new Error(`The folder "${base}" with a SKILL.md was not found in the archive`)
  }
  return { files, bytes }
}
