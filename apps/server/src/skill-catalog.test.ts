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
import {
  INSTALLED_RECORD_FILE,
  installedSkillDir,
  readInstalledRecord,
} from './installed-skills.js'
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
  general: { 'SKILL.md': '---\nname: general\n---\nv1' },
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
    category: id === 'motion' || id === 'general' ? id : 'design',
    source: {
      ...sourceFor(host, commit, archive, `skills/${id}`),
      url: `https://example.test/${id}`,
    },
    license: { name: null },
    ...extra,
  }
}

/** A project, the app's data folder, a code host serving the repository at the commits asked for, and the catalog over them. */
async function setup(
  options: {
    commit?: string
    skills?: Record<string, Record<string, string>>
    bundled?: string[]
  } = {},
) {
  const host = await startHost(2_000)
  hosts.push(host)
  const project = temporary('project')
  const data = temporary('data')
  const root = path.join(data, 'third-party-skills')
  const archives = new Map<string, Buffer>()
  const serve = (commit: string, skills: Record<string, Record<string, string>>) => {
    const archive = repositoryArchive(commit, skills)
    archives.set(commit, archive)
    host.serve(commit, { status: 200, body: archive })
    return archive
  }
  serve(options.commit ?? COMMIT_A, options.skills ?? SKILLS)
  const changes: Array<[string, string]> = []
  let manifest: CatalogEntry[] = []
  const catalog = new SkillCatalog({
    entries: () => manifest,
    root,
    bundled: () => new Set(options.bundled ?? []),
    onChanged: (provider, projectPath) => changes.push([provider, projectPath]),
    policy: host.policy,
  })
  return {
    host,
    project,
    data,
    root,
    catalog,
    changes,
    serve,
    /** The manifest pins these skills at this commit, as of now. */
    pin: (commit: string, ids: string[], extra: Partial<CatalogEntry> = {}) => {
      const archive = archives.get(commit)!
      manifest = ids.map((id) => entryFor(host.host, commit, archive, id, extra))
    },
    projectSkillsDir: path.join(project, '.agents', 'skills'),
  }
}

/** What an earlier version left in a project: the folder and the record beside it. */
function earlierInstall(skillsDir: string, id: string, commit: string) {
  mkdirSync(path.join(skillsDir, id), { recursive: true })
  writeFileSync(path.join(skillsDir, id, 'SKILL.md'), 'in the project')
  writeFileSync(
    path.join(skillsDir, CATALOG_RECORD_FILE),
    JSON.stringify({
      version: 1,
      skills: { [id]: { commit, category: 'design', installedAt: '2026-11-01T00:00:00.000Z' } },
    }),
  )
}

