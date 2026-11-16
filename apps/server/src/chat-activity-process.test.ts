import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'

/**
 * The parent channel, end to end: the real server entry point as a child process with Node's
 * IPC (the legacy launch; the utility process port carries the same message), in a temporary
 * data folder, on a free port. A second client starts the turns the way the phone does, through
 * the server's own API, with a tiny ACP agent as the provider. The parent hears working,
 * approval, failed and at rest, with no window anywhere.
 *
 * Needs `pnpm --filter @harness/server build` first.
 */
const main = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'main.js')
const built = existsSync(main)

// A provider with no CLI: answers the handshake, then holds a prompt until the test lets it end,
// fails it, or asks for an approval first.
const agent = String.raw`
const fs = require('node:fs')
const path = require('node:path')
const dir = process.env.FAKE_AGENT_DIR
const send = (message) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n')
const asked = new Map()
let nextRequest = 1000
const hold = (id) => {
  const timer = setInterval(() => {
    if (fs.existsSync(path.join(dir, 'fail'))) {
      clearInterval(timer)
      fs.rmSync(path.join(dir, 'fail'))
      send({ id, error: { code: -32000, message: 'the agent failed' } })
    } else if (fs.existsSync(path.join(dir, 'release'))) {
      clearInterval(timer)
      fs.rmSync(path.join(dir, 'release'))
      send({ id, result: { stopReason: 'end_turn' } })
    }
  }, 25)
}
const lines = require('node:readline').createInterface({ input: process.stdin })
// The server went away: so does this agent, or it would keep its folder open.
lines.on('close', () => process.exit(0))
lines.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.method === 'initialize') {
    send({ id: message.id, result: { protocolVersion: 1, agentCapabilities: {} } })
  } else if (message.method === 'session/new') {
    send({ id: message.id, result: { sessionId: 'fake-session' } })
  } else if (message.method === 'session/prompt') {
    if (JSON.stringify(message.params.prompt).includes('please ask')) {
      const request = nextRequest++
      asked.set(request, () => hold(message.id))
      send({
        id: request,
        method: 'session/request_permission',
        params: {
          sessionId: 'fake-session',
          toolCall: { toolCallId: 'call-1', title: 'npm test', kind: 'execute', status: 'pending' },
          options: [
            { optionId: 'yes', name: 'Allow', kind: 'allow_once' },
            { optionId: 'no', name: 'Reject', kind: 'reject_once' },
          ],
        },
      })
    } else hold(message.id)
  } else if (message.method === undefined && asked.has(message.id)) {
    asked.get(message.id)()
    asked.delete(message.id)
  }
})
`

type Activity = {
  type: string
  running: number
  chats: Array<{ id: string; title: string; state: string }>
}

const dirs: string[] = []
const children: ChildProcess[] = []
const sockets: WebSocket[] = []
afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close()
  for (const child of children.splice(0)) {
    if (child.exitCode !== null || child.signalCode !== null) continue
    const gone = new Promise((resolve) => child.once('exit', resolve))
    // The way the desktop stops it, so the server closes the agents it started too.
    child.send({ type: 'harness:shutdown' })
    const forced = setTimeout(() => child.kill(), 8_000)
    await gone
    clearTimeout(forced)
  }
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
})

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolve(port))
    })
  })
}

function until<T>(read: () => T | undefined, what: string, timeoutMs = 20_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const poll = () => {
      const value = read()
      if (value !== undefined) resolve(value)
      else if (Date.now() - started > timeoutMs) reject(new Error(`timed out waiting for ${what}`))
      else setTimeout(poll, 25)
    }
    poll()
  })
}

