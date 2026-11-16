import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  INSTALLED_CATALOG_MAX_CHARS,
  installedCategories,
  installedSkillsRoot,
  loadInstalledSkills,
  readInstalledRecord,
} from './installed-skills.js'
import { writeInstalledSkillsFixture } from './installed-skills.test-support.js'

const folders: string[] = []
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

function dataFolder(): string {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'harness-installed-'))
  folders.push(folder)
  return installedSkillsRoot(folder)
}

describe('the data folder of installed skills', () => {
  it('sits in a folder of its own beside the database', () => {
    expect(installedSkillsRoot(path.join('data'))).toBe(path.join('data', 'third-party-skills'))
  })

  it('reads a missing record as an empty one, and a written one back', async () => {
    const root = dataFolder()
    expect(readInstalledRecord(root)).toEqual({ version: 1, skills: {} })
    await writeInstalledSkillsFixture(root, [{ id: 'a', category: 'design' }])
    expect(Object.keys(readInstalledRecord(root).skills)).toEqual(['a'])
  })
})

describe('the skills a chat receives', () => {
  it('loads general always and the category of the mode, nothing else', async () => {
    const root = dataFolder()
    await writeInstalledSkillsFixture(root, [
      { id: 'every-chat', category: 'general' },
      { id: 'for-design', category: 'design' },
      { id: 'for-motion', category: 'motion' },
    ])

    const design = loadInstalledSkills(root, installedCategories('design'))
    const motion = loadInstalledSkills(root, installedCategories('motion'))
    const plain = loadInstalledSkills(root, installedCategories(undefined))

    expect(design?.skills).toEqual(['every-chat', 'for-design'])
    expect(design?.pluginDirs).toEqual([path.join(root, 'general'), path.join(root, 'design')])
    expect(motion?.skills).toEqual(['every-chat', 'for-motion'])
    expect(motion?.pluginDirs).toEqual([path.join(root, 'general'), path.join(root, 'motion')])
    expect(plain?.skills).toEqual(['every-chat'])
    expect(plain?.pluginDirs).toEqual([path.join(root, 'general')])
    expect(design?.catalog).toContain('- for-design')
    expect(design?.catalog).not.toContain('for-motion')
  })

  it('adds nothing when nothing of those categories is installed', async () => {
    const root = dataFolder()
    expect(loadInstalledSkills(root, installedCategories('design'))).toBeUndefined()
    await writeInstalledSkillsFixture(root, [{ id: 'for-motion', category: 'motion' }])
    expect(loadInstalledSkills(root, installedCategories('design'))).toBeUndefined()
    expect(loadInstalledSkills(root, installedCategories(undefined))).toBeUndefined()
  })

  it('treats a skill whose files are gone from the disk as not there', async () => {
    const root = dataFolder()
    await writeInstalledSkillsFixture(root, [{ id: 'gone', category: 'design' }])
    rmSync(path.join(root, 'design', 'skills', 'gone'), { recursive: true })
    expect(loadInstalledSkills(root, ['design'])).toBeUndefined()
  })

  it('names each skill with the summary the manifest gives, and its folder when it differs', async () => {
    const root = dataFolder()
    await writeInstalledSkillsFixture(root, [
      { id: 'tidy', category: 'design' },
      { id: 'folder-name', category: 'design', name: 'skill-name' },
    ])

    const loaded = loadInstalledSkills(root, ['design'], {
      summary: (id) => (id === 'tidy' ? ' keeps things tidy ' : undefined),
    })

    expect(loaded?.catalog).toContain('- tidy: keeps things tidy')
    expect(loaded?.catalog).toContain('- skill-name (folder folder-name)')
    expect(loaded?.catalog).toContain(path.join(root, 'design', 'skills'))
    expect(loaded?.loaded).toContain('are loaded in this session')
  })

  it('lists a skill the chat already has from the bundle once, by folder or by name', async () => {
    const root = dataFolder()
    await writeInstalledSkillsFixture(root, [
      { id: 'in-the-bundle', category: 'design' },
      { id: 'renamed-folder', category: 'design', name: 'bundled-name' },
      { id: 'only-installed', category: 'design' },
    ])

    const loaded = loadInstalledSkills(root, ['design'], {
      exclude: new Set(['in-the-bundle', 'bundled-name']),
    })

    expect(loaded?.skills).toEqual(['only-installed'])
    expect(loaded?.catalog).not.toContain('in-the-bundle')
    expect(loaded?.catalog).not.toContain('bundled-name')
    // Nothing left to add: no plugin folder either.
    expect(
      loadInstalledSkills(root, ['design'], {
        exclude: new Set(['in-the-bundle', 'bundled-name', 'only-installed']),
      }),
    ).toBeUndefined()
  })

  it('keeps a category catalog within its cap however many skills are installed', async () => {
    const root = dataFolder()
    await writeInstalledSkillsFixture(
      root,
      Array.from({ length: 60 }, (_, index) => ({
        id: `installed-skill-number-${index}`,
        category: 'design' as const,
      })),
    )

    const loaded = loadInstalledSkills(root, ['design'], {
      summary: () => 'a summary of about this many characters, as the manifest writes them',
    })

    expect(loaded?.catalog.length).toBeLessThanOrEqual(INSTALLED_CATALOG_MAX_CHARS)
    expect(loaded?.catalog).toContain('More, by name:')
    expect(loaded?.skills).toHaveLength(60)
  })
})
