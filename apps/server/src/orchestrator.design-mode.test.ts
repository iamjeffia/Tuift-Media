import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Capabilities, DomainEvent, ProviderId } from '@harness/contracts'
import { DESIGN_BRIEF_ATTACHMENT, designBriefingPrompt } from '@harness/design-agent'
import type { AgentSession, ProviderRuntime, StartOptions } from './adapters.js'
import {
  writeDefaultSkillPackFixture,
  writeDefaultSkillsFixture,
} from './default-skills.test-support.js'
import { DESIGN_ROLE_INSTRUCTION, DESIGN_ROLE_WITH_BROWSER } from './motion-session.js'
import { Orchestrator } from './orchestrator.js'
import { Store } from './store.js'

const CAPABILITIES: Capabilities = {
  steer: false,
  fork: false,
  interrupt: true,
  reasoningItems: false,
  approvals: false,
  images: true,
}

/** Records what the chat sends and lets a test play the provider's side of a turn. */
class FakeSession implements AgentSession {
  readonly capabilities = CAPABILITIES
  sent: string[] = []
  turnIds: string[] = []
  emit: (event: DomainEvent) => void = () => {}
  async sendTurn(_threadId: string, text: string): Promise<string> {
    this.sent.push(text)
    return this.turnIds.shift() ?? `turn-${this.sent.length}`
  }
  async interrupt(): Promise<void> {}
  respondToApproval(): void {}
  dispose(): void {}
  on(_event: 'event' | 'log', listener: (value: never) => void): void {
    this.emit = listener as (event: DomainEvent) => void
  }
}

