import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Capabilities, DomainEvent, ProviderId } from '@harness/contracts'
import type { AgentSession, ProviderRuntime, StartOptions } from './adapters.js'
import {
  writeDefaultSkillPackFixture,
  writeDefaultSkillsFixture,
} from './default-skills.test-support.js'
import { loadInstalledSkills, installedSkillsRoot } from './installed-skills.js'
import { writeInstalledSkillsFixture } from './installed-skills.test-support.js'
import { Orchestrator } from './orchestrator.js'
import { Store } from './store.js'

/**
 * Skills installed from their authors reach a chat through the session start,
 * the way the bundled packs do: a plugin folder for the provider that loads
 * plugins, catalog text for the others, chosen by the chat's mode.
 */

const CAPABILITIES: Capabilities = {
  steer: false,
  fork: false,
  interrupt: true,
  reasoningItems: false,
  approvals: false,
  images: true,
}

class FakeSession implements AgentSession {
  readonly capabilities = CAPABILITIES
  async sendTurn(): Promise<string> {
    return 'turn'
  }
  async interrupt(): Promise<void> {}
  respondToApproval(): void {}
  dispose(): void {}
  on(_event: 'event' | 'log', _listener: (value: never) => void): void {
    void (_listener as (event: DomainEvent) => void)
  }
}

const cleanups: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function harness() {
  const store = new Store(':memory:')
  const directory = mkdtempSync(path.join(os.tmpdir(), 'tc-installed-skills-'))
  cleanups.push(() => rmSync(directory, { recursive: true, force: true, maxRetries: 3 }))
  const root = await writeDefaultSkillsFixture(directory)
  await writeDefaultSkillPackFixture(root, 'motion', [['hyperframes', 'video made of HTML']])
  await writeDefaultSkillPackFixture(root, 'design', [
    ['ui-profissional', 'screens without a generic look'],
  ])
  const installed = installedSkillsRoot(path.join(directory, 'data'))
  await writeInstalledSkillsFixture(installed, [
    { id: 'every-chat-skill', category: 'general' },
    { id: 'design-skill', category: 'design' },
    { id: 'motion-skill', category: 'motion' },
    // Also in the Design pack: the chat has it from the bundle, so it is listed once.
    { id: 'ui-profissional', category: 'design' },
  ])
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
    ...(provider === 'claude-code'
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
    onEvent: () => {},
    agentTools: true,
    onLog: () => {},
    onLogin: () => {},
    defaultSkillsRoot: root,
    installedSkills: (categories, exclude) =>
      loadInstalledSkills(installed, categories, { exclude }),
    runtimeFor,
  })
  cleanups.push(() => orchestrator.disposeAll())
  return { store, orchestrator, started, resumed, directory, root, installed }
}

type Harness = Awaited<ReturnType<typeof harness>>

async function chat(h: Harness, provider: ProviderId, mode?: 'design' | 'motion') {
  const thread = await h.orchestrator.startThread(provider, h.directory, mode ? { mode } : {})
  if (mode) h.store.setThreadMode(thread.id, mode)
  return thread.id
}

const category = (h: Harness, name: string) => path.join(h.installed, name)
const pack = (h: Harness, name: string) => path.join(h.root, 'packs', name)

describe('installed skills in a chat of a provider that loads plugins', { timeout: 30_000 }, () => {
  it('adds the plugin folder of each category the chat loads, after the mode pack', async () => {
    const h = await harness()
    await chat(h, 'claude-code', 'design')
    await chat(h, 'claude-code', 'motion')
    await chat(h, 'claude-code')

    expect(h.started[0]!.packPlugins).toEqual([
      pack(h, 'design'),
      category(h, 'general'),
      category(h, 'design'),
    ])
    expect(h.started[1]!.packPlugins).toEqual([
      pack(h, 'motion'),
      category(h, 'general'),
      category(h, 'motion'),
    ])
    expect(h.started[2]!.packPlugins).toEqual([category(h, 'general')])
    expect(h.started[0]!.instructions).toContain('installed from their authors are loaded')
    // The plugin carries the skills: no catalog text on top of it.
    expect(h.started[0]!.instructions).not.toContain('- design-skill')
  })

  it('leaves the side chats that are not a chat of their own without them', async () => {
    const h = await harness()
    await h.orchestrator.startThread('claude-code', h.directory, { ephemeral: true })

    expect(h.started[0]!.packPlugins).toBeUndefined()
    expect(h.started[0]!.instructions ?? '').not.toContain('installed from their authors')
  })

  it('follows the mode when Design is turned on and off in the middle of the chat', async () => {
    const h = await harness()
    const id = await chat(h, 'claude-code')
    expect(h.started[0]!.packPlugins).toEqual([category(h, 'general')])

    h.store.setThreadMode(id, 'design')
    await h.orchestrator.modeChanged(id)
    await h.orchestrator.submitTurn(id, 'with Design')
    expect(h.resumed[0]!.packPlugins).toEqual([
      pack(h, 'design'),
      category(h, 'general'),
      category(h, 'design'),
    ])

    h.store.setThreadMode(id, null)
    await h.orchestrator.modeChanged(id)
    await h.orchestrator.submitTurn(id, 'without Design')
    expect(h.resumed[1]!.packPlugins).toEqual([category(h, 'general')])

    // Design to Motion in one step: the chat takes the other category, never both.
    h.store.setThreadMode(id, 'design')
    await h.orchestrator.modeChanged(id)
    h.store.setThreadMode(id, 'motion')
    await h.orchestrator.modeChanged(id)
    await h.orchestrator.submitTurn(id, 'now Motion')
    expect(h.resumed[2]!.packPlugins).toEqual([
      pack(h, 'motion'),
      category(h, 'general'),
      category(h, 'motion'),
    ])
  })
})

describe(
  'installed skills in a chat of a provider that reads skills on demand',
  { timeout: 30_000 },
  () => {
    it('puts their catalog in the instruction by category, and no plugin folder', async () => {
      const h = await harness()
      await chat(h, 'codex', 'design')
      await chat(h, 'codex', 'motion')
      await chat(h, 'codex')

      const [design, motion, plain] = h.started.map((start) => start.instructions ?? '')
      expect(h.started.every((start) => start.packPlugins === undefined)).toBe(true)
      expect(design).toContain('- every-chat-skill')
      expect(design).toContain('- design-skill')
      expect(design).not.toContain('motion-skill')
      expect(motion).toContain('- every-chat-skill')
      expect(motion).toContain('- motion-skill')
      expect(motion).not.toContain('design-skill')
      expect(plain).toContain('- every-chat-skill')
      expect(plain).not.toContain('design-skill')
      expect(plain).not.toContain('motion-skill')
      expect(design).toContain(path.join(category(h, 'design'), 'skills'))
    })

    it('lists a skill both bundled and installed once', async () => {
      const h = await harness()
      await chat(h, 'codex', 'design')

      const text = h.started[0]!.instructions ?? ''
      expect(text.match(/- ui-profissional/g)).toHaveLength(1)
      expect(text).toContain('- ui-profissional: screens without a generic look')
    })

    it('adds nothing for a chat that has no installed skills of its categories', async () => {
      const h = await harness()
      rmSync(h.installed, { recursive: true, force: true })
      await chat(h, 'codex', 'design')

      expect(h.started[0]!.instructions ?? '').not.toContain('installed from their authors')
    })
  },
)
