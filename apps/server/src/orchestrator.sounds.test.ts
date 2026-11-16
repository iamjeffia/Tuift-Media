import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Capabilities, DomainEvent, McpServerConfig, ProviderId } from '@harness/contracts'
import type { AgentSession, ProviderRuntime, StartOptions } from './adapters.js'
import { ClubeAccount } from './clube-account.js'
import { FakeClube, MemoryClubeStore } from './clube-fake.test-support.js'
import {
  writeDefaultSkillPackFixture,
  writeDefaultSkillsFixture,
} from './default-skills.test-support.js'
import { McpConfigStore } from './mcp-config.js'
import { Orchestrator } from './orchestrator.js'
import { SoundLibrary } from './sound-library.js'
import { Store } from './store.js'

const CAPABILITIES: Capabilities = {
  steer: false,
  fork: false,
  interrupt: true,
  reasoningItems: false,
  approvals: false,
  images: false,
}

class FakeSession implements AgentSession {
  readonly capabilities = CAPABILITIES
  async sendTurn(): Promise<string> {
    return 'turn'
  }
  async interrupt(): Promise<void> {}
  respondToApproval(): void {}
  async reloadMcpServers(_threadId: string, _servers: McpServerConfig[]): Promise<void> {}
  dispose(): void {}
  on(_event: 'event' | 'log', _listener: (value: never) => void): void {}
}

class FakeCodexControl extends EventEmitter {
  async start(): Promise<void> {}
  async dispose(): Promise<void> {}
  onUsageChanged(): void {}
  async listMcpServers(): Promise<never[]> {
    return []
  }
  isMcpLoading(): boolean {
    return false
  }
  async whenMcpServersListed(): Promise<boolean> {
    return true
  }
}

const cleanups: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function harness(
  options: { sounds?: boolean; plan?: FakeClube['plan']; link?: boolean } = {},
) {
  const store = new Store(':memory:')
  const directory = mkdtempSync(path.join(os.tmpdir(), 'tc-motion-sounds-'))
  cleanups.push(() => rmSync(directory, { recursive: true, force: true, maxRetries: 3 }))
  const root = await writeDefaultSkillsFixture(directory)
  await writeDefaultSkillPackFixture(root, 'motion', [['hyperframes', 'video made of HTML']])
  const project = path.join(directory, 'video')
  mkdirSync(project)

  const fake = new FakeClube()
  await fake.start()
  cleanups.push(() => fake.stop())
  if (options.plan) fake.plan = options.plan
  const clube = new ClubeAccount({ origin: fake.origin, store: new MemoryClubeStore() })
  if (options.link !== false) {
    const { authUrl } = await clube.connect()
    await fake.browse(authUrl)
    await vi.waitFor(() => expect(clube.linked()).toBe(true))
  }
  const library = new SoundLibrary({ clube, store })

  const started: StartOptions[] = []
  const resumed: StartOptions[] = []
  const runtimeFor = (provider: ProviderId): ProviderRuntime => ({
    async start(workspacePath, startOptions) {
      started.push(startOptions)
      return {
        thread: { id: `thread-${started.length}`, provider, workspacePath, createdAt: Date.now() },
        session: new FakeSession(),
      }
    },
    ...(provider === 'codex'
      ? {
          async resume(threadId: string, workspacePath: string, startOptions: StartOptions) {
            resumed.push(startOptions)
            return {
              thread: { id: threadId, provider, workspacePath, createdAt: Date.now() },
              session: new FakeSession(),
            }
          },
        }
      : {}),
  })
  const orchestrator = new Orchestrator(store, {
    onEvent: (_threadId: string, _event: DomainEvent) => {},
    agentTools: true,
    clube,
    ...(options.sounds === false ? {} : { sounds: library }),
    onLog: () => {},
    onLogin: () => {},
    mcpConfig: new McpConfigStore(path.join(directory, 'mcp.json')),
    readCredential: (reference) => `secret:${reference}`,
    defaultSkillsRoot: root,
    runtimeFor,
    createCodex: () => new FakeCodexControl() as never,
    providerServices: {},
  })
  cleanups.push(() => orchestrator.disposeAll())
  return { store, orchestrator, started, resumed, library, project, fake }
}

async function chat(h: Awaited<ReturnType<typeof harness>>, provider: ProviderId = 'codex') {
  const thread = await h.orchestrator.startThread(provider, h.project, { mode: 'motion' })
  h.store.setThreadMode(thread.id, 'motion')
  return thread.id
}

const instructions = (h: Awaited<ReturnType<typeof harness>>, index = 0) =>
  h.started[index]!.instructions!

