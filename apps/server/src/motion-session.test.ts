import { describe, expect, it } from 'vitest'
import { MOTION_STAGES, ProviderIdSchema } from '@harness/contracts'
import type { DefaultSkillPack } from './default-skills.js'
import {
  AFTER_EFFECTS_SENTENCES,
  MOTION_ROLE_INSTRUCTION,
  MOTION_ROLE_WITH_STAGE_TOOL,
  modeChangeRestart,
  modeSessionStart,
} from './motion-session.js'
import { PROVIDER_CAPABILITIES } from './provider-capabilities.js'

const pack: DefaultSkillPack = {
  name: 'motion',
  pluginDir: '/bundle/packs/motion',
  skills: ['hyperframes'],
  catalog:
    'Skills for this kind of work, one folder each in /bundle/packs/motion/skills:\n- hyperframes',
}

describe('the Motion role instruction', () => {
  it('lists exactly the stage ids of the contracts, in order', () => {
    // Adding a stage to MOTION_STAGES fails here until the text names it.
    const listed = [...MOTION_ROLE_INSTRUCTION.matchAll(/^\d+\. (\w+):/gm)].map((match) => match[1])
    expect(listed).toEqual([...MOTION_STAGES])
    expect([...MOTION_ROLE_INSTRUCTION.matchAll(/^(\d+)\. /gm)].map((match) => match[1])).toEqual(
      MOTION_STAGES.map((_stage, index) => String(index + 1)),
    )
  })

  it('stays short, and free of the em dashes the reply style forbids', () => {
    // About 250 tokens at four characters each.
    expect(MOTION_ROLE_INSTRUCTION.length).toBeLessThan(1400)
    expect(MOTION_ROLE_INSTRUCTION).not.toContain('—')
  })
})

describe('the Motion role instruction with the stage tool', () => {
  it('adds one sentence, before the closing lines, and stays within the same size class', () => {
    const [list, sentence, tail] = MOTION_ROLE_WITH_STAGE_TOOL.split(
      String.fromCharCode(10, 10),
    ).slice(-3)
    expect(list).toMatch(/10\. delivery: the final files and notes$/)
    expect(sentence).toMatch(/^When you move to another stage, call the motion_stage tool/)
    expect(tail).toMatch(/^The final wording/)
    expect(MOTION_ROLE_WITH_STAGE_TOOL.length - MOTION_ROLE_INSTRUCTION.length).toBeLessThan(200)
    expect(MOTION_ROLE_WITH_STAGE_TOOL.length).toBeLessThan(1600)
    expect(MOTION_ROLE_WITH_STAGE_TOOL).not.toContain('—')
  })

  it('is in the session start only when the provider reaches the tool', () => {
    expect(modeSessionStart('motion', true, () => undefined, true)?.instructions).toBe(
      MOTION_ROLE_WITH_STAGE_TOOL,
    )
    expect(modeSessionStart('motion', true, () => undefined, false)?.instructions).toBe(
      MOTION_ROLE_INSTRUCTION,
    )
    expect(modeSessionStart('motion', true, () => undefined)?.instructions).toBe(
      MOTION_ROLE_INSTRUCTION,
    )
  })
})

describe('modeSessionStart', () => {
  it('adds nothing without a mode, or in a mode with no pack yet', () => {
    expect(modeSessionStart(undefined, true, () => pack)).toBeUndefined()
    expect(modeSessionStart('design', true, () => pack)).toBeUndefined()
  })

  it('loads the pack as a plugin where the provider has a loader', () => {
    const start = modeSessionStart('motion', true, (name) => (name === 'motion' ? pack : undefined))
    expect(start?.plugins).toEqual(['/bundle/packs/motion'])
    expect(start?.instructions).toContain(MOTION_ROLE_INSTRUCTION)
    expect(start?.instructions).not.toContain('- hyperframes')
  })

  it('puts the pack catalog in the instruction elsewhere', () => {
    const start = modeSessionStart('motion', false, () => pack)
    expect(start?.plugins).toEqual([])
    expect(start?.instructions).toBe(`${MOTION_ROLE_INSTRUCTION}\n\n${pack.catalog}`)
  })

  it('keeps the role alone when the pack is not on disk', () => {
    for (const native of [true, false]) {
      expect(modeSessionStart('motion', native, () => undefined)).toEqual({
        instructions: MOTION_ROLE_INSTRUCTION,
        plugins: [],
      })
    }
  })
})

describe('modeChangeRestart', () => {
  it('resumes where the provider applies the instructions of a resume, and starts afresh elsewhere', () => {
    const plan = Object.fromEntries(
      ProviderIdSchema.options.map((provider) => [provider, modeChangeRestart(provider)]),
    )
    expect(plan).toEqual({
      codex: 'resume',
      'claude-code': 'resume',
      opencode: 'resume',
      grok: 'fresh',
      cursor: 'fresh',
      antigravity: 'fresh',
      pi: 'fresh',
      acp: 'fresh',
      api: 'none',
    })
  })

  it('never resumes a provider that cannot resume', () => {
    for (const provider of ProviderIdSchema.options) {
      if (modeChangeRestart(provider) === 'resume') {
        expect(PROVIDER_CAPABILITIES[provider].resume).toBe(true)
      }
    }
  })
})

describe('the After Effects sentence of the Motion role', () => {
  const start = (state?: 'ready' | 'not-installed' | 'unavailable', stageTool = false) =>
    modeSessionStart('motion', true, () => undefined, stageTool, state)!.instructions

  it('says nothing when the server was built without After Effects', () => {
    expect(start(undefined)).toBe(MOTION_ROLE_INSTRUCTION)
  })

  it('says the tools are there when ready, and one place to build when they are not', () => {
    expect(start('ready')).toContain(AFTER_EFFECTS_SENTENCES.ready)
    expect(start('ready')).not.toContain('HyperFrames')
    for (const state of ['not-installed', 'unavailable'] as const) {
      expect(start(state)).toContain(AFTER_EFFECTS_SENTENCES.unavailable)
      expect(start(state)).not.toContain(AFTER_EFFECTS_SENTENCES.ready)
    }
  })

  it('goes between the stage list and the closing lines, and stays small', () => {
    const paragraphs = start('ready', true).split(String.fromCharCode(10, 10))
    expect(paragraphs.slice(-3)).toEqual([
      AFTER_EFFECTS_SENTENCES.ready,
      expect.stringMatching(/^When you move to another stage/),
      expect.stringMatching(/^The final wording/),
    ])
    for (const sentence of Object.values(AFTER_EFFECTS_SENTENCES)) {
      expect(sentence.length).toBeLessThan(120)
      expect(sentence).not.toContain('—')
    }
    // The whole instruction, with the stage tool and the sentence, stays near 400 tokens.
    expect(start('unavailable', true).length).toBeLessThan(1800)
  })
})
