import { request as httpRequest } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentToolsEndpoint, type AgentToolsBroker } from './agent-tools-mcp.js'
import { ClubeAccount } from './clube-account.js'
import { FakeClube, MemoryClubeStore } from './clube-fake.test-support.js'
import { CLUBE_SERVER_ID, clubeServerConfig, isClubeServer } from './clube-mcp.js'

const broker: AgentToolsBroker = {
  listModels: vi.fn(async () => ({})),
  start: vi.fn(async () => ({})),
  wait: vi.fn(async () => ({})),
  stop: vi.fn(async () => ({})),
}

type Reply = {
  status: number
  body: string
  headers: Record<string, string | string[] | undefined>
}

function call(
  url: string,
  body: string,
  headers: Record<string, string> = {},
  method = 'POST',
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(
      url,
      { method, headers: { 'content-type': 'application/json', ...headers } },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString(),
            headers: response.headers,
          }),
        )
      },
    )
    outgoing.on('error', reject)
    outgoing.end(body)
  })
}

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function open() {
  const fake = new FakeClube()
  await fake.start()
  cleanups.push(() => fake.stop())
  const store = new MemoryClubeStore()
  const clock = { now: 1_800_000_000_000 }
  const clube = new ClubeAccount({ origin: fake.origin, store, now: () => clock.now })
  const { authUrl } = await clube.connect()
  await fake.browse(authUrl)
  await vi.waitFor(async () => expect((await clube.status()).state).toBe('connected'))
  const endpoint = new AgentToolsEndpoint(broker, undefined, undefined, clube)
  cleanups.push(() => endpoint.close())
  const grant = endpoint.grant()
  grant.bind('thread-1')
  const url = await endpoint.clubeUrl()
  const rpc = (message: unknown, headers: Record<string, string> = {}) =>
    call(url, JSON.stringify(message), { authorization: grant.authorization, ...headers })
  return { fake, clube, clock, store, endpoint, grant, url, rpc }
}

const toolCall = { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'buscar' } }

