import { createHash, randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { ClubeStore } from './clube-account.js'

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
  plan: 'mensal' | 'anual' | 'teste' | 'grátis' = 'mensal'
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
