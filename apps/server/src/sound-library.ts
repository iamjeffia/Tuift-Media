import { createHash } from 'node:crypto'
import { createWriteStream, statSync } from 'node:fs'
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { z } from 'zod'
import type {
  MusicAvailable,
  SoundDaily,
  SoundFacetsResult,
  SoundFailure,
  SoundFailureReason,
  SoundItem,
  SoundPreviewResult,
  SoundSearchParams,
  SoundSearchResult,
  SoundSettings,
  SoundShelf,
  SoundUseResult,
  UsedSound,
} from '@harness/contracts'
import { ClubeNotLinkedError, type ClubeAccount } from './clube-account.js'
import type { Store } from './store.js'
import { openZip, ZipError } from './sound-zip.js'
import { LIBRARY_FOLDER } from './sound-session.js'

/**
 * The Clube's sound library, one sound at a time. Searches and previews pass
 * through here with the linked account's token (which this module never sees:
 * `ClubeAccount.request` adds it), and a sound is fetched only when it is used,
 * into one folder of the chat's project, where it is found again the next time
 * instead of being fetched twice. There is no way to download the library.
 *
 * The Clube's own words (`sons`, `nota`, `modo`...) stop at this file: what goes
 * out is `SoundItem` and `UsedSound`.
 */

/** The Clube's daily ceilings per account, in files. */
const DAILY_LIMITS = { sound: 200, music: 60 } as const
const DEFAULT_LIMIT = 20
const MAX_JSON_BYTES = 1024 * 1024
const MAX_SOUND_BYTES = 96 * 1024 * 1024
const MAX_PREVIEW_BYTES = 2 * 1024 * 1024
const MAX_ZIP_BYTES = 1024 * 1024 * 1024
const MAX_RECORDS = 3_000
const FACETS_TTL_MS = 10 * 60_000
const REQUEST_TIMEOUT_MS = 120_000
const MANIFEST = 'manifest.json'
const MUSIC_FOLDER = 'music'
const AUDIO_NAME = /\.(?:wav|mp3|flac|ogg|m4a|aiff?|opus|aac)$/i

// ------------------------------------------------------------ the Clube's words

