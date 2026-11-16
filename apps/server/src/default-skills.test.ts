import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  PACK_CATALOG_MAX_CHARS,
  defaultSkillsRoot,
  isDefaultSkillId,
  loadDefaultSkillPack,
  loadDefaultSkills,
} from './default-skills.js'
import {
  writeDefaultSkillPackFixture,
  writeDefaultSkillsFixture,
} from './default-skills.test-support.js'

const temporary: string[] = []

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tc-default-skills-'))
  temporary.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })),
  )
})

describe('default skills', () => {
  it('lists the bundled skills as read-only system skills with a short catalog', async () => {
    const root = await writeDefaultSkillsFixture(await tempDir())
    const loaded = loadDefaultSkills(root)

    expect(loaded.skills.map((skill) => [skill.id, skill.name, skill.scope])).toEqual([
      ['tastecode:cinetic', 'cinetic', 'system'],
      ['tastecode:design-taste-frontend', 'design-taste-frontend', 'system'],
      ['tastecode:cook', 'cook', 'system'],
    ])
    expect(loaded.skills[0]).toMatchObject({
      description: 'The long cinetic description.',
      source: { type: 'folder', path: path.join(root, 'skills', 'cinetic') },
      enabled: true,
    })
    expect(loaded.catalog).toContain(`one folder each in ${path.join(root, 'skills')}.`)
    expect(loaded.catalog).toContain('- cinetic: cinematic videos and motion design made in code\n')
    expect(loaded.catalog).toContain('never in a Design mode run')
    expect(loaded.skills.every((skill) => isDefaultSkillId(skill.id))).toBe(true)
    expect(loaded.commands).toEqual(
      ['cinetic', 'design-taste-frontend', 'cook'].map((name) => ({
        name,
        description: `The long ${name} description.`,
        aliases: [`tastecode:${name}`],
        kind: 'skill',
        source: 'plugin',
      })),
    )
  })

  it('treats a skill kept in this repository like a pinned one', async () => {
    const root = await writeDefaultSkillsFixture(await tempDir(), ['cook'])
    await writeFile(
      path.join(root, 'skills.json'),
      JSON.stringify({
        plugin: { name: 'tastecode' },
        skills: [
          {
            folder: 'cook',
            source: 'local',
            summary: 'our own loop',
            license: 'MIT',
            licenseFile: 'LICENSE',
            treeSha256: '0'.repeat(64),
            files: 2,
            bytes: 40,
          },
        ],
      }),
    )
    const loaded = loadDefaultSkills(root)
    expect(loaded.skills.map((skill) => [skill.id, skill.scope])).toEqual([
      ['tastecode:cook', 'system'],
    ])
    expect(loaded.catalog).toContain('- cook: our own loop')
    expect(loaded.commands.map((command) => command.name)).toEqual(['cook'])
  })

  it('uses the skill name with a manifest plugin alias, and lists none without a plugin', async () => {
    const root = await writeDefaultSkillsFixture(await tempDir(), ['cook'])
    await writeFile(
      path.join(root, 'skills.json'),
      JSON.stringify({ plugin: { name: 'acme' }, skills: [{ folder: 'cook' }] }),
    )
    await writeFile(
      path.join(root, 'skills', 'cook', 'SKILL.md'),
      '---\nname: cook-loop\ndescription: Loops.\n---\n',
    )
    expect(loadDefaultSkills(root).commands).toEqual([
      {
        name: 'cook-loop',
        description: 'Loops.',
        aliases: ['acme:cook'],
        kind: 'skill',
        source: 'plugin',
      },
    ])

    await writeFile(
      path.join(root, 'skills.json'),
      JSON.stringify({ skills: [{ folder: 'cook' }] }),
    )
    const unnamed = loadDefaultSkills(root)
    expect(unnamed.skills.map((skill) => skill.name)).toEqual(['cook-loop'])
    expect(unnamed.commands).toEqual([])
  })

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['colon', 'acme:cook'],
    ['whitespace', 'cook loop'],
    ['leading slash', '/cook'],
    ['over 200 characters', 'c'.repeat(201)],
  ])('keeps the qualified name when the skill name is %s', async (_label, name) => {
    const root = await writeDefaultSkillsFixture(await tempDir(), ['cook'])
    await writeFile(
      path.join(root, 'skills', 'cook', 'SKILL.md'),
      `---\n${name === undefined ? '' : `name: ${JSON.stringify(name)}\n`}description: Loops.\n---\n`,
    )
    expect(loadDefaultSkills(root).commands).toEqual([
      {
        name: 'tastecode:cook',
        description: 'Loops.',
        kind: 'skill',
        source: 'plugin',
      },
    ])
  })

  it('accepts a trimmed bare name at the 200-character limit', async () => {
    const root = await writeDefaultSkillsFixture(await tempDir(), ['cook'])
    const name = 'c'.repeat(200)
    await writeFile(
      path.join(root, 'skills', 'cook', 'SKILL.md'),
      `---\nname: "  ${name}  "\n---\n`,
    )
    expect(loadDefaultSkills(root).commands).toEqual([
      {
        name,
        description: '',
        aliases: ['tastecode:cook'],
        kind: 'skill',
        source: 'plugin',
      },
    ])
  })

  it('keeps the catalog under 700 characters for a long install path', async () => {
    const deep = path.join(
      await tempDir(),
      'Users',
      'someone-with-a-long-name',
      'AppData',
      'Local',
      'Programs',
      'TUIFT Code',
      'resources',
    )
    await mkdir(deep, { recursive: true })
    const loaded = loadDefaultSkills(await writeDefaultSkillsFixture(deep))

    expect(loaded.skills).toHaveLength(3)
    expect(loaded.catalog.length).toBeLessThan(700)
  })

  it('lists only skills that are on disk, and nothing without a bundle', async () => {
    const partial = loadDefaultSkills(await writeDefaultSkillsFixture(await tempDir(), ['cook']))
    expect(partial.skills.map((skill) => skill.name)).toEqual(['cook'])
    expect(partial.catalog).not.toContain('cinetic')

    const missing = loadDefaultSkills(path.join(await tempDir(), 'no-bundle'))
    expect(missing).toMatchObject({ skills: [], commands: [], catalog: '' })
  })

  it('reads the packaged folder from the environment and the workspace copy otherwise', () => {
    expect(defaultSkillsRoot({ HARNESS_DEFAULT_SKILLS_DIR: '/app/resources/default-skills' })).toBe(
      path.resolve('/app/resources/default-skills'),
    )
    expect(defaultSkillsRoot({})).toBe(
      path.resolve(import.meta.dirname, '..', '..', '..', 'packages', 'default-skills', 'bundle'),
    )
  })
})

