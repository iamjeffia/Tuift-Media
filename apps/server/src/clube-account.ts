import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { z } from 'zod'
import { CLUBE_URL, type ClubeFailure, type ClubePlan, type ClubeStatus } from '@harness/contracts'
import { readCredential, removeCredential, writeCredential } from './credentials.js'

/**
 * The link to a Clube do Motion account: the OAuth 2.1 sign-in the Clube offers
 * (public client, PKCE, loopback redirect, dynamic registration), the tokens it
 * gives, and the one place that renews them.
 *
 * The tokens live in the OS credential store, as a provider's API key does
 * (Windows Credential Manager, which seals them with the user's DPAPI key; the
 * macOS Keychain). Nothing is written to a file, the database, a log or a push:
 * the screens see `ClubeStatus` and nothing more, and the MCP stand-in and the
 * API requests take a token from here for one request and let go of it.
 *
 * The refresh token is single use (the Clube rotates it at every refresh and the
 * old pair dies), so every refresh goes through `#refresh`, which runs one at a
 * time and shares its answer with whoever waited.
 */

/** Where the tokens and the registration are kept, one small credential each. */
export type ClubeStore = {
  read(reference: string): string | undefined
  write(reference: string, value: string): void
  remove(reference: string): void
}

const REFERENCES = {
  client: 'clube.client',
  access: 'clube.access',
  refresh: 'clube.refresh',
  expires: 'clube.expires',
} as const

export const osClubeStore: ClubeStore = {
  read: (reference) => {
    try {
      return readCredential(reference)
    } catch {
      return undefined
    }
  },
  write: writeCredential,
  remove: removeCredential,
}

/** The app's name at the Clube, as the owner decided. */
const CLIENT_NAME = 'TUIFT Code'
const SCOPE = 'clube'
const CALLBACK_PATH = '/callback'
const SIGN_IN_TIMEOUT_MS = 5 * 60_000
const REQUEST_TIMEOUT_MS = 20_000
/** A token this close to its end is renewed before a request goes out with it. */
const REFRESH_MARGIN_MS = 2 * 60_000
const ACCOUNT_TTL_MS = 60_000
/** The most of an answer from the Clube this module reads. */
const MAX_BODY_BYTES = 256 * 1024

/** The link does not exist (never made, or the Clube refused the renewal and the app let go of it). */
export class ClubeNotLinkedError extends Error {
  constructor() {
    super('no Clube do Motion account is linked')
  }
}

/** The Clube answered something this app cannot use, or could not be reached. */
export class ClubeUnreachableError extends Error {
  constructor() {
    super('the Clube do Motion could not be reached')
  }
}

const MetadataSchema = z.object({
  issuer: z.string().min(1),
  authorization_endpoint: z.string().min(1),
  token_endpoint: z.string().min(1),
  registration_endpoint: z.string().min(1),
  revocation_endpoint: z.string().min(1).optional(),
})
type Metadata = z.infer<typeof MetadataSchema>

const RegistrationSchema = z.object({ client_id: z.string().min(1) })
const TokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().positive(),
})
const AccountSchema = z.object({
  nome: z.string(),
  email: z.string(),
  plano: z.enum(['mensal', 'anual', 'tuift', 'teste', 'grátis']),
})

export type ClubeAccountInfo = { name: string; email: string; plan: ClubePlan }

/** How a sign-in's wait is ended: with the code, or with why not. */
type Settle = { resolve: (code: string) => void; reject: (reason: unknown) => void }
type Registration = { clientId: string; redirectUri: string }
type Tokens = { access: string; refresh: string; expiresAt: number }

type SignIn = {
  authUrl: string
  cancelled: boolean
  abort: (failure: ClubeFailure | undefined) => void
}