describe('what a Motion session is told about sounds', { timeout: 30_000 }, () => {
  it('names the tools and the folder the library fills, when the account is a subscriber', async () => {
    const h = await harness()
    await chat(h)
    const text = instructions(h)
    expect(text).toContain('sound_search, sound_use, music_search, music_use')
    expect(text).toContain('audio/clube/')
    expect(text).not.toContain('has its own sounds')
    expect(text).not.toContain("person's own sounds folder")
  })

  it('says where the project already has sounds of its own, and to use them first', async () => {
    const h = await harness()
    mkdirSync(path.join(h.project, 'audio', 'clube'), { recursive: true })
    mkdirSync(path.join(h.project, 'audio', 'voz'))
    writeFileSync(path.join(h.project, 'audio', 'voz', 'take.wav'), '')
    writeFileSync(path.join(h.project, 'audio', 'clube', 'fetched.flac'), '')
    await chat(h)
    expect(instructions(h)).toContain('has its own sounds in audio/ (1 audio files)')
  })

  it("does not count what the library fetched as the project's own", async () => {
    const h = await harness()
    mkdirSync(path.join(h.project, 'audio', 'clube'), { recursive: true })
    writeFileSync(path.join(h.project, 'audio', 'clube', 'fetched.flac'), '')
    await chat(h)
    expect(instructions(h)).not.toContain('has its own sounds')
  })

  it("passes on the person's own folder, and leaves the library alone when it is turned off", async () => {
    const h = await harness()
    h.library.updateSettings({ ownFolder: h.project, enabled: false })
    await chat(h)
    const text = instructions(h)
    expect(text).toContain(`The person's own sounds folder is ${h.project}`)
    expect(text).toContain('turned the app')
    expect(text).not.toContain('is available through the tools')
  })

  it('says the library needs an account when none is linked, and a subscription when it is free', async () => {
    const unlinked = await harness({ link: false })
    await chat(unlinked)
    expect(instructions(unlinked)).toContain('needs a Clube do Motion account linked')

    const free = await harness({ plan: 'grátis' })
    await chat(free)
    expect(instructions(free)).toContain('has no subscription')
    expect(instructions(free)).toContain('https://clubedomotion.com/planos')
  })

  it('sends a provider without the app tools to the Sounds tab', async () => {
    const h = await harness()
    await chat(h, 'grok')
    const text = instructions(h)
    expect(text).toContain('has no tools for this provider')
    expect(text).toContain('Sounds tab of the side panel')
    expect(text).not.toContain('sound_search, sound_use')
  })

  it('changes nothing for a chat that is not in Motion, or when the server has no library', async () => {
    const withLibrary = await harness()
    await withLibrary.orchestrator.startThread('codex', withLibrary.project)
    const without = await harness({ sounds: false })
    await without.orchestrator.startThread('codex', without.project)
    // The folders differ per harness; the text must not.
    const text = (h: typeof withLibrary) =>
      instructions(h).replaceAll(path.dirname(h.project), '<dir>')
    expect(text(withLibrary)).toBe(text(without))
    expect(instructions(withLibrary)).not.toMatch(/sound library/)

    const motionWithout = await harness({ sounds: false })
    await chat(motionWithout)
    expect(instructions(motionWithout)).toContain('This chat is in Motion mode.')
    expect(instructions(motionWithout)).not.toMatch(/sound library/)
  })

  it('reads the settings again when the session starts again', async () => {
    const h = await harness()
    const thread = await h.orchestrator.startThread('codex', h.project)
    h.store.setThreadMode(thread.id, 'motion')
    await h.orchestrator.modeChanged(thread.id)
    await h.orchestrator.submitTurn(thread.id, 'with Motion')
    expect(h.resumed[0]!.instructions).toContain('sound_search')

    h.library.updateSettings({ enabled: false })
    h.store.setThreadMode(thread.id, null)
    await h.orchestrator.modeChanged(thread.id)
    h.store.setThreadMode(thread.id, 'motion')
    await h.orchestrator.modeChanged(thread.id)
    await h.orchestrator.submitTurn(thread.id, 'Motion again')
    expect(h.resumed.at(-1)!.instructions).toContain('turned the app')
  })

  it('measures what it adds to the role', async () => {
    const h = await harness()
    h.library.updateSettings({ ownFolder: h.project })
    mkdirSync(path.join(h.project, 'audio'))
    writeFileSync(path.join(h.project, 'audio', 'a.wav'), '')
    await chat(h)
    const baseline = await harness({ sounds: false })
    await chat(baseline)
    const strip = (start: StartOptions, folder: string) =>
      start.instructions!.replaceAll(folder, '<dir>')
    const added =
      strip(h.started[0]!, h.project).length - strip(baseline.started[0]!, baseline.project).length
    // The longest case (own sounds, the library through tools, and the person's folder) stays well under a screen.
    expect(added).toBeGreaterThan(300)
    expect(added).toBeLessThan(1_000)
  })
})