const text = z.preprocess(
  (value) => (value == null || value === '' ? undefined : String(value)),
  z.string().optional(),
)
const number = z.preprocess((value) => {
  if (value == null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}, z.number().optional())

const SomSchema = z.looseObject({
  id: z.preprocess((value) => (value == null ? undefined : String(value)), z.string().min(1)),
  nome: z.preprocess((value) => (value == null ? '' : String(value)), z.string()),
  tipo: text,
  papel: text,
  nota: text,
  duracao_s: number,
  categoria: text,
  familia: text,
  modo: text,
  lufs: number,
  bpm: number,
})

/** A Clube music track as `/musicas` and `/musicas/:id` give it (the detail answers the same summary, flat). */
const MusicaSchema = z.looseObject({
  id: z.preprocess((value) => (value == null ? undefined : String(value)), z.string().min(1)),
  titulo: text,
  artista: text,
  genero: text,
  climas: z.array(z.string()).catch([]),
  bpm: number,
  tom: text,
  duracao_s: number,
  /** The MP3 previews, open to anyone, keyed by version. */
  previas: z.record(z.string(), z.string()).catch({}),
})

const total = z.preprocess(
  (value) => (typeof value === 'number' ? value : undefined),
  z.number().optional(),
)

function fromSom(raw: z.infer<typeof SomSchema>): SoundItem {
  return {
    id: raw.id,
    name: raw.nome || raw.id,
    shelf: 'sound',
    ...(raw.tipo ? { type: raw.tipo } : {}),
    ...(raw.papel ? { role: raw.papel } : {}),
    ...(raw.nota ? { key: raw.nota } : {}),
    ...(raw.modo ? { mode: raw.modo } : {}),
    ...(raw.duracao_s !== undefined ? { durationS: raw.duracao_s } : {}),
    ...(raw.categoria ? { category: raw.categoria } : {}),
    ...(raw.lufs !== undefined ? { lufs: raw.lufs } : {}),
    ...(raw.bpm !== undefined ? { bpm: raw.bpm } : {}),
    // The key and BPM of a `trilha` are the Clube's estimates.
    ...(raw.tipo === 'trilha' ? { estimated: true } : {}),
  }
}

function fromMusica(raw: z.infer<typeof MusicaSchema>): SoundItem {
  return {
    id: raw.id,
    name: raw.titulo ?? raw.id,
    shelf: 'music',
    // A track's key and BPM are catalogued facts, not estimates.
    ...(raw.tom ? { key: raw.tom } : {}),
    ...(raw.duracao_s !== undefined ? { durationS: raw.duracao_s } : {}),
    ...(raw.genero ? { category: raw.genero } : {}),
    ...(raw.artista ? { artist: raw.artista } : {}),
    ...(raw.climas.length > 0 ? { mood: raw.climas.join(', ') } : {}),
    ...(raw.bpm !== undefined ? { bpm: raw.bpm } : {}),
  }
}

/** The first array under one of the names the Clube may give a list. */
function listOf(body: unknown, names: readonly string[]): unknown[] {
  if (Array.isArray(body)) return body
  if (typeof body !== 'object' || body === null) return []
  for (const name of names) {
    const value = (body as Record<string, unknown>)[name]
    if (Array.isArray(value)) return value
  }
  return []
}

export function objectOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** A link the Clube gave: a string, or an object that holds one. */
function linkOf(value: unknown): string | undefined {
  if (typeof value === 'string' && value) return value
  const inner = objectOf(value)
  for (const name of ['url', 'link', 'href']) {
    const found = inner[name]
    if (typeof found === 'string' && found) return found
  }
  return undefined
}

// --------------------------------------------------------------- the manifest

const ManifestSchema = z.object({
  version: z.literal(1),
  items: z.record(
    z.string(),
    z.object({
      name: z.string(),
      format: z.string(),
      durationS: z.number().optional(),
      lufs: z.number().optional(),
      /** Paths relative to the library folder. */
      files: z.array(z.object({ version: z.string(), file: z.string(), format: z.string() })),
    }),
  ),
})
type Manifest = z.infer<typeof ManifestSchema>

/** The files fetched in the last 24 hours (the Clube's window rolls, it is not a calendar day). */
const QuotaSchema = z.object({
  sound: z.array(z.number()).default([]),
  music: z.array(z.number()).default([]),
  /** Until when the Clube said to wait, per shelf (ms since the epoch). */
  blocked: z.object({ sound: z.number().optional(), music: z.number().optional() }).default({}),
})
type Quota = z.infer<typeof QuotaSchema>
const WINDOW_MS = 24 * 3_600_000
/** Without a `Retry-After`, a refused day is asked about again after this long. */
const BLOCK_MS = 3_600_000

// -------------------------------------------------------------------- the class

/** What the library needs from the link and the store, so tests bring their own. */
export type SoundClube = Pick<ClubeAccount, 'origin' | 'request' | 'linked' | 'subscriber'>
export type SoundLibraryStore = Pick<
  Store,
  'soundSettings' | 'setSoundSettings' | 'soundQuota' | 'setSoundQuota'
>

export type SoundLibraryOptions = {
  clube: SoundClube
  store: SoundLibraryStore
  /** For the links the Clube hands out (a track's zip); the account's own requests never use it. */
  fetch?: typeof fetch
  now?: () => number
  /** One line, never a token or an answer's body. */
  log?: (line: string) => void
}

const fail = (
  reason: SoundFailureReason,
  extra: Partial<Pick<SoundFailure, 'retryAfterS' | 'daily' | 'message'>> = {},
): SoundFailure => ({ ok: false, reason, ...extra })

const isFailure = (value: unknown): value is SoundFailure =>
  typeof value === 'object' && value !== null && (value as { ok?: unknown }).ok === false

export const sanitizeName = (name: string): string => {
  const cleaned = Array.from(name.normalize('NFC'))
    .map((character) =>
      character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? ' ' : character,
    )
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  const limited = Array.from(cleaned)
    .slice(0, 120)
    .join('')
    .trim()
    .replace(/[. ]+$/, '')
  if (limited === '') return 'sound'
  // Windows opens these as devices whatever the extension.
  return /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(limited) ? `_${limited}` : limited
}

export class SoundLibrary {
  readonly #clube: SoundClube
  readonly #store: SoundLibraryStore
  readonly #fetch: typeof fetch
  readonly #now: () => number
  readonly #log: (line: string) => void
  /** Records seen in searches, by `shelf:id`: a use needs the real name of what it fetches. */
  readonly #records = new Map<string, SoundItem>()
  /** The open MP3 preview (the full mix) of each music track a search showed. */
  readonly #previews = new Map<string, string>()
  #facets: { at: number; value: Extract<SoundFacetsResult, { ok: true }> } | undefined
  /** Uses run one at a time: they share a folder and a manifest. */
  #queue: Promise<unknown> = Promise.resolve()

  constructor(options: SoundLibraryOptions) {
    this.#clube = options.clube
    this.#store = options.store
    this.#fetch = options.fetch ?? fetch
    this.#now = options.now ?? Date.now
    this.#log = options.log ?? (() => {})
  }

  // ------------------------------------------------------------------ settings

  settings(): SoundSettings {
    return this.#store.soundSettings()
  }

  /** `ownFolder: null` forgets the folder; a path must be an existing folder. */
  updateSettings(patch: {
    enabled?: boolean | undefined
    ownFolder?: string | null | undefined
  }): SoundSettings {
    const current = this.#store.soundSettings()
    const next: SoundSettings = { enabled: patch.enabled ?? current.enabled }
    let folder = current.ownFolder
    if (patch.ownFolder === null) folder = undefined
    else if (patch.ownFolder !== undefined) {
      folder = patch.ownFolder.trim()
      if (!path.isAbsolute(folder) || !statSyncDirectory(folder)) {
        throw new Error('the sounds folder must be an existing folder')
      }
    }
    if (folder !== undefined) next.ownFolder = folder
    this.#store.setSoundSettings(next)
    return next
  }

  /**
   * Whether the library can be used now, for the session start: the setting, the link, and the
   * plan. A plan that cannot be read now counts as open, so the tools answer plainly later.
   */
  async availability(): Promise<'ready' | 'off' | 'unlinked' | 'no-subscription'> {
    if (!this.settings().enabled) return 'off'
    if (!this.#clube.linked()) return 'unlinked'
    return (await this.#clube.subscriber()) === false ? 'no-subscription' : 'ready'
  }

  // --------------------------------------------------------------------- daily

  /** What the last 24 hours have left, as this app counts it. */
  daily(shelf: SoundShelf): SoundDaily {
    const limit = DAILY_LIMITS[shelf]
    // A day the Clube refused is full whatever this app counted (other devices share the account).
    if (this.#blockedFor(shelf) !== undefined) return { used: limit, limit }
    return { used: this.#quota()[shelf].length, limit }
  }

  #quota(): Quota {
    const parsed = QuotaSchema.safeParse(this.#store.soundQuota())
    const quota = parsed.success ? parsed.data : { sound: [], music: [], blocked: {} }
    const since = this.#now() - WINDOW_MS
    return {
      sound: quota.sound.filter((at) => at > since),
      music: quota.music.filter((at) => at > since),
      blocked: quota.blocked,
    }
  }

  #setQuota(change: (quota: Quota) => void): void {
    const quota = this.#quota()
    change(quota)
    this.#store.setSoundQuota(quota)
  }

  #blockedFor(shelf: SoundShelf): number | undefined {
    const until = this.#quota().blocked[shelf]
    return until !== undefined && until > this.#now()
      ? Math.ceil((until - this.#now()) / 1_000)
      : undefined
  }

  /** The Clube refused the rest of the window: ask again after `seconds`. */
  #block(shelf: SoundShelf, seconds: number | undefined): void {
    const until = this.#now() + (seconds ?? BLOCK_MS / 1_000) * 1_000
    this.#setQuota((quota) => {
      quota.blocked[shelf] = until
    })
  }

  // ---------------------------------------------------------------- the Clube

  /** One request for the linked account, its failures as the library's own. */
  async #ask(shelf: SoundShelf, route: string): Promise<{ response: Response } | SoundFailure> {
    if (!this.#clube.linked()) return fail('not-linked')
    let response: Response
    try {
      response = await this.#clube.request(route)
    } catch (error) {
      return fail(error instanceof ClubeNotLinkedError ? 'not-linked' : 'unreachable')
    }
    if (response.ok) return { response }
    return this.#failureOf(response, shelf)
  }

  async #failureOf(response: Response, shelf: SoundShelf): Promise<SoundFailure> {
    const status = response.status
    if (status === 429) {
      const body = objectOf(await readJson(response))
      const retry = Number(response.headers.get('retry-after'))
      const retryAfterS = Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : undefined
      const reason = String(body['motivo'] ?? '')
      if (body['error'] === 'limite' && /_dia$|^dia/.test(reason)) {
        this.#block(shelf, retryAfterS)
        return fail('daily-limit', {
          ...(retryAfterS === undefined ? {} : { retryAfterS }),
          daily: this.daily(shelf),
        })
      }
      return fail('rate-limit', retryAfterS === undefined ? {} : { retryAfterS })
    }
    await response.body?.cancel().catch(() => undefined)
    if (status === 403) return fail('no-subscription')
    if (status === 401) return fail('not-linked')
    if (status === 404) return fail('not-found')
    return fail('unreachable')
  }

  // -------------------------------------------------------------------- search

  async search(params: SoundSearchParams): Promise<SoundSearchResult> {
    const music = params.shelf === 'music'
    const query = new URLSearchParams()
    const add = (name: string, value: string | number | undefined) => {
      if (value !== undefined && value !== '') query.set(name, String(value))
    }
    add('q', params.query?.trim())
    add('limite', params.limit ?? DEFAULT_LIMIT)
    if (music) {
      add('genero', params.category)
      add('clima', params.mood)
      add('artista', params.artist)
      add('tom', params.key)
      add('bpm_min', params.bpmMin)
      add('bpm_max', params.bpmMax)
    } else {
      query.set('detalhe', '1')
      add('tipo', params.type)
      add('categoria', params.category)
      add('nota', params.key)
      add('modo', params.mode)
      add('bpm_min', params.bpmMin)
      add('bpm_max', params.bpmMax)
      add('inicio', params.offset)
    }
    const asked = await this.#ask(params.shelf, `${music ? '/musicas' : '/sons'}?${query}`)
    if (isFailure(asked)) return asked
    const body = await readJson(asked.response)
    if (body === undefined) return fail('unreachable')
    const raw = listOf(body, music ? ['musicas'] : ['sons'])
    const items: SoundItem[] = []
    for (const entry of raw) {
      const parsed = music ? MusicaSchema.safeParse(entry) : SomSchema.safeParse(entry)
      if (parsed.success) {
        items.push(
          music
            ? fromMusica(parsed.data as z.infer<typeof MusicaSchema>)
            : fromSom(parsed.data as z.infer<typeof SomSchema>),
        )
      }
    }
    for (const item of items) this.#remember(item)
    const meta = objectOf(body)
    if (music) {
      for (const entry of raw) {
        const parsed = MusicaSchema.safeParse(entry)
        // The previews are open links; the full mix is the one to hear.
        const preview = parsed.success ? parsed.data.previas['completa'] : undefined
        if (parsed.success && preview) this.#previews.set(parsed.data.id, preview)
      }
    }
    const available = music ? availableOf(meta['filtros_disponiveis']) : undefined
    const notice = text.parse(meta['aviso'])
    return {
      ok: true,
      total: total.parse(meta['total']) ?? items.length,
      offset: total.parse(meta['inicio']) ?? params.offset ?? 0,
      items,
      daily: this.daily(params.shelf),
      ...(available ? { available } : {}),
      ...(notice ? { notice } : {}),
    }
  }

  #remember(item: SoundItem): void {
    const key = `${item.shelf}:${item.id}`
    this.#records.delete(key)
    this.#records.set(key, item)
    if (this.#records.size > MAX_RECORDS) {
      const oldest = this.#records.keys().next().value
      if (oldest !== undefined) this.#records.delete(oldest)
    }
  }

  async facets(): Promise<SoundFacetsResult> {
    const cached = this.#facets
    if (cached && this.#now() - cached.at < FACETS_TTL_MS) {
      return { ...cached.value, daily: this.daily('sound') }
    }
    const asked = await this.#ask('sound', '/sons/facetas')
    if (isFailure(asked)) return asked
    const body = objectOf(await readJson(asked.response))
    const categories = listOf(body, ['categorias']).flatMap((entry) => {
      const row = objectOf(entry)
      const type = text.parse(row['tipo'])
      const category = text.parse(row['categoria'])
      return type && category ? [{ type, category, total: total.parse(row['total']) ?? 0 }] : []
    })
    const keys = listOf(body, ['notas']).flatMap((entry) => {
      const value = typeof entry === 'string' ? entry : text.parse(objectOf(entry)['nota'])
      return value ? [value] : []
    })
    const value = { ok: true as const, total: total.parse(body['total']) ?? 0, categories, keys }
    this.#facets = { at: this.#now(), value: { ...value, daily: this.daily('sound') } }
    return { ...value, daily: this.daily('sound') }
  }

  /** A preview, which the Clube does not count in the day. The page plays what is returned here. */
  async preview(shelf: SoundShelf, id: string): Promise<SoundPreviewResult> {
    if (shelf === 'sound') {
      const asked = await this.#ask('sound', `/sons/previa?id=${encodeURIComponent(id)}`)
      if (isFailure(asked)) return asked
      const bytes = await readCapped(asked.response, MAX_PREVIEW_BYTES)
      if (!bytes) return fail('unreachable')
      const mime = asked.response.headers.get('content-type')?.split(';')[0]?.trim() ?? 'audio/ogg'
      return {
        ok: true,
        mime: mime.startsWith('audio/') ? mime : 'audio/ogg',
        data: bytes.toString('base64'),
      }
    }
    // A track's previews come with the search; asking its detail for one would be a second call.
    const link = this.#previews.get(id)
    if (!link) return fail('not-found')
    const bytes = await this.#fetchLink(link, MAX_PREVIEW_BYTES)
    if (!bytes) return fail('unreachable')
    return { ok: true, mime: 'audio/mpeg', data: bytes.toString('base64') }
  }

  // ----------------------------------------------------------------- the music

  /**
   * `/musicas/:id`: the same summary as the search, flat, and the zip. A `zip.url` means the account
   * may download now; without it the answer is still a 200 and `aviso` says why (a limit starting
   * with `Limite`, or a plan that does not include it).
   */
  async #musicDetail(
    id: string,
  ): Promise<
    { record: SoundItem; zip: string | undefined; notice: string | undefined } | SoundFailure
  > {
    const asked = await this.#ask('music', `/musicas/${encodeURIComponent(id)}`)
    if (isFailure(asked)) return asked
    const body = objectOf(await readJson(asked.response))
    const parsed = MusicaSchema.safeParse({ id, ...body })
    if (!parsed.success) return fail('unreachable')
    return {
      record: fromMusica(parsed.data),
      zip: linkOf(objectOf(body['zip'])['url']),
      notice: text.parse(body['aviso']),
    }
  }

  /**
   * A link the Clube handed out (a preview, a track's signed zip): its own address on the Clube,
   * or https. The account's token is never sent to it, and a redirect is not followed.
   */
  async #fetchLink(link: string, limit: number): Promise<Buffer | undefined> {
    const response = await this.#linkResponse(link)
    return response ? readCapped(response, limit) : undefined
  }

  async #linkResponse(link: string): Promise<Response | undefined> {
    let url: URL
    try {
      url = new URL(link, this.#clube.origin)
    } catch {
      return undefined
    }
    const own = url.origin === new URL(this.#clube.origin).origin
    if (!own && url.protocol !== 'https:') return undefined
    try {
      // A link on the Clube's API is answered only with the account's token; any other is signed.
      const response =
        own && url.pathname.startsWith('/api/v1/')
          ? await this.#clube.request(`${url.pathname.slice('/api/v1'.length)}${url.search}`)
          : await this.#fetch(url, {
              redirect: 'error',
              signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            })
      if (response.ok) return response
      await response.body?.cancel().catch(() => undefined)
    } catch {
      // Unreachable, or not linked any more.
    }
    return undefined
  }

  // ----------------------------------------------------------------------- use

  /**
   * Puts a sound (or a track) into `<project>/audio/clube/` and says where. A sound already
   * there is found again by its id and costs nothing. Runs one at a time.
   */
  use(projectDir: string, shelf: SoundShelf, id: string): Promise<SoundUseResult> {
    const run = this.#queue.then(() => this.#use(projectDir, shelf, id))
    this.#queue = run.catch(() => undefined)
    return run
  }

  async #use(projectDir: string, shelf: SoundShelf, id: string): Promise<SoundUseResult> {
    const folder = await libraryFolder(projectDir)
    if (!folder) return fail('no-project')
    const key = `${shelf}:${id}`
    const manifest = await readManifest(folder)
    const kept = manifest.items[key]
    if (kept && kept.files.length > 0) {
      const files = kept.files.map((file) => ({
        ...file,
        path: path.join(folder, ...file.file.split('/')),
      }))
      if (await allExist(files.map((file) => file.path))) {
        return {
          ok: true,
          sound: usedSound(kept, files, true, shelf),
          daily: this.daily(shelf),
        }
      }
    }
    const blocked = this.#blockedFor(shelf)
    if (blocked !== undefined)
      return fail('daily-limit', { retryAfterS: blocked, daily: this.daily(shelf) })
    const record = this.#records.get(key)
    // A track's name comes from its own detail; a sound's, from the search that showed it.
    if (!record && shelf === 'sound') return fail('not-found')

    const made =
      shelf === 'sound'
        ? await this.#fetchSound(folder, manifest, record!)
        : await this.#fetchTrack(folder, manifest, id)
    if (isFailure(made)) return made
    manifest.items[key] = made
    await writeManifest(folder, manifest)
    const now = this.#now()
    this.#setQuota((quota) => {
      quota[shelf].push(now)
    })
    this.#log(`[sounds] fetched a ${shelf}`)
    const files = made.files.map((file) => ({
      ...file,
      path: path.join(folder, ...file.file.split('/')),
    }))
    return { ok: true, sound: usedSound(made, files, false, shelf), daily: this.daily(shelf) }
  }

  async #fetchSound(
    folder: string,
    manifest: Manifest,
    record: SoundItem,
  ): Promise<Manifest['items'][string] | SoundFailure> {
    const asked = await this.#ask('sound', `/sons/arquivo?id=${encodeURIComponent(record.id)}`)
    if (isFailure(asked)) return asked
    const { response } = asked
    const bytes = await readCapped(response, MAX_SOUND_BYTES)
    if (!bytes) return fail('unreachable')
    // The hash is always sent, in lowercase hex: a file without one, or with another, is not kept.
    const claimed = response.headers.get('x-som-sha256')?.trim()
    if (!claimed || claimed !== createHash('sha256').update(bytes).digest('hex')) {
      this.#log('[sounds] a file did not match its checksum and was dropped')
      return fail('damaged')
    }
    const format = formatOf(response.headers.get('x-som-fmt'), response.headers.get('content-type'))
    const file = await freeName(folder, manifest, sanitizeName(record.name), format, record.id)
    await writeAtomic(path.join(folder, file), bytes)
    const durationS = positive(response.headers.get('x-som-duracao')) ?? record.durationS
    const lufs = finite(response.headers.get('x-som-lufs')) ?? record.lufs
    return {
      name: record.name,
      format,
      ...(durationS === undefined ? {} : { durationS }),
      ...(lufs === undefined ? {} : { lufs }),
      files: [{ version: 'file', file, format }],
    }
  }

  async #fetchTrack(
    folder: string,
    manifest: Manifest,
    id: string,
  ): Promise<Manifest['items'][string] | SoundFailure> {
    const detail = await this.#musicDetail(id)
    if (isFailure(detail)) return detail
    const record = detail.record
    if (!detail.zip) {
      const message = detail.notice
      if (message && /^limite/i.test(message)) {
        // The Clube's own sentence is the truth of the day; this app's count is only its estimate.
        this.#block('music', undefined)
        return fail('daily-limit', { message, daily: this.daily('music') })
      }
      return fail('no-subscription', message ? { message } : {})
    }
    const response = await this.#linkResponse(detail.zip)
    if (!response?.body) return fail('unreachable')
    const directory = await freeName(
      folder,
      manifest,
      `${MUSIC_FOLDER}/${sanitizeName(record.artist ? `${record.artist} - ${record.name}` : record.name)}`,
      '',
      record.id,
    )
    const target = path.join(folder, ...directory.split('/'))
    await mkdir(target, { recursive: true })
    const archive = path.join(folder, `.${sanitizeName(record.id)}.zip.part`)
    const files: Manifest['items'][string]['files'] = []
    try {
      await download(response, archive, MAX_ZIP_BYTES)
      const zip = await openZip(archive)
      try {
        for (const entry of zip.entries
          .filter((candidate) => AUDIO_NAME.test(candidate.name))
          .slice(0, 8)) {
          const name =
            sanitizeName(entry.name.replace(AUDIO_NAME, '')) +
            path.extname(entry.name).toLowerCase()
          await writeAtomic(path.join(target, name), await entry.read())
          files.push({
            version: name.replace(AUDIO_NAME, ''),
            file: `${directory}/${name}`,
            format: path.extname(name).slice(1),
          })
        }
      } finally {
        await zip.close()
      }
    } catch (error) {
      await rm(target, { recursive: true, force: true }).catch(() => undefined)
      return error instanceof ZipError ? fail('damaged') : fail('unreachable')
    } finally {
      await rm(archive, { force: true }).catch(() => undefined)
    }
    if (files.length === 0) {
      await rm(target, { recursive: true, force: true }).catch(() => undefined)
      return fail('damaged')
    }
    return {
      name: record.name,
      format: files[0]!.format,
      ...(record.durationS === undefined ? {} : { durationS: record.durationS }),
      files,
    }
  }
}

