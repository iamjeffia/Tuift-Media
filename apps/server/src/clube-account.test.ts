import { createConnection } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClubeAccount, ClubeNotLinkedError, ClubeUnreachableError } from './clube-account.js'
import { FAKE_ACCOUNT, FakeClube, MemoryClubeStore } from './clube-fake.test-support.js'

const fakes: FakeClube[] = []
afterEach(async () => {
  await Promise.all(fakes.splice(0).map((fake) => fake.stop()))
})

async function setup(options: { signInTimeoutMs?: number } = {}) {
  const fake = new FakeClube()
  await fake.start()
  fakes.push(fake)
  const store = new MemoryClubeStore()
  const logs: string[] = []
  const clock = { now: 1_800_000_000_000 }
  let changes = 0
  const clube = new ClubeAccount({
    origin: fake.origin,
    store,
    now: () => clock.now,
    log: (line) => logs.push(line),
    onChanged: () => {
      changes += 1
    },
    ...options,
  })
  /** Signs in the way a person does: the page opens in a browser and allows. */
  const link = async () => {
    const { authUrl } = await clube.connect()
    expect(fake.checkAuthorize(authUrl)).toEqual([])
    expect(await fake.browse(authUrl)).toBe(200)
    await vi.waitFor(async () => expect((await clube.status()).state).toBe('connected'))
  }
  return { fake, store, logs, clock, clube, link, changes: () => changes }
}

const tokensIn = (store: MemoryClubeStore) => ({
  access: store.read('clube.access')!,
  refresh: store.read('clube.refresh')!,
})