export type ClubeOptions = {
  /** The Clube's origin; tests point it at a fake. */
  origin?: string
  fetch?: typeof fetch
  store?: ClubeStore
  now?: () => number
  /** One line, never a token or an answer's body. */
  log?: (line: string) => void
  /** The link or its state changed. */
  onChanged?: () => void
  signInTimeoutMs?: number
}

/**
 * Who the Clube lets through its MCP server and API: a paid plan, or an account the Clube itself
 * released (`tuift`). A free trial is for the site only and gets the same 403 as a free account.
 */
export const isSubscriber = (plan: ClubePlan): boolean =>
  plan === 'mensal' || plan === 'anual' || plan === 'tuift'

const base64url = (bytes: Buffer): string => bytes.toString('base64url')

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export class ClubeAccount {
  readonly origin: string
  readonly #fetch: typeof fetch
  readonly #store: ClubeStore
  readonly #now: () => number
  readonly #log: (line: string) => void
  readonly #onChanged: () => void
  readonly #signInTimeoutMs: number

  #tokens: Tokens | undefined
  #loaded = false
  #refreshing: Promise<Tokens> | undefined
  #signIn: SignIn | undefined
  #failure: ClubeFailure | undefined
  #account: { info: ClubeAccountInfo; at: number } | undefined
  #metadata: Promise<Metadata> | undefined

  constructor(options: ClubeOptions = {}) {
    this.origin = (options.origin ?? CLUBE_URL).replace(/\/+$/, '')
    this.#fetch = options.fetch ?? fetch
    this.#store = options.store ?? osClubeStore
    this.#now = options.now ?? Date.now
    this.#log = options.log ?? (() => {})
    this.#onChanged = options.onChanged ?? (() => {})
    this.#signInTimeoutMs = options.signInTimeoutMs ?? SIGN_IN_TIMEOUT_MS
  }

  // ---------------------------------------------------------------- state

  /** Whether tokens are held. No network. */
  linked(): boolean {
    return this.#load() !== undefined
  }

  /** What the screens show. Reads the account (cached for a minute) while linked. */
  async status(): Promise<ClubeStatus> {
    if (this.#signIn) return { state: 'connecting' }
    if (!this.linked()) {
      return { state: 'disconnected', ...(this.#failure ? { failure: this.#failure } : {}) }
    }
    const info = await this.account().catch(() => undefined)
    if (!this.linked()) {
      return { state: 'disconnected', ...(this.#failure ? { failure: this.#failure } : {}) }
    }
    return {
      state: 'connected',
      ...(info ? { account: info, subscriber: isSubscriber(info.plan) } : {}),
    }
  }

  /**
   * The linked account's name, e-mail and plan: `/api/v1/conta`, answered from a
   * minute-old copy when there is one. Rejects when nothing is linked or the Clube
   * does not answer; the last copy stands in for a Clube that is briefly down.
   */
  async account(): Promise<ClubeAccountInfo> {
    const cached = this.#account
    if (cached && this.#now() - cached.at < ACCOUNT_TTL_MS) return cached.info
    try {
      const response = await this.request('/conta')
      if (!response.ok) throw new ClubeUnreachableError()
      const parsed = AccountSchema.safeParse(await readJson(response))
      if (!parsed.success) throw new ClubeUnreachableError()
      const info = {
        name: parsed.data.nome,
        email: parsed.data.email,
        plan: parsed.data.plano,
      }
      const changed = cached?.info.plan !== info.plan
      this.#account = { info, at: this.#now() }
      if (changed) this.#onChanged()
      return info
    } catch (error) {
      if (cached && this.linked()) return cached.info
      throw error
    }
  }

  /** Whether the linked account is a subscriber, or undefined when that cannot be told now. */
  async subscriber(): Promise<boolean | undefined> {
    if (!this.linked()) return false
    try {
      return isSubscriber((await this.account()).plan)
    } catch {
      return undefined
    }
  }

  // -------------------------------------------------------------- sign-in

  /**
   * Starts a sign-in: registers the app when it has not (or when its port is
   * taken), listens on 127.0.0.1 for this sign-in alone, and returns the address
   * the person opens in their browser. The rest runs behind it and ends in
   * `status()`. A second call while one is waiting returns the same address.
   */
  async connect(): Promise<{ authUrl: string }> {
    if (this.#signIn) return { authUrl: this.#signIn.authUrl }
    if (this.linked()) throw new Error('a Clube do Motion account is already linked')
    this.#failure = undefined
    const metadata = await this.#discover()
    const state = base64url(randomBytes(24))
    const verifier = base64url(randomBytes(48))
    const challenge = base64url(createHash('sha256').update(verifier).digest())
    const listener = await this.#listen(state)
    let registration: Registration
    try {
      registration = await this.#register(metadata, listener.port)
    } catch (error) {
      listener.close()
      throw error
    }
    const authorize = new URL(metadata.authorization_endpoint)
    authorize.search = new URLSearchParams({
      response_type: 'code',
      client_id: registration.clientId,
      redirect_uri: registration.redirectUri,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      scope: SCOPE,
      resource: `${this.origin}/mcp`,
    }).toString()
    const authUrl = authorize.toString()

    let timer: NodeJS.Timeout | undefined
    const signIn: SignIn = {
      authUrl,
      cancelled: false,
      abort: (failure) => {
        signIn.cancelled = true
        clearTimeout(timer)
        listener.cancel(failure)
      },
    }
    this.#signIn = signIn
    timer = setTimeout(() => listener.cancel('timeout'), this.#signInTimeoutMs)
    timer.unref()
    void listener.result.then(
      async (code) => {
        clearTimeout(timer)
        try {
          await this.#exchange(metadata, registration, code, verifier)
          // A disconnect while the code was being exchanged wins.
          if (signIn.cancelled) this.#forget()
          else this.#log('[clube] linked')
        } catch (error) {
          this.#failure = error instanceof ClubeUnreachableError ? 'unreachable' : 'mismatch'
          this.#log(`[clube] sign-in failed: ${this.#failure}`)
        } finally {
          listener.close()
          if (this.#signIn === signIn) this.#signIn = undefined
          this.#onChanged()
        }
      },
      (failure: unknown) => {
        clearTimeout(timer)
        listener.close()
        if (this.#signIn === signIn) this.#signIn = undefined
        this.#failure = isFailure(failure) ? failure : undefined
        if (this.#failure) this.#log(`[clube] sign-in ended: ${this.#failure}`)
        this.#onChanged()
      },
    )
    this.#onChanged()
    return { authUrl }
  }

  /** Ends a sign-in that is waiting for the browser. Nothing is linked and nothing is called a failure. */
  cancel(): void {
    const waiting = this.#signIn
    if (!waiting) return
    this.#signIn = undefined
    waiting.abort(undefined)
  }

  /**
   * Revokes the refresh token at the Clube and forgets everything held. The
   * registration stays, so signing in again does not register again. A Clube
   * that cannot be reached still ends the link here.
   */
  async disconnect(): Promise<void> {
    this.cancel()
    const tokens = this.#load()
    const client = this.#readRegistration()
    this.#forget()
    this.#failure = undefined
    this.#onChanged()
    if (!tokens || !client) return
    try {
      const metadata = await this.#discover()
      if (!metadata.revocation_endpoint) return
      const response = await this.#post(metadata.revocation_endpoint, {
        token: tokens.refresh,
        token_type_hint: 'refresh_token',
        client_id: client.clientId,
      })
      this.#log(`[clube] revoked (${response.status})`)
    } catch {
      this.#log('[clube] revoke could not reach the Clube; the link was removed here')
    }
  }

  // --------------------------------------------------------------- tokens

  /**
   * A token good for the request the caller is about to make. Renews first when
   * it is about to expire. Rejects with `ClubeNotLinkedError` when there is no
   * link, and unlinks (and says so in `status()`) when the Clube refuses to renew.
   */
  async accessToken(): Promise<string> {
    const tokens = this.#load()
    if (!tokens) throw new ClubeNotLinkedError()
    if (tokens.expiresAt - this.#now() > REFRESH_MARGIN_MS) return tokens.access
    return (await this.#refresh(tokens.access)).access
  }

  /**
   * An authenticated request to the Clube's API (`/api/v1` + `path`) for the
   * linked account. The token is renewed when needed, and once more when the
   * Clube answers 401 to one that looked fresh. A 403 (no subscription) and a
   * 429 are answers, not errors: the caller reads them from the response.
   */
  async request(path: string, init: RequestInit = {}): Promise<Response> {
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('path must start with "/"')
    return this.#authenticated(`${this.origin}/api/v1${path}`, init)
  }

  /** The same, for any address on the Clube's own origin (the MCP stand-in uses `/mcp`). */
  async #authenticated(url: string, init: RequestInit): Promise<Response> {
    const send = async (token: string) => {
      const headers = new Headers(init.headers)
      headers.set('authorization', `Bearer ${token}`)
      return this.#fetch(url, {
        ...init,
        headers,
        signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: 'manual',
      })
    }
    const token = await this.accessToken()
    const response = await send(token)
    if (response.status !== 401) return response
    await response.body?.cancel().catch(() => undefined)
    return send((await this.#refresh(token)).access)
  }

  /** For the MCP stand-in: a request to `/mcp` with a fresh token. */
  mcpRequest(init: RequestInit): Promise<Response> {
    return this.#authenticated(`${this.origin}/mcp`, init)
  }

  /**
   * The single place that renews. `stale` is the access token the caller held:
   * when it is no longer the one in hand, someone renewed already and the new
   * pair is used as it is.
   */
  #refresh(stale: string): Promise<Tokens> {
    if (this.#refreshing) return this.#refreshing
    const current = this.#load()
    if (!current) return Promise.reject(new ClubeNotLinkedError())
    if (current.access !== stale && current.expiresAt - this.#now() > REFRESH_MARGIN_MS) {
      return Promise.resolve(current)
    }
    const running = this.#renew(current).finally(() => {
      if (this.#refreshing === running) this.#refreshing = undefined
    })
    this.#refreshing = running
    return running
  }

  async #renew(current: Tokens): Promise<Tokens> {
    const client = this.#readRegistration()
    if (!client) {
      this.#unlink()
      throw new ClubeNotLinkedError()
    }
    let response: Response
    try {
      const metadata = await this.#discover()
      response = await this.#post(metadata.token_endpoint, {
        grant_type: 'refresh_token',
        refresh_token: current.refresh,
        client_id: client.clientId,
        resource: `${this.origin}/mcp`,
      })
    } catch {
      throw new ClubeUnreachableError()
    }
    if (response.status >= 500 || response.status === 429) {
      await response.body?.cancel().catch(() => undefined)
      throw new ClubeUnreachableError()
    }
    const parsed = response.ok ? TokenSchema.safeParse(await readJson(response)) : undefined
    if (!parsed?.success) {
      // The Clube refused (or sent nothing usable): the pair is dead, so the link is too.
      await response.body?.cancel().catch(() => undefined)
      this.#log(`[clube] renewal refused (${response.status}); unlinked`)
      this.#unlink()
      throw new ClubeNotLinkedError()
    }
    return this.#save(parsed.data)
  }

  /** Writes the pair. The refresh token goes first: it is the one that cannot be asked for again. */
  #save(token: z.infer<typeof TokenSchema>): Tokens {
    const tokens = {
      access: token.access_token,
      refresh: token.refresh_token,
      expiresAt: this.#now() + token.expires_in * 1_000,
    }
    this.#store.write(REFERENCES.refresh, tokens.refresh)
    this.#store.write(REFERENCES.access, tokens.access)
    this.#store.write(REFERENCES.expires, String(tokens.expiresAt))
    this.#tokens = tokens
    this.#loaded = true
    return tokens
  }

  #load(): Tokens | undefined {
    if (this.#loaded) return this.#tokens
    this.#loaded = true
    const refresh = this.#store.read(REFERENCES.refresh)
    if (!refresh) return undefined
    const expiresAt = Number(this.#store.read(REFERENCES.expires))
    this.#tokens = {
      access: this.#store.read(REFERENCES.access) ?? '',
      refresh,
      // Unknown or lost expiry: renew on first use.
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
    }
    return this.#tokens
  }

  #forget(): void {
    this.#tokens = undefined
    this.#loaded = true
    this.#account = undefined
    for (const key of ['access', 'refresh', 'expires'] as const) {
      this.#store.remove(REFERENCES[key])
    }
  }

  /** The Clube refused the renewal: let go, and keep the reason for the screen. */
  #unlink(): void {
    this.#forget()
    this.#failure = 'unlinked'
    this.#onChanged()
  }

  // ----------------------------------------------------------- the Clube

  #discover(): Promise<Metadata> {
    this.#metadata ??= this.#fetchMetadata().catch((error: unknown) => {
      this.#metadata = undefined
      throw error
    })
    return this.#metadata
  }

  async #fetchMetadata(): Promise<Metadata> {
    let response: Response
    try {
      response = await this.#fetch(`${this.origin}/.well-known/oauth-authorization-server`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch {
      throw new ClubeUnreachableError()
    }
    const parsed = response.ok ? MetadataSchema.safeParse(await readJson(response)) : undefined
    if (!parsed?.success) throw new ClubeUnreachableError()
    // Every endpoint must be the Clube's own: a document that points elsewhere is not trusted with a token.
    for (const endpoint of [
      parsed.data.authorization_endpoint,
      parsed.data.token_endpoint,
      parsed.data.registration_endpoint,
      parsed.data.revocation_endpoint,
    ]) {
      if (endpoint !== undefined && new URL(endpoint).origin !== new URL(this.origin).origin) {
        throw new ClubeUnreachableError()
      }
    }
    return parsed.data
  }

  #readRegistration(): Registration | undefined {
    const raw = this.#store.read(REFERENCES.client)
    if (!raw) return undefined
    try {
      const parsed = z
        .object({ clientId: z.string().min(1), redirectUri: z.string().min(1) })
        .parse(JSON.parse(raw))
      return parsed
    } catch {
      return undefined
    }
  }

  /**
   * The app registers once. The registration names the loopback port it will
   * listen on; the next sign-in listens on that port again, and only when it is
   * taken does the app register again with the port it got.
   */
  async #register(metadata: Metadata, port: number): Promise<Registration> {
    const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`
    const known = this.#readRegistration()
    if (known && known.redirectUri === redirectUri) return known
    let response: Response
    try {
      response = await this.#fetch(metadata.registration_endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_name: CLIENT_NAME,
          redirect_uris: [redirectUri],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
          scope: SCOPE,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch {
      throw new ClubeUnreachableError()
    }
    const parsed = response.ok ? RegistrationSchema.safeParse(await readJson(response)) : undefined
    if (!parsed?.success) throw new ClubeUnreachableError()
    const registration = { clientId: parsed.data.client_id, redirectUri }
    this.#store.write(REFERENCES.client, JSON.stringify(registration))
    return registration
  }

  async #exchange(
    metadata: Metadata,
    registration: Registration,
    code: string,
    verifier: string,
  ): Promise<void> {
    let response: Response
    try {
      response = await this.#post(metadata.token_endpoint, {
        grant_type: 'authorization_code',
        code,
        redirect_uri: registration.redirectUri,
        client_id: registration.clientId,
        code_verifier: verifier,
        resource: `${this.origin}/mcp`,
      })
    } catch {
      throw new ClubeUnreachableError()
    }
    if (response.status >= 500) throw new ClubeUnreachableError()
    const parsed = response.ok ? TokenSchema.safeParse(await readJson(response)) : undefined
    if (!parsed?.success) {
      await response.body?.cancel().catch(() => undefined)
      throw new Error('the Clube did not accept the code')
    }
    this.#account = undefined
    this.#save(parsed.data)
  }

  #post(url: string, form: Record<string, string>): Promise<Response> {
    return this.#fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  }

  // ------------------------------------------------------------- listener

  /**
   * The loopback listener of one sign-in. It tries the port the app registered
   * last time, then any free one, and answers `/callback` only. A request whose
   * state is not this sign-in's is refused and the wait goes on.
   */
  async #listen(state: string): Promise<{
    port: number
    result: Promise<string>
    cancel: (failure: ClubeFailure | undefined) => void
    close: () => void
  }> {
    const settle: Settle = { resolve: () => {}, reject: () => {} }
    const result = new Promise<string>((resolve, reject) => {
      settle.resolve = resolve
      settle.reject = reject
    })
    // A cancel is not a failure; the rejection carries `undefined` and the caller reads that.
    result.catch(() => undefined)
    let done = false
    const server: Server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (request.method !== 'GET' || url.pathname !== CALLBACK_PATH) {
        response.writeHead(404).end()
        return
      }
      const given = url.searchParams.get('state')
      if (!given || !sameText(given, state) || done) {
        response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('Invalid')
        return
      }
      const error = url.searchParams.get('error')
      const code = url.searchParams.get('code')
      const issuer = url.searchParams.get('iss')
      done = true
      const answer = (failure: ClubeFailure | undefined, text: string) => {
        response
          .writeHead(failure ? 400 : 200, {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
            'referrer-policy': 'no-referrer',
          })
          .end(callbackPage(text))
        if (failure) settle.reject(failure)
      }
      if (error) return answer('denied', 'Conexão cancelada. Connection cancelled.')
      if (!code || (issuer !== null && !sameText(issuer.replace(/\/+$/, ''), this.origin))) {
        return answer('mismatch', 'Resposta inválida. Invalid answer.')
      }
      answer(undefined, 'Conta conectada. Você já pode fechar esta aba. You can close this tab.')
      settle.resolve(code)
    })
    server.on('clientError', (_error, socket) => socket.destroy())
    const preferred = Number(/:(\d+)\//.exec(this.#readRegistration()?.redirectUri ?? '')?.[1])
    const attempts = Number.isInteger(preferred) && preferred > 0 ? [preferred, 0] : [0]
    let port = 0
    for (const attempt of attempts) {
      try {
        port = await new Promise<number>((resolve, reject) => {
          server.once('error', reject)
          server.listen({ host: '127.0.0.1', port: attempt }, () => {
            server.off('error', reject)
            const address = server.address()
            if (!address || typeof address === 'string') reject(new Error('no port'))
            else resolve(address.port)
          })
        })
        break
      } catch {
        // The registered port is taken: the next attempt takes any free one.
      }
    }
    if (port === 0) throw new Error('could not listen for the Clube sign-in')
    return {
      port,
      result,
      cancel: (failure) => {
        done = true
        settle.reject(failure)
      },
      close: () => {
        server.close()
        server.closeAllConnections()
      },
    }
  }
}

const isFailure = (value: unknown): value is ClubeFailure =>
  value === 'denied' || value === 'timeout' || value === 'mismatch'

function callbackPage(text: string): string {
  const escaped = text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
  return `<!doctype html><meta charset="utf-8"><title>TUIFT Code</title><body style="font:16px system-ui;margin:3rem;text-align:center"><p>${escaped}</p>`
}

/** An answer's JSON, bounded; anything else is undefined. */
async function readJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text()
    if (text.length > MAX_BODY_BYTES) return undefined
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
