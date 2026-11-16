import { createHash, randomBytes } from 'node:crypto'
import { deflateRawSync } from 'node:zlib'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { ClubeStore } from './clube-account.js'
import { FakeLibrary } from './clube-fake-library.test-support.js'

/**
 * A fake Clube do Motion for tests: the discovery document, dynamic registration,
 * authorize (PKCE checked, driven by `browse`), a token endpoint that rotates the
 * refresh token, revocation, `/api/v1/conta` and an MCP endpoint with two tools.
 * Every test runs against this; nothing here talks to the real site.
 */

export const FAKE_ACCOUNT = { nome: 'Pessoa de Teste', email: 'pessoa@example.test' }

type Registered = { clientId: string; redirectUris: string[]; name: string }
type Code = { challenge: string; redirectUri: string; clientId: string }

export class FakeClube {
  origin = ''
  plan: 'mensal' | 'anual' | 'tuift' | 'teste' | 'grátis' = 'mensal'
  /** The token endpoint refuses every refresh with invalid_grant. */
  refuseRefresh = false
  /** The token endpoint answers 503 to a refresh. */
  failRefresh = false
  /** Milliseconds a refresh takes to answer, so concurrent callers overlap. */
  refreshDelay = 0
  /** Every MCP call answers 429 with this `Retry-After`. */
  mcpRetryAfter: number | undefined
  expiresIn = 3600

  readonly registrations: Registered[] = []
  readonly revoked: string[] = []
  readonly refreshes: string[] = []
  readonly codeExchanges: Array<Record<string, string>> = []
  /** The `Authorization` header of every call to the API or the MCP endpoint, in order. */
  readonly seen: Array<{ path: string; authorization: string | undefined; session?: string }> = []
  readonly mcpCalls: unknown[] = []

  /** The sound library: what `/api/v1/sons` and `/api/v1/musicas` answer from. */
  sons: FakeSom[] = defaultSons()
  musicas: FakeMusica[] = defaultMusicas()
  /** Ids asked of `/sons/arquivo`, of `/sons/previa`, and of the track zips, in order. */
  readonly fileCalls: string[] = []
  readonly previewCalls: string[] = []
  readonly zipCalls: string[] = []
  /** Every call to `/sons` and `/musicas` answers 429 with this `Retry-After` (the per-minute limit). */
  soundsRetryAfter: number | undefined
  /** Files a day per shelf; past them the Clube answers `limite` with the reason of the shelf. */
  dailySounds = 200
  dailyMusic = 60
  /** `/sons/arquivo` sends this checksum instead of the real one, or none when `null`. */
  fileHash: string | null | undefined
  /** The `Retry-After` the daily-limit answer carries. */
  dailyRetryAfter: number | undefined
  /** Ids asked of `/musicas/:id`, in order. */
  readonly detailCalls: string[] = []
  /** The plan does not include the music download: no `zip.url`, and a sentence that says so. */
  musicPlanBlocked = false
  #filesToday = 0
  #zipsToday = 0
  /** The library of the Clube tab: its items, skills, limits and files (see clube-fake-library.test-support.ts). */
  readonly library = new FakeLibrary(() => this.origin)

  #server: Server | undefined
  #codes = new Map<string, Code>()
  #access = new Set<string>()
  #refresh = new Map<string, string>()
  #counter = 0

