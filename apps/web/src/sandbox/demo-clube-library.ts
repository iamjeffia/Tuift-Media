import type {
  AvailableSkill,
  ClubeDownloadStartResult,
  ClubeExportResult,
  ClubeFacets,
  ClubeItem,
  ClubeJobResult,
  ClubeKind,
  ClubeLibraryFailure,
  ClubeLimitsResult,
  ClubeMediaResult,
  ClubeRecord,
  ClubeRecordResult,
  ClubeSearchParams,
  ClubeSearchResult,
  ClubeSimpleResult,
  ClubeSkillInstallResult,
} from '@harness/contracts'
import { sineWave } from './demo-sounds.js'

/**
 * The Clube's library as the design sandbox answers it. Every title, text and number is made up and
 * nothing is the Clube's own. `?clubeLib=` picks what it answers, for screens and tests: `empty`,
 * `error`, `slow` (a search that never answers), `rate` (the per-minute limit), `hold` (a download
 * that stays at forty percent), `spent` (a download refused for the day's files), `nolimits` (the
 * limits route is not published) and `unlimited`. `?clubeSkills=1` starts with a Clube skill
 * installed, for the Skills page.
 */

const kindWord = {
  animation: 'animacao',
  project: 'projeto',
  reference: 'referencia',
  skill: 'skill',
  music: 'musica',
} as const

const make = (
  kind: ClubeKind,
  slug: string,
  title: string,
  summary: string,
  extra: Partial<ClubeItem> = {},
): ClubeItem => ({
  id: `${kindWord[kind]}/${slug}`,
  kind,
  title,
  summary,
  style: ['minimalista'],
  tool: ['After Effects'],
  scene: ['abertura'],
  format: '16:9',
  durationS: 12,
  cover: `demo://cover/${slug}`,
  access: 'subscriber',
  ...extra,
})

const ITEMS: ClubeItem[] = [
  make(
    'animation',
    'cartao-que-desliza',
    'Cartão que desliza',
    'Um cartão entra pela lateral, assenta com uma mola curta e solta uma sombra suave.',
    {
      preview: 'demo://preview/cartao-que-desliza.mp4',
      page: 'https://clube.example.test/animacoes/cartao-que-desliza',
    },
  ),
  make(
    'animation',
    'contagem-em-mola',
    'Contagem em mola',
    'Um número sobe de zero ao valor final com uma curva que passa um pouco do alvo.',
    {
      style: ['saas'],
      scene: ['dados'],
      format: '9:16',
      durationS: 6,
    },
  ),
  make(
    'animation',
    'grafico-que-cresce',
    'Gráfico que cresce',
    'Barras que crescem em sequência, com o rótulo acompanhando a ponta de cada uma.',
    {
      style: ['saas'],
      scene: ['dados'],
      durationS: 9,
      access: 'free',
    },
  ),
  make(
    'project',
    'anuncio-de-app',
    'Anúncio de app em três cenas',
    'Um anúncio curto de aplicativo, com roteiro, narração, arquivos do projeto e o vídeo final.',
    {
      style: ['saas'],
      scene: ['produto'],
      format: '9:16',
      durationS: 30,
    },
  ),
  make(
    'project',
    'vinheta-de-canal',
    'Vinheta de canal',
    'Uma vinheta de cinco segundos para abrir e fechar vídeos.',
    {
      scene: ['fechamento'],
      durationS: 5,
    },
  ),
  make(
    'reference',
    'corte-seco-em-ritmo',
    'Corte seco em ritmo',
    'Uma referência de edição que alterna cortes secos e um zoom curto no tempo da batida.',
    {
      style: ['editorial'],
      tool: ['Premiere'],
      scene: ['transição'],
      durationS: 24,
      page: 'https://clube.example.test/referencias/corte-seco-em-ritmo',
    },
  ),
  make(
    'reference',
    'texto-por-mascara',
    'Texto que revela por máscara',
    'O texto aparece atrás de uma máscara que se abre da esquerda para a direita.',
    {
      style: ['editorial'],
      scene: ['título'],
      durationS: 8,
    },
  ),
  make(
    'skill',
    'ritmo-de-corte',
    'Ritmo de corte',
    'Ensina o agente a marcar cortes no tempo da narração e da música.',
    {
      style: [],
      tool: [],
      scene: [],
      format: undefined,
      durationS: undefined,
      cover: undefined,
      page: 'https://clube.example.test/skills/ritmo-de-corte',
    },
  ),
  make(
    'skill',
    'tom-de-voz-curto',
    'Tom de voz curto',
    'Um guia de escrita para legendas e chamadas curtas.',
    {
      style: [],
      tool: [],
      scene: [],
      format: undefined,
      durationS: undefined,
      cover: undefined,
    },
  ),
  make(
    'music',
    'mare-lenta',
    'Maré lenta',
    'Uma trilha cinematográfica de andamento calmo, com versões instrumental e vocal.',
    {
      style: ['cinematográfica'],
      tool: [],
      scene: [],
      format: 'mp3',
      durationS: 168,
      access: 'free',
    },
  ),
]