// ------------------------------------------------------------------------ files

function statSyncDirectory(directory: string): boolean {
  try {
    return statSync(directory).isDirectory()
  } catch {
    return false
  }
}

/**
 * `<project>/audio/clube`, created, with its real location checked: a link inside the project
 * that points elsewhere is refused, so nothing is ever written outside the project.
 */
async function libraryFolder(projectDir: string): Promise<string | undefined> {
  try {
    const project = await realpath(projectDir)
    if (!(await stat(project)).isDirectory()) return undefined
    const wanted = path.join(project, ...LIBRARY_FOLDER.split('/'))
    await mkdir(wanted, { recursive: true })
    const real = await realpath(wanted)
    const relative = path.relative(project, real)
    return relative === '' || relative.startsWith('..') || path.isAbsolute(relative)
      ? undefined
      : real
  } catch {
    return undefined
  }
}

async function readManifest(folder: string): Promise<Manifest> {
  try {
    const parsed = ManifestSchema.safeParse(
      JSON.parse(await readFile(path.join(folder, MANIFEST), 'utf8')),
    )
    if (parsed.success) return parsed.data
  } catch {
    // Missing or unreadable: the library starts a new one and fetches again what it must.
  }
  return { version: 1, items: {} }
}

async function writeManifest(folder: string, manifest: Manifest): Promise<void> {
  await writeAtomic(path.join(folder, MANIFEST), Buffer.from(JSON.stringify(manifest, null, 2)))
}

