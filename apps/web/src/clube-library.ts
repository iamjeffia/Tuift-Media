import type {
  ClubeItem,
  ClubeKind,
  ClubeLibraryFailure,
  ClubePart,
  ClubeSearchParams,
} from '@harness/contracts'
import type { I18n, Language, MessageKey } from './i18n/index.js'
import type { Transport } from './transport.js'

/** How many cards a page of results holds (the Clube's own ceiling for `limite`). */
export const CLUBE_PAGE = 24

export const CLUBE_KINDS: readonly ClubeKind[] = [
  'animation',
  'project',
  'reference',
  'skill',
  'music',
]

export const KIND_WORDS = {
  animation: 'clubePanel.kind.animation',
  project: 'clubePanel.kind.project',
  reference: 'clubePanel.kind.reference',
  skill: 'clubePanel.kind.skill',
  music: 'clubePanel.kind.music',
} as const satisfies Record<ClubeKind, MessageKey>

export const KIND_PLURAL_WORDS = {
  animation: 'clubePanel.kindPlural.animation',
  project: 'clubePanel.kindPlural.project',
  reference: 'clubePanel.kindPlural.reference',
  skill: 'clubePanel.kindPlural.skill',
  music: 'clubePanel.kindPlural.music',
} as const satisfies Record<ClubeKind, MessageKey>

export type ClubeFilters = {
  query: string
  kind: ClubeKind | ''
  style: string
  tool: string
  scene: string
  format: string
}
export const NO_CLUBE_FILTERS: ClubeFilters = {
  query: '',
  kind: '',
  style: '',
  tool: '',
  scene: '',
  format: '',
}

/** What a set of filters asks the server. The contract takes several values per facet; the screen picks one. */
export function clubeSearchParams(filters: ClubeFilters, cursor?: string): ClubeSearchParams {
  const query = filters.query.trim()
  return {
    ...(query ? { query } : {}),
    ...(filters.kind ? { kind: filters.kind } : {}),
    ...(filters.style ? { style: [filters.style] } : {}),
    ...(filters.tool ? { tool: [filters.tool] } : {}),
    ...(filters.scene ? { scene: [filters.scene] } : {}),
    ...(filters.format ? { format: filters.format } : {}),
    ...(cursor ? { cursor } : {}),
    limit: CLUBE_PAGE,
  }
}

/** The slug of an item id (`projeto/p1` is `p1`). */
export const slugOf = (id: string): string => id.slice(id.indexOf('/') + 1)

/** Where a download of this item lands, relative to the project, as the server lays it out. */
export function itemFolderName(item: Pick<ClubeItem, 'id' | 'kind'>): string {
  return `clube/${item.kind === 'animation' ? 'animacoes' : 'projetos'}/${slugOf(item.id)}/`
}

export const isDownloadable = (kind: ClubeKind): boolean =>
  kind === 'animation' || kind === 'project'

/** What the parts chosen come to: the megabytes, and the files that count in the day's limit. */
export function partsTotals(parts: readonly ClubePart[], chosen: ReadonlySet<string>) {
  let sizeMb = 0
  let files = 0
  let any = false
  for (const part of parts) {
    if (!chosen.has(part.key)) continue
    any = true
    if (part.onDisk) continue
    sizeMb += part.sizeMb
    files += part.files
  }
  return { sizeMb, files, nothingToFetch: any && files === 0 }
}

export function formatMb(mb: number, language: Language): string {
  return new Intl.NumberFormat(language, {
    maximumFractionDigits: mb < 10 ? 1 : 0,
  }).format(mb)
}

