import { readFileSync } from 'node:fs'
import { lstat, mkdir, mkdtemp, readFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type {
  AvailableSkill,
  AvailableSkillCategory,
  ProviderId,
  SkillInstallResult,
} from '@harness/contracts'
import {
  categoryPluginDir,
  ensureCategoryPlugin,
  installedSkillDir,
  readInstalledRecord,
  writeInstalledRecord,
  type InstalledEntry,
} from './installed-skills.js'
import {
  DEFAULT_DOWNLOAD_POLICY,
  downloadArchive,
  unpackSkill,
  type DownloadPolicy,
} from './skill-download.js'
import { projectSkillsDir } from './skill-inventory.js'

/**
 * Third-party skills TUIFT Code does not ship. `packages/default-skills/third-party-skills.json`
 * lists them; an install downloads the pinned commit from the author's repository,
 * checks it and unpacks the skill into the app's own data folder (see
 * `installed-skills.ts`), where every project and every provider reaches it.
 */

const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/
const HOST = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/
const SHA256 = /^[0-9a-f]{64}$/
const COMMIT = /^[0-9a-f]{40}$/

const SourceSchema = z.object({
  host: z.string().regex(HOST),
  repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  commit: z.string().regex(COMMIT),
  archiveSha256: z.string().regex(SHA256),
  archiveBytes: z.number().int().positive(),
  path: z
    .string()
    .min(1)
    .refine(
      (value) => value.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
      'expected a relative path inside the repository',
    ),
  url: z.url().refine((value) => value.startsWith('https://'), 'expected an https URL'),
})

const LicenseSchema = z
  .object({
    /** As the repository declares it; null when it declares none. */
    name: z.string().min(1).nullable(),
    /** The licence file inside the repository and its SHA-256, which the maintainer's check compares. */
    file: z.string().min(1).optional(),
    sha256: z.string().regex(SHA256).optional(),
  })
  .refine(
    (license) => (license.name === null ? !license.file : Boolean(license.file && license.sha256)),
    'a declared licence names its file and hash; no licence names neither',
  )

const EntrySchema = z.object({
  id: z.string().regex(ID),
  name: z.string().min(1),
  summary: z.object({ en: z.string().min(1), 'pt-BR': z.string().min(1) }),
  author: z.string().min(1),
  category: z.enum(['motion', 'design', 'general']),
  set: z.string().min(1).optional(),
  source: SourceSchema,
  license: LicenseSchema,
})
export type CatalogEntry = z.infer<typeof EntrySchema>

const ManifestSchema = z
  .object({ version: z.literal(1), skills: z.array(EntrySchema).min(1) })
  .refine(
    (manifest) => new Set(manifest.skills.map((entry) => entry.id)).size === manifest.skills.length,
    'skill ids must be unique',
  )

/** Reads and validates the manifest. A malformed one is a build mistake, so it throws. */
export function parseCatalog(text: string): CatalogEntry[] {
  return ManifestSchema.parse(JSON.parse(text)).skills
}

/** The manifest at `file`, validated; an install that lost it cannot list or install anything. */
export function readCatalogFile(file: string): CatalogEntry[] {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    throw new Error('The list of skills from their authors is missing from this install')
  }
  return parseCatalog(text)
}

/** Beside the default skills bundle: `packages/default-skills`, or `resources` once packaged. */
export function thirdPartySkillsFile(defaultSkillsDir: string): string {
  return path.join(path.dirname(defaultSkillsDir), 'third-party-skills.json')
}

/**
 * What an earlier version remembered about the skills it installed into a project
 * (`.agents/skills/.tuift-catalog.json`, `{ version: 1, skills: { <id>: { commit,
 * category, set?, installedAt } } }`). It is only read now: such a skill stays in
 * its project and the page says so, but nothing installs into a project any more.
 */
export type CatalogRecord = {
  version: 1
  skills: Record<
    string,
    { commit: string; category: AvailableSkillCategory; set?: string; installedAt: string }
  >
}