describe.skipIf(!built)('chat activity over the parent channel, with a real server process', () => {
  it('reports working, approval, failed and at rest for turns a second client starts', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'harness-activity-'))
    dirs.push(root)
    for (const name of ['data', 'config', 'desktop', 'home', 'project', 'agent'])
      mkdirSync(path.join(root, name))
    const script = path.join(root, 'fake-agent.cjs')
    writeFileSync(script, agent)
    const port = await freePort()
    const env: NodeJS.ProcessEnv = {
      SystemRoot: process.env['SystemRoot'],
      PATH: path.dirname(process.execPath),
      TEMP: root,
      TMP: root,
      HARNESS_DATA_DIR: path.join(root, 'data'),
      HARNESS_CONFIG_DIR: path.join(root, 'config'),
      HARNESS_DESKTOP_DATA_DIR: path.join(root, 'desktop'),
      HARNESS_PORT: String(port),
      HARNESS_HOST: '127.0.0.1',
      USERPROFILE: path.join(root, 'home'),
      HOME: path.join(root, 'home'),
      APPDATA: path.join(root, 'home'),
      LOCALAPPDATA: path.join(root, 'home'),
    }
    const child = spawn(process.execPath, [main], {
      env,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      windowsHide: true,
    })
    children.push(child)
    let output = ''
    child.stdout?.on('data', (chunk) => (output += chunk))
    child.stderr?.on('data', (chunk) => (output += chunk))

    // What the owner of this process hears, in order.
    const heard: Activity[] = []
    child.on('message', (message) => {
      if ((message as Activity).type === 'harness:chatActivity') heard.push(message as Activity)
    })
    // Reports are read in order, each wait starting after the last one it matched, so a report
    // that arrives before the call that caused it has answered is not missed.
    let cursor = 0
    const next = async (what: string, match: (message: Activity) => boolean) => {
      const found = await until(() => {
        const index = heard.findIndex((message, at) => at >= cursor && match(message))
        return index < 0 ? undefined : index
      }, what)
      cursor = found + 1
      return heard[found]!
    }

    // The first report is the whole picture, and says nothing runs.
    const first = await until(() => heard[0], 'the first report')
    expect(first).toEqual({ type: 'harness:chatActivity', running: 0, chats: [] })
    cursor = 1

    // A second client, the way the phone does it.
    const socket = new WebSocket(`ws://127.0.0.1:${port}`)
    sockets.push(socket)
    await new Promise((resolve, reject) => {
      socket.on('open', resolve)
      socket.on('error', reject)
    })
    let counter = 0
    const replies = new Map<string, { result?: unknown; error?: unknown }>()
    socket.on('message', (raw) => {
      const message = JSON.parse(String(raw)) as { id?: string; result?: unknown; error?: unknown }
      if (message.id) replies.set(message.id, message)
    })
    const call = async (method: string, params: unknown): Promise<any> => {
      const id = `c${(counter += 1)}`
      socket.send(JSON.stringify({ id, method, params }))
      const reply = await until(() => replies.get(id), `the reply to ${method}`)
      if (reply.error) throw new Error(`${method}: ${JSON.stringify(reply.error)}`)
      return reply.result
    }
    const project = path.join(root, 'project')
    await call('projects.add', { path: project })
    await call('harnesses.upsert', {
      id: 'fake-agent',
      displayName: 'Fake agent',
      provider: 'acp',
      command: process.execPath,
      args: [script],
      environment: { FAKE_AGENT_DIR: path.join(root, 'agent') },
    })
    const { threadId } = await call('thread.start', {
      provider: 'acp',
      agent: 'fake-agent',
      workspacePath: project,
      approval: 'ask',
    })
    const signal = (name: string) => writeFileSync(path.join(root, 'agent', name), '')
    const state = (message: Activity) =>
      message.chats.find((chat) => chat.id === threadId)?.state ?? 'rest'

    // A turn starts: working, one running.
    await call('thread.sendTurn', { threadId, text: 'work' })
    const working = await next('working', (message) => state(message) === 'working')
    expect(working.running).toBe(1)

    // It ends: at rest, nothing running.
    signal('release')
    const rest = await next('at rest', (message) => state(message) === 'rest')
    expect(rest).toMatchObject({ running: 0, chats: [] })

    // A turn that needs an approval: the chat waits on the person, and still counts as running.
    await call('thread.sendTurn', { threadId, text: 'please ask first' })
    const approval = await next('approval', (message) => state(message) === 'approval')
    expect(approval.running).toBe(1)
    // The agent names its approval after the tool call it wants to run.
    const approvalId = 'call-1'
    await call('thread.respondToApproval', { threadId, approvalId, decision: 'approve' })
    await next('working again', (message) => state(message) === 'working')
    signal('release')
    await next('at rest again', (message) => state(message) === 'rest')

    // A turn that fails: failed stays reported, but nothing runs.
    await call('thread.sendTurn', { threadId, text: 'work' })
    await next('working before the failure', (message) => state(message) === 'working')
    signal('fail')
    const failed = await next('failed', (message) => state(message) === 'failed')
    expect(failed.running).toBe(0)

    expect(output).not.toContain('cannot start')
  }, 60_000)
})