async function writeAtomic(file: string, bytes: Buffer): Promise<void> {
  const partial = `${file}.part`
  await writeFile(partial, bytes)
  await rename(partial, file)
}

async function download(response: Response, file: string, limit: number): Promise<void> {
  let received = 0
  const source = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)
  source.on('data', (chunk: Buffer) => {
    received += chunk.length
    if (received > limit) source.destroy(new Error('too large'))
  })
  await pipeline(source, createWriteStream(file))
}

async function allExist(files: readonly string[]): Promise<boolean> {
  for (const file of files) {
    try {
      if (!(await stat(file)).isFile()) return false
    } catch {
      return false
    }
  }
  return true
}

/** A name in the folder that no other item holds and nothing else occupies. */
async function freeName(
  folder: string,
  manifest: Manifest,
  base: string,
  format: string,
  id: string,
): Promise<string> {
  const taken = new Set(
    Object.values(manifest.items).flatMap((item) =>
      item.files.map((file) => file.file.toLowerCase()),
    ),
  )
  const named = (name: string) => (format ? `${name}.${format}` : name)
  const free = async (name: string) => {
    if (taken.has(named(name).toLowerCase())) return false
    try {
      await stat(path.join(folder, ...named(name).split('/')))
      return false
    } catch {
      return true
    }
  }
  if (await free(base)) return named(base)
  const withId = `${base} (${sanitizeName(id)})`
  return named(withId)
}

