import { randomBytes } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import {
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  statfs,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type {
  AvailableSkillCategory,
  ClubeExportResult,
  ClubeFacets,
  ClubeItem,
  ClubeJob,
  ClubeJobResult,
  ClubeKind,
  ClubeLibraryFailure,
  ClubeLibraryFailureReason,
  ClubeLimitsResult,
  ClubeMediaResult,
  ClubePart,
  ClubeRecord,
  ClubeRecordResult,
  ClubeSearchParams,
  ClubeSearchResult,
  ClubeSignal,
  ClubeSimpleResult,
  ClubeSkillInstallResult,
  ProviderId,
  ClubeDownloadStartResult,
} from '@harness/contracts'
import { ClubeNotLinkedError, type ClubeAccount } from './clube-account.js'
import { confinedSegments } from './skill-download.js'
import { objectOf, readCapped, readJson, sanitizeName } from './sound-library.js'
import { openZip, ZipError } from './sound-zip.js'

/**
 * The Clube's library for the Clube tab: searches and records through the linked account's token
 * (which this module never sees: `ClubeAccount.request` adds it), downloads of a project or an
 * animation into the chat's project, skills installed once for the whole app, and text written for
 * the agent. The Clube's own words (`titulo`, `ferramenta`, `arquivos`...) stop at this file.
 *
 * Every byte is fetched here, never by the page. A signed link is fetched only when it is on the
 * Clube's own origin, without the account's token and without following a redirect. Everything
 * written stays inside the folder the download names, every entry of a zip included, and a
 * download that fails or is cancelled leaves nothing under a final name that was not complete.
 */

// ------------------------------------------------------------------- ceilings

const MB = 1024 * 1024
/**
 * What the app sets, in bytes. The Clube declares the size of every file (`tamanho_mb`), and that
 * declaration is the real limit of a file (plus a small tolerance); these are the ceilings for
 * a Clube that declares nothing or declares wrong. They sit under what the zip reader can open:
 * it has no ZIP64, so an archive of 4 GiB or an entry of 4 GiB is refused whatever is set here.
 */
export const CLUBE_LIMITS = {
  /** One file fetched through a signed link. */
  file: 2048 * MB,
  /** One download: every file of the parts chosen, as the Clube declares them. */
  download: 4096 * MB,
  /** The files one archive may unpack to, and how big one unpacked file may be. */
  zipEntries: 5_000,
  zipEntry: 2048 * MB,
  /** What unpacking a download may write in all. */
  unpacked: 6144 * MB,
  /** A skill is text and a few images. */
  skillFiles: 2_000,
  skillBytes: 64 * MB,
  /** A cover, a music preview and an animation's preview, as the page gets them (base64 over the socket). */
  image: 4 * MB,
  // A track's preview is the whole track: the largest in the catalogue is just under 8 MB.
  audio: 24 * MB,
  video: 10 * MB,
  /** The first bytes of an answer and the silence between two chunks. */
  headersMs: 30_000,
  stallMs: 60_000,
  requestMs: 20_000,
  /** Over the declared size, the tolerance of a file. */
  slackBytes: 2 * MB,
  /** Free space kept beyond what a download needs (the archive and what it unpacks to are both on disk). */
  spareBytes: 64 * MB,
} as const

const JOBS_KEPT = 30
const JOB_KEPT_MS = 15 * 60_000
const MAX_JSON_BYTES = 2 * MB
const MANIFEST = '.clube-download.json'
const RECORD_ID =
  /^(animacao|projeto|referencia|skill|musica)\/([\p{L}\p{N}_-][\p{L}\p{N}._-]{0,119})$/u
const SKILL_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/

const KINDS = {
  animacao: 'animation',
  projeto: 'project',
  referencia: 'reference',
  skill: 'skill',
  musica: 'music',
} as const satisfies Record<string, ClubeKind>
const CLUBE_KINDS = {
  animation: 'animacao',
  project: 'projeto',
  reference: 'referencia',
  skill: 'skill',
  music: 'musica',
} as const satisfies Record<ClubeKind, string>
const FOLDERS = {
  animation: 'animacoes',
  project: 'projetos',
  reference: 'referencias',
  skill: 'skills',
  music: 'musicas',
} as const satisfies Record<ClubeKind, string>
/** `motion` and `som` are for Motion chats; `texto` and `processo` for every chat (the `general` category). */
const SKILL_CATEGORIES = {
  motion: 'motion',
  som: 'motion',
  texto: 'general',
  processo: 'general',
} as const satisfies Record<string, AvailableSkillCategory>

// ----------------------------------------------------------------- the words

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined
const numberOf = (value: unknown): number | undefined => {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : undefined
}
const listOfText = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry !== '')
    : typeof value === 'string' && value !== ''
      ? [value]
      : []