describe('linking the account', () => {
  it('registers once, signs in with PKCE on a loopback port, and stores the tokens', async () => {
    const { fake, store, clube, link } = await setup()
    expect(await clube.status()).toEqual({ state: 'disconnected' })

    const { authUrl } = await clube.connect()
    expect(await clube.status()).toEqual({ state: 'connecting' })
    const params = new URL(authUrl).searchParams
    expect(params.get('code_challenge_method')).toBe('S256')
    expect(params.get('resource')).toBe(`${fake.origin}/mcp`)
    expect(params.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/)
    expect(fake.registrations).toHaveLength(1)
    expect(fake.registrations[0]!.name).toBe('TUIFT Code')
    // The same address while one is waiting: one listener, one registration.
    expect((await clube.connect()).authUrl).toBe(authUrl)

    expect(await fake.browse(authUrl)).toBe(200)
    await vi.waitFor(async () => expect((await clube.status()).state).toBe('connected'))
    expect(await clube.status()).toEqual({
      state: 'connected',
      account: { name: FAKE_ACCOUNT.nome, email: FAKE_ACCOUNT.email, plan: 'mensal' },
      subscriber: true,
    })
    const { access, refresh } = tokensIn(store)
    expect(access).toMatch(/^access-token-/)
    expect(refresh).toMatch(/^refresh-token-/)
    // The code was exchanged with the verifier of this sign-in, once.
    expect(fake.codeExchanges).toHaveLength(1)

    // Signing out and in again does not register again: the app reuses its port.
    await clube.disconnect()
    await link()
    expect(fake.registrations).toHaveLength(1)
  })

  it('treats a free account as connected without a subscription', async () => {
    const { fake, clube, link } = await setup()
    fake.plan = 'grátis'
    await link()
    expect(await clube.status()).toMatchObject({
      state: 'connected',
      account: { plan: 'grátis' },
      subscriber: false,
    })
    expect(await clube.subscriber()).toBe(false)
  })

  it('counts as subscriber only what the Clube lets through its MCP server and API', async () => {
    // The Clube answers a free trial with the same 403 as a free account, and lets through an
    // account it released itself (`tuift`).
    for (const [plan, subscriber] of [
      ['teste', false],
      ['tuift', true],
      ['anual', true],
    ] as const) {
      const { fake, clube, link } = await setup()
      fake.plan = plan
      await link()
      expect(await clube.status()).toMatchObject({ account: { plan }, subscriber })
      expect(await clube.subscriber()).toBe(subscriber)
    }
  })

  it('ends a cancelled sign-in without calling it a failure, and closes the listener', async () => {
    const { clube, fake } = await setup()
    const { authUrl } = await clube.connect()
    const port = Number(new URL(new URL(authUrl).searchParams.get('redirect_uri')!).port)
    clube.cancel()
    expect(await clube.status()).toEqual({ state: 'disconnected' })
    await vi.waitFor(async () => {
      const open = await new Promise<boolean>((resolve) => {
        const socket = createConnection({ host: '127.0.0.1', port }, () => {
          socket.destroy()
          resolve(true)
        })
        socket.on('error', () => resolve(false))
      })
      expect(open).toBe(false)
    })
    expect(fake.codeExchanges).toHaveLength(0)
  })

  it('reports a denial in the browser as denied', async () => {
    const { clube, fake } = await setup()
    const { authUrl } = await clube.connect()
    await fake.browse(authUrl, { deny: true })
    await vi.waitFor(async () =>
      expect(await clube.status()).toEqual({ state: 'disconnected', failure: 'denied' }),
    )
  })

  it('times out a sign-in nobody finishes', async () => {
    const { clube } = await setup({ signInTimeoutMs: 40 })
    await clube.connect()
    await vi.waitFor(async () =>
      expect(await clube.status()).toEqual({ state: 'disconnected', failure: 'timeout' }),
    )
  })

  it('ignores an answer with the wrong state and keeps waiting', async () => {
    const { clube, fake, store } = await setup()
    const { authUrl } = await clube.connect()
    expect(await fake.browse(authUrl, { state: 'not-the-state' })).toBe(400)
    expect(await clube.status()).toEqual({ state: 'connecting' })
    expect(fake.codeExchanges).toHaveLength(0)
    expect(store.read('clube.refresh')).toBeUndefined()
    expect(await fake.browse(authUrl)).toBe(200)
    await vi.waitFor(async () => expect((await clube.status()).state).toBe('connected'))
  })

  it('fails with a mismatch when the Clube does not accept the code', async () => {
    const { clube, fake, store } = await setup()
    const { authUrl } = await clube.connect()
    await fake.browse(authUrl, { code: 'a-code-nobody-issued' })
    await vi.waitFor(async () =>
      expect(await clube.status()).toEqual({ state: 'disconnected', failure: 'mismatch' }),
    )
    expect(store.read('clube.refresh')).toBeUndefined()
    expect(store.read('clube.access')).toBeUndefined()
  })

  it('does not trust a discovery document that points to another host', async () => {
    const { clube, fake } = await setup()
    const real = globalThis.fetch
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input).endsWith('/.well-known/oauth-authorization-server')) {
        return Response.json({
          issuer: fake.origin,
          authorization_endpoint: 'https://elsewhere.example/authorize',
          token_endpoint: `${fake.origin}/oauth/token`,
          registration_endpoint: `${fake.origin}/oauth/registrar`,
        })
      }
      return real(input, init)
    })
    const other = new ClubeAccount({ origin: fake.origin, store: new MemoryClubeStore() })
    await expect(other.connect()).rejects.toBeInstanceOf(ClubeUnreachableError)
    expect(fake.registrations).toHaveLength(0)
    spy.mockRestore()
    expect(clube).toBeDefined()
  })
})