function usedSound(
  item: Manifest['items'][string],
  files: Array<{ version: string; file: string; format: string; path: string }>,
  reused: boolean,
  shelf: SoundShelf,
): UsedSound {
  const first = files[0]!
  return {
    // A sound is its file; a track is the folder of its versions.
    path: shelf === 'sound' ? first.path : path.dirname(first.path),
    name: shelf === 'sound' ? path.basename(first.path) : item.name,
    format: item.format,
    ...(item.durationS === undefined ? {} : { durationS: item.durationS }),
    ...(item.lufs === undefined ? {} : { lufs: item.lufs }),
    reused,
    files: files.map((file) => ({ version: file.version, path: file.path, format: file.format })),
  }
}

// ---------------------------------------------------------------------- helpers

/** The genres, moods, keys and artists a music search says it can filter by (names of an object of counts). */
function availableOf(value: unknown): MusicAvailable | undefined {
  const raw = objectOf(value)
  if (Object.keys(raw).length === 0) return undefined
  const names = (field: string) =>
    Object.keys(objectOf(raw[field])).sort((a, b) => a.localeCompare(b))
  return {
    category: names('genero'),
    mood: names('clima'),
    key: names('tom'),
    artist: names('artista'),
  }
}

function formatOf(header: string | null, contentType: string | null): string {
  const named = header?.trim().toLowerCase()
  if (named && /^[a-z0-9]{2,5}$/.test(named)) return named
  const type = contentType?.split(';')[0]?.trim().toLowerCase()
  if (type === 'audio/mpeg' || type === 'audio/mp3') return 'mp3'
  if (type === 'audio/wav' || type === 'audio/x-wav') return 'wav'
  if (type === 'audio/ogg') return 'ogg'
  return 'flac'
}

const finite = (value: string | null): number | undefined => {
  if (value === null || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}
const positive = (value: string | null): number | undefined => {
  const parsed = finite(value)
  return parsed !== undefined && parsed > 0 ? parsed : undefined
}

/** An answer's JSON, bounded; anything else is undefined. */
export async function readJson(response: Response): Promise<unknown> {
  const bytes = await readCapped(response, MAX_JSON_BYTES)
  if (!bytes) return undefined
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch {
    return undefined
  }
}

/** A whole answer, or undefined when it is longer than `limit` or breaks off. */
export async function readCapped(response: Response, limit: number): Promise<Buffer | undefined> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) {
    await response.body?.cancel().catch(() => undefined)
    return undefined
  }
  if (!response.body) return Buffer.alloc(0)
  const chunks: Buffer[] = []
  let size = 0
  try {
    const reader = response.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > limit) {
        await reader.cancel().catch(() => undefined)
        return undefined
      }
      chunks.push(Buffer.from(value))
    }
  } catch {
    return undefined
  }
  return Buffer.concat(chunks)
}
