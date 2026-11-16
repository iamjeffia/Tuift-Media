import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { zip } from './clube-fake.test-support.js'

/**
 * The library part of the fake Clube (see `clube-fake.test-support.ts`, which routes to it): the
 * search over five kinds, a record per kind, projects and their parts, skills, the day's limits,
 * signed file links and open covers and previews, all written from the contract in the task of the
 * Clube panel and nothing else. Every title, text and file here is invented.
 */

const MB = 1024 * 1024

export type FakeFile = {
  /** The part of a project; an animation's file is its own part by name. */
  parte: string
  nome: string
  /** Where it goes inside the item's folder; defaults to `nome`. */
  destino?: string
  descricao?: string
  data: Buffer
  /** The size the Clube declares, when it should differ from the bytes. */
  declaredMb?: number
  /** The link points at another origin. */
  foreign?: boolean
  /** The bytes come slowly, so a test can cancel in the middle. */
  slow?: boolean
}

export type FakeItem = {
  id: string
  tipo: 'animacao' | 'projeto' | 'referencia' | 'skill' | 'musica'
  titulo: string
  resumo: string
  estilo: string[]
  ferramenta: string[]
  cena: string[]
  formato: string
  duracao_s: number
  acesso: 'livre' | 'assinante'
  analise?: string
  aspectos?: Partial<Record<'animacao' | 'cores' | 'tipografia' | 'transicao' | 'som', string>>
  prompt?: string
  original?: string
  files?: FakeFile[]
  /** Music: the facts of the record. */
  musica?: { bpm: number; tom: string; genero: string; climas: string[] }
}

export type FakeSkill = {
  id: string
  nome: string
  area: 'motion' | 'som' | 'texto' | 'processo'
  resumo: string
  /** The entries of the zip; by default one folder named by the id with a SKILL.md. */
  entries?: Array<{ name: string; data: Buffer }>
}

export function defaultLibrary(): FakeItem[] {
  const base = {
    estilo: ['minimal'],
    ferramenta: ['after-effects'],
    cena: ['abertura'],
    formato: '16:9',
    duracao_s: 12,
    acesso: 'assinante' as const,
  }
  return [
    {
      ...base,
      id: 'animacao/marca-pulsante',
      tipo: 'animacao',
      titulo: 'Marca pulsante',
      resumo: 'Um logotipo que pulsa duas vezes e assenta.',
      analise: '## Movimento\n\nA marca **pulsa** duas vezes.',
      aspectos: { animacao: 'Mola curta.', cores: 'Duas cores chapadas.' },
      prompt: 'Faça um logotipo pulsar duas vezes.',
      files: [
        { parte: 'preview', nome: 'preview.mp4', data: Buffer.from('mp4-preview') },
        {
          parte: 'modelo',
          nome: 'modelo.zip',
          data: Buffer.from('placeholder'),
          destino: 'modelo.zip',
        },
      ],
    },
    {
      ...base,
      id: 'projeto/p1',
      tipo: 'projeto',
      titulo: 'Anúncio de teste',
      resumo: 'Um projeto inteiro de exemplo.',
      estilo: ['saas'],
      formato: '9:16',
      analise: 'Projeto **inventado** para teste.',
      prompt: 'Monte um anúncio curto.',
      files: [
        { parte: 'guia', nome: 'LEIA-ME.md', data: Buffer.from('# Guia\n') },
        { parte: 'audio', nome: 'narracao.mp3', data: Buffer.from('ID3-narracao') },
        {
          parte: 'projeto',
          nome: 'projeto.zip',
          destino: 'projeto.zip',
          data: zip([
            { name: 'comp.json', data: Buffer.from('{"comp":1}') },
            { name: 'assets/logo.png', data: Buffer.from('png-bytes') },
          ]),
        },
        {
          parte: 'render',
          nome: 'render.mp4',
          destino: 'render/final.mp4',
          data: Buffer.alloc(3000, 7),
        },
      ],
    },
    {
      ...base,
      id: 'projeto/p2',
      tipo: 'projeto',
      titulo: 'Vinheta de teste',
      resumo: 'Outro projeto de exemplo.',
      cena: ['fechamento'],
      files: [{ parte: 'guia', nome: 'LEIA-ME.md', data: Buffer.from('# Guia 2\n') }],
    },
    {
      ...base,
      id: 'referencia/r1',
      tipo: 'referencia',
      titulo: 'Referência de teste',
      resumo: 'Um vídeo de referência inventado.',
      estilo: ['editorial'],
      ferramenta: ['premiere'],
      cena: ['transicao'],
      analise: 'A referência alterna **cortes secos** e zoom.',
      aspectos: { transicao: 'Corte seco.', som: 'Batida marcada.' },
      prompt: 'Alterne cortes secos e zoom.',
      original: 'https://example.test/original',
    },
    {
      ...base,
      id: 'skill/ritmo-de-corte',
      tipo: 'skill',
      titulo: 'Ritmo de corte',
      resumo: 'Uma skill de teste sobre ritmo.',
      ferramenta: [],
      cena: [],
      analise: '---\nname: ritmo-de-corte\ndescription: Skill de teste.\n---\n\n# Ritmo\n',
    },
    {
      ...base,
      id: 'musica/m1',
      tipo: 'musica',
      titulo: 'Maré lenta',
      resumo: 'Uma trilha inventada.',
      estilo: ['cinematico'],
      ferramenta: [],
      cena: [],
      formato: 'mp3',
      duracao_s: 120,
      acesso: 'livre',
      musica: { bpm: 84, tom: 'Am', genero: 'cinematic', climas: ['tenso'] },
    },
  ]
}