function leftovers(root: string): string[] {
  return existsSync(root) ? readdirSync(root).filter((name) => name.startsWith('.staging-')) : []
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
    expect(entries.find((entry) => entry.id === 'remotion-best-practices')?.license.name).toBeNull()
    expect(entries.find((entry) => entry.id === 'transitions-polish')?.license.name).toBe(
      'Transitions.dev License',
    )
  })

  it('lists the Remotion umbrella skill alone, since it carries the others inside it', () => {
    const ids = readCatalogFile(file).map((entry) => entry.id)

    expect(ids.filter((id) => id.startsWith('remotion-'))).toEqual(['remotion-best-practices'])
  })

  it('lists nothing the bundle already ships', () => {
    const bundled = JSON.parse(
      readFileSync(
        path.resolve(import.meta.dirname, '../../../packages/default-skills/skills.json'),
        'utf8',
      ),
    ).skills.map((skill: { folder: string }) => skill.folder)

    // The 21st skills moved into the Design pack (Apache-2.0 at the pinned commit).
    expect(bundled).toContain('21st-ui-build')
    expect(readCatalogFile(file).filter((entry) => bundled.includes(entry.id))).toEqual([])
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
  it('installs into the data folder once, laid out like a plugin, and records the commit and the category', async () => {
    const { catalog, project, root, projectSkillsDir, pin, changes } = await setup()
    pin(COMMIT_A, ['design', 'motion'], { set: 'pair' })

    expect((await catalog.list(project)).map((skill) => [skill.id, skill.state])).toEqual([
      ['design', 'not-installed'],
      ['motion', 'not-installed'],
    ])

    const results = await catalog.install('claude-code', project, ['design'])

    expect(results).toEqual([{ id: 'design', ok: true }])
    expect(
      readFileSync(path.join(root, 'design', 'skills', 'design', 'references', 'a.md'), 'utf8'),
    ).toBe('a')
    expect(
      JSON.parse(readFileSync(path.join(root, 'design', '.claude-plugin', 'plugin.json'), 'utf8')),
    ).toMatchObject({
      name: 'tastecode-installed-design',
    })
    expect(existsSync(path.join(root, 'motion'))).toBe(false)
    // Nothing goes into the project, whichever provider asked.
    expect(existsSync(projectSkillsDir)).toBe(false)
    expect(readInstalledRecord(root).skills['design']).toMatchObject({
      commit: COMMIT_A,
      category: 'design',
      set: 'pair',
    })
    expect(JSON.parse(readFileSync(path.join(root, INSTALLED_RECORD_FILE), 'utf8')).version).toBe(1)
    const listed = await catalog.list(project)
    expect(listed.map((skill) => [skill.id, skill.state, skill.installedFor])).toEqual([
      ['design', 'installed', 'app'],
      ['motion', 'not-installed', undefined],
    ])
    expect(listed[0]).toMatchObject({
      installedCommit: COMMIT_A,
      commit: COMMIT_A,
      license: null,
      sourceUrl: 'https://example.test/design',
    })
    expect(changes).toEqual([['claude-code', project]])
    expect(leftovers(root)).toEqual([])
  })

  it('puts each skill in the folder of its category and shows the same list to every project', async () => {
    const { catalog, project, root, pin } = await setup()
    pin(COMMIT_A, ['design', 'motion', 'general'])

    await catalog.install('codex', project, ['design', 'motion', 'general'])

    for (const id of ['design', 'motion', 'general'] as const) {
      expect(existsSync(installedSkillDir(root, id, id))).toBe(true)
    }
    const other = temporary('other-project')
    expect((await catalog.list(other)).map((skill) => skill.state)).toEqual([
      'installed',
      'installed',
      'installed',
    ])
  })

  it('installs several skills from one download, and one bad skill does not stop the others', async () => {
    const { catalog, project, root, pin, host, changes } = await setup()
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
    expect(Object.keys(readInstalledRecord(root).skills).sort()).toEqual(['design', 'motion'])
    // The page hears about each skill as it lands.
    expect(changes).toHaveLength(3)
    expect(leftovers(root)).toEqual([])
  })

  it('installs nothing from a download that does not match the pinned hash', async () => {
    const { catalog, project, root, pin, serve } = await setup()
    pin(COMMIT_A, ['design', 'motion'])
    serve(COMMIT_A, { design: { 'SKILL.md': 'tampered' }, motion: { 'SKILL.md': 'tampered' } })

    const results = await catalog.install('codex', project, ['design', 'motion'])

    expect(results.every((result) => !result.ok)).toBe(true)
    expect(results[0]).toMatchObject({ message: expect.stringContaining('checksum') })
    expect(existsSync(path.join(root, 'design'))).toBe(false)
    expect(readInstalledRecord(root).skills).toEqual({})
    expect((await catalog.list(project)).every((skill) => skill.state === 'not-installed')).toBe(
      true,
    )
    expect(leftovers(root)).toEqual([])
  })

  it('refuses a host the manifest names that the server does not allow', async () => {
    const { project, host, root } = await setup()
    const archive = repositoryArchive(COMMIT_A, SKILLS)
    const strange = new SkillCatalog({
      entries: () => [entryFor('evil.example', COMMIT_A, archive, 'design')],
      root,
      onChanged: () => undefined,
      policy: host.policy,
    })

    const results = await strange.install('codex', project, ['design'])

    expect(results).toEqual([
      { id: 'design', ok: false, message: expect.stringContaining('not a code host') },
    ])
    expect(host.hits()).toEqual([])
  })

  it('rolls the skill back when its record cannot be written', async () => {
    const { catalog, project, root, pin } = await setup()
    pin(COMMIT_A, ['design'])
    // A folder where the record file belongs: the final rename fails.
    mkdirSync(path.join(root, INSTALLED_RECORD_FILE), { recursive: true })

    const [result] = await catalog.install('codex', project, ['design'])

    expect(result?.ok).toBe(false)
    expect(existsSync(installedSkillDir(root, 'design', 'design'))).toBe(false)
    expect(readdirSync(root).filter((name) => name.endsWith('.tmp'))).toEqual([])
    expect(leftovers(root)).toEqual([])
  })

  it('does nothing for a skill that is already at the pinned commit', async () => {
    const { catalog, project, pin, host } = await setup()
    pin(COMMIT_A, ['design'])
    await catalog.install('codex', project, ['design'])

    const [again] = await catalog.install('claude-code', project, ['design'])

    expect(again).toEqual({ id: 'design', ok: true })
    expect(host.hits()).toHaveLength(1)
  })

  it('neither offers nor installs a skill the bundle already ships', async () => {
    const { catalog, project, root, pin, host } = await setup({ bundled: ['design'] })
    pin(COMMIT_A, ['design', 'motion'])

    expect((await catalog.list(project)).map((skill) => skill.id)).toEqual(['motion'])
    const results = await catalog.install('codex', project, ['design', 'motion'])

    expect(results[0]).toMatchObject({
      id: 'design',
      ok: false,
      message: expect.stringContaining('already ships'),
    })
    expect(results[1]).toEqual({ id: 'motion', ok: true })
    expect(existsSync(path.join(root, 'design'))).toBe(false)
    expect(host.hits()).toHaveLength(1)
  })

  it('treats a folder left in the data folder without a record as nothing, and installs over it', async () => {
    const { catalog, project, root, pin } = await setup()
    pin(COMMIT_A, ['design'])
    mkdirSync(installedSkillDir(root, 'design', 'design'), { recursive: true })
    writeFileSync(path.join(installedSkillDir(root, 'design', 'design'), 'old.md'), 'leftover')

    expect((await catalog.list(project))[0]).toMatchObject({ state: 'not-installed' })
    const [result] = await catalog.install('codex', project, ['design'])

    expect(result).toEqual({ id: 'design', ok: true })
    expect(existsSync(path.join(installedSkillDir(root, 'design', 'design'), 'old.md'))).toBe(false)
    expect(existsSync(path.join(installedSkillDir(root, 'design', 'design'), 'SKILL.md'))).toBe(
      true,
    )
  })
})