  async start(): Promise<void> {
    this.#server = createServer((request, response) => {
      void this.#route(request, response).catch(() => response.destroy())
    })
    await new Promise<void>((resolve) => this.#server!.listen(0, '127.0.0.1', resolve))
    const address = this.#server.address()
    if (!address || typeof address === 'string') throw new Error('fake Clube did not bind')
    this.origin = `http://127.0.0.1:${address.port}`
  }

  async stop(): Promise<void> {
    const server = this.#server
    if (!server) return
    this.#server = undefined
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
      server.closeAllConnections()
    })
  }

  /** What the browser would do: open the authorize page, and let the app's listener hear the answer. */
  async browse(
    authUrl: string,
    options: { deny?: boolean; state?: string; code?: string } = {},
  ): Promise<number> {
    const url = new URL(authUrl)
    const params = url.searchParams
    const redirectUri = params.get('redirect_uri')!
    const answer = new URL(redirectUri)
    if (options.deny) {
      answer.searchParams.set('error', 'access_denied')
    } else {
      const code = options.code ?? `code-${++this.#counter}-${randomBytes(4).toString('hex')}`
      if (options.code === undefined) {
        this.#codes.set(code, {
          challenge: params.get('code_challenge')!,
          redirectUri,
          clientId: params.get('client_id')!,
        })
      }
      answer.searchParams.set('code', code)
    }
    answer.searchParams.set('state', options.state ?? params.get('state')!)
    answer.searchParams.set('iss', this.origin)
    const reply = await fetch(answer)
    await reply.text()
    return reply.status
  }

  /** What the browser is sent to for authorizing: the checks the real page makes. */
  checkAuthorize(authUrl: string): string[] {
    const url = new URL(authUrl)
    const p = url.searchParams
    const problems: string[] = []
    if (url.origin !== this.origin || url.pathname !== '/oauth/autorizar') problems.push('address')
    if (p.get('response_type') !== 'code') problems.push('response_type')
    if (p.get('code_challenge_method') !== 'S256') problems.push('code_challenge_method')
    if (!p.get('code_challenge')) problems.push('code_challenge')
    if (p.get('resource') !== `${this.origin}/mcp`) problems.push('resource')
    if (!p.get('state')) problems.push('state')
    const client = this.registrations.find((entry) => entry.clientId === p.get('client_id'))
    if (!client?.redirectUris.includes(p.get('redirect_uri') ?? '')) problems.push('redirect_uri')
    const redirect = new URL(p.get('redirect_uri') ?? 'http://invalid')
    if (redirect.hostname !== '127.0.0.1') problems.push('loopback')
    return problems
  }

  /** An hour passed for the access tokens the Clube issued: the next one sent is refused with 401. */
  expireAccessTokens(): void {
    this.#access.clear()
  }

  async #route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', this.origin)
    const body = await text(request)
    const json = (status: number, value: unknown, headers: Record<string, string> = {}): void => {
      response
        .writeHead(status, { 'content-type': 'application/json', ...headers })
        .end(JSON.stringify(value))
    }
    const bearer = () => /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1]

    if (url.pathname === '/.well-known/oauth-authorization-server') {
      return json(200, {
        issuer: this.origin,
        authorization_endpoint: `${this.origin}/oauth/autorizar`,
        token_endpoint: `${this.origin}/oauth/token`,
        registration_endpoint: `${this.origin}/oauth/registrar`,
        revocation_endpoint: `${this.origin}/oauth/revogar`,
        code_challenge_methods_supported: ['S256'],
      })
    }
    if (url.pathname === '/oauth/registrar' && request.method === 'POST') {
      const data = JSON.parse(body) as { client_name: string; redirect_uris: string[] }
      const clientId = `client-${this.registrations.length + 1}`
      this.registrations.push({
        clientId,
        redirectUris: data.redirect_uris,
        name: data.client_name,
      })
      return json(201, { client_id: clientId, redirect_uris: data.redirect_uris })
    }
    if (url.pathname === '/oauth/token' && request.method === 'POST') {
      const form = Object.fromEntries(new URLSearchParams(body))
      if (form['grant_type'] === 'authorization_code') {
        this.codeExchanges.push(form)
        const code = this.#codes.get(form['code'] ?? '')
        const verified =
          code &&
          code.redirectUri === form['redirect_uri'] &&
          code.clientId === form['client_id'] &&
          createHash('sha256')
            .update(form['code_verifier'] ?? '')
            .digest('base64url') === code.challenge
        if (!verified) return json(400, { error: 'invalid_grant' })
        this.#codes.delete(form['code']!)
        return json(200, this.#issue(form['client_id']!))
      }
      if (form['grant_type'] === 'refresh_token') {
        this.refreshes.push(form['refresh_token'] ?? '')
        if (this.refreshDelay) await new Promise((r) => setTimeout(r, this.refreshDelay))
        if (this.failRefresh) return json(503, { error: 'temporarily_unavailable' })
        const owner = this.#refresh.get(form['refresh_token'] ?? '')
        if (this.refuseRefresh || !owner) return json(400, { error: 'invalid_grant' })
        // Single use: the old pair dies.
        this.#refresh.delete(form['refresh_token']!)
        return json(200, this.#issue(owner))
      }
      return json(400, { error: 'unsupported_grant_type' })
    }
    if (url.pathname === '/oauth/revogar' && request.method === 'POST') {
      const form = Object.fromEntries(new URLSearchParams(body))
      this.revoked.push(form['token'] ?? '')
      this.#refresh.delete(form['token'] ?? '')
      return json(200, {})
    }
    if (url.pathname === '/api/v1/conta') {
      this.seen.push({ path: url.pathname, authorization: request.headers.authorization })
      if (!bearer() || !this.#access.has(bearer()!)) return json(401, { error: 'invalid_token' })
      return json(200, { ...FAKE_ACCOUNT, plano: this.plan })
    }
    if (/^\/api\/v1\/(?:biblioteca|projetos|skills|limites)(?:\/|$)/.test(url.pathname)) {
      this.seen.push({ path: url.pathname, authorization: request.headers.authorization })
      if (!bearer() || !this.#access.has(bearer()!)) return json(401, { error: 'invalid_token' })
      if (this.plan === 'grátis' || this.plan === 'teste') {
        return json(403, { error: 'so_assinantes', mensagem: 'Só para assinantes.' })
      }
      return this.library.handle(url, request, response, json, body)
    }
    if (await this.library.serve(url, request, response)) return
    if (url.pathname.startsWith('/api/v1/sons') || url.pathname.startsWith('/api/v1/musicas')) {
      return this.#library(url, request, response, json, bearer)
    }
    // The previews are open to anyone: no token, and the request is not recorded as one.
    const preview = /^\/previas\/([^/]+)\/(completa|instrumental|vocal)\.mp3$/.exec(url.pathname)
    if (preview) {
      this.previewCalls.push(`${preview[1]}/${preview[2]}`)
      return void response
        .writeHead(200, { 'content-type': 'audio/mpeg' })
        .end(Buffer.from('ID3-preview'))
    }
    if (url.pathname.startsWith('/zips/')) {
      const id = url.pathname.slice('/zips/'.length).replace(/\.zip$/, '')
      const track = this.musicas.find((entry) => entry.id === id)
      if (!track) return void response.writeHead(404).end()
      this.zipCalls.push(id)
      return void response
        .writeHead(200, { 'content-type': 'application/zip' })
        .end(zip(track.versions ?? defaultVersions(`${track.artista} - ${track.titulo}`)))
    }
    if (url.pathname === '/mcp') {
      this.seen.push({
        path: url.pathname,
        authorization: request.headers.authorization,
        ...(typeof request.headers['mcp-session-id'] === 'string'
          ? { session: request.headers['mcp-session-id'] }
          : {}),
      })
      if (!bearer() || !this.#access.has(bearer()!)) return json(401, { error: 'invalid_token' })
      if (this.plan === 'grátis') {
        return json(403, { error: 'subscription_required', planos: `${this.origin}/planos` })
      }
      if (this.mcpRetryAfter !== undefined) {
        return json(429, { error: 'rate_limited' }, { 'retry-after': String(this.mcpRetryAfter) })
      }
      const message = JSON.parse(body) as {
        id?: number
        method: string
        params?: { name?: string }
      }
      this.mcpCalls.push(message)
      if (message.id === undefined) return void response.writeHead(202).end()
      const ok = (result: unknown) => json(200, { jsonrpc: '2.0', id: message.id, result })
      if (message.method === 'initialize') {
        return ok({
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'fake-clube', version: '1' },
        })
      }
      if (message.method === 'tools/list') {
        return ok({
          tools: [
            { name: 'buscar', description: 'Search', inputSchema: { type: 'object' } },
            { name: 'conta', description: 'Account', inputSchema: { type: 'object' } },
          ],
        })
      }
      if (message.method === 'tools/call') {
        return ok({ content: [{ type: 'text', text: `called ${message.params?.name}` }] })
      }
      return json(200, { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'no' } })
    }
    response.writeHead(404).end()
  }

  #summary(track: FakeMusica) {
    const previas = Object.fromEntries(
      ['completa', 'instrumental', 'vocal'].map((v) => [
        v,
        `${this.origin}/previas/${track.id}/${v}.mp3`,
      ]),
    )
    const minutes = Math.floor(track.duracao_s / 60)
    const { versions: _versions, ...rest } = track
    return {
      ...rest,
      duracao: `${minutes}:${String(track.duracao_s % 60).padStart(2, '0')}`,
      capa: null,
      spotify: null,
      previas,
      separacao: 'demucs',
      usada_em: [],
      zip_mb: 98,
      pagina: `${this.origin}/musicas/${track.id}`,
    }
  }

  /** `/api/v1/sons*` and `/api/v1/musicas*`: the sound library, from the contract. */
  async #library(
    url: URL,
    request: IncomingMessage,
    response: ServerResponse,
    json: (status: number, value: unknown, headers?: Record<string, string>) => void,
    bearer: () => string | undefined,
  ): Promise<void> {
    this.seen.push({ path: url.pathname, authorization: request.headers.authorization })
    if (!bearer() || !this.#access.has(bearer()!)) return json(401, { error: 'invalid_token' })
    if (this.plan === 'grátis' || this.plan === 'teste')
      return json(403, { error: 'so_assinantes' })
    const query = url.searchParams
    const rest = url.pathname.slice('/api/v1'.length)
    if (this.soundsRetryAfter !== undefined && rest !== '/sons/previa') {
      return json(429, { error: 'rate_limited' }, { 'retry-after': String(this.soundsRetryAfter) })
    }
    const has = (haystack: Array<string | undefined>, q: string) =>
      !q || haystack.join(' ').toLowerCase().includes(q)
    if (rest === '/sons/facetas') {
      const categorias = new Map<string, number>()
      for (const som of this.sons) {
        const key = `${som.tipo}|${som.categoria ?? ''}`
        categorias.set(key, (categorias.get(key) ?? 0) + 1)
      }
      return json(200, {
        total: this.sons.length,
        tipos: [...new Set(this.sons.map((som) => som.tipo))],
        categorias: [...categorias].map(([key, total]) => {
          const [tipo, categoria] = key.split('|')
          return { tipo, categoria, total }
        }),
        notas: [...new Set(this.sons.flatMap((som) => (som.nota ? [som.nota] : [])))],
      })
    }
    if (rest === '/sons') {
      const q = (query.get('q') ?? '').toLowerCase()
      const found = this.sons.filter(
        (som) =>
          has([som.nome, som.familia, som.categoria, som.papel], q) &&
          (!query.get('tipo') || som.tipo === query.get('tipo')) &&
          (!query.get('categoria') || som.categoria === query.get('categoria')) &&
          (!query.get('nota') || som.nota === query.get('nota')) &&
          (!query.get('modo') || som.modo === query.get('modo')) &&
          inRange(som.bpm, query),
      )
      const inicio = Number(query.get('inicio') ?? 0)
      const limite = Math.min(50, Number(query.get('limite') ?? 20))
      return json(200, {
        total: found.length,
        inicio,
        sons: found
          .slice(inicio, inicio + limite)
          .map(({ bytes: _bytes, fmt: _fmt, ...som }) => som),
      })
    }
    if (rest === '/sons/previa') {
      this.previewCalls.push(query.get('id') ?? '')
      if (!this.sons.some((som) => som.id === query.get('id'))) {
        return json(404, { error: 'nao_encontrado' })
      }
      return void response
        .writeHead(200, { 'content-type': 'audio/ogg' })
        .end(Buffer.from('OggS-preview'))
    }
    if (rest === '/sons/arquivo') {
      const id = query.get('id') ?? ''
      const som = this.sons.find((entry) => entry.id === id)
      if (!som) return json(404, { error: 'nao_encontrado' })
      if (this.#filesToday >= this.dailySounds) {
        return json(
          429,
          { error: 'limite', motivo: 'sons_dia' },
          this.dailyRetryAfter === undefined ? {} : { 'retry-after': String(this.dailyRetryAfter) },
        )
      }
      this.#filesToday += 1
      this.fileCalls.push(id)
      const bytes = som.bytes ?? Buffer.from(`audio:${som.id}:${som.nome}`)
      const fmt = som.fmt ?? 'flac'
      const headers = {
        'content-type': fmt === 'mp3' ? 'audio/mpeg' : 'audio/flac',
        'x-som-fmt': fmt,
        'x-som-duracao': String(som.duracao_s),
        ...(som.lufs === undefined ? {} : { 'x-som-lufs': String(som.lufs) }),
        ...(this.fileHash === null
          ? {}
          : { 'x-som-sha256': this.fileHash ?? createHash('sha256').update(bytes).digest('hex') }),
      }
      return void response.writeHead(200, headers).end(bytes)
    }
    if (rest === '/musicas') {
      const q = (query.get('q') ?? '').toLowerCase()
      const bpm = query.get('bpm')
      const filtered =
        query.get('genero') ||
        query.get('clima') ||
        query.get('artista') ||
        query.get('tom') ||
        bpm ||
        query.get('bpm_min') ||
        query.get('bpm_max') ||
        q
      const found = this.musicas.filter(
        (track) =>
          has([track.titulo, track.genero, ...track.climas, track.artista], q) &&
          (!query.get('genero') || track.genero === query.get('genero')) &&
          (!query.get('clima') || track.climas.includes(query.get('clima')!)) &&
          (!query.get('artista') || track.artista === query.get('artista')) &&
          (!query.get('tom') || track.tom === query.get('tom')) &&
          (!bpm || Math.abs(track.bpm - Number(bpm)) <= 4) &&
          inRange(track.bpm, query),
      )
      const limite = Number(query.get('limite') ?? 20)
      const shown = found.slice(0, limite)
      const count = (values: string[]) =>
        Object.fromEntries(
          [...new Set(values)].map((v) => [v, values.filter((x) => x === v).length]),
        )
      return json(200, {
        total: found.length,
        mostrando: shown.length,
        versoes: 'Cada musica tem tres versoes alinhadas: completa, instrumental e vocal.',
        musicas: shown.map((track) => this.#summary(track)),
        // Only for a request without a filter, or one that found nothing.
        ...(!filtered || found.length === 0
          ? {
              filtros_disponiveis: {
                genero: count(this.musicas.map((track) => track.genero)),
                clima: count(this.musicas.flatMap((track) => track.climas)),
                tom: count(this.musicas.map((track) => track.tom)),
                artista: count(this.musicas.map((track) => track.artista)),
                bpm: {
                  min: Math.min(...this.musicas.map((track) => track.bpm)),
                  max: Math.max(...this.musicas.map((track) => track.bpm)),
                },
              },
            }
          : {}),
        ...(found.length === 0 ? { aviso: 'Nenhuma musica encontrada com esses filtros.' } : {}),
      })
    }
    const detail = /^\/musicas\/([^/]+)$/.exec(rest)
    if (detail) {
      const track = this.musicas.find((entry) => entry.id === detail[1])
      if (!track) return json(404, { error: 'musica nao encontrada' })
      this.detailCalls.push(track.id)
      // No 429 for the music limit: a 200 without `zip.url` and a sentence that says why.
      const refusal = this.musicPlanBlocked
        ? 'Seu plano nao inclui o download das musicas.'
        : this.#zipsToday >= this.dailyMusic
          ? `Limite de ${this.dailyMusic} arquivos por dia atingido (${this.#zipsToday} hoje): o link volta amanha.`
          : undefined
      if (!refusal) this.#zipsToday += 1
      return json(200, {
        ...this.#summary(track),
        zip: {
          conteudo: 'Tres WAV (44.1 kHz, 16 bit, estereo) e um leia-me.',
          tamanho_mb: 98,
          ...(refusal ? {} : { url: `${this.origin}/zips/${track.id}.zip`, validade: '6 horas' }),
        },
        ...(refusal ? { aviso: refusal } : {}),
        comandos: { curl: 'curl -O <url>' },
        depois: 'Rode o comando em outro produto.',
      })
    }
    return json(404, { error: 'nao_encontrado' })
  }

  #issue(clientId: string) {
    const n = ++this.#counter
    const access = `access-token-${n}-${randomBytes(6).toString('hex')}`
    const refresh = `refresh-token-${n}-${randomBytes(6).toString('hex')}`
    this.#access.add(access)
    this.#refresh.set(refresh, clientId)
    return {
      token_type: 'Bearer',
      access_token: access,
      refresh_token: refresh,
      expires_in: this.expiresIn,
    }
  }
}