export function defaultSkills(): FakeSkill[] {
  return [
    {
      id: 'ritmo-de-corte',
      nome: 'Ritmo de corte',
      area: 'motion',
      resumo: 'Uma skill de teste sobre ritmo.',
    },
    {
      id: 'tom-de-voz',
      nome: 'Tom de voz',
      area: 'texto',
      resumo: 'Uma skill de teste sobre texto.',
    },
  ]
}

export function skillZip(skill: FakeSkill): Buffer {
  return zip(
    skill.entries ?? [
      {
        name: `${skill.id}/SKILL.md`,
        data: Buffer.from(
          `---\nname: ${skill.id}\ndescription: ${skill.resumo}\n---\n\n# ${skill.nome}\n`,
        ),
      },
      { name: `${skill.id}/references/nota.md`, data: Buffer.from('nota') },
    ],
  )
}

type Json = (status: number, value: unknown, headers?: Record<string, string>) => void

export class FakeLibrary {
  items: FakeItem[] = defaultLibrary()
  skills: FakeSkill[] = defaultSkills()
  /** `/limites` answers 404 until the Clube publishes it. */
  limitsRoute = true
  semLimite = false
  /** Every call to the library answers 429 `muitas_chamadas` with this `Retry-After`. */
  retryAfter: number | undefined
  /** Files a day (the Clube's 60); a link request past it answers 429 and a record comes with `aviso`. */
  dailyFiles = 60
  filesToday = 0
  /** A project's sizes as `GET /projetos/<id>` declares them are the data lengths unless a file says otherwise. */
  sizeMb = 0
  credits = { used: 0, de: 300, periodo: '30 dias' }

  /** Ids whose record was opened, in order; and the references that cost a credit. */
  readonly opened: string[] = []
  readonly openedReferences = new Set<string>()
  readonly signals: Array<{ id: string; sinal: string }> = []
  readonly hidden = new Set<string>()
  /** `POST /projetos/<id>/download` bodies, signed-link fetches, and the covers and previews fetched. */
  readonly downloads: Array<{ id: string; partes: string[] | undefined }> = []
  readonly signedCalls: Array<{ path: string; authorization: string | undefined }> = []
  readonly mediaCalls: Array<{ path: string; authorization: string | undefined }> = []
  readonly searches: string[] = []

