import { open } from 'node:fs/promises'
import { inflateRaw } from 'node:zlib'
import { promisify } from 'node:util'

const inflate = promisify(inflateRaw)

/**
 * Just enough of ZIP to unpack a track's WAV versions: the central directory,
 * stored and deflated entries, no encryption, no ZIP64. Entries are read one at a
 * time from the file, so a big archive never sits in memory whole. The names it
 * hands back are file names only: a path inside the archive is never used.
 */

const END_OF_DIRECTORY = 0x06054b50
const DIRECTORY_ENTRY = 0x02014b50
const LOCAL_ENTRY = 0x04034b50
/** The most a single entry may unpack to. */
const MAX_ENTRY_BYTES = 400 * 1024 * 1024
const MAX_ENTRIES = 64

export class ZipError extends Error {}

export type ZipEntry = { name: string; size: number; read: () => Promise<Buffer> }

export async function openZip(
  file: string,
): Promise<{ entries: ZipEntry[]; close: () => Promise<void> }> {
  const handle = await open(file, 'r')
  const close = () => handle.close()
  try {
    const { size } = await handle.stat()
    const tailLength = Math.min(size, 22 + 0xffff)
    const tail = Buffer.alloc(tailLength)
    await handle.read(tail, 0, tailLength, size - tailLength)
    let end = -1
    for (let at = tailLength - 22; at >= 0; at -= 1) {
      if (tail.readUInt32LE(at) === END_OF_DIRECTORY) {
        end = at
        break
      }
    }
    if (end < 0) throw new ZipError('not a zip archive')
    const count = tail.readUInt16LE(end + 10)
    const directorySize = tail.readUInt32LE(end + 12)
    const directoryAt = tail.readUInt32LE(end + 16)
    if (count > MAX_ENTRIES || count === 0xffff || directorySize === 0xffffffff) {
      throw new ZipError('unsupported zip archive')
    }
    if (directoryAt + directorySize > size) throw new ZipError('damaged zip archive')
    const directory = Buffer.alloc(directorySize)
    await handle.read(directory, 0, directorySize, directoryAt)

    const entries: ZipEntry[] = []
    let cursor = 0
    for (let index = 0; index < count; index += 1) {
      if (cursor + 46 > directory.length || directory.readUInt32LE(cursor) !== DIRECTORY_ENTRY) {
        throw new ZipError('damaged zip archive')
      }
      const flags = directory.readUInt16LE(cursor + 8)
      const method = directory.readUInt16LE(cursor + 10)
      const compressed = directory.readUInt32LE(cursor + 20)
      const uncompressed = directory.readUInt32LE(cursor + 24)
      const nameLength = directory.readUInt16LE(cursor + 28)
      const extraLength = directory.readUInt16LE(cursor + 30)
      const commentLength = directory.readUInt16LE(cursor + 32)
      const localAt = directory.readUInt32LE(cursor + 42)
      const rawName = directory.toString('utf8', cursor + 46, cursor + 46 + nameLength)
      cursor += 46 + nameLength + extraLength + commentLength
      if (rawName.endsWith('/')) continue
      const name = rawName.split(/[\\/]/).at(-1) ?? ''
      if (!name || name === '.' || name === '..') continue
      entries.push({
        name,
        size: uncompressed,
        read: async () => {
          if (flags & 1) throw new ZipError('encrypted zip entry')
          if (compressed === 0xffffffff || uncompressed === 0xffffffff) {
            throw new ZipError('unsupported zip archive')
          }
          if (uncompressed > MAX_ENTRY_BYTES) throw new ZipError('zip entry too large')
          const local = Buffer.alloc(30)
          await handle.read(local, 0, 30, localAt)
          if (local.readUInt32LE(0) !== LOCAL_ENTRY) throw new ZipError('damaged zip archive')
          const dataAt = localAt + 30 + local.readUInt16LE(26) + local.readUInt16LE(28)
          if (dataAt + compressed > size) throw new ZipError('damaged zip archive')
          const raw = Buffer.alloc(compressed)
          await handle.read(raw, 0, compressed, dataAt)
          if (method === 0) return raw
          if (method !== 8) throw new ZipError('unsupported zip compression')
          const data = await inflate(raw, { maxOutputLength: uncompressed })
          if (data.length !== uncompressed) throw new ZipError('damaged zip entry')
          return data
        },
      })
    }
    return { entries, close }
  } catch (error) {
    await close()
    throw error
  }
}