export const CATALOG_RECORD_FILE = '.tuift-catalog.json'

export async function readCatalogRecord(projectPath: string): Promise<CatalogRecord> {
  const empty: CatalogRecord = { version: 1, skills: {} }
  let text: string
  try {
    text = await readFile(path.join(projectSkillsDir(projectPath), CATALOG_RECORD_FILE), 'utf8')
  } catch {
    return empty
  }
  try {
    const parsed = z
      .object({
        version: z.literal(1),
        skills: z.record(
          z.string(),
          z.object({
            commit: z.string().regex(COMMIT),
            category: z.enum(['motion', 'design', 'general']),
            set: z.string().optional(),
            installedAt: z.string(),
          }),
        ),
      })
      .parse(JSON.parse(text))
    return parsed as CatalogRecord
  } catch {
    // A damaged record only costs the "installed" detail; the folders are still there.
    return empty
  }
}

type FolderState = 'missing' | 'folder' | 'other'

async function folderState(destination: string): Promise<FolderState> {
  try {
    const info = await lstat(destination)
    return info.isDirectory() ? 'folder' : 'other'
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing'
    throw error
  }
}

export type SkillCatalogOptions = {
  /** The validated manifest entries; read again on every call so a new manifest shows at once. */
  entries: () => CatalogEntry[]
  /** The app's folder of installed third-party skills (`installedSkillsRoot`). */
  root: string
  /** Folder names the bundle ships. A manifest entry with one of them is neither offered nor installed. */
  bundled?: () => ReadonlySet<string>
  /** Tells the page the skills changed; it names the provider and project of the page that asked. */
  onChanged: (provider: ProviderId, projectPath: string) => void
  policy?: DownloadPolicy
}

export class SkillCatalog {
  readonly #options: SkillCatalogOptions
  /** One change at a time: an install holds an archive and a copy of its skill in memory and on disk. */
  #queue: Promise<unknown> = Promise.resolve()

  constructor(options: SkillCatalogOptions) {
    this.#options = options
  }