  #origin: () => string
  #links = new Map<string, FakeFile>()
  #counter = 0

  constructor(origin: () => string) {
    this.#origin = origin
  }

  #visible(): FakeItem[] {
    return this.items.filter((item) => !this.hidden.has(item.id))
  }

  #summary(item: FakeItem) {
    const origin = this.#origin()
    const slug = item.id.split('/')[1]!
    return {
      id: item.id,
      tipo: item.tipo,
      titulo: item.titulo,
      resumo: item.resumo,
      estilo: item.estilo,
      ferramenta: item.ferramenta,
      cena: item.cena,
      formato: item.formato,
      duracao_s: item.duracao_s,
      capa: `${origin}/media/capa/${slug}.png`,
      previa:
        item.tipo === 'musica'
          ? `${origin}/media/previa/${slug}.mp3`
          : item.tipo === 'animacao' || item.tipo === 'projeto'
            ? `${origin}/media/previa/${slug}.mp4`
            : null,
      pagina: `${origin}/${item.tipo}s/${slug}`,
      acesso: item.acesso,
    }
  }

  #declared(file: FakeFile): number {
    return file.declaredMb ?? Math.max(0.001, file.data.length / MB)
  }

  /** A signed link for a file: on the Clube's origin (or another, when the file says so). */
  #link(file: FakeFile): string {
    const token = `${++this.#counter}-${createHash('sha1').update(file.nome).digest('hex').slice(0, 8)}`
    this.#links.set(token, file)
    this.filesToday += 1
    const origin = file.foreign ? 'http://example.invalid' : this.#origin()
    return `${origin}/arquivos/${token}/${encodeURIComponent(file.nome)}`
  }

  /** Whether `files` more would pass the day's limit. */
  #over(files: number): boolean {
    return this.filesToday + files > this.dailyFiles
  }

  async handle(
    url: URL,
    request: IncomingMessage,
    response: ServerResponse,
    json: Json,
    body: string,
  ): Promise<void> {
    const rest = url.pathname.slice('/api/v1'.length)
    if (rest === '/limites') {
      if (!this.limitsRoute) return json(404, { error: 'nao_encontrado' })
      return json(200, {
        arquivos: { usados: this.filesToday, limite: this.dailyFiles, janela: '24h' },
        sons: { usados: 3, limite: 200, janela: '24h' },
        referencias: { usados: this.credits.used, limite: this.credits.de, janela: '30d' },
        chamadas: { limite: 60, janela: '1min' },
        ...(this.semLimite ? { sem_limite: true } : {}),
      })
    }
    if (this.retryAfter !== undefined) {
      return json(429, { error: 'muitas_chamadas' }, { 'retry-after': String(this.retryAfter) })
    }
    const query = url.searchParams
    if (rest === '/biblioteca') {
      this.searches.push(url.search)
      const q = (query.get('q') ?? '').toLowerCase()
      const many = (name: string) => query.get(name)?.split(',').filter(Boolean) ?? []
      const matching = this.#visible().filter(
        (item) =>
          (!q || `${item.titulo} ${item.resumo}`.toLowerCase().includes(q)) &&
          (!query.get('tipo') || item.tipo === query.get('tipo')) &&
          many('estilo').every((value) => item.estilo.includes(value)) &&
          many('ferramenta').every((value) => item.ferramenta.includes(value)) &&
          many('cena').every((value) => item.cena.includes(value)) &&
          (!query.get('formato') || item.formato === query.get('formato')),
      )
      const count = (values: string[]) =>
        Object.fromEntries(
          [...new Set(values)].map((v) => [v, values.filter((x) => x === v).length]),
        )
      const limite = Math.min(24, Number(query.get('limite') ?? 24))
      const start = Number(query.get('cursor') ?? 0)
      const end = start + limite
      return json(200, {
        total: matching.length,
        itens: matching.slice(start, end).map((item) => this.#summary(item)),
        proximo: end < matching.length ? String(end) : null,
        facetas: {
          tipo: count(matching.map((item) => item.tipo)),
          estilo: count(matching.flatMap((item) => item.estilo)),
          ferramenta: count(matching.flatMap((item) => item.ferramenta)),
          cena: count(matching.flatMap((item) => item.cena)),
          formato: count(matching.map((item) => item.formato)),
        },
        ...(matching.length === 0 ? { aviso: 'Nada encontrado.' } : {}),
      })
    }
    const signal = /^\/biblioteca\/([^/]+)\/([^/]+)\/sinal$/.exec(rest)
    if (signal) {
      const id = `${decodeURIComponent(signal[1]!)}/${decodeURIComponent(signal[2]!)}`
      const item = this.items.find((entry) => entry.id === id)
      if (!item || request.method !== 'POST') return json(404, { error: 'Item não encontrado.' })
      const sinal = (JSON.parse(body) as { sinal: string }).sinal
      this.signals.push({ id, sinal })
      if (sinal === 'ocultar') this.hidden.add(id)
      return json(200, { ok: true, id, sinal })
    }
    const detail = /^\/biblioteca\/([^/]+)(?:\/([^/]+))?$/.exec(rest)
    if (detail) {
      const id = detail[2]
        ? `${decodeURIComponent(detail[1]!)}/${decodeURIComponent(detail[2])}`
        : decodeURIComponent(detail[1]!)
      const item = this.items.find((entry) => entry.id === id)
      if (!item) return json(404, { error: 'Item não encontrado.' })
      this.opened.push(id)
      const extra: Record<string, unknown> = {}
      if (item.tipo === 'referencia') {
        if (!this.openedReferences.has(id)) {
          this.openedReferences.add(id)
          this.credits.used += 1
        }
        extra['original'] = item.original
        extra['creditos'] = {
          usados: this.credits.used,
          de: this.credits.de,
          periodo: this.credits.periodo,
        }
      }
      if (item.tipo === 'projeto') extra['comandos'] = { curl: 'curl -O <url>' }
      if (item.tipo === 'skill') extra['instalar'] = 'npx skills add ...'
      if (item.tipo === 'musica' && item.musica) {
        const origin = this.#origin()
        const slug = id.split('/')[1]!
        extra['previas'] = Object.fromEntries(
          ['completa', 'instrumental', 'vocal'].map((v) => [
            v,
            `${origin}/media/previa/${slug}-${v}.mp3`,
          ]),
        )
        extra['bpm'] = item.musica.bpm
        extra['tom'] = item.musica.tom
        extra['genero'] = item.musica.genero
        extra['climas'] = item.musica.climas
      }
      let arquivos: unknown[] = []
      let aviso: string | undefined
      if (item.tipo === 'animacao' || item.tipo === 'projeto') {
        const files = item.files ?? []
        if (this.#over(files.length)) aviso = 'Limite de arquivos do dia atingido.'
        else if (item.tipo === 'animacao') {
          arquivos = files.map((file) => ({
            parte: file.parte,
            nome: file.nome,
            tamanho_mb: this.#declared(file),
            validade: '6 horas',
            url: this.#link(file),
          }))
        }
      }
      return json(200, {
        ...this.#summary(item),
        analise: item.analise ?? null,
        aspectos: {
          animacao: item.aspectos?.animacao ?? null,
          cores: item.aspectos?.cores ?? null,
          tipografia: item.aspectos?.tipografia ?? null,
          transicao: item.aspectos?.transicao ?? null,
          som: item.aspectos?.som ?? null,
        },
        prompt: item.prompt ?? null,
        arquivos,
        ...(aviso ? { aviso } : {}),
        ...extra,
      })
    }
    const project = /^\/projetos\/([^/]+)$/.exec(rest)
    if (project) {
      const item = this.items.find((entry) => entry.id === `projeto/${project[1]}`)
      if (!item) return json(404, { error: 'Projeto não encontrado.' })
      return json(200, {
        id: item.id,
        arquivos: (item.files ?? []).map((file) => ({
          parte: file.parte,
          arquivo: file.nome,
          descricao: file.descricao ?? `Parte ${file.parte}`,
          tamanho_mb: this.#declared(file),
        })),
        docs: { 'LEIA-ME.md': '# invented', 'PROMPT.md': '', 'estilo.md': '', 'roteiro.md': '' },
      })
    }
    const download = /^\/projetos\/([^/]+)\/download$/.exec(rest)
    if (download && request.method === 'POST') {
      const item = this.items.find((entry) => entry.id === `projeto/${download[1]}`)
      if (!item) return json(404, { error: 'Projeto não encontrado.' })
      const asked = (JSON.parse(body) as { partes?: string[] }).partes
      this.downloads.push({ id: item.id, partes: asked })
      const files = (item.files ?? []).filter(
        (file) => !asked?.length || asked.includes(file.parte),
      )
      if (this.#over(files.length)) {
        return json(
          429,
          { error: 'Você chegou ao limite de 60 arquivos em 24 horas.' },
          { 'retry-after': '3600' },
        )
      }
      return json(200, {
        projeto: item.id,
        validade: '6 horas',
        total_mb: files.reduce((sum, file) => sum + this.#declared(file), 0),
        arquivos: files.map((file) => ({
          parte: file.parte,
          nome: file.nome,
          tamanho_mb: this.#declared(file),
          destino: file.destino ?? file.nome,
          url: this.#link(file),
        })),
      })
    }
    const skill = /^\/skills\/([^/]+)$/.exec(rest)
    if (skill) {
      const found = this.skills.find((entry) => entry.id === skill[1])
      if (!found) return json(404, { error: 'Skill não encontrada.' })
      if (this.#over(1)) {
        return json(429, { error: 'Você chegou ao limite de 60 arquivos em 24 horas.' })
      }
      const bytes = skillZip(found)
      const file: FakeFile = { parte: 'skill', nome: `${found.id}.zip`, data: bytes }
      return json(200, {
        id: found.id,
        nome: found.nome,
        area: found.area,
        resumo: found.resumo,
        o_que_faz: [],
        para_quem: '',
        precisa: [],
        exemplo_de_pedido: '',
        projetos: [],
        relacionadas: [],
        arquivos: 2,
        tamanho_kb: Math.ceil(bytes.length / 1024),
        pagina: `${this.#origin()}/skills/${found.id}`,
        skill_md: '# invented',
        download: {
          url: this.#link(file),
          validade: '6 horas',
          tamanho_kb: Math.ceil(bytes.length / 1024),
        },
      })
    }
    return json(404, { error: 'nao_encontrado' })
  }

  /** `/arquivos/...` (signed, no token) and `/media/...` (open): the bytes. */
  async serve(url: URL, request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const signed = /^\/arquivos\/([^/]+)\//.exec(url.pathname)
    if (signed) {
      this.signedCalls.push({ path: url.pathname, authorization: request.headers.authorization })
      const file = this.#links.get(signed[1]!)
      if (!file) return (void response.writeHead(403).end(), true)
      const bytes = file.data
      response.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': String(bytes.length),
      })
      if (file.slow) {
        // Half now, the rest after a long wait: a cancel lands in between.
        response.write(bytes.subarray(0, Math.floor(bytes.length / 2)))
        await new Promise((resolve) => setTimeout(resolve, 30_000).unref())
        response.end(bytes.subarray(Math.floor(bytes.length / 2)))
      } else {
        response.end(bytes)
      }
      return true
    }
    const media = /^\/media\/(capa|previa)\/([^/]+)$/.exec(url.pathname)
    if (media) {
      this.mediaCalls.push({ path: url.pathname, authorization: request.headers.authorization })
      const type = url.pathname.endsWith('.png')
        ? 'image/png'
        : url.pathname.endsWith('.mp4')
          ? 'video/mp4'
          : 'audio/mpeg'
      response.writeHead(200, { 'content-type': type }).end(Buffer.from(`bytes-of-${media[2]}`))
      return true
    }
    return false
  }
}
