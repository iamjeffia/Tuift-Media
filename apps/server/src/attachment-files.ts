import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { DomainEvent, Item } from '@harness/contracts'

type AttachmentInfo = NonNullable<Item['attachmentInfo']>[string]

const INLINE = /^data:([^;,]+);base64,/i

/** The sniffed or declared type's file extension: the preview classifies a file by it. */
const EXTENSIONS = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/gif', '.gif'],
  ['image/webp', '.webp'],
  ['image/avif', '.avif'],
  ['application/pdf', '.pdf'],
])

type SavedAttachment = { path: string; hash: string; info: AttachmentInfo }
type Externalized<E> = { event: E; hashes: string[] }

function sniff(bytes: Buffer, declared: string): string {
  if (bytes.length > 8 && bytes.readUInt32BE(0) === 0x89504e47) return 'image/png'
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg'
  if (bytes.length > 6 && bytes.toString('latin1', 0, 4) === 'GIF8') return 'image/gif'
  if (bytes.length > 12 && bytes.toString('latin1', 8, 12) === 'WEBP') return 'image/webp'
  return declared
}

/** Dimensions of a PNG or JPEG, which state them near the start; undefined for the rest. */
function dimensions(
  bytes: Buffer,
  mediaType: string,
): { width: number; height: number } | undefined {
  if (mediaType === 'image/png' && bytes.length >= 24)
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
  if (mediaType !== 'image/jpeg') return undefined
  for (let at = 2; at + 9 <= bytes.length;) {
    if (bytes[at] !== 0xff) return undefined
    const marker = bytes[at + 1]!
    if (marker === 0xff) {
      at += 1
      continue
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
      return { width: bytes.readUInt16BE(at + 7), height: bytes.readUInt16BE(at + 5) }
    at += 2 + bytes.readUInt16BE(at + 2)
  }
  return undefined
}

/** The size the schema accepts: a header that states a zero (or a lie) is left out. */
function positive(size: { width: number; height: number } | undefined) {
  return size && size.width > 0 && size.height > 0 && size.width < 2 ** 31 && size.height < 2 ** 31
    ? size
    : undefined
}

/**
 * Files an item's inline attachments live in, instead of the event log. Content-addressed
 * (`<sha256>.<ext>`), so one picture an agent read twenty times is one file. They sit in the
 * folder pasted attachments use, which the desktop already previews from by file name.
 */
export class AttachmentFiles {
  readonly directory: string

  constructor(directory: string) {
    this.directory = directory
  }

  /** Writes the bytes unless the file is already there, whole. Throws when it cannot. */
  save(bytes: Buffer, declaredType: string): SavedAttachment {
    const mediaType = sniff(bytes, declaredType.toLowerCase())
    const hash = createHash('sha256').update(bytes).digest('hex')
    const file = path.join(this.directory, `${hash}${EXTENSIONS.get(mediaType) ?? '.bin'}`)
    if (!(existsSync(file) && statSync(file).size === bytes.length)) {
      mkdirSync(this.directory, { recursive: true, mode: 0o700 })
      const partial = `${file}.${process.pid}.part`
      writeFileSync(partial, bytes, { mode: 0o600 })
      renameSync(partial, file)
      if (statSync(file).size !== bytes.length) throw new Error('attachment file was not written')
    }
    return {
      path: file,
      hash,
      info: { mediaType, bytes: bytes.length, ...positive(dimensions(bytes, mediaType)) },
    }
  }

  /** Every file named `<hash>.*` is removed; a file that is already gone is fine. */
  remove(hash: string): void {
    for (const extension of [...new Set(EXTENSIONS.values()), '.bin'])
      rmSync(path.join(this.directory, `${hash}${extension}`), { force: true })
  }

  /**
   * The event with each inline (`data:`) attachment replaced by the path of its file, and the
   * hashes of the files it now names. An attachment that cannot be written stays inline, so a
   * failure never loses an image. Returns the same event when there is nothing inline.
   */
  externalize<E extends DomainEvent>(event: E): Externalized<E> {
    if (event.type !== 'item.started' && event.type !== 'item.completed')
      return { event, hashes: [] }
    const item = event.item
    if (!item.attachments?.some((value) => INLINE.test(value))) return { event, hashes: [] }
    const hashes: string[] = []
    const info: NonNullable<Item['attachmentInfo']> = { ...item.attachmentInfo }
    const attachments = item.attachments.map((value) => {
      const type = INLINE.exec(value)?.[1]
      if (type === undefined) return value
      try {
        const saved = this.save(Buffer.from(value.slice(value.indexOf(',') + 1), 'base64'), type)
        hashes.push(saved.hash)
        info[saved.path] = saved.info
        return saved.path
      } catch {
        return value
      }
    })
    const named = Object.keys(info).length > 0 ? { attachmentInfo: info } : {}
    return { event: { ...event, item: { ...item, attachments, ...named } }, hashes }
  }
}

/** Whether an event still carries an inline attachment. */
export function hasInlineAttachment(event: DomainEvent): boolean {
  return (
    (event.type === 'item.started' || event.type === 'item.completed') &&
    (event.item.attachments?.some((value) => INLINE.test(value)) ?? false)
  )
}
