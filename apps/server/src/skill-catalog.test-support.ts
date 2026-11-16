import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { gzipSync } from 'node:zlib'
import type { ArchiveSource, DownloadPolicy } from './skill-download.js'

export type TarItem = {
  name: string
  body?: string
  /** `0` file, `5` folder, `2` symbolic link, `1` hard link. */
  type?: '0' | '5' | '2' | '1'
  linkName?: string
  /** Written as a pax `path` record instead of the header's 100-byte name field. */
  pax?: boolean
}

function octal(value: number, length: number): string {
  return `${value.toString(8).padStart(length - 1, '0')}\0`
}

function header(name: string, size: number, type: string, linkName: string): Buffer {
  const block = Buffer.alloc(512)
  block.write(name, 0, 100, 'utf8')
  block.write('0000644\0', 100)
  block.write('0000000\0', 108)
  block.write('0000000\0', 116)
  block.write(octal(size, 12), 124)
  block.write(octal(0, 12), 136)
  block.write('        ', 148)
  block.write(type, 156)
  block.write(linkName, 157, 100, 'utf8')
  block.write('ustar\0', 257)
  block.write('00', 263)
  let sum = 0
  for (const byte of block) sum += byte
  block.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
  return block
}

function padded(body: Buffer): Buffer {
  return Buffer.concat([body, Buffer.alloc((512 - (body.length % 512)) % 512)])
}

/** A tar archive the way GitHub writes one: a global pax header, then `<repo>-<commit>/` entries. */
export function tar(items: TarItem[]): Buffer {
  const blocks: Buffer[] = []
  for (const item of items) {
    const body = Buffer.from(item.body ?? '')
    const type = item.type ?? '0'
    if (item.pax) {
      const rest = ` path=${item.name}\n`
      let length = rest.length + 1
      while (String(length).length + rest.length !== length) {
        length = String(length).length + rest.length
      }
      const pax = Buffer.from(`${length}${rest}`)
      blocks.push(header('PaxHeader', pax.length, 'x', ''), padded(pax))
    }
    const size = type === '0' ? body.length : 0
    blocks.push(
      header(item.pax ? 'truncated' : item.name, size, type, item.linkName ?? ''),
      padded(type === '0' ? body : Buffer.alloc(0)),
    )
  }
  blocks.push(Buffer.alloc(1024))
  return Buffer.concat(blocks)
}

export function tarGz(items: TarItem[]): Buffer {
  return gzipSync(tar(items))
}

export const COMMIT_A = 'a'.repeat(40)
export const COMMIT_B = 'b'.repeat(40)

/** The entries of one repository at one commit holding the named skill folders. */
export function repositoryArchive(
  commit: string,
  skills: Record<string, Record<string, string>>,
  extra: TarItem[] = [],
): Buffer {
  const top = `owner-repo-${commit}`
  return tarGz([
    { name: 'pax_global_header', type: '5' },
    { name: `${top}/`, type: '5' },
    { name: `${top}/README.md`, body: 'repository readme' },
    ...Object.entries(skills).flatMap(([skill, files]) => [
      { name: `${top}/skills/${skill}/`, type: '5' as const },
      ...Object.entries(files).map(([file, body]) => ({
        name: `${top}/skills/${skill}/${file}`,
        body,
      })),
    ]),
    ...extra.map((item) => ({ ...item, name: `${top}/${item.name}` })),
  ])
}

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

export type Reply = { status: number; body?: Buffer; headers?: Record<string, string> } | 'hang'

export type TestHost = {
  /** `127.0.0.1:<port>`, what the manifest names as the host in a test. */
  host: string
  policy: DownloadPolicy
  /** Serve this reply for the archive of the commit; a later call replaces it. */
  serve: (commit: string, reply: Reply) => void
  hits: () => string[]
  close: () => Promise<void>
}

/** A local code host that answers the archive path `/owner/repo/tar.gz/<commit>`. */
export async function startHost(timeoutMs = 5_000): Promise<TestHost> {
  const replies = new Map<string, Reply>()
  const hits: string[] = []
  const hanging: Array<() => void> = []
  const server: Server = createServer((request, response) => {
    hits.push(request.url ?? '')
    const commit = (request.url ?? '').split('/').pop() ?? ''
    const reply = replies.get(commit)
    if (!reply) {
      response.writeHead(404).end()
    } else if (reply === 'hang') {
      hanging.push(() => response.destroy())
    } else {
      response.writeHead(reply.status, reply.headers ?? {})
      response.end(reply.body)
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const host = `127.0.0.1:${(server.address() as AddressInfo).port}`
  return {
    host,
    policy: { protocol: 'http:', hosts: new Set([host]), timeoutMs },
    serve: (commit, reply) => void replies.set(commit, reply),
    hits: () => hits,
    close: () =>
      new Promise<void>((resolve) => {
        for (const release of hanging) release()
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}

export function sourceFor(
  host: string,
  commit: string,
  archive: Buffer,
  skillPath: string,
): ArchiveSource {
  return {
    host,
    repository: 'owner/repo',
    commit,
    path: skillPath,
    archiveSha256: sha256(archive),
    archiveBytes: archive.length,
  }
}