const SKILL_AREAS = {
  'ritmo-de-corte': 'motion',
  'tom-de-voz-curto': 'general',
} as const

const FILES = {
  project: [
    {
      key: 'guia',
      label: 'guia',
      description: 'Roteiro, estilo e instruções',
      sizeMb: 0.2,
      files: 1,
    },
    { key: 'audio', label: 'audio', description: 'Narração e trilha', sizeMb: 11.4, files: 2 },
    { key: 'projeto', label: 'projeto', description: 'Arquivos do projeto', sizeMb: 84, files: 1 },
    { key: 'render', label: 'render', description: 'Vídeo final', sizeMb: 38.5, files: 1 },
  ],
  animation: [
    { key: 'preview.mp4', label: 'preview.mp4', sizeMb: 2.1, files: 1 },
    { key: 'modelo.zip', label: 'modelo.zip', sizeMb: 14.8, files: 1 },
  ],
} as const

const slugOf = (id: string) => id.slice(id.indexOf('/') + 1)

const cover = (slug: string): string => {
  let hash = 0
  for (const character of slug) hash = (hash * 31 + character.charCodeAt(0)) % 360
  const a = `hsl(${hash} 42% 34%)`
  const b = `hsl(${(hash + 50) % 360} 46% 22%)`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="160" height="90" fill="url(#g)"/><rect x="${20 + (hash % 40)}" y="26" width="64" height="38" rx="7" fill="rgba(255,255,255,.16)"/><circle cx="${110 + (hash % 20)}" cy="${34 + (hash % 20)}" r="12" fill="rgba(255,255,255,.28)"/></svg>`
  return btoa(svg)
}

type Job = {
  startedAt: number
  parts: string[]
  totalBytes: number
  cancelled: boolean
  slug: string
}

const MB = 1024 * 1024

export class DemoClubeLibrary {
  readonly #mode: string | null
  readonly #hidden = new Set<string>()
  readonly #opened = new Set<string>()
  readonly #jobs = new Map<string, Job>()
  readonly #installed = new Map<string, string>()
  readonly #done = new Map<string, Set<string>>()
  #files = 12
  #counter = 0
  readonly #now: () => number

  constructor(search: string, now: () => number = Date.now) {
    const query = new URLSearchParams(search)
    this.#mode = query.get('clubeLib')
    this.#now = now
    if (query.get('clubeSkills') === '1') this.#installed.set('ritmo-de-corte', 'motion')
  }

  #failure(): ClubeLibraryFailure | undefined {
    if (this.#mode === 'error') return { ok: false, reason: 'unreachable' }
    if (this.#mode === 'rate') return { ok: false, reason: 'rate-limit', retryAfterS: 24 }
    return undefined
  }

  async search(params: ClubeSearchParams): Promise<ClubeSearchResult> {
    if (this.#mode === 'slow') return new Promise(() => {})
    const failure = this.#failure()
    if (failure) return failure
    const query = (params.query ?? '').toLowerCase()
    const visible = ITEMS.filter((item) => !this.#hidden.has(item.id))
    const found =
      this.#mode === 'empty'
        ? []
        : visible.filter(
            (item) =>
              (!query || `${item.title} ${item.summary}`.toLowerCase().includes(query)) &&
              (!params.kind || item.kind === params.kind) &&
              (params.style ?? []).every((value) => item.style.includes(value)) &&
              (params.tool ?? []).every((value) => item.tool.includes(value)) &&
              (params.scene ?? []).every((value) => item.scene.includes(value)) &&
              (!params.format || item.format === params.format),
          )
    const count = (values: string[]) =>
      [...new Set(values)].map((value) => ({
        value,
        count: values.filter((entry) => entry === value).length,
      }))
    const facets: ClubeFacets = {
      kind: count(found.map((item) => item.kind)),
      style: count(found.flatMap((item) => item.style)),
      tool: count(found.flatMap((item) => item.tool)),
      scene: count(found.flatMap((item) => item.scene)),
      format: count(found.flatMap((item) => (item.format ? [item.format] : []))),
    }
    return { ok: true, total: found.length, items: found, next: null, facets }
  }

  item(id: string): ClubeRecordResult {
    const failure = this.#failure()
    if (failure) return failure
    const item = ITEMS.find((entry) => entry.id === id)
    if (!item) return { ok: false, reason: 'not-found' }
    const first = item.kind === 'reference' && !this.#opened.has(id)
    this.#opened.add(id)
    const done = this.#done.get(id)
    const parts =
      item.kind === 'project' || item.kind === 'animation'
        ? FILES[item.kind].map((part) => ({
            ...part,
            onDisk: done?.has(part.key) ?? false,
          }))
        : []
    const record: ClubeRecord = {
      item,
      analysis:
        item.kind === 'skill'
          ? `---\nname: ${slugOf(id)}\ndescription: ${item.summary}\n---\n\n# ${item.title}\n\nUse esta skill quando o pedido falar de ritmo.\n\n1. Ouça a narração inteira.\n2. Marque cada frase.\n3. Corte onde a respiração acontece.`
          : `## Como funciona\n\n${item.summary}\n\n- A entrada dura cerca de **seis quadros**.\n- A saída repete a curva, ao contrário.\n- Nada se move sem motivo: o resto fica parado.`,
      aspects: {
        animation:
          item.kind === 'music' || item.kind === 'skill'
            ? undefined
            : 'Mola curta, sem retorno, com a sombra chegando um quadro depois.',
        colors: item.kind === 'animation' ? 'Duas cores chapadas sobre fundo neutro.' : undefined,
        typography: item.kind === 'project' ? 'Uma família sem serifa em dois pesos.' : undefined,
        transition: item.kind === 'reference' ? 'Corte seco no tempo da batida.' : undefined,
        sound: item.kind === 'reference' ? 'Batida marcada e um estalo em cada corte.' : undefined,
      },
      ...(item.kind === 'skill' || item.kind === 'music'
        ? {}
        : { prompt: `Crie "${item.title}": ${item.summary}` }),
      parts,
      ...(item.kind === 'reference' ? { original: 'https://example.com/video-original' } : {}),
      ...(item.kind === 'reference'
        ? { credits: { used: 38 + (first ? 1 : 0), of: 300, period: '30 dias' } }
        : {}),
      ...(item.kind === 'music'
        ? {
            music: {
              previews: {
                full: 'demo://audio/completa',
                instrumental: 'demo://audio/instrumental',
                vocal: 'demo://audio/vocal',
              },
              bpm: 72,
              key: 'Dm',
              genre: 'cinematográfica',
              moods: ['calmo', 'amplo'],
            },
          }
        : {}),
    }
    return { ok: true, record }
  }

  media(url: string): ClubeMediaResult {
    if (url.startsWith('demo://cover/')) {
      return { ok: true, mime: 'image/svg+xml', data: cover(url.slice('demo://cover/'.length)) }
    }
    if (url.startsWith('demo://audio/')) return { ok: true, mime: 'audio/wav', data: sineWave() }
    return { ok: false, reason: 'unreachable' }
  }

  limits(): ClubeLimitsResult {
    if (this.#mode === 'nolimits') return { ok: false, reason: 'unavailable' }
    if (this.#mode === 'unlimited') return { ok: true, unlimited: true }
    return {
      ok: true,
      files: { used: this.#mode === 'spent' ? 60 : this.#files, limit: 60 },
      sounds: { used: 12, limit: 200 },
      references: { used: 38 + this.#opened.size, limit: 300 },
      unlimited: false,
    }
  }

  signal(id: string, signal: 'used' | 'hide'): ClubeSimpleResult {
    if (signal === 'hide') this.#hidden.add(id)
    return { ok: true }
  }

  download(id: string, parts: string[] | undefined): ClubeDownloadStartResult {
    if (this.#mode === 'spent') {
      return {
        ok: false,
        reason: 'daily-limit',
        message: 'Você chegou ao limite de 60 arquivos em 24 horas. Os arquivos voltam aos poucos.',
      }
    }
    const item = ITEMS.find((entry) => entry.id === id)
    if (!item || (item.kind !== 'project' && item.kind !== 'animation')) {
      return { ok: false, reason: 'not-found' }
    }
    const chosen = parts ?? FILES[item.kind].map((part) => part.key)
    const totalBytes = FILES[item.kind]
      .filter((part) => chosen.includes(part.key))
      .reduce((sum, part) => sum + part.sizeMb * MB, 0)
    const jobId = `demo-job-${++this.#counter}`
    this.#jobs.set(jobId, {
      startedAt: this.#now(),
      parts: chosen,
      totalBytes,
      cancelled: false,
      slug: `${item.kind === 'animation' ? 'animacoes' : 'projetos'}\\${slugOf(id)}`,
    })
    this.#files += chosen.length
    this.#done.set(id, new Set([...(this.#done.get(id) ?? []), ...chosen]))
    return { ok: true, jobId }
  }

  job(jobId: string): ClubeJobResult {
    const job = this.#jobs.get(jobId)
    if (!job) return { ok: false, reason: 'not-found' }
    if (job.cancelled) {
      return {
        ok: true,
        job: {
          state: 'cancelled',
          filesDone: 0,
          filesTotal: job.parts.length,
          receivedBytes: 0,
          totalBytes: job.totalBytes,
        },
      }
    }
    const elapsed = this.#now() - job.startedAt
    const finish = this.#mode === 'hold' ? 2_800 : 3_600
    const fraction = this.#mode === 'hold' ? 0.42 : Math.min(1, elapsed / finish)
    const done = fraction >= 1
    const received = Math.round(job.totalBytes * fraction)
    const base = {
      filesDone: done ? job.parts.length : Math.floor(job.parts.length * fraction),
      filesTotal: job.parts.length,
      receivedBytes: received,
      totalBytes: job.totalBytes,
    }
    if (done) {
      return {
        ok: true,
        job: {
          state: 'done',
          ...base,
          result: {
            folder: `C:\\Users\\demo\\tuift\\clube\\${job.slug}`,
            files: job.parts.length + 2,
            bytes: received,
            reusedParts: 0,
          },
        },
      }
    }
    return {
      ok: true,
      job: {
        state: elapsed < 400 ? 'queued' : 'running',
        file: job.parts[Math.min(job.parts.length - 1, base.filesDone)] ?? '',
        ...base,
      },
    }
  }

  cancel(jobId: string): void {
    const job = this.#jobs.get(jobId)
    if (job) job.cancelled = true
  }

  exportText(id: string): ClubeExportResult {
    const item = ITEMS.find((entry) => entry.id === id)
    if (!item) return { ok: false, reason: 'not-found' }
    return {
      ok: true,
      path: `C:\\Users\\demo\\tuift\\clube\\referencias\\${slugOf(id)}.md`,
    }
  }

  installSkill(id: string): ClubeSkillInstallResult {
    const item = ITEMS.find((entry) => entry.id === id)
    if (!item || item.kind !== 'skill') return { ok: false, reason: 'not-found' }
    const slug = slugOf(id)
    const category = slug in SKILL_AREAS ? SKILL_AREAS[slug as keyof typeof SKILL_AREAS] : 'general'
    this.#installed.set(slugOf(id), category)
    return { ok: true, name: item.title, category }
  }

  /** The skills installed from the library, as the Skills page lists them. */
  installedSkills(): AvailableSkill[] {
    return [...this.#installed].flatMap(([slug, category]) => {
      const item = ITEMS.find((entry) => entry.id === `skill/${slug}`)
      return item
        ? [
            {
              id: slug,
              name: item.title,
              summary: { en: item.summary, 'pt-BR': item.summary },
              author: 'Clube do Motion',
              category: category === 'motion' ? ('motion' as const) : ('general' as const),
              license: null,
              sourceUrl: item.page ?? 'https://clube.example.test',
              commit: '2026-11-16T10:00:00.000Z',
              state: 'installed' as const,
              installedFor: 'app' as const,
              origin: 'clube' as const,
            },
          ]
        : []
    })
  }

  removeSkill(id: string): boolean {
    return this.#installed.delete(id)
  }
}