describe('a skill installed into a project by the earlier road', () => {
  it('is shown as installed for that project, with no move and no removal', async () => {
    const { catalog, project, root, projectSkillsDir, pin, host } = await setup()
    pin(COMMIT_A, ['design', 'motion'])
    earlierInstall(projectSkillsDir, 'design', COMMIT_A)

    const listed = await catalog.list(project)

    expect(listed[0]).toMatchObject({
      id: 'design',
      state: 'installed',
      installedFor: 'project',
      installedCommit: COMMIT_A,
    })
    expect(listed[1]).toMatchObject({ id: 'motion', state: 'not-installed' })
    expect(await readCatalogRecord(project)).toMatchObject({
      skills: { design: { commit: COMMIT_A } },
    })
    // Another project does not have it.
    expect((await catalog.list(temporary('other')))[0]).toMatchObject({ state: 'not-installed' })
    await expect(catalog.remove('codex', project, 'design')).rejects.toThrow(
      'not installed for the whole app',
    )
    expect(readFileSync(path.join(projectSkillsDir, 'design', 'SKILL.md'), 'utf8')).toBe(
      'in the project',
    )
    expect(existsSync(root)).toBe(false)
    expect(host.hits()).toEqual([])
  })

  it('shows a folder the person put there as installed for the project too, and never touches it', async () => {
    const { catalog, project, projectSkillsDir, pin } = await setup()
    pin(COMMIT_A, ['design'])
    mkdirSync(path.join(projectSkillsDir, 'design'), { recursive: true })
    writeFileSync(path.join(projectSkillsDir, 'design', 'SKILL.md'), 'mine')

    const [listed] = await catalog.list(project)

    expect(listed).toMatchObject({ state: 'installed', installedFor: 'project' })
    expect(listed?.installedCommit).toBeUndefined()
    expect(readFileSync(path.join(projectSkillsDir, 'design', 'SKILL.md'), 'utf8')).toBe('mine')
  })

  it('gives way to the app install when both exist', async () => {
    const { catalog, project, projectSkillsDir, pin } = await setup()
    pin(COMMIT_A, ['design'])
    earlierInstall(projectSkillsDir, 'design', COMMIT_A)
    await catalog.install('codex', project, ['design'])

    expect((await catalog.list(project))[0]).toMatchObject({ installedFor: 'app' })
    expect(readFileSync(path.join(projectSkillsDir, 'design', 'SKILL.md'), 'utf8')).toBe(
      'in the project',
    )
  })
})

