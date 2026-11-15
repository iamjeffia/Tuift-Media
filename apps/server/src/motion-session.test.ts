import { describe, expect, it } from 'vitest'
import { MOTION_STAGES, ProviderIdSchema } from '@harness/contracts'
import type { DefaultSkillPack } from './default-skills.js'
import { MOTION_ROLE_INSTRUCTION, modeChangeRestart, modeSessionStart } from './motion-session.js'
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
