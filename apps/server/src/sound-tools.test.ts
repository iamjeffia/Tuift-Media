import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentToolsEndpoint, type AgentToolsBroker } from './agent-tools-mcp.js'
import { ClubeAccount } from './clube-account.js'
import { FakeClube, MemoryClubeStore } from './clube-fake.test-support.js'
import type { MotionStageBroker } from './motion-stage.js'
import { SoundLibrary, type SoundLibraryStore } from './sound-library.js'
import { SOUND_TOOLS } from './sound-tools.js'

const broker: AgentToolsBroker = {
  listModels: vi.fn(async () => ({})),
  start: vi.fn(async () => ({})),
  wait: vi.fn(async () => ({})),
  stop: vi.fn(async () => ({})),
}

function post(url: string, body: unknown, authorization: string) {
  return new Promise<{ status: number; json: any }>((resolve, reject) => {
    const outgoing = httpRequest(
      url,
      { method: 'POST', headers: { 'content-type': 'application/json', authorization } },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString()
          resolve({ status: response.statusCode ?? 0, json: text ? JSON.parse(text) : undefined })
        })
      },
    )
    outgoing.on('error', reject)
    outgoing.end(JSON.stringify(body))
  })
}

const cleanups: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function open(
  options: { mode?: 'motion' | undefined; plan?: FakeClube['plan']; link?: boolean } = {},
) {
  const fake = new FakeClube()
  await fake.start()
  cleanups.push(() => fake.stop())
  if (options.plan) fake.plan = options.plan
  const tokens = new MemoryClubeStore()
  const clube = new ClubeAccount({ origin: fake.origin, store: tokens })
  if (options.link !== false) {
    const { authUrl } = await clube.connect()
    await fake.browse(authUrl)
    await vi.waitFor(() => expect(clube.linked()).toBe(true))
  }
  let settings: ReturnType<SoundLibraryStore['soundSettings']> = { enabled: true }
  let quota: unknown
  const library = new SoundLibrary({
    clube,
    store: {
      soundSettings: () => settings,
      setSoundSettings: (next) => {
        settings = next
      },
      soundQuota: () => quota,
      setSoundQuota: (next) => {
        quota = next
      },
    },
  })
  const project = mkdtempSync(path.join(os.tmpdir(), 'tc-sound-tools-'))
  cleanups.push(() => rmSync(project, { recursive: true, force: true, maxRetries: 3 }))
  const chatMode = 'mode' in options ? options.mode : 'motion'
  const motion = {
    mode: () => chatMode,
    stage: () => undefined,
    setStage: () => {},
    pack: () => undefined,
  } as MotionStageBroker
  const endpoint = new AgentToolsEndpoint(broker, undefined, motion, undefined, {
    library,
    projectDir: (threadId) => (threadId === 'chat-1' ? project : undefined),
  })
  cleanups.push(() => endpoint.close())
  const url = await endpoint.url()
  const grant = endpoint.grant()
  grant.bind('chat-1')
  const rpc = (method: string, params?: unknown) =>
    post(url, { jsonrpc: '2.0', id: 1, method, params }, grant.authorization)
  const call = async (name: string, args: unknown = {}) => {
    const { json } = await rpc('tools/call', { name, arguments: args })
    const result = json.result as { content: Array<{ text: string }>; isError?: boolean }
    const text = result.content[0]!.text
    return { text, isError: result.isError === true, json: () => JSON.parse(text) as any }
  }
  return {
    fake,
    library,
    project,
    rpc,
    call,
    settings: () => settings,
    tokens,
    endpoint,
    url,
  }
}