const FAILURE_WORDS = {
  'not-linked': 'clubePanel.failure.notLinked',
  'no-subscription': 'clubePanel.failure.noSubscription',
  'daily-limit': 'clubePanel.failure.dailyLimit',
  unreachable: 'clubePanel.failure.unreachable',
  'not-found': 'clubePanel.failure.notFound',
  'no-project': 'clubePanel.failure.noProject',
  refused: 'clubePanel.failure.refused',
  damaged: 'clubePanel.failure.damaged',
  unsafe: 'clubePanel.failure.unsafe',
  'too-large': 'clubePanel.failure.tooLarge',
  'no-space': 'clubePanel.failure.noSpace',
  cancelled: 'clubePanel.failure.cancelled',
} as const satisfies Record<Exclude<ClubeLibraryFailure['reason'], 'rate-limit'>, MessageKey>

/**
 * The sentence for a failed action. The Clube's own sentence (it is in Portuguese) is shown in
 * Portuguese; in any other language the app's own sentence stands in.
 */
export function clubeFailureText(failure: ClubeLibraryFailure, i18n: I18n): string {
  if (failure.message && i18n.language === 'pt-BR') return failure.message
  if (failure.reason === 'rate-limit') {
    return failure.retryAfterS
      ? i18n.t('clubePanel.failure.rateLimit', { seconds: failure.retryAfterS })
      : i18n.t('clubePanel.failure.rateLimitNow')
  }
  return i18n.t(FAILURE_WORDS[failure.reason])
}

// ----------------------------------------------------------------------- media

const MEDIA_CONCURRENCY = 4
const MEDIA_KEPT = 120

/**
 * Covers and previews, fetched through the app's server (the page's policy lets it load nothing
 * from the Clube) and kept as blob addresses for the life of the tab. Four at a time, so a page
 * of covers does not queue a hundred requests. A cover that fails stays failed until the tab closes.
 */
export class ClubeMedia {
  readonly #transport: Transport
  readonly #urls = new Map<string, string>()
  readonly #failed = new Set<string>()
  readonly #pending = new Map<string, Promise<string | null>>()
  readonly #waiting: Array<() => void> = []
  readonly #listeners = new Set<() => void>()
  #active = 0
  #disposed = false

  constructor(transport: Transport) {
    this.#transport = transport
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  /** The blob address, `null` when it failed, `undefined` while it is not known yet. */
  state(link: string): string | null | undefined {
    return this.#urls.get(link) ?? (this.#failed.has(link) ? null : undefined)
  }

  /** Starts the fetch if it has not started. Resolves to the blob address, or null. */
  load(link: string): Promise<string | null> {
    const known = this.#urls.get(link)
    if (known) return Promise.resolve(known)
    if (this.#failed.has(link)) return Promise.resolve(null)
    const running = this.#pending.get(link)
    if (running) return running
    const task = new Promise<string | null>((resolve) => {
      const run = () => {
        this.#active += 1
        this.#transport
          .request('clube.library.media', { url: link })
          .then((result) => {
            if (!result.ok || this.#disposed) return null
            const bytes = Uint8Array.from(atob(result.data), (character) => character.charCodeAt(0))
            return URL.createObjectURL(new Blob([bytes], { type: result.mime }))
          })
          .catch(() => null)
          .then((url) => {
            this.#active -= 1
            this.#pending.delete(link)
            if (url) {
              this.#urls.set(link, url)
              if (this.#urls.size > MEDIA_KEPT) {
                const oldest = this.#urls.keys().next().value
                if (oldest !== undefined) {
                  URL.revokeObjectURL(this.#urls.get(oldest)!)
                  this.#urls.delete(oldest)
                }
              }
            } else {
              this.#failed.add(link)
            }
            for (const listener of this.#listeners) listener()
            this.#waiting.shift()?.()
            resolve(url)
          })
      }
      if (this.#active < MEDIA_CONCURRENCY) run()
      else this.#waiting.push(run)
    })
    this.#pending.set(link, task)
    return task
  }

  dispose(): void {
    this.#disposed = true
    for (const url of this.#urls.values()) URL.revokeObjectURL(url)
    this.#urls.clear()
    this.#listeners.clear()
  }
}
