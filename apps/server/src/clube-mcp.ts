import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import {
  CLUBE_PLANS_URL,
  CLUBE_URL,
  type McpServer,
  type McpServerConfig,
} from '@harness/contracts'
import { ClubeNotLinkedError, type ClubeAccount } from './clube-account.js'

/**
 * The Clube do Motion's MCP server, offered to a chat once the app is linked to a
 * subscriber account. The provider's process never holds the account's token and
 * the token lasts an hour, so the provider is given the app's own local endpoint
 * (the same one that serves the agent tools, with the same per-chat credential)
 * and this module forwards each request to `https://clubedomotion.com/mcp` with a
 * token that is fresh at that moment.
 */

/**
 * The id the server is attached under. It is not a name the person is likely to
 * pick for their own Clube server (`clube`, `clube-do-motion`...), so their own
 * is always told apart from this one, and the MCP page does not list this one as theirs.
 */
export const CLUBE_SERVER_ID = 'tuift-clube'

/** What the stand-in needs from the link, so tests bring their own. */
export type ClubeMcpSource = Pick<ClubeAccount, 'origin' | 'mcpRequest'>

const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
const NAMES = new Set(['clube', 'clubedomotion', 'clubemotion'])

/**
 * Whether a server the person (or their provider) has configured is the Clube's:
 * by id or name, or by an address on the Clube's own host. The app's own
 * attachment (the reserved id) never counts as theirs.
 */
export function isClubeServer(
  server: {
    id: string
    displayName?: string | undefined
    transport?: { type: string; url?: string } | undefined
  },
  origin: string,
): boolean {
  if (server.id === CLUBE_SERVER_ID) return false
  if (NAMES.has(normalize(server.id))) return true
  if (server.displayName !== undefined && NAMES.has(normalize(server.displayName))) return true
  const url = server.transport?.type === 'http' ? server.transport.url : undefined
  if (!url) return false
  try {
    const host = new URL(url).host
    return host === new URL(origin).host || host === new URL(CLUBE_URL).host
  } catch {
    return false
  }
}

/** The server a chat is started with: the stand-in's address, reached with the chat's own credential. */
export function clubeServerConfig(standInUrl: string, credentialRef: string): McpServerConfig {
  return {
    id: CLUBE_SERVER_ID,
    enabled: true,
    displayName: 'Clube do Motion',
    transport: {
      type: 'http',
      url: standInUrl,
      headers: { Authorization: { source: 'credential', credentialRef } },
    },
  }
}

/** The row the MCP page shows for the link: provided by it, and not editable. */
export function clubeProvidedServer(origin: string): McpServer {
  return {
    id: CLUBE_SERVER_ID,
    displayName: 'Clube do Motion',
    scope: 'global',
    enabled: true,
    transport: { type: 'http', url: `${origin}/mcp` },
    auth: { status: 'authenticated', method: 'oauth' },
    startup: { state: 'ready' },
    tools: [],
    resources: [],
    resourceTemplates: [],
    providedBy: 'clube',
  }
}

const MAX_BODY_BYTES = 8 * 1024 * 1024
/** A tool call may take a while on the Clube's side; this is only the ceiling. */
const FORWARD_TIMEOUT_MS = 120_000

/** The headers of a request that go on to the Clube. The agent's own `Authorization` never does. */
const FORWARDED_REQUEST = ['content-type', 'accept', 'mcp-session-id', 'mcp-protocol-version']
/** The headers of the Clube's answer that go back to the agent. */
const FORWARDED_RESPONSE = ['content-type', 'mcp-session-id', 'cache-control']

type JsonRpcMessage = { id?: string | number | null; method?: string }

function messagesOf(body: Buffer): JsonRpcMessage[] | undefined {
  try {
    const parsed: unknown = JSON.parse(body.toString('utf8'))
    const list = Array.isArray(parsed) ? parsed : [parsed]
    return list.every((entry) => typeof entry === 'object' && entry !== null)
      ? (list as JsonRpcMessage[])
      : undefined
  } catch {
    return undefined
  }
}

