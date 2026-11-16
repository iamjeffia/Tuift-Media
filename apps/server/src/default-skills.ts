import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ProviderCommand, Skill } from '@harness/contracts'
import { parseSkillFrontmatter, skillName } from './skill-inventory.js'

/** Ids of the skills that ship with TUIFT Code; no provider owns them, so none can switch them. */
export const DEFAULT_SKILL_ID_PREFIX = 'tastecode:'

export type DefaultSkills = {
  /**
   * The bundle folder. It is a plain skills tree (`skills/<name>/SKILL.md`)
   * and a Claude Code plugin (`.claude-plugin/plugin.json`) at once.
   */
  root: string
  skills: Skill[]
  /**
   * The skills as slash commands, with bare SKILL.md names preferred over
   * plugin-qualified aliases. None when skills.json names no plugin.
   */
  commands: ProviderCommand[]
  /** A few lines for shared instructions, or '' when no skill is installed. */
  catalog: string
}

type BundledEntry = { folder?: unknown; summary?: unknown; pack?: unknown }

/** The packs an entry of skills.json is in: `"pack": "a"` or `"pack": ["a", "b"]`; none for the base bundle. */
function entryPacks(entry: BundledEntry): unknown[] {
  return entry.pack === undefined ? [] : Array.isArray(entry.pack) ? entry.pack : [entry.pack]
}

const BUNDLE_NAME = /^[\w.-]+$/
/** The longest command name or alias the contracts accept. */
const MAX_COMMAND_NAME = 200

/**
 * A packaged app names its resources copy; an unpackaged run reads the folder
 * `pnpm --filter @harness/default-skills sync` fills. Both `src` and `dist`
 * sit one level under `apps/server`.
 */
export function defaultSkillsRoot(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env['HARNESS_DEFAULT_SKILLS_DIR']?.trim()
  if (configured) return path.resolve(configured)
  return fileURLToPath(new URL('../../../packages/default-skills/bundle', import.meta.url))
}

/**
 * Reads the bundled skills that are actually on disk. A checkout that never
 * fetched them, or a damaged install, lists none and adds no catalog rather
 * than pointing agents at files that are not there. It reads a few small
 * files once, synchronously, so a session start never waits a tick for it:
 * resume and Stop races depend on a session being created right away.
 */
export function loadDefaultSkills(root = defaultSkillsRoot()): DefaultSkills {
  let entries: BundledEntry[]
  let plugin: string | undefined
  try {
    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8')) as {
      skills?: unknown
      plugin?: { name?: unknown }
    }
    entries = Array.isArray(manifest.skills) ? (manifest.skills as BundledEntry[]) : []
    const name = manifest.plugin?.name
    plugin = typeof name === 'string' && BUNDLE_NAME.test(name) ? name : undefined
  } catch {
    return { root, skills: [], commands: [], catalog: '' }
  }
  const skills: Skill[] = []
  const commands: ProviderCommand[] = []
  const lines: string[] = []
  for (const entry of entries) {
    if (typeof entry.folder !== 'string' || !BUNDLE_NAME.test(entry.folder)) continue
    // A pack's skills are not in the base plugin; they load through loadDefaultSkillPack.
    if (entry.pack !== undefined) continue
    const dir = path.join(root, 'skills', entry.folder)
    let markdown: string
    try {
      markdown = readFileSync(path.join(dir, 'SKILL.md'), 'utf8')
    } catch {
      continue
    }
    const frontmatter = parseSkillFrontmatter(markdown)
    const name = skillName(frontmatter.name, entry.folder)
    skills.push({
      id: `${DEFAULT_SKILL_ID_PREFIX}${name}`,
      name,
      description: frontmatter.description ?? '',
      source: { type: 'folder', path: dir },
      scope: 'system',
      enabled: true,
      dependencyErrors: [],
    })
    const command = plugin ? pluginCommand(plugin, entry.folder, frontmatter) : undefined
    if (command) commands.push(command)
    const summary = typeof entry.summary === 'string' ? entry.summary.trim() : ''
    const where = entry.folder === name ? '' : ` (folder ${entry.folder})`
    lines.push(`- ${name}${where}${summary ? `: ${summary}` : ''}`)
  }
  return {
    root,
    skills,
    commands,
    catalog: lines.length ? catalogText(path.join(root, 'skills'), lines) : '',
  }
}

/**
 * Plugin skills run by their bare SKILL.md name as well as `<plugin>:<folder>`
 * (the acme-docs row of inventory-claude-2.1.296.json). Prefer the bare name in
 * the slash menu and keep the qualified name as an alias.
 */
function pluginCommand(
  plugin: string,
  folder: string,
  frontmatter: { name?: string; description?: string },
): ProviderCommand | undefined {
  const qualified = `${plugin}:${folder}`
  if (qualified.length > MAX_COMMAND_NAME) return undefined
  const bare = frontmatter.name?.trim()
  const validBare = bare && bare.length <= MAX_COMMAND_NAME && /^[^/\s:][^\s:]*$/.test(bare)
  return {
    name: validBare ? bare : qualified,
    description: frontmatter.description ?? '',
    ...(validBare ? { aliases: [qualified] } : {}),
    kind: 'skill',
    source: 'plugin',
  }
}

