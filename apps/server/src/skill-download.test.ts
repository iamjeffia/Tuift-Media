import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_DOWNLOAD_POLICY,
  archiveUrl,
  downloadArchive,
  unpackSkill,
} from './skill-download.js'
import {
  COMMIT_A,
  repositoryArchive,
  sourceFor,
  startHost,
  tar,
  type TestHost,
} from './skill-catalog.test-support.js'

const folders: string[] = []
const hosts: TestHost[] = []

function temporary(): string {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'harness-download-'))
  folders.push(folder)
  return folder
}

afterEach(async () => {
  for (const host of hosts.splice(0)) await host.close()
  for (const folder of folders.splice(0)) {
    rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

async function host(timeoutMs?: number): Promise<TestHost> {
  const started = await startHost(timeoutMs)
  hosts.push(started)
  return started
}

const archive = repositoryArchive(COMMIT_A, {
  design: { 'SKILL.md': '---\nname: design\n---\n', 'references/notes.md': 'notes' },
  other: { 'SKILL.md': 'other skill' },
})

describe('downloading a pinned archive', () => {
  it('downloads the archive and checks its hash', async () => {
    const code = await host()
    code.serve(COMMIT_A, { status: 200, body: archive })
    const source = sourceFor(code.host, COMMIT_A, archive, 'skills/design')

    const bytes = await downloadArchive(source, code.policy)

    expect(bytes.equals(archive)).toBe(true)
    expect(code.hits()).toEqual([`/owner/repo/tar.gz/${COMMIT_A}`])
  })

  it('discards a download whose hash is not the pinned one', async () => {
    const code = await host()
    code.serve(COMMIT_A, { status: 200, body: archive })
    const source = {
      ...sourceFor(code.host, COMMIT_A, archive, 'skills/design'),
      archiveSha256: '0'.repeat(64),
    }

    await expect(downloadArchive(source, code.policy)).rejects.toThrow(
      'does not match the checksum pinned',
    )
  })

  it('stops a download that is bigger than the manifest declares', async () => {
    const code = await host()
    code.serve(COMMIT_A, { status: 200, body: archive })
    const source = {
      ...sourceFor(code.host, COMMIT_A, archive, 'skills/design'),
      archiveBytes: archive.length - 1,
    }

    await expect(downloadArchive(source, code.policy)).rejects.toThrow('larger than')
  })

  it('stops a body that outgrows its Content-Length', async () => {
    // A server that sends chunked data with no length: the read itself must stop at the limit.
    const server = createServer((_, response) => {
      response.writeHead(200)
      response.write(Buffer.alloc(4096))
      response.end(Buffer.alloc(4096))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const where = `127.0.0.1:${(server.address() as AddressInfo).port}`
    try {
      const source = {
        host: where,
        repository: 'owner/repo',
        commit: COMMIT_A,
        path: 'skills/design',
        archiveSha256: '0'.repeat(64),
        archiveBytes: 4096,
      }
      await expect(
        downloadArchive(source, {
          protocol: 'http:',
          hosts: new Set([where]),
          timeoutMs: 5_000,
        }),
      ).rejects.toThrow('larger than')
    } finally {
      server.closeAllConnections()
      server.close()
    }
  })

  it('refuses a host the policy does not name, before any request', async () => {
    const code = await host()
    const source = {
      ...sourceFor('evil.example', COMMIT_A, archive, 'skills/design'),
    }

    await expect(downloadArchive(source, code.policy)).rejects.toThrow(
      '"evil.example" is not a code host',
    )
    expect(code.hits()).toEqual([])
  })

  it('only talks to GitHub over https by default', () => {
    const source = sourceFor('codeload.github.com', COMMIT_A, archive, 'skills/design')

    expect(archiveUrl(source, DEFAULT_DOWNLOAD_POLICY).href).toBe(
      `https://codeload.github.com/owner/repo/tar.gz/${COMMIT_A}`,
    )
    for (const changed of [
      { host: 'raw.githubusercontent.com' },
      { host: 'github.com' },
      { repository: '../../etc/passwd' },
      { commit: 'main' },
    ]) {
      expect(() => archiveUrl({ ...source, ...changed }, DEFAULT_DOWNLOAD_POLICY)).toThrow()
    }
  })

  it('does not follow a redirect, not even to another host', async () => {
    const other = await host()
    other.serve(COMMIT_A, { status: 200, body: archive })
    const code = await host()
    code.serve(COMMIT_A, {
      status: 302,
      headers: { location: `http://${other.host}/owner/repo/tar.gz/${COMMIT_A}` },
    })
    const source = sourceFor(code.host, COMMIT_A, archive, 'skills/design')

    await expect(downloadArchive(source, code.policy)).rejects.toThrow('redirect')
    expect(other.hits()).toEqual([])
  })

  it('reports a missing archive and a host that never answers', async () => {
    const code = await host(300)
    const source = sourceFor(code.host, COMMIT_A, archive, 'skills/design')
    await expect(downloadArchive(source, code.policy)).rejects.toThrow('answered 404')

    code.serve(COMMIT_A, 'hang')
    await expect(downloadArchive(source, code.policy)).rejects.toThrow('took too long')
  })
})

describe('unpacking one skill', () => {
  it('writes only the skill folder, with its subfolders', async () => {
    const destination = path.join(temporary(), 'design')

    const result = await unpackSkill(archive, 'skills/design', destination)

    expect(result).toEqual({ files: 2, bytes: 26 })
    expect(readFileSync(path.join(destination, 'references', 'notes.md'), 'utf8')).toBe('notes')
    expect(readdirSync(destination).sort()).toEqual(['SKILL.md', 'references'])
  })

  it('reads a path that only a pax header can carry', async () => {
    const deep = `${'a'.repeat(60)}/${'b'.repeat(60)}/file.md`
    const long = repositoryArchive(COMMIT_A, { design: { 'SKILL.md': 'skill' } }, [
      { name: `skills/design/${deep}`, body: 'deep', pax: true },
    ])
    const destination = path.join(temporary(), 'design')

    await unpackSkill(long, 'skills/design', destination)

    expect(readFileSync(path.join(destination, ...deep.split('/')), 'utf8')).toBe('deep')
  })

  it.each([
    ['climbs out with ..', 'skills/design/../../escaped.txt'],
    ['climbs out in the middle', 'skills/design/a/../../../escaped.txt'],
    ['uses a backslash', 'skills/design/..\\escaped.txt'],
    ['names a drive', 'skills/design/C:/escaped.txt'],
    ['names a data stream', 'skills/design/SKILL.md:stream'],
    ['has an empty segment', 'skills/design//escaped.txt'],
    ['names a reserved device', 'skills/design/nul.txt'],
  ])('refuses a path that %s', async (_name, entry) => {
    const root = temporary()
    const bad = repositoryArchive(COMMIT_A, { design: { 'SKILL.md': 'skill' } }, [
      { name: entry, body: 'escaped' },
    ])

    await expect(unpackSkill(bad, 'skills/design', path.join(root, 'design'))).rejects.toThrow(
      'not allowed',
    )
    expect(existsSync(path.join(root, 'escaped.txt'))).toBe(false)
    expect(existsSync(path.join(root, 'design', 'escaped.txt'))).toBe(false)
  })

  it('refuses a symbolic link inside the skill, even one that points inside it', async () => {
    const root = temporary()
    const bad = repositoryArchive(COMMIT_A, { design: { 'SKILL.md': 'skill' } }, [
      { name: 'skills/design/outside', type: '2', linkName: '../../../../etc' },
    ])

    await expect(unpackSkill(bad, 'skills/design', path.join(root, 'design'))).rejects.toThrow(
      'link or a special file',
    )
    const hard = repositoryArchive(COMMIT_A, { design: { 'SKILL.md': 'skill' } }, [
      { name: 'skills/design/again', type: '1', linkName: 'SKILL.md' },
    ])
    await expect(unpackSkill(hard, 'skills/design', path.join(root, 'two'))).rejects.toThrow(
      'link or a special file',
    )
  })

  it('ignores a link outside the skill folder, which it never reads', async () => {
    const root = temporary()
    const fine = repositoryArchive(COMMIT_A, { design: { 'SKILL.md': 'skill' } }, [
      { name: 'skills/other/link', type: '2', linkName: '/etc/passwd' },
    ])

    await unpackSkill(fine, 'skills/design', path.join(root, 'design'))

    expect(readdirSync(path.join(root, 'design'))).toEqual(['SKILL.md'])
  })

  it('refuses a repeated file and a folder without a SKILL.md', async () => {
    const root = temporary()
    const twice = repositoryArchive(COMMIT_A, { design: { 'SKILL.md': 'skill' } }, [
      { name: 'skills/design/SKILL.md', body: 'again' },
    ])
    await expect(unpackSkill(twice, 'skills/design', path.join(root, 'one'))).rejects.toThrow()
    await expect(unpackSkill(archive, 'skills/missing', path.join(root, 'two'))).rejects.toThrow(
      'was not found in the archive',
    )
    const bare = repositoryArchive(COMMIT_A, { design: { 'notes.md': 'no skill file' } })
    await expect(unpackSkill(bare, 'skills/design', path.join(root, 'three'))).rejects.toThrow(
      'SKILL.md was not found',
    )
  })

  it('refuses something that is not a gzip archive, and a tar cut short', async () => {
    const root = temporary()
    await expect(
      unpackSkill(Buffer.from('not an archive'), 'skills/design', path.join(root, 'one')),
    ).rejects.toThrow('could not be unpacked')
    const cut = gzipSync(
      tar([{ name: 'top/skills/design/SKILL.md', body: 'x'.repeat(2000) }]).subarray(0, 700),
    )
    await expect(unpackSkill(cut, 'skills/design', path.join(root, 'two'))).rejects.toThrow(
      'truncated',
    )
  })
})