/**
 * What the agent reads when the Clube does not give an answer: a tool error for a
 * tool call (the connection stays up and the agent can tell the person), a
 * JSON-RPC error for anything else. Notifications get no answer.
 */
function failure(messages: JsonRpcMessage[], text: string): unknown[] {
  return messages.flatMap((message): unknown[] => {
    if (message.id === undefined || message.id === null) return []
    if (message.method === 'tools/call') {
      return [
        {
          jsonrpc: '2.0',
          id: message.id,
          result: { content: [{ type: 'text', text }], isError: true },
        },
      ]
    }
    return [{ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: text } }]
  })
}

function textFor(status: number, retryAfter: string | null): string {
  if (status === 403) {
    return `The Clube do Motion account linked to TUIFT Code has no active subscription, so the Clube's tools are not available. Tell the user: the plans are at ${CLUBE_PLANS_URL}.`
  }
  if (status === 429) {
    const seconds = Number(retryAfter)
    return `The Clube do Motion limit for this account was reached. ${
      Number.isFinite(seconds) && seconds > 0
        ? `Try again in ${Math.ceil(seconds)} seconds.`
        : 'Try again in a minute.'
    }`
  }
  if (status === 401) {
    return 'The Clube do Motion account is no longer linked to TUIFT Code. Tell the user to connect it again in Settings.'
  }
  return 'The Clube do Motion could not be reached. Try again shortly.'
}

function send(response: ServerResponse, status: number, value: unknown): void {
  if (response.headersSent) return
  response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value))
}

/**
 * Forwards one request of the stand-in to the Clube. The caller has already
 * checked the route, the chat's credential and the absence of an `Origin`, and
 * read the body. A refusal or a limit becomes an answer the agent can read.
 */
export async function forwardToClube(
  clube: ClubeMcpSource,
  request: IncomingMessage,
  body: Buffer,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== 'POST') {
    // No server-initiated stream and no session to end: the stand-in only answers requests.
    response.writeHead(405, { allow: 'POST' }).end()
    return
  }
  if (body.length > MAX_BODY_BYTES) {
    response.writeHead(413).end()
    return
  }
  const messages = messagesOf(body)
  const batch = body.toString('utf8').trimStart().startsWith('[')
  if (!messages) {
    send(response, 400, {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    })
    return
  }
  const answer = (text: string) => {
    const answers = failure(messages, text)
    if (answers.length === 0) response.writeHead(202).end()
    else send(response, 200, batch ? answers : answers[0])
  }

  const headers = new Headers()
  for (const name of FORWARDED_REQUEST) {
    const value = request.headers[name]
    if (typeof value === 'string') headers.set(name, value)
  }
  if (!headers.has('accept')) headers.set('accept', 'application/json, text/event-stream')

  const closed = new AbortController()
  const abort = () => closed.abort()
  response.once('close', abort)
  let upstream: Response
  try {
    upstream = await clube.mcpRequest({
      method: 'POST',
      headers,
      body: new Uint8Array(body),
      signal: AbortSignal.any([closed.signal, AbortSignal.timeout(FORWARD_TIMEOUT_MS)]),
    })
  } catch (error) {
    response.off('close', abort)
    if (closed.signal.aborted) return
    answer(textFor(error instanceof ClubeNotLinkedError ? 401 : 0, null))
    return
  }
  if (upstream.status === 401 || upstream.status === 403 || upstream.status === 429) {
    await upstream.body?.cancel().catch(() => undefined)
    response.off('close', abort)
    answer(textFor(upstream.status, upstream.headers.get('retry-after')))
    return
  }
  if (upstream.status >= 500 || (upstream.status >= 300 && upstream.status < 400)) {
    await upstream.body?.cancel().catch(() => undefined)
    response.off('close', abort)
    answer(textFor(0, null))
    return
  }
  const out: Record<string, string> = {}
  for (const name of FORWARDED_RESPONSE) {
    const value = upstream.headers.get(name)
    if (value !== null) out[name] = value
  }
  response.writeHead(upstream.status, out)
  if (!upstream.body) {
    response.end()
    return
  }
  const stream = Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream)
  stream.once('error', () => response.destroy())
  stream.pipe(response)
}