describe('the sound tools on the agent tools channel', () => {
  it('are offered in Motion chats and in no other', async () => {
    const motion = await open()
    const names = (await motion.rpc('tools/list')).json.result.tools.map(
      (tool: { name: string }) => tool.name,
    )
    for (const tool of SOUND_TOOLS) expect(names).toContain(tool.name)
    expect(names).toContain('motion_stage')

    const plain = await open({ mode: undefined })
    const plainNames = (await plain.rpc('tools/list')).json.result.tools.map(
      (tool: { name: string }) => tool.name,
    )
    for (const tool of SOUND_TOOLS) expect(plainNames).not.toContain(tool.name)
    // A call from a chat that is not in Motion is refused in words, not as a broken call.
    const refused = await plain.call('sound_search', {})
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('only available in Motion chats')
  })

  it('search sounds and answer ids, keys, durations and what is left of the day', async () => {
    const { call } = await open()
    const found = await call('sound_search', { type: 'tonal', key: 'A', limit: 5 })
    expect(found.isError).toBe(false)
    const body = found.json()
    expect(body.total).toBe(2)
    expect(body.results[0]).toEqual({
      id: '101',
      name: 'Cello Drone A minor',
      type: 'tonal',
      role: 'drone',
      key: 'A',
      mode: 'menor',
      duration_s: 42,
      category: 'Drones',
      lufs: -23,
    })
    expect(body.files_left_in_24h_estimate).toBe(200)
  })

  it('search music, whose key and BPM are catalogued facts and not marked as estimates', async () => {
    const { call } = await open()
    const found = await call('music_search', { genre: 'cinematic' })
    const body = found.json()
    expect(body.results).toHaveLength(1)
    expect(body.results[0]).toMatchObject({ id: 'm1', name: 'Slow Burn', key: 'Am', bpm: 84 })
    expect(body.results[0].estimated_key_and_bpm).toBeUndefined()
    expect(body.note).toBeUndefined()
  })

  it('search soundtracks (trilha), say their key and BPM are estimates, and use one as a sound', async () => {
    const { call, project } = await open()
    const found = await call('sound_search', { type: 'trilha', bpm_min: 100, key: 'A' })
    const body = found.json()
    expect(body.results).toHaveLength(1)
    expect(body.results[0]).toMatchObject({
      id: '202',
      name: 'City Pulse',
      type: 'trilha',
      key: 'A',
      mode: 'menor',
      bpm: 118,
      category: 'Electronic',
      estimated_key_and_bpm: true,
    })
    expect(body.note).toMatch(/estimates/)
    const used = (await call('sound_use', { id: '202' })).json()
    expect(used).toMatchObject({
      path: path.join(project, 'audio', 'clube', 'City Pulse.mp3'),
      format: 'mp3',
      reused: false,
    })
  })

  it('tell the agent when to prefer a trilha and when a Clube music track', () => {
    const description = (name: string) =>
      SOUND_TOOLS.find((tool) => tool.name === name)!.description
    expect(description('sound_search')).toMatch(/trilha/)
    expect(description('sound_search')).toMatch(/bed of music under narration/)
    expect(description('sound_search')).toMatch(/instrumental and vocal versions, use music_search/)
    expect(description('music_search')).toMatch(/instrumental without voice/)
    expect(
      SOUND_TOOLS.find((tool) => tool.name === 'sound_search')!.inputSchema.properties.type.enum,
    ).toContain('trilha')
  })

  it('use a sound: fetch it into the chat project and answer its path, format, duration and loudness', async () => {
    const { call, project, fake } = await open()
    await call('sound_search', {})
    const used = await call('sound_use', { id: '101' })
    expect(used.isError).toBe(false)
    const body = used.json()
    const file = path.join(project, 'audio', 'clube', 'Cello Drone A minor.flac')
    expect(body).toMatchObject({
      path: file,
      format: 'flac',
      duration_s: 42,
      lufs: -23,
      reused: false,
      files_left_in_24h_estimate: 199,
    })
    expect(readFileSync(file, 'utf8')).toBe('audio:101:Cello Drone A minor')
    const again = (await call('sound_use', { id: '101' })).json()
    expect(again.reused).toBe(true)
    expect(again.files_left_in_24h_estimate).toBe(199)
    expect(fake.fileCalls).toEqual(['101'])
  })

  it('use a track: answer the folder and each version', async () => {
    const { call, project } = await open()
    await call('music_search', {})
    const body = (await call('music_use', { id: 'm2' })).json()
    const name = 'Artista Dois - Bright Day'
    expect(body.path).toBe(path.join(project, 'audio', 'clube', 'music', name))
    expect(body.files.map((file: { version: string }) => file.version).sort()).toEqual([
      `${name} - completa`,
      `${name} - instrumental`,
      `${name} - vocal`,
    ])
    expect(body.format).toBe('wav')
  })

  it('answer a chat that has no project folder in words', async () => {
    const { endpoint, url } = await open()
    const stranger = endpoint.grant()
    stranger.bind('chat-2')
    const { json } = await post(
      url,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'sound_use', arguments: { id: '101' } },
      },
      stranger.authorization,
    )
    expect(json.result.isError).toBe(true)
    expect(json.result.content[0].text).toContain('no project folder')
  })

  it('say what the person can do when there is no account, no subscription, or a limit', async () => {
    const unlinked = await open({ link: false })
    const noAccount = await unlinked.call('sound_search', {})
    expect(noAccount.isError).toBe(true)
    expect(noAccount.text).toMatch(/not linked|No Clube do Motion account is linked/)
    expect(noAccount.text).toContain('Settings > Clube do Motion')

    const free = await open({ plan: 'grátis' })
    const noPlan = await free.call('music_search', {})
    expect(noPlan.isError).toBe(true)
    expect(noPlan.text).toContain('no subscription')
    expect(noPlan.text).toContain('https://clubedomotion.com/planos')

    const busy = await open()
    busy.fake.soundsRetryAfter = 12
    const limited = await busy.call('sound_search', {})
    expect(limited.isError).toBe(true)
    expect(limited.text).toContain('Try again in 12 seconds')

    const spent = await open()
    spent.fake.dailySounds = 0
    await spent.call('sound_search', {})
    const daily = await spent.call('sound_use', { id: '101' })
    expect(daily.isError).toBe(true)
    expect(daily.text).toContain('rolling 24 hours')
    expect(daily.text).not.toMatch(/midnight.*reset|tomorrow/)
    expect(daily.text).toContain('audio/clube')

    // A track the Clube will not give now: its own sentence reaches the agent.
    const music = await open()
    music.fake.dailyMusic = 0
    const track = await music.call('music_use', { id: 'm1' })
    expect(track.isError).toBe(true)
    expect(track.text).toContain('Limite de 0 arquivos por dia atingido')
    expect(track.text).toContain('rolling 24 hours')
  })

  it('answer a library the person turned off, without calling the Clube', async () => {
    const { call, library, fake } = await open()
    library.updateSettings({ enabled: false })
    const result = await call('sound_search', {})
    expect(result.isError).toBe(true)
    expect(result.text).toContain('turned the app')
    expect(fake.seen.filter((entry) => entry.path.startsWith('/api/v1/sons'))).toHaveLength(0)
  })

  it('answer invalid arguments in words, and an unknown id', async () => {
    const { call } = await open()
    const bad = await call('sound_search', { limit: 500, nonsense: true })
    expect(bad.isError).toBe(true)
    expect(bad.text).toContain('Invalid arguments')
    const missing = await call('sound_use', {})
    expect(missing.text).toContain('Invalid arguments')
    const unknown = await call('sound_use', { id: 'nope' })
    expect(unknown.isError).toBe(true)
    expect(unknown.text).toContain('Search again')
  })

  it('never show the account token, or where the sounds come from', async () => {
    const { call, tokens } = await open()
    const outputs = [
      (await call('sound_search', {})).text,
      (await call('music_search', {})).text,
      (await call('sound_use', { id: '101' })).text,
      (await call('music_use', { id: 'm1' })).text,
      ...SOUND_TOOLS.map((tool) => tool.description),
    ].join('\n')
    expect(outputs).not.toContain(tokens.read('clube.access')!)
    expect(outputs).not.toContain(tokens.read('clube.refresh')!)
    expect(outputs).not.toContain('Pack interno')
  })
})