describe('removing an installed skill', () => {
  it('deletes its folder and its record, keeps the others and tells the page', async () => {
    const { catalog, project, root, pin, changes } = await setup()
    pin(COMMIT_A, ['design', 'general', 'motion'])
    await catalog.install('codex', project, ['design', 'general', 'motion'])
    changes.length = 0

    await catalog.remove('claude-code', project, 'general')

    // The last skill of a category takes its plugin folder with it.
    expect(existsSync(path.join(root, 'general'))).toBe(false)
    expect(Object.keys(readInstalledRecord(root).skills).sort()).toEqual(['design', 'motion'])
    expect(existsSync(installedSkillDir(root, 'design', 'design'))).toBe(true)
    expect((await catalog.list(project)).map((skill) => skill.state)).toEqual([
      'installed',
      'not-installed',
      'installed',
    ])
    expect(changes).toEqual([['claude-code', project]])
  })

  it('keeps the plugin folder while the category still has a skill, and lets the skill be installed again', async () => {
    const { catalog, project, root, pin } = await setup()
    pin(COMMIT_A, ['design', 'motion'], { category: 'design' })
    await catalog.install('codex', project, ['design', 'motion'])

    await catalog.remove('codex', project, 'design')

    expect(existsSync(path.join(root, 'design', '.claude-plugin', 'plugin.json'))).toBe(true)
    expect(existsSync(installedSkillDir(root, 'design', 'design'))).toBe(false)
    expect(await catalog.install('codex', project, ['design'])).toEqual([
      { id: 'design', ok: true },
    ])
  })

  it('refuses a skill that is not installed for the whole app', async () => {
    const { catalog, project, pin } = await setup()
    pin(COMMIT_A, ['design'])

    await expect(catalog.remove('codex', project, 'design')).rejects.toThrow(
      'not installed for the whole app',
    )
  })

  it('waits for an install that is running', async () => {
    const { catalog, project, root, pin } = await setup()
    pin(COMMIT_A, ['design'])

    const installing = catalog.install('codex', project, ['design'])
    const removing = catalog.remove('codex', project, 'design')
    await Promise.all([installing, removing])

    expect(readInstalledRecord(root).skills).toEqual({})
    expect(existsSync(installedSkillDir(root, 'design', 'design'))).toBe(false)
  })
})

describe('a newer pinned commit', () => {
  it('shows an update and replaces the skill when it is installed again', async () => {
    const { catalog, project, root, pin, serve } = await setup()
    pin(COMMIT_A, ['design'])
    await catalog.install('codex', project, ['design'])
    serve(COMMIT_B, { design: { 'SKILL.md': '---\nname: design\n---\nv2', 'new.md': 'new' } })
    pin(COMMIT_B, ['design'])
    const folder = installedSkillDir(root, 'design', 'design')

    const [outdated] = await catalog.list(project)
    expect(outdated).toMatchObject({
      state: 'update-available',
      installedCommit: COMMIT_A,
      commit: COMMIT_B,
      installedFor: 'app',
    })

    const [result] = await catalog.install('claude-code', project, ['design'])

    expect(result).toEqual({ id: 'design', ok: true })
    expect(readFileSync(path.join(folder, 'SKILL.md'), 'utf8')).toContain('v2')
    expect(existsSync(path.join(folder, 'new.md'))).toBe(true)
    expect(existsSync(path.join(folder, 'references'))).toBe(false)
    expect((await catalog.list(project))[0]).toMatchObject({
      state: 'installed',
      installedCommit: COMMIT_B,
    })
    expect(leftovers(root)).toEqual([])
  })

  it('keeps the old version when the update fails', async () => {
    const { catalog, project, root, pin, host, serve } = await setup()
    pin(COMMIT_A, ['design'])
    await catalog.install('codex', project, ['design'])
    serve(COMMIT_B, { design: { 'SKILL.md': 'v2' } })
    pin(COMMIT_B, ['design'])
    // What the host sends is not what the manifest pinned.
    host.serve(COMMIT_B, { status: 200, body: Buffer.from('garbage') })

    const [result] = await catalog.install('codex', project, ['design'])

    expect(result?.ok).toBe(false)
    expect(
      readFileSync(path.join(installedSkillDir(root, 'design', 'design'), 'SKILL.md'), 'utf8'),
    ).toContain('v1')
    expect((await catalog.list(project))[0]).toMatchObject({
      state: 'update-available',
      installedCommit: COMMIT_A,
    })
    expect(leftovers(root)).toEqual([])
  })

  it('moves a skill to the folder of its new category when the manifest changes it', async () => {
    const { catalog, project, root, pin, serve } = await setup()
    pin(COMMIT_A, ['design'])
    await catalog.install('codex', project, ['design'])
    serve(COMMIT_B, { design: { 'SKILL.md': 'v2' } })
    pin(COMMIT_B, ['design'], { category: 'general' })

    await catalog.install('codex', project, ['design'])

    expect(existsSync(installedSkillDir(root, 'general', 'design'))).toBe(true)
    expect(existsSync(installedSkillDir(root, 'design', 'design'))).toBe(false)
    expect(readInstalledRecord(root).skills['design']).toMatchObject({ category: 'general' })
  })
})