describe('default skill packs', () => {
  const motion = [
    ['hyperframes', 'HTML video entry point'],
    ['stageshow', 'fake screens as video material'],
  ] as const

  it('keeps a pack out of the base bundle and returns its plugin directory and catalog', async () => {
    const root = await writeDefaultSkillsFixture(await tempDir())
    await writeDefaultSkillPackFixture(root, 'motion', motion)

    const base = loadDefaultSkills(root)
    expect(base.skills.map((skill) => skill.name)).toEqual([
      'cinetic',
      'design-taste-frontend',
      'cook',
    ])
    expect(base.commands.map((command) => command.name)).toEqual([
      'cinetic',
      'design-taste-frontend',
      'cook',
    ])
    expect(base.catalog).not.toContain('hyperframes')

    const pack = loadDefaultSkillPack('motion', root)
    expect(pack).toMatchObject({
      name: 'motion',
      pluginDir: path.join(root, 'packs', 'motion'),
      skills: ['hyperframes', 'stageshow'],
    })
    expect(pack?.catalog).toContain(
      `one folder each in ${path.join(root, 'packs', 'motion', 'skills')}.`,
    )
    expect(pack?.catalog).toContain(
      '- hyperframes: HTML video entry point\n- stageshow: fake screens',
    )
    expect(pack?.catalog).not.toContain('cinetic')
  })

  it('lists only the skills of the pack that are on disk', async () => {
    const root = await writeDefaultSkillsFixture(await tempDir())
    await writeDefaultSkillPackFixture(root, 'motion', motion, ['stageshow'])
    const pack = loadDefaultSkillPack('motion', root)
    expect(pack?.skills).toEqual(['stageshow'])
    expect(pack?.catalog).not.toContain('hyperframes')

    await writeDefaultSkillPackFixture(root, 'design', [['ui-profissional', 'screens']], [])
    expect(loadDefaultSkillPack('design', root)).toBeUndefined()
  })

  it.each([
    ['an undeclared pack', 'nope'],
    ['a name with a path in it', '../skills'],
    ['a name that only inherits from Object', 'constructor'],
    ['an empty name', ''],
  ])('returns nothing for %s', async (_label, name) => {
    const root = await writeDefaultSkillsFixture(await tempDir())
    await writeDefaultSkillPackFixture(root, 'motion', motion)
    expect(loadDefaultSkillPack(name, root)).toBeUndefined()
  })

  it('returns nothing without a bundle', async () => {
    expect(loadDefaultSkillPack('motion', path.join(await tempDir(), 'no-bundle'))).toBeUndefined()
  })

  it('caps a large pack: descriptions for the first skills, names for the rest, then a pointer', async () => {
    const deep = path.join(await tempDir(), 'Users', 'someone-with-a-long-name', 'AppData', 'Local')
    const root = await writeDefaultSkillsFixture(path.join(deep, 'Programs', 'TUIFT Code'))
    const many = Array.from(
      { length: 60 },
      (_, index) =>
        [
          `skill-${String(index).padStart(2, '0')}`,
          'a description of about sixty characters, as long as the longest one',
        ] as const,
    )
    await writeDefaultSkillPackFixture(root, 'motion', many)
    const { catalog, skills } = loadDefaultSkillPack('motion', root) ?? { catalog: '', skills: [] }

    expect(skills).toHaveLength(60)
    expect(catalog.length).toBeLessThanOrEqual(PACK_CATALOG_MAX_CHARS)
    expect(catalog).toContain('- skill-00: a description')
    expect(catalog).not.toContain('- skill-59:')
    expect(catalog).toMatch(/\nMore, by name: skill-\d\d, /)
    expect(catalog.endsWith(', and others (list the folder above)')).toBe(true)
    // Names are whole: the cut falls between names, not inside one.
    expect(
      catalog
        .split('\nMore, by name: ')[1]!
        .replace(', and others (list the folder above)', '')
        .split(', ')
        .every((name) => /^skill-\d\d$/.test(name)),
    ).toBe(true)
  })

  it('names the rest in full when that fits the cap', async () => {
    const root = await writeDefaultSkillsFixture(await tempDir())
    const many = Array.from(
      { length: 30 },
      (_, index) =>
        [
          `skill-${String(index).padStart(2, '0')}`,
          'a description of about sixty characters, as long as the longest one',
        ] as const,
    )
    await writeDefaultSkillPackFixture(root, 'motion', many)
    const { catalog } = loadDefaultSkillPack('motion', root) ?? { catalog: '' }
    expect(catalog.length).toBeLessThanOrEqual(PACK_CATALOG_MAX_CHARS)
    expect(catalog).toContain('\nMore, by name: ')
    expect(catalog).toContain('skill-29')
    expect(catalog).not.toContain('others')
  })

  it.skipIf(!existsSync(path.join(defaultSkillsRoot(), 'packs', 'motion')))(
    'fits the real Motion pack within the cap and lists the HyperFrames entry point',
    () => {
      const pack = loadDefaultSkillPack('motion')
      expect(pack?.skills).toHaveLength(19)
      expect(pack?.skills.slice(0, 3)).toEqual([
        'motion-app-ae',
        'composicao-trilha',
        'video-referencias',
      ])
      expect(pack?.catalog.length).toBeLessThanOrEqual(PACK_CATALOG_MAX_CHARS)
      expect(pack?.catalog).toContain('- hyperframes: ')
      expect(loadDefaultSkills().skills).toHaveLength(5)
    },
  )
})