export type FakeSom = {
  id: string
  nome: string
  tipo: string
  papel?: string
  nota?: string
  duracao_s: number
  categoria?: string
  colecao?: string
  familia?: string
  modo?: string
  lufs?: number
  bpm?: number
  /** What `/sons/arquivo` sends; a short text by default. */
  bytes?: Buffer
  fmt?: 'flac' | 'mp3'
}

export type FakeMusica = {
  id: string
  titulo: string
  artista: string
  genero: string
  climas: string[]
  tom: string
  bpm: number
  duracao_s: number
  /** The files of the track's zip; three versions by default. */
  versions?: Array<{ name: string; data: Buffer }>
}

export function defaultSons(): FakeSom[] {
  return [
    {
      id: '101',
      nome: 'Cello Drone A minor',
      tipo: 'tonal',
      papel: 'drone',
      nota: 'A',
      modo: 'menor',
      duracao_s: 42,
      categoria: 'Drones',
      familia: 'Cello',
      colecao: 'Pack interno',
      lufs: -23,
    },
    {
      id: '102',
      nome: 'Piano Loop C major',
      tipo: 'tonal',
      papel: 'loop',
      nota: 'C',
      modo: 'maior',
      duracao_s: 16,
      categoria: 'Loops',
      familia: 'Piano',
      lufs: -20,
      bpm: 90,
    },
    {
      id: '103',
      nome: 'Whoosh Fast',
      tipo: 'efeito',
      papel: 'transicao',
      duracao_s: 1.2,
      categoria: 'Whoosh',
      lufs: -18,
    },
    {
      id: '104',
      nome: 'Click Soft',
      tipo: 'efeito',
      papel: 'ui',
      duracao_s: 0.2,
      categoria: 'UI',
      lufs: -26,
    },
    {
      id: '105',
      nome: 'Hit Low A',
      tipo: 'tonal',
      papel: 'hit',
      nota: 'A',
      modo: 'menor',
      duracao_s: 4,
      categoria: 'Hits',
      familia: 'Synth',
      lufs: -16,
    },
    // Music tracks that are sounds of the library: one MP3 each, the genre as the category, an estimated key and BPM.
    {
      id: '201',
      nome: 'Quiet Morning',
      tipo: 'trilha',
      nota: 'D',
      modo: 'maior',
      duracao_s: 150,
      categoria: 'Ambient',
      lufs: -18,
      bpm: 72,
      fmt: 'mp3',
    },
    {
      id: '202',
      nome: 'City Pulse',
      tipo: 'trilha',
      nota: 'A',
      modo: 'menor',
      duracao_s: 128,
      categoria: 'Electronic',
      lufs: -14,
      bpm: 118,
      fmt: 'mp3',
    },
  ]
}

