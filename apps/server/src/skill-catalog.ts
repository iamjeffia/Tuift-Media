import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { lstat, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import type {
  AvailableSkill,
  AvailableSkillCategory,
  ProviderId,
  Skill,
  SkillInstallResult,
} from '@harness/contracts'
import {
  DEFAULT_DOWNLOAD_POLICY,
  downloadArchive,
  unpackSkill,
  type DownloadPolicy,
} from './skill-download.js'
import { projectSkillsDir } from './skill-inventory.js'

/**
 * Third-party skills TUIFT Code does not ship. `packages/default-skills/third-party-skills.json`
 * lists them; an install downloads the pinned commit from the author's repository
 * and hands the unpacked folder to the same code path "install from a folder" uses.
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
 * What TUIFT Code remembers about the skills it installed from their authors.
 * It lives in the project, next to the skills (`.agents/skills/.tuift-catalog.json`);
 * the leading dot keeps the skill listing from reading it as a skill. Read it to
 * tell which skills came from the catalog, at which commit, and in which category.
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
    // A damaged record only costs the "installed at" detail; the folders are still there.
    return empty
  }
}

async function writeCatalogRecord(projectPath: string, record: CatalogRecord): Promise<void> {
  const file = path.join(projectSkillsDir(projectPath), CATALOG_RECORD_FILE)
  const temporary = `${file}.${randomBytes(4).toString('hex')}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`)
    await rename(temporary, file)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
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
  /** The "install from a folder" path: copies the folder into the project and returns the skill. */
  installFolder: (provider: ProviderId, projectPath: string, folderPath: string) => Promise<Skill>
  /** Tells the page the project's skills changed. */
  onChanged: (provider: ProviderId, projectPath: string) => void
  policy?: DownloadPolicy
}

export class SkillCatalog {
  readonly #options: SkillCatalogOptions
  /** One install at a time: each holds an archive and a copy of its skill in memory and on disk. */
  #queue: Promise<unknown> = Promise.resolve()

  constructor(options: SkillCatalogOptions) {
    this.#options = options
  }

  /** The manifest's skills with their state in this project. */
  async list(projectPath: string): Promise<AvailableSkill[]> {
    const record = await readCatalogRecord(projectPath)
    const root = projectSkillsDir(projectPath)
    const skills: AvailableSkill[] = []
    for (const entry of this.#options.entries()) {
      const present = (await folderState(path.join(root, entry.id))) !== 'missing'
      const installed = present ? record.skills[entry.id] : undefined
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
        state: !present
          ? 'not-installed'
          : installed && installed.commit !== entry.source.commit
            ? 'update-available'
            : 'installed',
        ...(installed ? { installedCommit: installed.commit } : {}),
      })
    }
    return skills
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

  async #installAll(
    provider: ProviderId,
    projectPath: string,
    ids: string[],
  ): Promise<SkillInstallResult[]> {
    const entries = new Map(this.#options.entries().map((entry) => [entry.id, entry]))
    const results = new Map<string, SkillInstallResult>()
    const groups = new Map<string, CatalogEntry[]>()
    for (const id of new Set(ids)) {
      const entry = entries.get(id)
      if (!entry) {
        results.set(id, { id, ok: false, message: 'This skill is not in the list from authors' })
        continue
      }
      const key = `${entry.source.host}/${entry.source.repository}@${entry.source.commit}`
      groups.set(key, [...(groups.get(key) ?? []), entry])
    }

    for (const group of groups.values()) {
      const pending: CatalogEntry[] = []
      for (const entry of group) {
        const skip = await this.#skipReason(projectPath, entry)
        if (skip === 'current') results.set(entry.id, { id: entry.id, ok: true })
        else if (skip) results.set(entry.id, { id: entry.id, ok: false, message: skip })
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
          await this.#installOne(provider, projectPath, entry, archive)
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

  /** `current` when there is nothing to do, a reason when the skill must not be touched, else nothing. */
  async #skipReason(projectPath: string, entry: CatalogEntry): Promise<string | undefined> {
    const destination = path.join(projectSkillsDir(projectPath), entry.id)
    const state = await folderState(destination)
    if (state === 'missing') return undefined
    const installed = (await readCatalogRecord(projectPath)).skills[entry.id]
    if (state === 'folder' && installed) {
      return installed.commit === entry.source.commit ? 'current' : undefined
    }
    // Someone else's folder: never replaced.
    return `A skill named "${entry.id}" already exists in this project and was not installed from this list`
  }

  async #installOne(
    provider: ProviderId,
    projectPath: string,
    entry: CatalogEntry,
    archive: Buffer,
  ): Promise<void> {
    const staging = await mkdtemp(path.join(os.tmpdir(), 'tuift-skill-'))
    const destination = path.join(projectSkillsDir(projectPath), entry.id)
    // An update moves the old folder aside, so a failure can put it back.
    const aside =
      (await folderState(destination)) === 'folder'
        ? path.join(
            projectSkillsDir(projectPath),
            `.${entry.id}.replaced-${randomBytes(4).toString('hex')}`,
          )
        : undefined
    try {
      // The folder's name is the skill's name: "install from a folder" copies it under that name.
      const folder = path.join(staging, entry.id)
      await unpackSkill(archive, entry.source.path, folder)
      if (aside) await rename(destination, aside)
      try {
        // On a failure the copy and the provider check clean up after themselves.
        await this.#options.installFolder(provider, projectPath, folder)
      } catch (error) {
        if (aside) await rename(aside, destination).catch(() => undefined)
        throw error
      }
      try {
        const record = await readCatalogRecord(projectPath)
        record.skills[entry.id] = {
          commit: entry.source.commit,
          category: entry.category,
          ...(entry.set ? { set: entry.set } : {}),
          installedAt: new Date().toISOString(),
        }
        await writeCatalogRecord(projectPath, record)
      } catch (error) {
        // Nothing half-installed: without its record the new folder goes and the old one comes back.
        await rm(destination, { recursive: true, force: true })
        if (aside) await rename(aside, destination).catch(() => undefined)
        throw error
      }
      if (aside) await rm(aside, { recursive: true, force: true })
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
  }
}

function failure(id: string, error: unknown): SkillInstallResult {
  return { id, ok: false, message: error instanceof Error ? error.message : String(error) }
}