const listOfObjects = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.map((entry) => objectOf(entry)) : []
const urlText = (value: unknown): string | undefined => {
  const raw = text(value)
  if (!raw) return undefined
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

const kindOf = (value: unknown): ClubeKind | undefined =>
  typeof value === 'string' && Object.hasOwn(KINDS, value)
    ? KINDS[value as keyof typeof KINDS]
    : undefined

function toItem(raw: unknown): ClubeItem | undefined {
  const body = objectOf(raw)
  const id = text(body['id'])
  const match = id ? RECORD_ID.exec(id) : null
  const kind = kindOf(body['tipo']) ?? (match ? kindOf(match[1]) : undefined)
  const title = text(body['titulo'])
  if (!id || !match || !kind || !title || KINDS[match[1] as keyof typeof KINDS] !== kind) {
    return undefined
  }
  const format = text(body['formato'])
  const durationS = numberOf(body['duracao_s'])
  const cover = urlText(body['capa'])
  const preview = urlText(body['previa'])
  const page = urlText(body['pagina'])
  return {
    id,
    kind,
    title,
    summary: text(body['resumo']) ?? '',
    style: listOfText(body['estilo']),
    tool: listOfText(body['ferramenta']),
    scene: listOfText(body['cena']),
    ...(format ? { format } : {}),
    ...(durationS !== undefined ? { durationS } : {}),
    ...(cover ? { cover } : {}),
    ...(preview ? { preview } : {}),
    ...(page ? { page } : {}),
    access: body['acesso'] === 'livre' ? 'free' : 'subscriber',
  }
}

function facetsOf(value: unknown): ClubeFacets {
  const body = objectOf(value)
  const values = (name: string) =>
    Object.entries(objectOf(body[name])).flatMap(([key, count]) => {
      const total = numberOf(count)
      return total === undefined ? [] : [{ value: key, count: total }]
    })
  return {
    // The Clube names kinds in Portuguese; the page's words are the contract's.
    kind: values('tipo').flatMap((entry) => {
      const kind = kindOf(entry.value)
      return kind ? [{ ...entry, value: kind }] : []
    }),
    style: values('estilo'),
    tool: values('ferramenta'),
    scene: values('cena'),
    format: values('formato'),
  }
}

// ---------------------------------------------------------------- the class

/** What the library needs of the link, so tests bring their own. */
export type ClubeLibraryClube = Pick<ClubeAccount, 'origin' | 'request' | 'linked'>

/** How a skill reaches the app's folder of installed skills (`SkillCatalog.installStaged`). */
export type ClubeSkillInstaller = (
  skill: {
    id: string
    category: AvailableSkillCategory
    title: string
    summary: string
    page?: string
  },
  stage: (folder: string) => Promise<void>,
  /** The chat that asked: the page that did hears `skills.changed` for it. */
  where: { provider: ProviderId; projectPath: string },
) => Promise<void>

export type ClubeLibraryOptions = {
  clube: ClubeLibraryClube
  /** For the signed links only; the account's own requests never use it. */
  fetch?: typeof fetch
  installSkill: ClubeSkillInstaller
  /** One line, never a token, a link or an answer's body. */
  log?: (line: string) => void
  now?: () => number
  limits?: Partial<typeof CLUBE_LIMITS>
}

const fail = (
  reason: ClubeLibraryFailureReason,
  extra: Partial<Pick<ClubeLibraryFailure, 'retryAfterS' | 'message'>> = {},
): ClubeLibraryFailure => ({ ok: false, reason, ...extra })
const isFailure = (value: unknown): value is ClubeLibraryFailure =>
  typeof value === 'object' && value !== null && (value as { ok?: unknown }).ok === false

class Stop extends Error {
  constructor(readonly failure: ClubeLibraryFailure) {
    super(failure.reason)
  }
}

type Job = {
  id: string
  state: ClubeJob['state']
  file: string | undefined
  filesDone: number
  filesTotal: number
  receivedBytes: number
  totalBytes: number
  result: ClubeJob['result']
  failure: ClubeLibraryFailure | undefined
  controller: AbortController
  finishedAt: number | undefined
}

type PlannedFile = {
  part: string
  name: string
  /** Where it goes, relative to the item's folder, with `/` separators. */
  destino: string
  bytes: number
  url: URL
}

type PartFiles = Array<{ file: string; bytes: number }>

const manifestParts = (value: unknown): Map<string, PartFiles> => {
  const parts = new Map<string, PartFiles>()
  for (const [key, entry] of Object.entries(objectOf(objectOf(value)['parts']))) {
    parts.set(
      key,
      listOfObjects(objectOf(entry)['files']).flatMap((file) => {
        const name = text(file['file'])
        const bytes = numberOf(file['bytes'])
        return name && bytes !== undefined ? [{ file: name, bytes }] : []
      }),
    )
  }
  return parts
}

export class ClubeLibrary {
  readonly #clube: ClubeLibraryClube
  readonly #fetch: typeof fetch
  readonly #installSkill: ClubeSkillInstaller
  readonly #log: (line: string) => void
  readonly #now: () => number
  readonly #limits: typeof CLUBE_LIMITS
  readonly #jobs = new Map<string, Job>()
  /** Downloads run one at a time: they share the disk and the account's day. */
  #queue: Promise<unknown> = Promise.resolve()
  /** The items already told to the Clube as used, so one use is one signal. */
  readonly #signalled = new Set<string>()

  constructor(options: ClubeLibraryOptions) {
    this.#clube = options.clube
    this.#fetch = options.fetch ?? fetch
    this.#installSkill = options.installSkill
    this.#log = options.log ?? (() => {})
    this.#now = options.now ?? Date.now
    this.#limits = { ...CLUBE_LIMITS, ...options.limits }
  }

  // ---------------------------------------------------------------- the Clube

  /** One request for the linked account, its failures as the library's own. */
  async #ask(
    route: string,
    init: RequestInit = {},
  ): Promise<{ response: Response } | ClubeLibraryFailure> {
    if (!this.#clube.linked()) return fail('not-linked')
    let response: Response
    try {
      response = await this.#clube.request(route, init)
    } catch (error) {
      return fail(error instanceof ClubeNotLinkedError ? 'not-linked' : 'unreachable')
    }
    if (response.ok) return { response }
    return failureOf(response)
  }

  async #json(
    route: string,
    init?: RequestInit,
  ): Promise<Record<string, unknown> | ClubeLibraryFailure> {
    const asked = await this.#ask(route, init)
    if (isFailure(asked)) return asked
    const bytes = await readCapped(asked.response, MAX_JSON_BYTES)
    if (!bytes) return fail('unreachable')
    try {
      const parsed: unknown = JSON.parse(bytes.toString('utf8'))
      return objectOf(parsed)
    } catch {
      return fail('unreachable')
    }
  }

  // ------------------------------------------------------------------ search

  async search(params: ClubeSearchParams): Promise<ClubeSearchResult> {
    const query = new URLSearchParams()
    const add = (name: string, value: string | number | undefined) => {
      if (value !== undefined && value !== '') query.set(name, String(value))
    }
    add('q', params.query?.trim())
    if (params.kind) add('tipo', CLUBE_KINDS[params.kind])
    // Several values are separated by commas; a comma inside a value would split it.
    const many = (values: string[] | undefined) =>
      values
        ?.map((value) => value.replaceAll(',', ' ').trim())
        .filter(Boolean)
        .join(',')
    add('estilo', many(params.style))
    add('ferramenta', many(params.tool))
    add('cena', many(params.scene))
    add('formato', params.format)
    add('cursor', params.cursor)
    add('limite', params.limit ?? 24)
    const body = await this.#json(`/biblioteca?${query}`)
    if (isFailure(body)) return body
    const items = listOfObjects(body['itens']).flatMap((entry) => toItem(entry) ?? [])
    const next =
      text(body['proximo']) ??
      (typeof body['proximo'] === 'number' ? String(body['proximo']) : null)
    const notice = text(body['aviso'])
    return {
      ok: true,
      total: numberOf(body['total']) ?? items.length,
      items,
      next,
      facets: facetsOf(body['facetas']),
      ...(notice ? { notice } : {}),
    }
  }

  // ------------------------------------------------------------------ record

  /**
   * Opens one item's record. Called only when the person asks: the Clube counts it as seen, and
   * the first opening of a reference spends one of the account's credits.
   */
  async item(id: string, projectDir?: string): Promise<ClubeRecordResult> {
    const parsed = parseId(id)
    if (!parsed) return fail('not-found')
    const body = await this.#json(
      `/biblioteca/${parsed.kindWord}/${encodeURIComponent(parsed.slug)}`,
    )
    if (isFailure(body)) return body
    const item = toItem({ ...body, id })
    if (!item) return fail('unreachable')
    const aspects = objectOf(body['aspectos'])
    const credits = objectOf(body['creditos'])
    const previews = objectOf(body['previas'])
    const original = urlText(body['original'])
    const notice = text(body['aviso'])
    const usedCredits = numberOf(credits['usados'])
    const creditsOf = numberOf(credits['de'])
    const analysis = text(body['analise'])
    const prompt = text(body['prompt'])
    const record: ClubeRecord = {
      item,
      ...(analysis ? { analysis } : {}),
      aspects: {
        animation: text(aspects['animacao']),
        colors: text(aspects['cores']),
        typography: text(aspects['tipografia']),
        transition: text(aspects['transicao']),
        sound: text(aspects['som']),
      },
      ...(prompt ? { prompt } : {}),
      parts: [],
      ...(original ? { original } : {}),
      ...(usedCredits !== undefined && creditsOf !== undefined
        ? {
            credits: {
              used: usedCredits,
              of: creditsOf,
              ...(text(credits['periodo']) ? { period: text(credits['periodo'])! } : {}),
            },
          }
        : {}),
      ...(notice ? { notice } : {}),
    }
    if (item.kind === 'music') {
      const bpm = numberOf(body['bpm'])
      record.music = {
        previews: {
          ...(urlText(previews['completa']) ? { full: urlText(previews['completa'])! } : {}),
          ...(urlText(previews['instrumental'])
            ? { instrumental: urlText(previews['instrumental'])! }
            : {}),
          ...(urlText(previews['vocal']) ? { vocal: urlText(previews['vocal'])! } : {}),
        },
        ...(bpm !== undefined ? { bpm } : {}),
        ...(text(body['tom']) ? { key: text(body['tom'])! } : {}),
        ...(text(body['genero']) ? { genre: text(body['genero'])! } : {}),
        moods: listOfText(body['climas']),
      }
    }
    if (item.kind === 'project') {
      // The sizes come from the project's own route, which gives no links and so costs no file.
      const detail = await this.#json(`/projetos/${encodeURIComponent(parsed.slug)}`)
      if (!isFailure(detail)) {
        record.parts = groupParts(
          listOfObjects(detail['arquivos']).map((row) => ({
            key: text(row['parte']),
            label: text(row['parte']),
            description: text(row['descricao']),
            name: text(row['arquivo']),
            sizeMb: numberOf(row['tamanho_mb']),
          })),
        )
      }
    } else if (item.kind === 'animation') {
      record.parts = groupParts(
        listOfObjects(body['arquivos']).map((row) => ({
          key: text(row['parte']) ?? text(row['nome']),
          label: text(row['parte']) ?? text(row['nome']),
          description: undefined,
          name: text(row['nome']),
          sizeMb: numberOf(row['tamanho_mb']),
        })),
      )
    }
    if (projectDir && record.parts.length > 0) {
      const done = await this.#completeParts(projectDir, item)
      record.parts = record.parts.map((part) => ({ ...part, onDisk: done.has(part.key) }))
    }
    return { ok: true, record }
  }

  // ------------------------------------------------------------------- media

  /**
   * A cover or a preview of the Clube's own origin, for a page whose policy lets it load nothing
   * from the Clube. Anything on another origin is refused before a request. No token goes: these
   * are open. Only a picture, a short video or an audio preview, each within its ceiling.
   */
  async media(link: string): Promise<ClubeMediaResult> {
    const url = this.#ownUrl(link)
    if (!url) return fail('unsafe')
    let response: Response
    try {
      response = await this.#fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(this.#limits.requestMs),
        headers: { accept: 'image/*, video/mp4, audio/mpeg' },
      })
    } catch {
      return fail('unreachable')
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      return fail(response.status === 404 ? 'not-found' : 'unreachable')
    }
    const mime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''
    const limit = /^image\/(?:png|jpeg|webp|gif|avif)$/.test(mime)
      ? this.#limits.image
      : /^video\/(?:mp4|webm)$/.test(mime)
        ? this.#limits.video
        : /^audio\/(?:mpeg|mp3|mp4|ogg|wav|x-wav)$/.test(mime)
          ? this.#limits.audio
          : undefined
    if (limit === undefined) {
      await response.body?.cancel().catch(() => undefined)
      return fail('unsafe')
    }
    const bytes = await readCapped(response, limit)
    return bytes ? { ok: true, mime, data: bytes.toString('base64') } : fail('too-large')
  }

  /** The address when it is on the Clube's own origin (and only then), else undefined. */
  #ownUrl(link: string): URL | undefined {
    try {
      const url = new URL(link)
      const own = new URL(this.#clube.origin)
      if (url.origin !== own.origin || url.username || url.password) return undefined
      return url
    } catch {
      return undefined
    }
  }

  // ------------------------------------------------------------------ limits

  /** `/limites`. The Clube may not have it yet: any answer but a good one means "no limits to show". */
  async limits(): Promise<ClubeLimitsResult> {
    if (!this.#clube.linked()) return { ok: false, reason: 'unavailable' }
    let response: Response
    try {
      response = await this.#clube.request('/limites')
    } catch {
      return { ok: false, reason: 'unavailable' }
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      return { ok: false, reason: 'unavailable' }
    }
    const raw = await readJson(response)
    if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'unavailable' }
    const body = objectOf(raw)
    const limit = (name: string) => {
      const entry = objectOf(body[name])
      const used = numberOf(entry['usados'])
      const max = numberOf(entry['limite'])
      return used !== undefined && max !== undefined ? { used, limit: max } : undefined
    }
    const files = limit('arquivos')
    const sounds = limit('sons')
    const references = limit('referencias')
    return {
      ok: true,
      ...(files ? { files } : {}),
      ...(sounds ? { sounds } : {}),
      ...(references ? { references } : {}),
      unlimited: body['sem_limite'] === true,
    }
  }

  // ------------------------------------------------------------------ signal

  /** `usado` or `ocultar`; hiding is permanent for the account. */
  async signal(id: string, signal: ClubeSignal): Promise<ClubeSimpleResult> {
    const parsed = parseId(id)
    if (!parsed) return fail('not-found')
    const body = await this.#json(
      `/biblioteca/${parsed.kindWord}/${encodeURIComponent(parsed.slug)}/sinal`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sinal: signal === 'hide' ? 'ocultar' : 'usado' }),
      },
    )
    return isFailure(body) ? body : { ok: true }
  }

  /** Tells the Clube an item was used, once per item per run, and never lets a failure matter. */
  async #used(id: string): Promise<void> {
    if (this.#signalled.has(id)) return
    this.#signalled.add(id)
    const result = await this.signal(id, 'used').catch(() => undefined)
    if (!result?.ok) this.#signalled.delete(id)
  }

  /** The page sends `used` after it put a folder in the chat; the server has already sent it for a download. */
  markUsed(id: string): Promise<void> {
    return this.#used(id)
  }

  // ------------------------------------------------------------------ folders

  /** `<project>/clube/<kind folder>`, created, its real location checked to stay inside the project. */
  async #base(projectDir: string, kind: ClubeKind): Promise<string | undefined> {
    try {
      const project = await realpath(projectDir)
      if (!(await stat(project)).isDirectory()) return undefined
      return await confinedDir(project, ['clube', FOLDERS[kind]])
    } catch {
      return undefined
    }
  }

  async #itemFolder(projectDir: string, item: { kind: ClubeKind; slug: string }) {
    const base = await this.#base(projectDir, item.kind)
    if (!base) return undefined
    try {
      return await confinedDir(base, [sanitizeName(item.slug)])
    } catch {
      return undefined
    }
  }

  async #readManifest(folder: string): Promise<Map<string, PartFiles>> {
    try {
      return manifestParts(JSON.parse(await readFile(path.join(folder, MANIFEST), 'utf8')))
    } catch {
      return new Map()
    }
  }

  /** The parts whose every file is still on disk with the size it was written with. */
  async #wholeParts(folder: string, manifest: Map<string, PartFiles>): Promise<Set<string>> {
    const whole = new Set<string>()
    for (const [key, files] of manifest) {
      let ok = files.length > 0
      for (const entry of files) {
        const target = path.join(folder, ...entry.file.split('/'))
        const info = await stat(target).catch(() => undefined)
        if (!inside(folder, target) || !info?.isFile() || info.size !== entry.bytes) ok = false
      }
      if (ok) whole.add(key)
    }
    return whole
  }

  /** The parts of an item already complete in the chat's project. */
  async #completeParts(projectDir: string, item: ClubeItem): Promise<Set<string>> {
    const parsed = parseId(item.id)
    if (!parsed) return new Set()
    try {
      const folder = path.join(
        await realpath(projectDir),
        'clube',
        FOLDERS[item.kind],
        sanitizeName(parsed.slug),
      )
      return await this.#wholeParts(folder, await this.#readManifest(folder))
    } catch {
      return new Set()
    }
  }

  // ---------------------------------------------------------------- download

  /**
   * Starts a download of a project or an animation into the chat's project and answers at once.
   * `parts` are the keys the person chose (none: all). The rest is `job()`.
   */
  async download(
    projectDir: string,
    id: string,
    parts: readonly string[] | undefined,
  ): Promise<ClubeDownloadStartResult> {
    const parsed = parseId(id)
    if (!parsed || (parsed.kind !== 'project' && parsed.kind !== 'animation')) {
      return fail('not-found')
    }
    if (!this.#clube.linked()) return fail('not-linked')
    const folder = await this.#itemFolder(projectDir, parsed)
    if (!folder) return fail('no-project')
    this.#prune()
    const job: Job = {
      id: randomBytes(9).toString('base64url'),
      state: 'queued',
      file: undefined,
      filesDone: 0,
      filesTotal: 0,
      receivedBytes: 0,
      totalBytes: 0,
      result: undefined,
      failure: undefined,
      controller: new AbortController(),
      finishedAt: undefined,
    }
    this.#jobs.set(job.id, job)
    const run = this.#queue.then(() => this.#run(job, folder, id, parsed, parts))
    this.#queue = run.catch(() => undefined)
    return { ok: true, jobId: job.id }
  }

  job(jobId: string): ClubeJobResult {
    const job = this.#jobs.get(jobId)
    if (!job) return fail('not-found')
    return {
      ok: true,
      job: {
        state: job.state,
        ...(job.file ? { file: job.file } : {}),
        filesDone: job.filesDone,
        filesTotal: job.filesTotal,
        receivedBytes: job.receivedBytes,
        totalBytes: job.totalBytes,
        ...(job.result ? { result: job.result } : {}),
        ...(job.failure ? { failure: job.failure } : {}),
      },
    }
  }

  cancel(jobId: string): void {
    const job = this.#jobs.get(jobId)
    if (!job || job.finishedAt !== undefined) return
    job.controller.abort(new Stop(fail('cancelled')))
  }

  #prune(): void {
    const old = this.#now() - JOB_KEPT_MS
    for (const [key, job] of this.#jobs) {
      if (job.finishedAt !== undefined && job.finishedAt < old) this.#jobs.delete(key)
    }
    while (this.#jobs.size >= JOBS_KEPT) {
      const first = [...this.#jobs.values()].find((job) => job.finishedAt !== undefined)
      if (!first) break
      this.#jobs.delete(first.id)
    }
  }

  async #run(
    job: Job,
    folder: string,
    id: string,
    parsed: { kind: ClubeKind; slug: string; kindWord: string },
    parts: readonly string[] | undefined,
  ): Promise<void> {
    const finish = (state: ClubeJob['state'], failure?: ClubeLibraryFailure) => {
      job.state = state
      job.failure = failure
      job.file = undefined
      job.finishedAt = this.#now()
    }
    if (job.controller.signal.aborted) return finish('cancelled', fail('cancelled'))
    job.state = 'running'
    try {
      const plan = await this.#plan(job, folder, parsed, parts)
      const reusedParts = plan.reused
      let bytes = 0
      let files = 0
      for (const group of plan.groups) {
        const written: string[] = []
        for (const file of group.files) {
          job.file = file.name
          const done = await this.#fetchFile(job, folder, file)
          written.push(...done)
          job.filesDone += 1
        }
        // A part is whole only when all its files are; the manifest says so, one part at a time.
        const manifest = await this.#readManifest(folder)
        const sizes: Array<{ file: string; bytes: number }> = []
        for (const relative of written) {
          const info = await stat(path.join(folder, ...relative.split('/')))
          sizes.push({ file: relative, bytes: info.size })
          bytes += info.size
        }
        files += sizes.length
        manifest.set(group.key, sizes)
        await writeManifest(folder, id, manifest)
      }
      job.result = { folder, files, bytes, reusedParts }
      finish('done')
      this.#log('[clube] a download finished')
      void this.#used(id)
    } catch (error) {
      const reason = job.controller.signal.reason
      const failure =
        error instanceof Stop
          ? error.failure
          : reason instanceof Stop
            ? reason.failure
            : this.#failureOfError(error)
      finish(failure.reason === 'cancelled' ? 'cancelled' : 'failed', failure)
      this.#log(`[clube] a download ended: ${failure.reason}`)
    }
  }

  #failureOfError(error: unknown): ClubeLibraryFailure {
    if (error instanceof ZipError) return fail('damaged')
    if ((error as NodeJS.ErrnoException)?.code === 'ENOSPC') return fail('no-space')
    return fail('unreachable')
  }

  /** What to fetch: the parts chosen that are not whole on disk, as files with the Clube's links. */
  async #plan(
    job: Job,
    folder: string,
    parsed: { kind: ClubeKind; slug: string; kindWord: string },
    chosen: readonly string[] | undefined,
  ): Promise<{ groups: Array<{ key: string; files: PlannedFile[] }>; reused: number }> {
    const whole = await this.#wholeParts(folder, await this.#readManifest(folder))
    let rows: Array<{ part: string; name: string; destino: string; sizeMb: number; url: string }>
    let keys: string[]
    if (parsed.kind === 'project') {
      // The parts and their sizes cost no file; the links do, so only parts not on disk are asked for.
      const detail = await this.#json(`/projetos/${encodeURIComponent(parsed.slug)}`)
      if (isFailure(detail)) throw new Stop(detail)
      const all = [
        ...new Set(listOfObjects(detail['arquivos']).flatMap((row) => text(row['parte']) ?? [])),
      ]
      keys = chosen ? all.filter((key) => chosen.includes(key)) : all
      if (keys.length === 0) throw new Stop(fail('not-found'))
      const missing = keys.filter((key) => !whole.has(key))
      rows = []
      if (missing.length > 0) {
        const answer = await this.#json(`/projetos/${encodeURIComponent(parsed.slug)}/download`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ partes: missing }),
        })
        if (isFailure(answer)) throw new Stop(answer)
        rows = listOfObjects(answer['arquivos']).flatMap((row) => {
          const part = text(row['parte'])
          const url = text(row['url'])
          const name = text(row['nome']) ?? text(row['destino'])
          const destino = text(row['destino']) ?? name
          if (!part || !url || !name || !destino || !missing.includes(part)) return []
          return [{ part, name, destino, sizeMb: numberOf(row['tamanho_mb']) ?? 0, url }]
        })
      }
    } else {
      const record = await this.#json(
        `/biblioteca/${parsed.kindWord}/${encodeURIComponent(parsed.slug)}`,
      )
      if (isFailure(record)) throw new Stop(record)
      const all = listOfObjects(record['arquivos']).flatMap((row) => {
        const name = text(row['nome'])
        return name
          ? [
              {
                part: text(row['parte']) ?? name,
                name,
                destino: name,
                sizeMb: numberOf(row['tamanho_mb']) ?? 0,
                url: text(row['url']) ?? '',
              },
            ]
          : []
      })
      keys = [...new Set(all.map((row) => row.part))].filter(
        (key) => !chosen || chosen.includes(key),
      )
      if (keys.length === 0) {
        // The Clube sends no files when the day's limit is reached, and says so.
        const notice = text(record['aviso'])
        throw new Stop(notice ? fail('daily-limit', { message: notice }) : fail('not-found'))
      }
      rows = all.filter((row) => keys.includes(row.part) && !whole.has(row.part))
    }
    // Every link and every destination is checked before the first request.
    const planned: PlannedFile[] = []
    for (const row of rows) {
      const url = this.#ownUrl(row.url)
      if (!url) throw new Stop(fail('unsafe'))
      confine(row.destino)
      if (row.destino === MANIFEST) throw new Stop(fail('unsafe'))
      planned.push({
        part: row.part,
        name: row.name,
        destino: row.destino,
        bytes: Math.round(row.sizeMb * MB),
        url,
      })
    }
    const total = planned.reduce((sum, file) => sum + file.bytes, 0)
    if (total > this.#limits.download || planned.some((file) => file.bytes > this.#limits.file)) {
      throw new Stop(fail('too-large'))
    }
    await this.#checkSpace(folder, total)
    job.totalBytes = total
    job.filesTotal = planned.length
    const groups = keys
      .filter((key) => planned.some((file) => file.part === key))
      .map((key) => ({ key, files: planned.filter((file) => file.part === key) }))
    return { groups, reused: keys.filter((key) => whole.has(key)).length }
  }

  /** The archive and what it unpacks to are both on disk for a while: ask for twice the download. */
  async #checkSpace(folder: string, bytes: number): Promise<void> {
    try {
      const info = await statfs(folder)
      if (info.bavail * info.bsize < bytes * 2 + this.#limits.spareBytes) {
        throw new Stop(fail('no-space'))
      }
    } catch (error) {
      if (error instanceof Stop) throw error
      // A volume that cannot say is not refused: the write itself fails cleanly when the disk fills.
    }
  }

  /**
   * One file: streamed to a `.part` beside its destination, checked, and only then given its name;
   * a zip is unpacked in a staging folder first and each file moved when all of them are whole.
   * Returns the paths written, relative to the folder.
   */
  async #fetchFile(job: Job, folder: string, file: PlannedFile): Promise<string[]> {
    const segments = confine(file.destino)
    const target = path.join(folder, ...segments)
    if (!inside(folder, target)) throw new Stop(fail('unsafe'))
    await mkdir(path.dirname(target), { recursive: true })
    const partial = `${target}.${randomBytes(4).toString('hex')}.part`
    const stage = path.join(folder, `.stage-${randomBytes(4).toString('hex')}`)
    const isZip = /\.zip$/i.test(file.destino)
    try {
      await this.#stream(job, file, partial)
      if (!isZip) {
        await rename(partial, target)
        return [file.destino]
      }
      return await this.#unpack(partial, path.dirname(target), folder, stage)
    } finally {
      await rm(partial, { force: true }).catch(() => undefined)
      await rm(stage, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  /** Bytes to disk as they arrive. Never the account's token; a redirect is an error. */
  async #stream(job: Job, file: PlannedFile, partial: string): Promise<void> {
    const limit =
      file.bytes > 0
        ? Math.min(this.#limits.file, Math.ceil(file.bytes * 1.05) + this.#limits.slackBytes)
        : this.#limits.file
    const controller = new AbortController()
    const stop = (reason: unknown) => controller.abort(reason)
    job.controller.signal.addEventListener('abort', () => stop(job.controller.signal.reason), {
      once: true,
    })
    if (job.controller.signal.aborted) stop(job.controller.signal.reason)
    let timer = setTimeout(() => stop(new Stop(fail('unreachable'))), this.#limits.headersMs)
    const rearm = () => {
      clearTimeout(timer)
      timer = setTimeout(() => stop(new Stop(fail('unreachable'))), this.#limits.stallMs)
    }
    try {
      let response: Response
      try {
        response = await this.#fetch(file.url, { redirect: 'error', signal: controller.signal })
      } catch (error) {
        throw controller.signal.aborted ? controller.signal.reason : error
      }
      if (!response.ok) {
        const failure = await failureOf(response)
        // A signed link that stopped working (expired, used up) is the Clube refusing the file.
        throw new Stop(
          failure.reason === 'not-found' || failure.reason === 'unreachable'
            ? fail('refused')
            : failure,
        )
      }
      const declared = Number(response.headers.get('content-length'))
      if (Number.isFinite(declared) && declared > limit) {
        await response.body?.cancel().catch(() => undefined)
        throw new Stop(fail('too-large'))
      }
      if (!response.body) throw new Stop(fail('damaged'))
      rearm()
      let received = 0
      const counter = new Transform({
        transform: (chunk: Buffer, _encoding, done) => {
          received += chunk.length
          if (received > limit) {
            done(new Stop(fail('too-large')))
            return
          }
          job.receivedBytes += chunk.length
          rearm()
          done(null, chunk)
        },
      })
      try {
        await pipeline(
          Readable.fromWeb(response.body as import('node:stream/web').ReadableStream),
          counter,
          createWriteStream(partial, { flags: 'wx' }),
          { signal: controller.signal },
        )
      } catch (error) {
        throw controller.signal.aborted ? controller.signal.reason : error
      }
    } catch (error) {
      await rm(partial, { force: true }).catch(() => undefined)
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  /** Unpacks a zip into `stage`, then moves each file to its place under `into`. */
  async #unpack(archive: string, into: string, folder: string, stage: string): Promise<string[]> {
    await mkdir(stage, { recursive: true })
    const zip = await openZip(archive, { maxEntries: this.#limits.zipEntries })
    const staged: Array<{ from: string; relative: string }> = []
    let total = 0
    try {
      for (const entry of zip.entries) {
        const segments = confine(entry.path)
        const destination = path.join(into, ...segments)
        if (!inside(folder, destination)) throw new Stop(fail('unsafe'))
        const relative = path.relative(folder, destination).split(path.sep).join('/')
        if (relative === MANIFEST || relative.startsWith('.stage-')) throw new Stop(fail('unsafe'))
        total += entry.size
        if (entry.size > this.#limits.zipEntry || total > this.#limits.unpacked) {
          throw new Stop(fail('too-large'))
        }
        const from = path.join(stage, `${staged.length}.bin`)
        await entry.writeTo(from, this.#limits.zipEntry)
        staged.push({ from, relative })
      }
    } finally {
      await zip.close()
    }
    // Every entry came out whole: now each goes to its name. A failure undoes the new names.
    const placed: string[] = []
    try {
      for (const { from, relative } of staged) {
        const to = path.join(folder, ...relative.split('/'))
        await mkdir(path.dirname(to), { recursive: true })
        const existed = await stat(to).then(
          () => true,
          () => false,
        )
        await rename(from, to)
        if (!existed) placed.push(to)
      }
    } catch (error) {
      for (const to of placed) await unlink(to).catch(() => undefined)
      throw error
    }
    return staged.map((entry) => entry.relative)
  }

  // -------------------------------------------------------------------- text

  /**
   * An item's analysis and prompt as one Markdown file under `clube/` of the project, for a
   * reference or anything that is only text. Opening the record is what it takes, so the person
   * has already agreed to a reference's credit.
   */
  async exportText(projectDir: string, id: string): Promise<ClubeExportResult> {
    const parsed = parseId(id)
    if (!parsed) return fail('not-found')
    const base = await this.#base(projectDir, parsed.kind)
    if (!base) return fail('no-project')
    const opened = await this.item(id)
    if (!opened.ok) return opened
    const { record } = opened
    const file = path.join(base, `${sanitizeName(parsed.slug)}.md`)
    if (!inside(base, file)) return fail('unsafe')
    await writeFile(file, markdownOf(record))
    void this.#used(id)
    return { ok: true, path: file }
  }

  // ------------------------------------------------------------------ skills

  /**
   * Installs a skill of the Clube once, in the app's folder of installed skills, so every project
   * and every provider that receives them has it. The zip is one folder named by the skill's id
   * with a SKILL.md inside; nothing else is kept, and every entry stays inside that folder.
   */
  async installSkill(
    id: string,
    where: { provider: ProviderId; projectPath: string },
  ): Promise<ClubeSkillInstallResult> {
    const parsed = parseId(id)
    if (!parsed || parsed.kind !== 'skill' || !SKILL_ID.test(parsed.slug)) return fail('not-found')
    const detail = await this.#json(`/skills/${encodeURIComponent(parsed.slug)}`)
    if (isFailure(detail)) return detail
    const area = text(detail['area'])
    const category =
      area && Object.hasOwn(SKILL_CATEGORIES, area)
        ? SKILL_CATEGORIES[area as keyof typeof SKILL_CATEGORIES]
        : undefined
    const download = objectOf(detail['download'])
    const link = text(download['url']) ? this.#ownUrl(text(download['url'])!) : undefined
    if (!category || !link)
      return fail(link === undefined && text(download['url']) ? 'unsafe' : 'unreachable')
    const skillId = text(detail['id'])
    if (skillId !== undefined && skillId !== parsed.slug) return fail('unreachable')
    const title = text(detail['nome']) ?? parsed.slug
    const summary = text(detail['resumo']) ?? ''
    const page = urlText(detail['pagina'])
    const declared = Math.round((numberOf(download['tamanho_kb']) ?? 0) * 1024)
    const limit =
      declared > 0
        ? Math.min(this.#limits.skillBytes, declared * 2 + 64 * 1024)
        : this.#limits.skillBytes
    const scratch = path.join(tmpdir(), `tuift-clube-skill-${randomBytes(6).toString('hex')}`)
    await mkdir(scratch, { recursive: true })
    try {
      const archive = path.join(scratch, 'skill.zip')
      await this.#stream(
        newJob(),
        { part: 'skill', name: parsed.slug, destino: 'skill.zip', bytes: limit, url: link },
        archive,
      )
      await this.#installSkill(
        { id: parsed.slug, category, title, summary, ...(page ? { page } : {}) },
        (folder) => this.#unpackSkill(archive, parsed.slug, folder),
        where,
      )
    } catch (error) {
      if (error instanceof Stop) return error.failure
      if (error instanceof ZipError) return fail('damaged')
      return fail('refused')
    } finally {
      await rm(scratch, { recursive: true, force: true }).catch(() => undefined)
    }
    void this.#used(id)
    this.#log('[clube] a skill was installed')
    return { ok: true, name: title, category }
  }

  /** The archive's `<id>/...` entries into `folder`, which must end up with a SKILL.md. */
  async #unpackSkill(archive: string, id: string, folder: string): Promise<void> {
    const zip = await openZip(archive, { maxEntries: this.#limits.skillFiles })
    let total = 0
    try {
      await mkdir(folder, { recursive: true })
      for (const entry of zip.entries) {
        const segments = confine(entry.path)
        if (segments[0] !== id || segments.length < 2) throw new Stop(fail('unsafe'))
        total += entry.size
        if (total > this.#limits.skillBytes) throw new Stop(fail('too-large'))
        const target = path.join(folder, ...segments.slice(1))
        if (!inside(folder, target)) throw new Stop(fail('unsafe'))
        await mkdir(path.dirname(target), { recursive: true })
        await entry.writeTo(target, this.#limits.skillBytes)
      }
    } finally {
      await zip.close()
    }
    const skillFile = await stat(path.join(folder, 'SKILL.md')).catch(() => undefined)
    if (!skillFile?.isFile()) throw new Stop(fail('damaged'))
  }
}

// ------------------------------------------------------------------- helpers

function newJob(): Job {
  return {
    id: '',
    state: 'running',
    file: undefined,
    filesDone: 0,
    filesTotal: 1,
    receivedBytes: 0,
    totalBytes: 0,
    result: undefined,
    failure: undefined,
    controller: new AbortController(),
    finishedAt: undefined,
  }
}

function parseId(id: string): { kind: ClubeKind; slug: string; kindWord: string } | undefined {
  const match = RECORD_ID.exec(id)
  if (!match) return undefined
  return { kind: KINDS[match[1] as keyof typeof KINDS], slug: match[2]!, kindWord: match[1]! }
}

/**
 * `root` plus `segments`, created one level at a time, each level checked after it exists: a link
 * (or a junction) that points out of `root` is refused before anything is made behind it.
 */
async function confinedDir(root: string, segments: string[]): Promise<string | undefined> {
  let current = root
  for (const segment of segments) {
    const next = path.join(current, segment)
    await mkdir(next, { recursive: false }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error
    })
    const real = await realpath(next)
    if (!inside(root, real) || real === current || !(await stat(real)).isDirectory()) {
      return undefined
    }
    current = real
  }
  return current
}

/** The segments of a path inside a download, or a refusal for anything that could leave its folder. */
function confine(relative: string): string[] {
  try {
    return confinedSegments(relative)
  } catch {
    throw new Stop(fail('unsafe'))
  }
}

function inside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return (
    relative === '' ||
    (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
  )
}

/** The rows of a record's files as parts: one part per key, its sizes summed, one file per row. */
function groupParts(
  rows: Array<{
    key: string | undefined
    label: string | undefined
    description: string | undefined
    name: string | undefined
    sizeMb: number | undefined
  }>,
): ClubePart[] {
  const parts = new Map<string, ClubePart>()
  for (const row of rows) {
    if (!row.key) continue
    const known = parts.get(row.key)
    if (known) {
      known.sizeMb += row.sizeMb ?? 0
      known.files += 1
      continue
    }
    parts.set(row.key, {
      key: row.key,
      label: row.label ?? row.key,
      ...(row.description ? { description: row.description } : {}),
      sizeMb: row.sizeMb ?? 0,
      files: 1,
      onDisk: false,
    })
  }
  return [...parts.values()]
}

/** The Clube's answer to a request that was not a success, as the library's failure. */
async function failureOf(response: Response): Promise<ClubeLibraryFailure> {
  const status = response.status
  const body = objectOf(await readJson(response).catch(() => undefined))
  const error = text(body['error'])
  const sentence = text(body['mensagem']) ?? (error && /\s/.test(error) ? error : undefined)
  const retry = Number(response.headers.get('retry-after'))
  const retryAfterS = Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : undefined
  const after = retryAfterS === undefined ? {} : { retryAfterS }
  if (status === 401) return fail('not-linked')
  if (status === 403)
    return error === 'so_assinantes'
      ? fail('no-subscription')
      : fail('refused', sentence ? { message: sentence } : {})
  if (status === 429) {
    return error === 'muitas_chamadas'
      ? fail('rate-limit', after)
      : fail('daily-limit', { ...after, ...(sentence ? { message: sentence } : {}) })
  }
  if (status === 404) return fail('not-found', sentence ? { message: sentence } : {})
  if (status === 400) return fail('refused', sentence ? { message: sentence } : {})
  return fail('unreachable')
}

async function writeManifest(
  folder: string,
  id: string,
  parts: Map<string, PartFiles>,
): Promise<void> {
  const file = path.join(folder, MANIFEST)
  const partial = `${file}.part`
  await writeFile(
    partial,
    `${JSON.stringify(
      {
        version: 1,
        id,
        parts: Object.fromEntries([...parts].map(([key, files]) => [key, { files }])),
      },
      null,
      2,
    )}\n`,
  )
  await rename(partial, file)
}

/** What the agent reads with no more than the path: what the file is, then the Clube's own text. */
function markdownOf(record: ClubeRecord): string {
  const { item } = record
  const lines: string[] = [
    `# ${item.title}`,
    '',
    `> Saved from the Clube do Motion library (${item.kind}). Read it as a brief: the analysis says what the piece does and how, the prompt is what produced it. Use it as reference for the work the person asked for.`,
    '',
  ]
  if (item.summary) lines.push(item.summary, '')
  const facts = [
    item.format ? `Format: ${item.format}` : undefined,
    item.style.length ? `Style: ${item.style.join(', ')}` : undefined,
    item.tool.length ? `Tool: ${item.tool.join(', ')}` : undefined,
    item.scene.length ? `Scene: ${item.scene.join(', ')}` : undefined,
    item.page ? `Page: ${item.page}` : undefined,
    record.original ? `Original: ${record.original}` : undefined,
  ].filter((line): line is string => line !== undefined)
  if (facts.length) lines.push(...facts.map((line) => `- ${line}`), '')
  if (record.analysis) lines.push('## Analysis', '', record.analysis, '')
  const aspects: Array<[string, string | undefined]> = [
    ['Animation', record.aspects.animation],
    ['Colors', record.aspects.colors],
    ['Typography', record.aspects.typography],
    ['Transition', record.aspects.transition],
    ['Sound', record.aspects.sound],
  ]
  for (const [title, value] of aspects) if (value) lines.push(`## ${title}`, '', value, '')
  if (record.prompt) {
    const fence = '`'.repeat(Math.max(3, longestRun(record.prompt, '`') + 1))
    lines.push('## Prompt', '', fence, record.prompt, fence, '')
  }
  return lines.join('\n')
}

function longestRun(value: string, character: string): number {
  let longest = 0
  let run = 0
  for (const next of value) {
    run = next === character ? run + 1 : 0
    longest = Math.max(longest, run)
  }
  return longest
}
