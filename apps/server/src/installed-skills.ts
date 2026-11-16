import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { AvailableSkillCategorySchema, type AvailableSkillCategory } from '@harness/contracts'
import { packCatalogText } from './default-skills.js'
import { parseSkillFrontmatter, skillName } from './skill-inventory.js'

/**
 * The skills installed from their authors live once, in the app's data folder,
 * laid out the way the bundled packs are: one plugin folder per category, so
 * the provider that loads plugins gets the folder and the others get a short
 * catalog of it.
 *
 *   third-party-skills/
 *     installed.json                  the record: id -> commit, category, set, installedAt
 *     <category>/                     "design", "motion" or "general"; a Claude Code plugin
 *       .claude-plugin/plugin.json    named tastecode-installed-<category>
 *       skills/<id>/SKILL.md
 *
 * A chat receives the `general` folder always, and the folder of its mode's
 * category (`design` or `motion`) when that mode is on.
 */

export const INSTALLED_SKILLS_DIR = 'third-party-skills'
export const INSTALLED_RECORD_FILE = 'installed.json'
/** One category's catalog stays within about 300 tokens, however many skills are installed. */
export const INSTALLED_CATALOG_MAX_CHARS = 1200

const COMMIT = /^[0-9a-f]{40}$/
const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/

export type InstalledEntry = {
  commit: string
  category: AvailableSkillCategory
  set?: string
  installedAt: string
}
export type InstalledRecord = { version: 1; skills: Record<string, InstalledEntry> }

/** Under the folder that holds the app's database. */
export function installedSkillsRoot(dataDir: string): string {
  return path.join(dataDir, INSTALLED_SKILLS_DIR)
}

export const installedPluginName = (category: AvailableSkillCategory) =>
  `tastecode-installed-${category}`

/** The plugin folder of one category. */
export const categoryPluginDir = (root: string, category: AvailableSkillCategory) =>
  path.join(root, category)

export const installedSkillDir = (root: string, category: AvailableSkillCategory, id: string) =>
  path.join(root, category, 'skills', id)

const EntrySchema = z.object({
  commit: z.string().regex(COMMIT),
  category: AvailableSkillCategorySchema,
  set: z.string().optional(),
  installedAt: z.string(),
})
const RecordSchema = z.object({
  version: z.literal(1),
  skills: z.record(z.string().regex(ID), EntrySchema),
})

/**
 * The record, or an empty one when there is none or it is damaged: the loss costs
 * the list its "installed" state, never a crash. Read synchronously, like the
 * bundle, so a session start never waits a tick for it.
 */
export function readInstalledRecord(root: string): InstalledRecord {
  try {
    return RecordSchema.parse(
      JSON.parse(readFileSync(path.join(root, INSTALLED_RECORD_FILE), 'utf8')),
    ) as InstalledRecord
  } catch {
    return { version: 1, skills: {} }
  }
}

export async function writeInstalledRecord(root: string, record: InstalledRecord): Promise<void> {
  await mkdir(root, { recursive: true })
  const file = path.join(root, INSTALLED_RECORD_FILE)
  const temporary = `${file}.${randomBytes(4).toString('hex')}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`)
    await rename(temporary, file)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

/** The plugin manifest of a category's folder, written before its first skill lands. */
export async function ensureCategoryPlugin(
  root: string,
  category: AvailableSkillCategory,
): Promise<void> {
  const manifest = path.join(categoryPluginDir(root, category), '.claude-plugin', 'plugin.json')
  if (existsSync(manifest)) return
  await mkdir(path.dirname(manifest), { recursive: true })
  await writeFile(
    manifest,
    `${JSON.stringify(
      {
        name: installedPluginName(category),
        description: `Agent Skills installed from their authors, for ${category} chats.`,
        author: { name: 'TUIFT Code' },
      },
      null,
      2,
    )}\n`,
  )
}

export type InstalledSkills = {
  /** The plugin folders for a provider that loads plugins, one per category that has a skill. */
  pluginDirs: string[]
  /** The folder names of the skills a chat receives, listed once. */
  skills: string[]
  /** A short list for providers that read skills on demand. */
  catalog: string
  /** The line that stands in for the catalog where the plugins are loaded. */
  loaded: string
}

/**
 * The installed skills a chat receives: `categories` is `general` plus the
 * category of the chat's mode. A skill the chat already has from the bundle
 * (`exclude`, by folder or by name) is left out, so nothing is listed twice.
 * Undefined when there is nothing to add.
 */
export function loadInstalledSkills(
  root: string,
  categories: readonly AvailableSkillCategory[],
  options: {
    /** The one-line summary the manifest gives a skill; absent, the line names the skill alone. */
    summary?: (id: string) => string | undefined
    exclude?: ReadonlySet<string>
  } = {},
): InstalledSkills | undefined {
  const record = readInstalledRecord(root)
  const pluginDirs: string[] = []
  const skills: string[] = []
  const groups: string[] = []
  for (const category of new Set(categories)) {
    const skillsDir = path.join(categoryPluginDir(root, category), 'skills')
    const folders: string[] = []
    const lines: string[] = []
    for (const [id, entry] of Object.entries(record.skills)) {
      if (entry.category !== category) continue
      let markdown: string
      try {
        markdown = readFileSync(path.join(skillsDir, id, 'SKILL.md'), 'utf8')
      } catch {
        continue
      }
      const name = skillName(parseSkillFrontmatter(markdown).name, id)
      if (options.exclude?.has(id) || options.exclude?.has(name)) continue
      const summary = options.summary?.(id)?.trim()
      folders.push(id)
      lines.push(`- ${name}${name === id ? '' : ` (folder ${id})`}${summary ? `: ${summary}` : ''}`)
    }
    if (!folders.length) continue
    pluginDirs.push(categoryPluginDir(root, category))
    skills.push(...folders)
    groups.push(
      packCatalogText(
        skillsDir,
        folders,
        lines,
        `Skills installed from their authors, one folder each in ${skillsDir}. Read a skill's SKILL.md only when the step calls for it:`,
        INSTALLED_CATALOG_MAX_CHARS,
      ),
    )
  }
  if (!skills.length) return undefined
  return {
    pluginDirs,
    skills,
    catalog: groups.join('\n'),
    loaded: 'The skills installed from their authors are loaded in this session.',
  }
}

/** What the orchestrator calls at a session start; the server builds it over the data folder. */
export type InstalledSkillsLoader = (
  categories: AvailableSkillCategory[],
  exclude: ReadonlySet<string>,
) => InstalledSkills | undefined

/** The categories a chat in `mode` loads installed skills of. */
export function installedCategories(mode: string | undefined): AvailableSkillCategory[] {
  return mode === 'design' || mode === 'motion' ? ['general', mode] : ['general']
}