describe('the Clube MCP stand-in', () => {
  it('forwards initialize, the tool list and a tool call, each with a fresh token of the account', async () => {
    const { fake, store, clock, rpc, grant } = await open()
    const initialized = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    expect(JSON.parse(initialized.body).result.serverInfo.name).toBe('fake-clube')
    expect((await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202)
    const listed = JSON.parse((await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).body)
    expect(listed.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'buscar',
      'conta',
    ])
    expect(JSON.parse((await rpc(toolCall)).body).result.content[0].text).toBe('called buscar')

    // The Clube saw the account's token, never the chat's credential.
    const first = store.read('clube.access')!
    const sent = fake.seen.filter((entry) => entry.path === '/mcp')
    expect(sent.length).toBeGreaterThanOrEqual(4)
    expect(sent.every((entry) => entry.authorization === `Bearer ${first}`)).toBe(true)
    expect(sent.some((entry) => entry.authorization === grant.authorization)).toBe(false)

    // An hour later the next call goes out with a renewed token, and the agent notices nothing.
    clock.now += 3_600_000
    const later = JSON.parse((await rpc({ ...toolCall, id: 8 })).body)
    expect(later.result.content[0].text).toBe('called buscar')
    const renewed = store.read('clube.access')!
    expect(renewed).not.toBe(first)
    expect(fake.seen.at(-1)!.authorization).toBe(`Bearer ${renewed}`)
    expect(fake.refreshes).toHaveLength(1)
  })

  it('never shows the agent the account token in an answer', async () => {
    const { store, rpc } = await open()
    const answers = [
      await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
      await rpc(toolCall),
    ]
    for (const answer of answers) {
      expect(answer.body).not.toContain(store.read('clube.access')!)
      expect(answer.body).not.toContain(store.read('clube.refresh')!)
      expect(JSON.stringify(answer.headers)).not.toContain(store.read('clube.access')!)
    }
  })

  it('answers a missing subscription as a tool error with the plans, not a broken connection', async () => {
    const { fake, rpc } = await open()
    fake.plan = 'grátis'
    const reply = await rpc(toolCall)
    expect(reply.status).toBe(200)
    const message = JSON.parse(reply.body)
    expect(message.id).toBe(7)
    expect(message.result.isError).toBe(true)
    expect(message.result.content[0].text).toContain('no active subscription')
    expect(message.result.content[0].text).toContain('https://clubedomotion.com/planos')
  })

  it('answers a limit as a tool error with the wait', async () => {
    const { fake, rpc } = await open()
    fake.mcpRetryAfter = 17
    const message = JSON.parse((await rpc(toolCall)).body)
    expect(message.result.isError).toBe(true)
    expect(message.result.content[0].text).toContain('17 seconds')
    // A list gets a JSON-RPC error with the same words; the id is kept.
    const listed = JSON.parse((await rpc({ jsonrpc: '2.0', id: 9, method: 'tools/list' })).body)
    expect(listed.id).toBe(9)
    expect(listed.error.message).toContain('17 seconds')
  })

  it('answers a batch one answer per request', async () => {
    const { fake, rpc } = await open()
    fake.mcpRetryAfter = 3
    const answers = JSON.parse(
      (await rpc([toolCall, { jsonrpc: '2.0', method: 'notifications/initialized' }])).body,
    )
    expect(answers).toHaveLength(1)
    expect(answers[0].result.isError).toBe(true)
  })

  it('tells the agent the account is no longer linked once the Clube refuses the renewal', async () => {
    const { fake, clock, rpc, clube } = await open()
    clock.now += 3_600_000
    fake.refuseRefresh = true
    const message = JSON.parse((await rpc(toolCall)).body)
    expect(message.result.isError).toBe(true)
    expect(message.result.content[0].text).toContain('no longer linked')
    expect(clube.linked()).toBe(false)
  })

  it('tells the agent the Clube is unreachable, not that the connection broke', async () => {
    const { fake, rpc } = await open()
    await fake.stop()
    const message = JSON.parse((await rpc(toolCall)).body)
    expect(message.result.isError).toBe(true)
    expect(message.result.content[0].text).toContain('could not be reached')
  })

  it('answers only a chat that holds the credential, and never a page', async () => {
    const { url, rpc, grant } = await open()
    const body = JSON.stringify(toolCall)
    expect((await call(url, body)).status).toBe(401)
    expect(
      (await call(url, body, { authorization: 'Bearer wrong-wrong-wrong-wrong' })).status,
    ).toBe(401)
    expect((await rpc(toolCall, { origin: 'https://evil.example' })).status).toBe(403)
    expect((await call(url, '', { authorization: grant.authorization }, 'GET')).status).toBe(405)
    grant.revoke()
    expect((await rpc(toolCall)).status).toBe(401)
  })

  it('does not exist on an endpoint built without a link', async () => {
    const endpoint = new AgentToolsEndpoint(broker)
    cleanups.push(() => endpoint.close())
    const grant = endpoint.grant()
    const url = await endpoint.clubeUrl()
    const reply = await call(url, JSON.stringify(toolCall), { authorization: grant.authorization })
    expect(reply.status).toBe(404)
  })

  it('keeps the session header of the Clube on its way through, both ways', async () => {
    const { fake, rpc } = await open()
    await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { 'mcp-session-id': 'abc' })
    expect(fake.seen.at(-1)!.session).toBe('abc')
  })
})

describe('the person’s own server', () => {
  const origin = 'https://clubedomotion.com'
  it('is recognised by id, name or address, and never by the app’s own id', () => {
    expect(isClubeServer({ id: 'clube' }, origin)).toBe(true)
    expect(isClubeServer({ id: 'Clube-do-Motion' }, 'https://x.test')).toBe(true)
    expect(isClubeServer({ id: 'clubedomotion' }, origin)).toBe(true)
    expect(isClubeServer({ id: 'x', displayName: 'Clube do Motion' }, origin)).toBe(true)
    expect(
      isClubeServer(
        { id: 'x', transport: { type: 'http', url: 'https://clubedomotion.com/mcp' } },
        origin,
      ),
    ).toBe(true)
    expect(
      isClubeServer(
        { id: 'x', transport: { type: 'http', url: 'https://example.com/mcp' } },
        origin,
      ),
    ).toBe(false)
    expect(isClubeServer({ id: 'figma' }, origin)).toBe(false)
    expect(isClubeServer({ id: CLUBE_SERVER_ID }, origin)).toBe(false)
  })

  it('is attached as an http server whose only secret is the chat credential', () => {
    expect(clubeServerConfig('http://127.0.0.1:1/agents/x/clube', 'ref')).toEqual({
      id: CLUBE_SERVER_ID,
      enabled: true,
      displayName: 'Clube do Motion',
      transport: {
        type: 'http',
        url: 'http://127.0.0.1:1/agents/x/clube',
        headers: { Authorization: { source: 'credential', credentialRef: 'ref' } },
      },
    })
  })
})