const cleanups: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function harness(options: { design?: boolean; motion?: boolean } = {}) {
  const store = new Store(':memory:')
  const directory = mkdtempSync(path.join(os.tmpdir(), 'tc-design-mode-'))
  cleanups.push(() => rmSync(directory, { recursive: true, force: true, maxRetries: 3 }))
  const root = await writeDefaultSkillsFixture(directory)
  if (options.motion !== false)
    await writeDefaultSkillPackFixture(root, 'motion', [['hyperframes', 'video made of HTML']])
  if (options.design !== false)
    await writeDefaultSkillPackFixture(root, 'design', [
      ['ui-profissional', 'screens without a generic look'],
      ['better-typography', 'type that fits the subject'],
    ])
  const started: StartOptions[] = []
  const resumed: StartOptions[] = []
  const sessions: FakeSession[] = []
  const runtimeFor = (provider: ProviderId): ProviderRuntime => ({
    async start(workspacePath, startOptions) {
      started.push(startOptions)
      const session = new FakeSession()
      sessions.push(session)
      return {
        thread: { id: `thread-${sessions.length}`, provider, workspacePath, createdAt: Date.now() },
        session,
      }
    },
    ...(provider === 'codex' || provider === 'claude-code'
      ? {
          async resume(threadId: string, workspacePath: string, startOptions: StartOptions) {
            resumed.push(startOptions)
            const session = new FakeSession()
            sessions.push(session)
            return {
              thread: { id: threadId, provider, workspacePath, createdAt: Date.now() },
              session,
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
    runtimeFor,
  })
  cleanups.push(() => orchestrator.disposeAll())
  return { store, orchestrator, started, resumed, sessions, directory, root }
}

/** Starts a Design chat the way the server does: the mode is stored once the chat exists. */
async function designChat(h: Awaited<ReturnType<typeof harness>>, provider: ProviderId) {
  const thread = await h.orchestrator.startThread(provider, h.directory, { mode: 'design' })
  h.store.setThreadMode(thread.id, 'design')
  return thread.id
}

const packDir = (h: Awaited<ReturnType<typeof harness>>, name: string) =>
  path.join(h.root, 'packs', name)

describe('a chat in Design mode', { timeout: 30_000 }, () => {
  it('loads the Design pack as a plugin where the provider loads plugins, with the role and no catalog', async () => {
    const h = await harness()
    await designChat(h, 'claude-code')
    const start = h.started[0]!
    expect(start.packPlugins).toEqual([packDir(h, 'design')])
    expect(start.instructions).toContain(DESIGN_ROLE_WITH_BROWSER)
    expect(start.instructions).toContain(
      'The skills of the Design pack are loaded in this session.',
    )
    expect(start.instructions).not.toContain('- ui-profissional')
    expect(start.instructions).not.toContain('hyperframes')
    expect(start.instructions).not.toContain('Motion')
  })

  it('puts the pack catalog in the instruction where the provider reads skills on demand', async () => {
    const h = await harness()
    await designChat(h, 'codex')
    const start = h.started[0]!
    expect(start.packPlugins).toBeUndefined()
    expect(start.instructions).toContain(DESIGN_ROLE_WITH_BROWSER)
    expect(start.instructions).toContain('- ui-profissional: screens without a generic look')
    expect(start.instructions).toContain('- better-typography')
    expect(start.instructions).not.toContain('hyperframes')
  })

  it('gives a chat with no mode nothing of it, and a Motion chat its own pack only', async () => {
    const h = await harness()
    await h.orchestrator.startThread('claude-code', h.directory)
    const motion = await h.orchestrator.startThread('claude-code', h.directory, {
      mode: 'motion',
    })
    h.store.setThreadMode(motion.id, 'motion')
    expect(h.started[0]!.packPlugins).toBeUndefined()
    expect(h.started[0]!.instructions).not.toContain('Design mode')
    expect(h.started[1]!.packPlugins).toEqual([packDir(h, 'motion')])
    expect(h.started[1]!.instructions).not.toContain('Design mode')
  })

  it('keeps the role alone when the pack is not on disk', async () => {
    const h = await harness({ design: false })
    await designChat(h, 'claude-code')
    expect(h.started[0]!.packPlugins).toBeUndefined()
    expect(h.started[0]!.instructions).toContain(DESIGN_ROLE_WITH_BROWSER)
    expect(h.started[0]!.instructions).not.toContain('are loaded in this session')
  })

  it('has the role and the pack from the next turn when Design is turned on mid-chat, and drops them when it is turned off', async () => {
    const h = await harness()
    const thread = await h.orchestrator.startThread('claude-code', h.directory)
    expect(h.started[0]!.packPlugins).toBeUndefined()

    h.store.setThreadMode(thread.id, 'design')
    await h.orchestrator.modeChanged(thread.id)
    await h.orchestrator.submitTurn(thread.id, 'with Design')
    expect(h.resumed[0]!.packPlugins).toEqual([packDir(h, 'design')])
    expect(h.resumed[0]!.instructions).toContain(DESIGN_ROLE_WITH_BROWSER)

    h.store.setThreadMode(thread.id, null)
    await h.orchestrator.modeChanged(thread.id)
    await h.orchestrator.submitTurn(thread.id, 'without Design')
    expect(h.resumed[1]!.packPlugins).toBeUndefined()
    expect(h.resumed[1]!.instructions).not.toContain('Design mode')

    // Design to Motion in one step: the chat takes the other pack, never both.
    h.store.setThreadMode(thread.id, 'design')
    await h.orchestrator.modeChanged(thread.id)
    h.store.setThreadMode(thread.id, 'motion')
    await h.orchestrator.modeChanged(thread.id)
    await h.orchestrator.submitTurn(thread.id, 'now Motion')
    expect(h.resumed[2]!.packPlugins).toEqual([packDir(h, 'motion')])
    expect(h.resumed[2]!.instructions).not.toContain('Design mode')
  })

  it('has one mode at a time: a chat in Design is not in Motion', async () => {
    const h = await harness()
    const id = await designChat(h, 'codex')
    expect(h.store.threadSettings(id).mode).toBe('design')
    h.store.setThreadMode(id, 'motion')
    expect(h.store.threadSettings(id).mode).toBe('motion')
  })

  it('has no browser sentence where the provider does not reach the app tools', async () => {
    const h = await harness()
    await designChat(h, 'api')
    expect(h.started[0]!.instructions).toContain(DESIGN_ROLE_INSTRUCTION)
    expect(h.started[0]!.instructions).not.toContain('browser_open')
  })
})

describe('the Design pipeline inside a Design chat', { timeout: 30_000 }, () => {
  it('sends its phase prompts as they are: the role stays in the session start, and a JSON turn still parses', async () => {
    const h = await harness()
    const id = await designChat(h, 'codex')
    const session = h.sessions[0]!
    session.turnIds = ['brief', 'answer']
    const request = 'Build me a site for a bakery.'
    await h.orchestrator.submitTurn(id, request, [DESIGN_BRIEF_ATTACHMENT])

    // The provider's first turn carries the pipeline's own briefing prompt, word for word (the app
    // wraps it with its progress-update lines): nothing of the role or the pack is added to it, so
    // a turn that asks for JSON only gets exactly that ask.
    expect(session.sent).toHaveLength(1)
    expect(session.sent[0]).toContain(designBriefingPrompt(request))
    expect(session.sent[0]).toContain('Do not browse or invoke external design skills.')
    expect(session.sent[0]).not.toContain('This chat is in Design mode')
    // The role is in the session instead, where the phase prompt's own instructions come first.
    expect(h.started[0]!.instructions).toContain(
      'A message that carries its own phase instructions, or asks for a JSON answer only, comes first',
    )

    // The strict JSON answer of the briefing turn is read as before, and the request goes on as a task.
    session.emit({
      type: 'turn.started',
      turn: { id: 'brief', threadId: id, status: 'running', createdAt: Date.now() },
    })
    session.emit({
      type: 'item.completed',
      item: {
        id: 'verdict',
        turnId: 'brief',
        type: 'message',
        role: 'assistant',
        status: 'completed',
        text: JSON.stringify({ status: 'not_design', message: 'Not design.' }),
        createdAt: 0,
      },
    })
    session.emit({ type: 'turn.completed', turnId: 'brief', status: 'completed' })
    await vi.waitFor(() => expect(session.sent).toHaveLength(2))
    expect(session.sent[1]).toContain(request)
    expect(session.sent[1]).toContain('restrictions have ended')
    expect(session.sent[1]).not.toContain('This chat is in Design mode')
  })
})