  /** The manifest's skills that do not ship with the app, with their state. */
  async list(projectPath: string): Promise<AvailableSkill[]> {
    const record = readInstalledRecord(this.#options.root)
    const legacy = await readCatalogRecord(projectPath)
    const legacyDir = projectSkillsDir(projectPath)
    const bundled = this.#options.bundled?.()
    const skills: AvailableSkill[] = []
    for (const entry of this.#options.entries()) {
      if (bundled?.has(entry.id)) continue
      const recorded = record.skills[entry.id]
      // An id the Clube's library also uses is that skill's, not this entry's.
      const own = recorded?.origin === 'clube' ? undefined : recorded
      const installedHere =
        own !== undefined &&
        (await folderState(installedSkillDir(this.#options.root, own.category, entry.id))) ===
          'folder'
      // An earlier install into this project: still shown, never moved or removed.
      const earlier =
        !installedHere && (await folderState(path.join(legacyDir, entry.id))) !== 'missing'
      const installed = installedHere ? own : earlier ? legacy.skills[entry.id] : undefined
      skills.push({
        id: entry.id,
        name: entry.name,
        summary: entry.summary,
        author: entry.author,
        category: entry.category,
        ...(entry.set ? { set: entry.set } : {}),
        license: entry.license.name,
        sourceUrl: entry.source.url,
        commit: entry.source.commit,
        state:
          !installedHere && !earlier
            ? 'not-installed'
            : installedHere && installed && installed.commit !== entry.source.commit
              ? 'update-available'
              : 'installed',
        ...(installed?.commit ? { installedCommit: installed.commit } : {}),
        ...(installedHere ? { installedFor: 'app' as const } : {}),
        ...(earlier ? { installedFor: 'project' as const } : {}),
      })
    }
    // The skills the person installed from the Clube's library: no manifest entry, one record each.
    const listed = new Set(skills.map((skill) => skill.id))
    for (const [id, own] of Object.entries(record.skills)) {
      if (own.origin !== 'clube' || listed.has(id)) continue
      if (
        (await folderState(installedSkillDir(this.#options.root, own.category, id))) !== 'folder'
      ) {
        continue
      }
      skills.push({
        id,
        name: own.title ?? id,
        summary: { en: own.summary ?? own.title ?? id, 'pt-BR': own.summary ?? own.title ?? id },
        author: 'Clube do Motion',
        category: own.category,
        license: null,
        sourceUrl: own.page ?? 'https://clubedomotion.com',
        commit: own.installedAt,
        state: 'installed',
        installedFor: 'app',
        origin: 'clube',
      })
    }
    return skills
  }

  /**
   * Installs a skill that did not come from the manifest (one from the Clube's library): `stage`
   * writes the skill's files into the new folder it is given, and from there the move into the
   * app's data folder, the record and the rollback are the same as for a skill from an author.
   * Refuses an id the manifest or the bundle already uses.
   */
  installStaged(
    provider: ProviderId,
    projectPath: string,
    skill: {
      id: string
      category: AvailableSkillCategory
      title: string
      summary: string
      page?: string
    },
    stage: (folder: string) => Promise<void>,
  ): Promise<void> {
    const run = this.#queue.then(async () => {
      const taken =
        this.#options.bundled?.().has(skill.id) ||
        this.#options.entries().some((entry) => entry.id === skill.id)
      const before = readInstalledRecord(this.#options.root).skills[skill.id]
      if (taken || (before && before.origin !== 'clube')) {
        throw new Error('This skill id is already used by a skill TUIFT Code lists')
      }
      await this.#place(
        skill.id,
        skill.category,
        {
          origin: 'clube',
          title: skill.title,
          summary: skill.summary,
          ...(skill.page ? { page: skill.page } : {}),
        },
        stage,
      )
      this.#options.onChanged(provider, projectPath)
    })
    this.#queue = run.catch(() => undefined)
    return run
  }

  /**
   * Installs the named skills one after another, downloading each archive once
   * however many of its skills are asked for. A failure is reported for its own
   * skill (or for every skill of the archive it came with) and the rest go on.
   */
  install(provider: ProviderId, projectPath: string, ids: string[]): Promise<SkillInstallResult[]> {
    const run = this.#queue.then(() => this.#installAll(provider, projectPath, ids))
    this.#queue = run.catch(() => undefined)
    return run
  }

  /** Removes a skill installed for the whole app: its folder and its record. */
  remove(provider: ProviderId, projectPath: string, id: string): Promise<void> {
    const run = this.#queue.then(async () => {
      const root = this.#options.root
      const record = readInstalledRecord(root)
      const own = record.skills[id]
      if (!own) throw new Error('This skill is not installed for the whole app')
      // The record goes first: a folder left behind is never loaded, a record without one is never shown.
      delete record.skills[id]
      await writeInstalledRecord(root, record)
      const last = !Object.values(record.skills).some((entry) => entry.category === own.category)
      await rm(
        last ? categoryPluginDir(root, own.category) : installedSkillDir(root, own.category, id),
        { recursive: true, force: true, maxRetries: 5, retryDelay: 100 },
      )
      this.#options.onChanged(provider, projectPath)
    })
    this.#queue = run.catch(() => undefined)
    return run
  }

  async #installAll(
    provider: ProviderId,
    projectPath: string,
    ids: string[],
  ): Promise<SkillInstallResult[]> {
    const bundled = this.#options.bundled?.()
    const entries = new Map(this.#options.entries().map((entry) => [entry.id, entry]))
    const results = new Map<string, SkillInstallResult>()
    const groups = new Map<string, CatalogEntry[]>()
    for (const id of new Set(ids)) {
      const entry = entries.get(id)
      if (!entry) {
        results.set(id, { id, ok: false, message: 'This skill is not in the list from authors' })
        continue
      }
      if (bundled?.has(id)) {
        results.set(id, { id, ok: false, message: 'This skill already ships with TUIFT Code' })
        continue
      }
      const key = `${entry.source.host}/${entry.source.repository}@${entry.source.commit}`
      groups.set(key, [...(groups.get(key) ?? []), entry])
    }

    for (const group of groups.values()) {
      const pending: CatalogEntry[] = []
      for (const entry of group) {
        if (await this.#current(entry)) results.set(entry.id, { id: entry.id, ok: true })
        else pending.push(entry)
      }
      if (!pending.length) continue
      let archive: Buffer
      try {
        archive = await downloadArchive(
          pending[0]!.source,
          this.#options.policy ?? DEFAULT_DOWNLOAD_POLICY,
        )
      } catch (error) {
        for (const entry of pending) results.set(entry.id, failure(entry.id, error))
        continue
      }
      for (const entry of pending) {
        try {
          await this.#installOne(entry, archive)
          results.set(entry.id, { id: entry.id, ok: true })
        } catch (error) {
          results.set(entry.id, failure(entry.id, error))
        }
        // After each skill, so the page shows them arrive one by one.
        this.#options.onChanged(provider, projectPath)
      }
    }
    return ids.filter((id, index) => ids.indexOf(id) === index).map((id) => results.get(id)!)
  }

  /** Installed for the app at the pinned commit: nothing to do. */
  async #current(entry: CatalogEntry): Promise<boolean> {
    const own = readInstalledRecord(this.#options.root).skills[entry.id]
    return (
      own?.origin !== 'clube' &&
      own?.commit === entry.source.commit &&
      own.category === entry.category &&
      (await folderState(installedSkillDir(this.#options.root, own.category, entry.id))) ===
        'folder'
    )
  }

  async #installOne(entry: CatalogEntry, archive: Buffer): Promise<void> {
    await this.#place(
      entry.id,
      entry.category,
      {
        commit: entry.source.commit,
        ...(entry.set ? { set: entry.set } : {}),
      },
      (folder) => unpackSkill(archive, entry.source.path, folder).then(() => undefined),
    )
  }

  /** Stages the skill's folder, moves it into place and records it; a failure leaves what was there. */
  async #place(
    id: string,
    category: AvailableSkillCategory,
    extra: Pick<InstalledEntry, 'commit' | 'origin' | 'title' | 'summary' | 'page' | 'set'>,
    stage: (folder: string) => Promise<void>,
  ): Promise<void> {
    const root = this.#options.root
    await mkdir(root, { recursive: true })
    // Inside the data folder, so the final move is a rename on the same volume.
    const staging = await mkdtemp(path.join(root, '.staging-'))
    const destination = installedSkillDir(root, category, id)
    try {
      const folder = path.join(staging, id)
      await stage(folder)
      await ensureCategoryPlugin(root, category)
      await mkdir(path.dirname(destination), { recursive: true })
      // An update, or what a crash left: moved aside, so a failure can put it back.
      const aside =
        (await folderState(destination)) === 'missing' ? undefined : path.join(staging, 'replaced')
      if (aside) await rename(destination, aside)
      try {
        await rename(folder, destination)
        const record = readInstalledRecord(root)
        const before = record.skills[id]
        record.skills[id] = {
          ...extra,
          category,
          installedAt: new Date().toISOString(),
        }
        await writeInstalledRecord(root, record)
        // The manifest moved the skill to another category: its old folder goes.
        if (before && before.category !== category) {
          await rm(installedSkillDir(root, before.category, id), {
            recursive: true,
            force: true,
          })
        }
      } catch (error) {
        // Nothing half-installed: without its record the new folder goes and the old one comes back.
        await rm(destination, { recursive: true, force: true })
        if (aside) await rename(aside, destination).catch(() => undefined)
        throw error
      }
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
  }
}

function failure(id: string, error: unknown): SkillInstallResult {
  return { id, ok: false, message: error instanceof Error ? error.message : String(error) }
}