/**
 * Names, one line each and where to read more: every session pays for these
 * tokens, so the skill text itself is read only when a task needs it. Design
 * runs get their own direction and say not to use outside design skills.
 */
function catalogText(directory: string, lines: string[]): string {
  return [
    `Skills included with TUIFT Code, one folder each in ${directory}. Read a skill's SKILL.md only when the task calls for it, never in a Design mode run:`,
    ...lines,
  ].join('\n')
}

export function isDefaultSkillId(id: string): boolean {
  return id.startsWith(DEFAULT_SKILL_ID_PREFIX)
}

/**
 * The folder names of every skill the bundle declares, base and packs, whether or
 * not its files are on disk. A skill from its author with one of these names is
 * already shipped, so it is not offered and not loaded a second time.
 */
export function bundledSkillFolders(root = defaultSkillsRoot()): Set<string> {
  try {
    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8')) as {
      skills?: unknown
    }
    const entries = Array.isArray(manifest.skills) ? (manifest.skills as BundledEntry[]) : []
    return new Set(
      entries.flatMap((entry) => (typeof entry.folder === 'string' ? [entry.folder] : [])),
    )
  } catch {
    return new Set()
  }
}

/** A catalog of a pack stays within about 450 tokens, whatever its install path. */
export const PACK_CATALOG_MAX_CHARS = 1800

export type DefaultSkillPack = {
  name: string
  /** The pack as a Claude Code plugin directory: pass it as one more `--plugin-dir`. */
  pluginDir: string
  /** The folder names of the skills of the pack that are on disk, in catalog order. */
  skills: string[]
  /** A short list for providers that read skills on demand. */
  catalog: string
}

/**
 * One pack of the bundle (`packs/<name>/`, laid out by packages/default-skills):
 * its plugin directory for Claude Code and a capped catalog for the other
 * providers. A chat receives a pack only through its mode (motion-session.ts).
 * Undefined when the pack is not declared, or none of its skills is on disk.
 */
export function loadDefaultSkillPack(
  name: string,
  root = defaultSkillsRoot(),
): DefaultSkillPack | undefined {
  if (!BUNDLE_NAME.test(name)) return undefined
  let entries: BundledEntry[]
  let declared: boolean
  try {
    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8')) as {
      skills?: unknown
      packs?: Record<string, unknown>
    }
    entries = Array.isArray(manifest.skills) ? (manifest.skills as BundledEntry[]) : []
    declared = Object.hasOwn(manifest.packs ?? {}, name)
  } catch {
    return undefined
  }
  if (!declared) return undefined
  const pluginDir = path.join(root, 'packs', name)
  const skillsDir = path.join(pluginDir, 'skills')
  const skills: string[] = []
  const lines: string[] = []
  for (const entry of entries) {
    if (!entryPacks(entry).includes(name) || typeof entry.folder !== 'string') continue
    if (!BUNDLE_NAME.test(entry.folder)) continue
    let markdown: string
    try {
      markdown = readFileSync(path.join(skillsDir, entry.folder, 'SKILL.md'), 'utf8')
    } catch {
      continue
    }
    const frontmatter = parseSkillFrontmatter(markdown)
    const skill = skillName(frontmatter.name, entry.folder)
    const summary = typeof entry.summary === 'string' ? entry.summary.trim() : ''
    const where = entry.folder === skill ? '' : ` (folder ${entry.folder})`
    skills.push(entry.folder)
    lines.push(`- ${skill}${where}${summary ? `: ${summary}` : ''}`)
  }
  if (!skills.length) return undefined
  return { name, pluginDir, skills, catalog: packCatalogText(skillsDir, skills, lines) }
}

/**
 * Entry points first: lines are kept, in bundle order, while they fit the cap.
 * The rest is named without a description, and when even that is too long, the
 * agent is told to list the folder. A pack is large, and every session of its
 * mode pays for these tokens.
 */
export function packCatalogText(
  directory: string,
  folders: string[],
  lines: string[],
  head = `Skills for this kind of work, one folder each in ${directory}. Read a skill's SKILL.md only when the step calls for it:`,
  max = PACK_CATALOG_MAX_CHARS,
): string {
  let text = head
  // Room kept for the line that names the rest.
  const budget = max - 220
  let shown = 0
  while (shown < lines.length && text.length + 1 + lines[shown]!.length <= budget)
    text += `\n${lines[shown++]}`
  const rest = folders.slice(shown)
  if (!rest.length) return text
  const prefix = '\nMore, by name: '
  const names = rest.join(', ')
  if (text.length + prefix.length + names.length <= max) return text + prefix + names
  const pointer = ', and others (list the folder above)'
  const room = max - text.length - prefix.length - pointer.length
  const fit = names.slice(0, Math.max(room, 0))
  return text + prefix + fit.slice(0, Math.max(fit.lastIndexOf(', '), 0)) + pointer
}