describe('renewing the access', () => {
  it('renews once when many requests meet an expired token, and rotates the pair', async () => {
    const { fake, store, clock, clube, link } = await setup()
    await link()
    const before = tokensIn(store)
    clock.now += 3_600_000
    fake.refreshDelay = 40

    const answers = await Promise.all(
      Array.from({ length: 6 }, () => clube.request('/conta').then((r) => r.status)),
    )
    expect(answers).toEqual([200, 200, 200, 200, 200, 200])
    expect(fake.refreshes).toEqual([before.refresh])
    const after = tokensIn(store)
    expect(after.refresh).not.toBe(before.refresh)
    expect(after.access).not.toBe(before.access)
    // Every request after the renewal went out with the new token.
    expect(fake.seen.at(-1)!.authorization).toBe(`Bearer ${after.access}`)
  })

  it('renews before the token expires, never sending an expired one', async () => {
    const { fake, store, clock, clube, link } = await setup()
    await link()
    const first = tokensIn(store).access
    // 90 s left: inside the two minutes of margin.
    clock.now += 3_600_000 - 90_000
    const token = await clube.accessToken()
    expect(token).not.toBe(first)
    expect(fake.refreshes).toHaveLength(1)
    // Plenty left: no renewal.
    await clube.accessToken()
    expect(fake.refreshes).toHaveLength(1)
  })

  it('renews and retries once when the Clube refuses a token that looked fresh', async () => {
    const { fake, clube, link } = await setup()
    await link()
    fake.expireAccessTokens()
    const response = await clube.request('/conta')
    expect(response.status).toBe(200)
    expect(fake.refreshes).toHaveLength(1)
  })

  it('unlinks cleanly when the Clube refuses the renewal, and says why', async () => {
    const { fake, store, clock, clube, link, changes } = await setup()
    await link()
    const seenChanges = changes()
    clock.now += 3_600_000
    fake.refuseRefresh = true
    await expect(clube.request('/conta')).rejects.toBeInstanceOf(ClubeNotLinkedError)
    expect(await clube.status()).toEqual({ state: 'disconnected', failure: 'unlinked' })
    expect(store.read('clube.refresh')).toBeUndefined()
    expect(store.read('clube.access')).toBeUndefined()
    expect(changes()).toBeGreaterThan(seenChanges)
    // Concurrent callers see the same end, with one refusal between them.
    expect(fake.refreshes).toHaveLength(1)
    // And the person can link again.
    fake.refuseRefresh = false
    const { authUrl } = await clube.connect()
    await fake.browse(authUrl)
    await vi.waitFor(async () => expect((await clube.status()).state).toBe('connected'))
  })

  it('keeps the link when the Clube is unreachable at renewal', async () => {
    const { fake, store, clock, clube, link } = await setup()
    await link()
    const before = tokensIn(store)
    clock.now += 3_600_000
    fake.failRefresh = true
    await expect(clube.accessToken()).rejects.toBeInstanceOf(ClubeUnreachableError)
    expect(tokensIn(store)).toEqual(before)
    fake.failRefresh = false
    expect((await clube.request('/conta')).status).toBe(200)
  })

  it('refuses a request when nothing is linked', async () => {
    const { clube } = await setup()
    await expect(clube.request('/conta')).rejects.toBeInstanceOf(ClubeNotLinkedError)
    await expect(clube.request('conta')).rejects.toThrow('path must start')
  })

  it('picks the link up again from the store after a restart', async () => {
    const { fake, store, clock, clube, link } = await setup()
    await link()
    const restarted = new ClubeAccount({ origin: fake.origin, store, now: () => clock.now })
    expect(restarted.linked()).toBe(true)
    expect((await restarted.account()).email).toBe(FAKE_ACCOUNT.email)
    void clube
  })
})

describe('ending the link', () => {
  it('revokes at the Clube and removes the tokens, keeping only the registration', async () => {
    const { fake, store, clube, link } = await setup()
    await link()
    const { refresh } = tokensIn(store)
    await clube.disconnect()
    expect(fake.revoked).toEqual([refresh])
    expect(await clube.status()).toEqual({ state: 'disconnected' })
    expect([...store.values.keys()]).toEqual(['clube.client'])
    await expect(clube.accessToken()).rejects.toBeInstanceOf(ClubeNotLinkedError)
  })

  it('removes the link here even when the Clube cannot be reached to revoke', async () => {
    const { fake, store, clube, link } = await setup()
    await link()
    await fake.stop()
    await clube.disconnect()
    expect(store.read('clube.refresh')).toBeUndefined()
    expect(await clube.status()).toEqual({ state: 'disconnected' })
  })
})

describe('what is never shown', () => {
  it('keeps every token out of logs, statuses, change nudges and anything but the credential store', async () => {
    const { fake, store, clock, clube, link, logs } = await setup()
    const nudges: unknown[][] = []
    const watched = new ClubeAccount({
      origin: fake.origin,
      store,
      now: () => clock.now,
      log: (line) => logs.push(line),
      onChanged: (...args: unknown[]) => nudges.push(args),
    })
    await link()
    clock.now += 3_600_000
    fake.refuseRefresh = false
    await clube.request('/conta')
    await watched.status()
    await clube.disconnect()
    await link()
    clock.now += 3_600_000
    fake.refuseRefresh = true
    await clube.request('/conta').catch(() => undefined)

    const secrets = [
      ...fake.refreshes,
      ...fake.revoked,
      ...fake.seen.map((entry) => entry.authorization!.replace('Bearer ', '')),
      ...fake.codeExchanges.flatMap((form) => [form['code']!, form['code_verifier']!]),
    ]
    expect(secrets.length).toBeGreaterThan(4)
    const everything = JSON.stringify([logs, nudges, await clube.status(), await watched.status()])
    for (const secret of secrets) expect(everything).not.toContain(secret)
    expect(logs.every((line) => line.startsWith('[clube] '))).toBe(true)
  })
})
