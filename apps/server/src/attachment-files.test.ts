import { randomBytes } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DomainEvent } from '@harness/contracts'
import { DatabaseSync } from './sqlite.js'
import { Store } from './store.js'
import { AttachmentFiles } from './attachment-files.js'

const THREAD = 'external:claude-code:synthetic'
const OTHER = 'external:claude-code:other'

let folder: string
let store: Store
const files = () => path.join(folder, 'pasted-files')

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'attachments-'))
  store = open()
})

afterEach(() => {
  store.close()
  rmSync(folder, { recursive: true, force: true })
})

function open(): Store {
  const opened = new Store(path.join(folder, 'tastecode.db'))
  opened.addProject('/repo')
  for (const id of [THREAD, OTHER])
    if (!opened.thread(id))
      opened.addThread({ id, projectPath: '/repo', provider: 'claude-code', title: 'Synthetic' })
  return opened
}

/** A made-up PNG: the real signature and IHDR size fields, then random bytes. */
function png(width: number, height: number, size: number): Buffer {
  const head = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head)
  head.write('IHDR', 12, 'latin1')
  head.writeUInt32BE(width, 16)
  head.writeUInt32BE(height, 20)
  return Buffer.concat([head, randomBytes(size - 24)])
}

const inline = (bytes: Buffer) => `data:image/png;base64,${bytes.toString('base64')}`

function toolCall(id: string, ...attachments: string[]): DomainEvent {
  return {
    type: 'item.completed',
    item: {
      id,
      turnId: 'turn-1',
      type: 'tool_call',
      status: 'completed',
      text: 'Read',
      attachments,
      createdAt: 1,
    },
  }
}

function items(threadId = THREAD) {
  return store
    .history(threadId)
    .flatMap(({ event }) => (event.type === 'item.completed' ? [event.item] : []))
}

function storedPayloadBytes(): number {
  const db = new DatabaseSync(path.join(folder, 'tastecode.db'))
  try {
    const row = db.prepare('SELECT COALESCE(SUM(LENGTH(payload)), 0) AS bytes FROM events').get()
    return Number(row?.['bytes'])
  } finally {
    db.close()
  }
}

describe('attachment files', () => {
  it('stores a picture once, by content, and names its type and size', () => {
    const attachments = new AttachmentFiles(files())
    const bytes = png(640, 360, 4096)

    const first = attachments.save(bytes, 'image/png')
    const second = attachments.save(bytes, 'application/octet-stream')

    expect(second.path).toBe(first.path)
    expect(path.basename(first.path)).toMatch(/^[0-9a-f]{64}\.png$/)
    expect(readFileSync(first.path).equals(bytes)).toBe(true)
    expect(first.info).toEqual({ mediaType: 'image/png', bytes: 4096, width: 640, height: 360 })
    expect(readdirSync(files())).toHaveLength(1)
  })

  it('leaves out a size the header does not state properly', () => {
    const { info } = new AttachmentFiles(files()).save(png(0, 0, 100), 'image/png')

    expect(info).toEqual({ mediaType: 'image/png', bytes: 100 })
  })

  it('leaves an attachment inline when its file cannot be written', () => {
    // A file where the folder should be: nothing can be created under it.
    writeFileSync(files(), 'not a folder')
    const attachments = new AttachmentFiles(files())
    const value = inline(png(10, 10, 100))

    const { event, hashes } = attachments.externalize(toolCall('call', value))

    expect(hashes).toEqual([])
    expect(event.type === 'item.completed' && event.item.attachments).toEqual([value])
  })
})