export function defaultMusicas(): FakeMusica[] {
  return [
    {
      id: 'm1',
      titulo: 'Slow Burn',
      artista: 'Artista Um',
      genero: 'cinematic',
      climas: ['tenso', 'sombrio'],
      tom: 'Am',
      bpm: 84,
      duracao_s: 120,
    },
    {
      id: 'm2',
      titulo: 'Bright Day',
      artista: 'Artista Dois',
      genero: 'pop',
      climas: ['alegre'],
      tom: 'C',
      bpm: 120,
      duracao_s: 95,
    },
  ]
}

/** The zip of a track: three WAV versions and a read-me, inside one folder named like the track. */
export function defaultVersions(name: string): Array<{ name: string; data: Buffer }> {
  return [
    ...['completa', 'instrumental', 'vocal'].map((version) => ({
      name: `${name}/${name} - ${version}.wav`,
      data: Buffer.from(`RIFF-${name}-${version}`),
    })),
    { name: `${name}/LEIA-ME.txt`, data: Buffer.from('read me') },
  ]
}

function inRange(bpm: number | undefined, query: URLSearchParams): boolean {
  const min = query.get('bpm_min')
  const max = query.get('bpm_max')
  if (min === null && max === null) return true
  if (bpm === undefined) return false
  return (min === null || bpm >= Number(min)) && (max === null || bpm <= Number(max))
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(data: Buffer): number {
  let c = 0xffffffff
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** A zip of the entries given: the first stored, the others deflated, so both paths are read. */
export function zip(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const locals: Buffer[] = []
  const directory: Buffer[] = []
  let offset = 0
  entries.forEach((entry, index) => {
    const name = Buffer.from(entry.name)
    const method = index === 0 ? 0 : 8
    const body = method === 0 ? entry.data : deflateRawSync(entry.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(crc32(entry.data), 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, body)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(crc32(entry.data), 16)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(entry.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    directory.push(central, name)
    offset += local.length + name.length + body.length
  })
  const central = Buffer.concat(directory)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(central.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, central, end])
}

function text(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => resolve(Buffer.concat(chunks).toString()))
    request.on('error', reject)
  })
}

/** The credential store of a test: a map, with what a test needs to look inside. */
export class MemoryClubeStore implements ClubeStore {
  readonly values = new Map<string, string>()
  read(reference: string): string | undefined {
    return this.values.get(reference)
  }
  write(reference: string, value: string): void {
    this.values.set(reference, value)
  }
  remove(reference: string): void {
    this.values.delete(reference)
  }
}
