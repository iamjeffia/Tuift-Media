import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ProviderId, Skill } from '@harness/contracts'
import {
  CATALOG_RECORD_FILE,
  SkillCatalog,
  parseCatalog,
  readCatalogFile,
  readCatalogRecord,
  thirdPartySkillsFile,
  type CatalogEntry,
} from './skill-catalog.js'
import {
  COMMIT_A,
  COMMIT_B,
  repositoryArchive,
  sourceFor,
  startHost,
  type TestHost,
} from './skill-catalog.test-support.js'
import { installLocalSkill } from './skill-install.js'

const folders: string[] = []
const hosts: TestHost[] = []

function temporary(name: string): string {
  const folder = mkdtempSync(path.join(os.tmpdir(), `harness-catalog-${name}-`))
  folders.push(folder)
  return folder
}

afterEach(async () => {
  for (const host of hosts.splice(0)) await host.close()
  for (const folder of folders.splice(0)) {
    rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

const SKILLS = {
  design: { 'SKILL.md': '---\nname: design\n---\nv1', 'references/a.md': 'a' },
  motion: { 'SKILL.md': '---\nname: motion\n---\nv1' },
}

function entryFor(
  host: string,
  commit: string,
  archive: Buffer,
  id: string,
  extra: Partial<CatalogEntry> = {},
): CatalogEntry {
  return {
    id,
    name: id,
    summary: { en: `${id} in English`, 'pt-BR': `${id} em português` },
    author: 'Someone',
    category: 'design',
    source: {
      ...sourceFor(host, commit, archive, `skills/${id}`),
      url: `https://example.test/${id}`,
    },
    license: { name: null },
    ...extra,
  }
}

/** A project, a code host serving the repository at the commits asked for, and the catalog over them. */
async function setup(
  options: {
    commit?: string
    skills?: Record<string, Record<string, string>>
    failInstall?: (folder: string) => boolean
  } = {},
) {
  const host = await startHost(2_000)
  hosts.push(host)
  const project = temporary('project')
  const archives = new Map<string, Buffer>()
  const serve = (commit: string, skills: Record<string, Record<string, string>>) => {
    const archive = repositoryArchive(commit, skills)
    archives.set(commit, archive)
    host.serve(commit, { status: 200, body: archive })
    return archive
  }
  serve(options.commit ?? COMMIT_A, options.skills ?? SKILLS)
  const changes: string[] = []
  let manifest: CatalogEntry[] = []
  const catalog = new SkillCatalog({
    entries: () => manifest,
    installFolder: async (_provider: ProviderId, projectPath, folder) => {
      if (options.failInstall?.(folder))
        throw new Error('Provider did not discover the installed skill')
      const destination = await installLocalSkill(projectPath, folder)
      return {
        id: destination,
        name: path.basename(destination),
        description: '',
        source: { type: 'folder', path: destination },
        scope: 'project',
        enabled: true,
        dependencyErrors: [],
      } satisfies Skill
    },
    onChanged: (_provider, projectPath) => changes.push(projectPath),
    policy: host.policy,
  })
  return {
    host,
    project,
    catalog,
    changes,
    serve,
    /** The manifest pins these skills at this commit, as of now. */
    pin: (commit: string, ids: string[], extra: Partial<CatalogEntry> = {}) => {
      const archive = archives.get(commit)!
      manifest = ids.map((id) => entryFor(host.host, commit, archive, id, extra))
    },
    skillsDir: path.join(project, '.agents', 'skills'),
  }
}

function leftovers(): string[] {
  return readdirSync(os.tmpdir()).filter((name) => name.startsWith('tuift-skill-'))
}

describe('the manifest of third-party skills', () => {
  const file = path.resolve(
    import.meta.dirname,
    '../../../packages/default-skills/third-party-skills.json',
  )

  it('is valid, names only hosts the server allows and pins every skill', () => {
    const entries = readCatalogFile(file)

    expect(entries.length).toBeGreaterThan(0)
    for (const entry of entries) {
      expect(entry.source.host).toBe('codeload.github.com')
      expect(entry.source.url).toContain(`/${entry.source.commit}/${entry.source.path}`)
      expect(entry.source.path).toBe(`skills/${entry.id}`)
    }
    expect(new Set(entries.map((entry) => entry.category))).toEqual(new Set(['motion', 'design']))
    // A skill with no declared licence says so by having none.
    expect(entries.find((entry) => entry.id === 'remotion-docs')?.license.name).toBeNull()
    expect(entries.find((entry) => entry.id === 'transitions-polish')?.license.name).toBe(
      'Transitions.dev License',
    )
  })

  it('is found beside the default skills bundle', () => {
    expect(thirdPartySkillsFile(path.join('app', 'resources', 'default-skills'))).toBe(
      path.join('app', 'resources', 'third-party-skills.json'),
    )
  })

  it('refuses a manifest with a repeated id, a loose commit or a licence without its hash', () => {
    const [first] = readCatalogFile(file)
    const wrap = (skills: unknown[]) => JSON.stringify({ version: 1, skills })

    expect(() => parseCatalog(wrap([first, first]))).toThrow('unique')
    expect(() =>
      parseCatalog(wrap([{ ...first, source: { ...first!.source, commit: 'main' } }])),
    ).toThrow()
    expect(() =>
      parseCatalog(wrap([{ ...first, source: { ...first!.source, path: 'skills/../x' } }])),
    ).toThrow()
    expect(() =>
      parseCatalog(wrap([{ ...first, source: { ...first!.source, url: 'http://example.test' } }])),
    ).toThrow()
    expect(() => parseCatalog(wrap([{ ...first, license: { name: 'MIT' } }]))).toThrow()
    expect(() => parseCatalog(wrap([{ ...first, id: '../up' }]))).toThrow()
    expect(() => parseCatalog('{"version":2,"skills":[]}')).toThrow()
  })
})

describe('installing from the author', () => {
  it('installs one skill, records the commit and the category, and leaves nothing behind', async () => {
    const before = leftovers()
    const { catalog, project, skillsDir, pin, changes } = await setup()
    pin(COMMIT_A, ['design', 'motion'], { set: 'pair' })

    expect((await catalog.list(project)).map((skill) => [skill.id, skill.state])).toEqual([
      ['design', 'not-installed'],
      ['motion', 'not-installed'],
    ])

    const results = await catalog.install('codex', project, ['design'])

    expect(results).toEqual([{ id: 'design', ok: true }])
    expect(readFileSync(path.join(skillsDir, 'design', 'references', 'a.md'), 'utf8')).toBe('a')
    expect(existsSync(path.join(skillsDir, 'motion'))).toBe(false)
    const record = await readCatalogRecord(project)
    expect(record.skills['design']).toMatchObject({
      commit: COMMIT_A,
      category: 'design',
      set: 'pair',
    })
    expect(
      JSON.parse(readFileSync(path.join(skillsDir, CATALOG_RECORD_FILE), 'utf8')).version,
    ).toBe(1)
    const listed = await catalog.list(project)
    expect(listed.map((skill) => [skill.id, skill.state])).toEqual([
      ['design', 'installed'],
      ['motion', 'not-installed'],
    ])
    expect(listed[0]).toMatchObject({
      installedCommit: COMMIT_A,
      commit: COMMIT_A,
      license: null,
      sourceUrl: 'https://example.test/design',
    })
    expect(changes).toEqual([project])
    expect(leftovers()).toEqual(before)
  })

  it('installs several skills from one download, and one bad skill does not stop the others', async () => {
    const { catalog, project, skillsDir, pin, host, changes } = await setup()
    pin(COMMIT_A, ['design', 'motion', 'absent'])

    const results = await catalog.install('codex', project, ['design', 'absent', 'motion', 'nope'])

    expect(results.map((result) => [result.id, result.ok])).toEqual([
      ['design', true],
      ['absent', false],
      ['motion', true],
      ['nope', false],
    ])
    expect(results[1]).toMatchObject({ message: expect.stringContaining('was not found') })
    expect(results[3]).toMatchObject({ message: expect.stringContaining('not in the list') })
    expect(host.hits()).toHaveLength(1)
    expect(
      readdirSync(skillsDir)
        .filter((name) => !name.startsWith('.'))
        .sort(),
    ).toEqual(['design', 'motion'])
    expect(Object.keys((await readCatalogRecord(project)).skills).sort()).toEqual([
      'design',
      'motion',
    ])
    // The page hears about each skill as it lands.
    expect(changes).toHaveLength(3)
  })

  it('installs nothing from a download that does not match the pinned hash', async () => {
    const before = leftovers()
    const { catalog, project, skillsDir, pin, serve } = await setup()
    pin(COMMIT_A, ['design', 'motion'])
    serve(COMMIT_A, { design: { 'SKILL.md': 'tampered' }, motion: { 'SKILL.md': 'tampered' } })

    const results = await catalog.install('codex', project, ['design', 'motion'])

    expect(results.every((result) => !result.ok)).toBe(true)
    expect(results[0]).toMatchObject({ message: expect.stringContaining('checksum') })
    expect(existsSync(skillsDir)).toBe(false)
    expect((await catalog.list(project)).every((skill) => skill.state === 'not-installed')).toBe(
      true,
    )
    expect(leftovers()).toEqual(before)
  })

  it('refuses a host the manifest names that the server does not allow', async () => {
    const { project, host } = await setup()
    const archive = repositoryArchive(COMMIT_A, SKILLS)
    const strange = new SkillCatalog({
      entries: () => [entryFor('evil.example', COMMIT_A, archive, 'design')],
      installFolder: () => Promise.reject(new Error('must not be reached')),
      onChanged: () => undefined,
      policy: host.policy,
    })

    const results = await strange.install('codex', project, ['design'])

    expect(results).toEqual([
      { id: 'design', ok: false, message: expect.stringContaining('not a code host') },
    ])
    expect(host.hits()).toEqual([])
  })

  it('leaves no folder and no record when the provider does not find the skill', async () => {
    const before = leftovers()
    const { catalog, project, skillsDir, pin } = await setup({
      failInstall: (folder) => path.basename(folder) === 'motion',
    })
    pin(COMMIT_A, ['design', 'motion'])

    const results = await catalog.install('codex', project, ['design', 'motion'])

    expect(results[0]).toEqual({ id: 'design', ok: true })
    expect(results[1]).toMatchObject({ id: 'motion', ok: false })
    expect(existsSync(path.join(skillsDir, 'motion'))).toBe(false)
    expect(Object.keys((await readCatalogRecord(project)).skills)).toEqual(['design'])
    expect(leftovers()).toEqual(before)
  })

  it('rolls the skill back when its record cannot be written', async () => {
    const { catalog, project, skillsDir, pin } = await setup()
    pin(COMMIT_A, ['design'])
    // A folder where the record file belongs: the final rename fails.
    mkdirSync(path.join(skillsDir, CATALOG_RECORD_FILE), { recursive: true })

    const [result] = await catalog.install('codex', project, ['design'])

    expect(result?.ok).toBe(false)
    expect(existsSync(path.join(skillsDir, 'design'))).toBe(false)
    expect(readdirSync(skillsDir).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('does not touch a skill of the same name that the person put there', async () => {
    const { catalog, project, skillsDir, pin, host } = await setup()
    pin(COMMIT_A, ['design'])
    mkdirSync(path.join(skillsDir, 'design'), { recursive: true })
    writeFileSync(path.join(skillsDir, 'design', 'SKILL.md'), 'mine')

    const listed = await catalog.list(project)
    const [result] = await catalog.install('codex', project, ['design'])

    expect(listed[0]).toMatchObject({ state: 'installed' })
    expect(listed[0]?.installedCommit).toBeUndefined()
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('already exists') })
    expect(readFileSync(path.join(skillsDir, 'design', 'SKILL.md'), 'utf8')).toBe('mine')
    expect(host.hits()).toEqual([])
  })

  it('does nothing for a skill that is already at the pinned commit', async () => {
    const { catalog, project, pin, host } = await setup()
    pin(COMMIT_A, ['design'])
    await catalog.install('codex', project, ['design'])

    const [again] = await catalog.install('codex', project, ['design'])

    expect(again).toEqual({ id: 'design', ok: true })
    expect(host.hits()).toHaveLength(1)
  })
})

describe('a newer pinned commit', () => {
  it('shows an update and replaces the skill when it is installed again', async () => {
    const { catalog, project, skillsDir, pin, serve } = await setup()
    pin(COMMIT_A, ['design'])
    await catalog.install('codex', project, ['design'])
    serve(COMMIT_B, { design: { 'SKILL.md': '---\nname: design\n---\nv2', 'new.md': 'new' } })
    pin(COMMIT_B, ['design'])

    const [outdated] = await catalog.list(project)
    expect(outdated).toMatchObject({
      state: 'update-available',
      installedCommit: COMMIT_A,
      commit: COMMIT_B,
    })

    const [result] = await catalog.install('codex', project, ['design'])

    expect(result).toEqual({ id: 'design', ok: true })
    expect(readFileSync(path.join(skillsDir, 'design', 'SKILL.md'), 'utf8')).toContain('v2')
    expect(existsSync(path.join(skillsDir, 'design', 'new.md'))).toBe(true)
    expect(existsSync(path.join(skillsDir, 'design', 'references'))).toBe(false)
    expect((await catalog.list(project))[0]).toMatchObject({
      state: 'installed',
      installedCommit: COMMIT_B,
    })
    expect(readdirSync(skillsDir).filter((name) => name.includes('replaced'))).toEqual([])
  })

  it('keeps the old version when the update fails', async () => {
    const { catalog, project, skillsDir, pin, host, serve } = await setup()
    pin(COMMIT_A, ['design'])
    await catalog.install('codex', project, ['design'])
    serve(COMMIT_B, { design: { 'SKILL.md': 'v2' } })
    pin(COMMIT_B, ['design'])
    // What the host sends is not what the manifest pinned.
    host.serve(COMMIT_B, { status: 200, body: Buffer.from('garbage') })

    const [result] = await catalog.install('codex', project, ['design'])

    expect(result?.ok).toBe(false)
    expect(readFileSync(path.join(skillsDir, 'design', 'SKILL.md'), 'utf8')).toContain('v1')
    expect((await catalog.list(project))[0]).toMatchObject({
      state: 'update-available',
      installedCommit: COMMIT_A,
    })
    expect(readdirSync(skillsDir).filter((name) => name.includes('replaced'))).toEqual([])
  })
})