describe('a saved transcript with pictures', () => {
  it('keeps them as files and the event as a path', () => {
    const picture = png(800, 600, 50_000)
    const value = inline(picture)

    store.mergeProviderHistory(THREAD, 'one', [
      { key: 'a', event: toolCall('read-1', value) },
      { key: 'b', event: toolCall('read-2', value, inline(png(2, 2, 200))) },
    ])

    const [first, second] = items()
    const [file] = first!.attachments!
    expect(path.dirname(file!)).toBe(files())
    expect(readFileSync(file!).equals(picture)).toBe(true)
    expect(first!.attachmentInfo![file!]).toMatchObject({ width: 800, height: 600 })
    expect(second!.attachments).toHaveLength(2)
    expect(second!.attachments![0]).toBe(file)
    // One file per picture, not per mention.
    expect(readdirSync(files())).toHaveLength(2)
    expect(storedPayloadBytes()).toBeLessThan(5_000)
  })

  it('is not rewritten when the provider file is read again', () => {
    const chat = [{ key: 'a', event: toolCall('read-1', inline(png(8, 8, 3000))) }]
    store.mergeProviderHistory(THREAD, 'one', chat)
    const seqs = store.history(THREAD).map(({ seq }) => seq)

    expect(store.mergeProviderHistory(THREAD, 'two', chat)).toBe(false)
    expect(store.history(THREAD).map(({ seq }) => seq)).toEqual(seqs)
  })

  it('still reads a chat whose file went missing', () => {
    store.mergeProviderHistory(THREAD, 'one', [
      { key: 'a', event: toolCall('read-1', inline(png(8, 8, 3000))) },
    ])
    const [file] = items()[0]!.attachments!
    rmSync(file!)

    expect(items()[0]!.attachments).toEqual([file])
  })

  it('moves the pictures old events carry inline, once, when the chat is opened', () => {
    const picture = png(300, 200, 60_000)
    // What an older version saved: the picture inside the event.
    store.append(THREAD, toolCall('old-1', inline(picture)))
    store.append(THREAD, toolCall('old-2', 'C:\\Users\\someone\\shot.png'))
    expect(storedPayloadBytes()).toBeGreaterThan(60_000)

    expect(store.externalizeEmbeddedAttachments(THREAD)).toBe(1)

    expect(storedPayloadBytes()).toBeLessThan(2_000)
    const [moved, untouched] = items()
    expect(readFileSync(moved!.attachments![0]!).equals(picture)).toBe(true)
    expect(untouched!.attachments).toEqual(['C:\\Users\\someone\\shot.png'])
    // Opened again in this run: nothing left to look at.
    expect(store.externalizeEmbeddedAttachments(THREAD)).toBe(0)
  })

  it('never loses an inline picture when its file cannot be written', () => {
    const value = inline(png(300, 200, 5_000))
    store.append(THREAD, toolCall('old-1', value))
    writeFileSync(files(), 'not a folder')

    expect(store.externalizeEmbeddedAttachments(THREAD)).toBe(0)

    expect(items()[0]!.attachments).toEqual([value])
  })

  it('removes the files of a deleted chat unless another chat names them', () => {
    const shared = inline(png(4, 4, 500))
    const own = inline(png(5, 5, 500))
    store.mergeProviderHistory(THREAD, 'one', [{ key: 'a', event: toolCall('r', shared, own) }])
    store.mergeProviderHistory(OTHER, 'one', [{ key: 'a', event: toolCall('r', shared) }])
    const [sharedFile, ownFile] = items()[0]!.attachments!

    store.deleteThread(THREAD)

    expect(existsSync(ownFile!)).toBe(false)
    expect(existsSync(sharedFile!)).toBe(true)
    store.deleteThread(OTHER)
    expect(existsSync(sharedFile!)).toBe(false)
  })

  it('leaves a picture the user attached alone', () => {
    const mine = path.join(files(), 'pasted-image.png')
    mkdirSync(files(), { recursive: true })
    writeFileSync(mine, 'x')
    store.append(THREAD, toolCall('mine', mine))

    store.deleteThread(THREAD)

    expect(existsSync(mine)).toBe(true)
  })
})

describe('a chat with many large pictures', () => {
  it('keeps the log and what a client is sent small however many there are', () => {
    // 60 screenshots of 400 KB each, 24 MB in all, as a saved Claude Code transcript holds them.
    const chat = Array.from({ length: 60 }, (_, index) => ({
      key: `read-${index}`,
      event: toolCall(`read-${index}`, inline(png(1920, 1080, 400_000))),
    }))

    store.mergeProviderHistory(THREAD, 'one', chat)

    const sent = JSON.stringify(store.history(THREAD))
    expect(sent.length).toBeLessThan(60 * 600)
    expect(storedPayloadBytes()).toBeLessThan(60 * 600)
    expect(readdirSync(files())).toHaveLength(60)
  })
})
