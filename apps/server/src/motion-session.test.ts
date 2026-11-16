import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { MOTION_STAGES, ProviderIdSchema } from '@harness/contracts'
import type { DefaultSkillPack } from './default-skills.js'
import {
  AFTER_EFFECTS_SENTENCES,
  DESIGN_ROLE_INSTRUCTION,
  DESIGN_ROLE_WITH_BROWSER,
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
    // 1081 characters with the delivery sentence (948 before it).
    expect(MOTION_ROLE_INSTRUCTION.length).toBeLessThan(1200)
    expect(MOTION_ROLE_INSTRUCTION).not.toContain('—')
  })

  it('tells the agent to give a finished file by its full path, because the app shows it in the chat', () => {
    for (const role of [MOTION_ROLE_INSTRUCTION, MOTION_ROLE_WITH_STAGE_TOOL]) {
      expect(role).toContain(
        'Give a finished file with its full path on a line of its own: the app shows it in the chat, so never send the person to look for it.',
      )
    }
  })
})

describe('the Motion role instruction with the stage tool', () => {
  it('adds the tool lines, before the closing lines, and stays within the same size class', () => {
    const [list, sentence, tail] = MOTION_ROLE_WITH_STAGE_TOOL.split(
      String.fromCharCode(10, 10),
    ).slice(-3)
    expect(list).toMatch(/10\. delivery: the final files and notes$/)
    expect(sentence).toMatch(/^When you move to another stage, call the motion_stage tool/)
    expect(tail).toMatch(/^The final wording/)
    // The scene lights a character while a helper with its name runs: the agent is told the names.
    expect(sentence).toMatch(
      /A helper agent named after a character \(Zig, Bun, Moss, Cloud, Penny or Pip\)/,
    )
    expect(MOTION_ROLE_WITH_STAGE_TOOL.length - MOTION_ROLE_INSTRUCTION.length).toBeLessThan(320)
    // 1367 characters with the delivery sentence (1234 before it).
    expect(MOTION_ROLE_WITH_STAGE_TOOL.length).toBeLessThan(1500)
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
  it('adds nothing without a mode', () => {
    expect(modeSessionStart(undefined, true, () => pack)).toBeUndefined()
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

const designPack: DefaultSkillPack = {
  name: 'design',
  pluginDir: '/bundle/packs/design',
  skills: ['ui-profissional', 'stageshow'],
  catalog:
    'Skills for this kind of work, one folder each in /bundle/packs/design/skills:\n- ui-profissional\n- stageshow',
}
const loadDesign = (name: string) => (name === 'design' ? designPack : undefined)

describe('the Design role instruction', () => {
  /** The skills of the Design pack in the committed manifest, by folder. */
  const manifest = JSON.parse(
    readFileSync(new URL('../../../packages/default-skills/skills.json', import.meta.url), 'utf8'),
  ) as { skills: Array<{ folder: string; pack?: string | string[] }> }
  const inDesign = manifest.skills
    .filter((entry) => [entry.pack ?? []].flat().includes('design'))
    .map((entry) => entry.folder)

  it('stays short, and free of the em dashes the reply style forbids', () => {
    // About 330 tokens at four characters each, Motion's being about 250 (1081 characters).
    expect(DESIGN_ROLE_INSTRUCTION.length).toBeLessThan(1700)
    expect(DESIGN_ROLE_WITH_BROWSER.length).toBeLessThan(1800)
    for (const role of [DESIGN_ROLE_INSTRUCTION, DESIGN_ROLE_WITH_BROWSER])
      expect(role).not.toContain('—')
  })

  it('names only skills the Design pack really holds, and no Remotion or transitions skill', () => {
    const named = [...DESIGN_ROLE_INSTRUCTION.matchAll(/^- [^:]+: (.+)$/gm)].flatMap((match) =>
      match[1]!.split(/,?\s+(?:and|then)\s+|,\s*/),
    )
    expect(named.length).toBeGreaterThan(8)
    for (const name of named) expect(inDesign, name).toContain(name)
    expect(inDesign.some((folder) => /remotion|transitions/.test(folder))).toBe(false)
  })

  it('covers the five kinds of request, references first, and a phone and a desktop width', () => {
    for (const kind of [
      'build something new',
      'redesign or review',
      'interface text',
      'interface animation',
      'a library or an effect',
    ])
      expect(DESIGN_ROLE_INSTRUCTION).toContain(`- ${kind}:`)
    expect(DESIGN_ROLE_INSTRUCTION.indexOf('Look for references')).toBeLessThan(
      DESIGN_ROLE_INSTRUCTION.indexOf('Pick skills'),
    )
    expect(DESIGN_ROLE_INSTRUCTION).toContain('machine-made')
    for (const role of [DESIGN_ROLE_INSTRUCTION, DESIGN_ROLE_WITH_BROWSER])
      expect(role).toContain('a phone width and at a desktop width')
  })

  it('lets a phase prompt of the Design pipeline, or a JSON-only answer, come first', () => {
    // The pipeline's turns run in this session: its own instructions must win over the role.
    expect(DESIGN_ROLE_INSTRUCTION).toContain(
      'A message that carries its own phase instructions, or asks for a JSON answer only, comes first',
    )
  })
})

describe('modeSessionStart for a Design chat', () => {
  it('loads the Design pack as a plugin where the provider has a loader, with the role alone in the text', () => {
    const start = modeSessionStart('design', true, loadDesign)
    expect(start?.plugins).toEqual(['/bundle/packs/design'])
    expect(start?.instructions).toBe(
      `${DESIGN_ROLE_INSTRUCTION}\n\nThe skills of the Design pack are loaded in this session.`,
    )
    expect(start?.instructions).not.toContain('- stageshow')
  })

  it('puts the pack catalog in the instruction elsewhere', () => {
    const start = modeSessionStart('design', false, loadDesign)
    expect(start?.plugins).toEqual([])
    expect(start?.instructions).toBe(`${DESIGN_ROLE_INSTRUCTION}\n\n${designPack.catalog}`)
  })

  it('points at the browser tools only where the provider reaches the app tools', () => {
    expect(modeSessionStart('design', true, loadDesign, true)?.instructions).toContain(
      DESIGN_ROLE_WITH_BROWSER,
    )
    expect(modeSessionStart('design', true, loadDesign, true)?.instructions).toContain(
      'browser_screenshot',
    )
    expect(modeSessionStart('design', true, loadDesign, false)?.instructions).not.toContain(
      'browser_open',
    )
  })

  it('keeps the role alone when the pack is not on disk', () => {
    for (const native of [true, false])
      expect(modeSessionStart('design', native, () => undefined)).toEqual({
        instructions: DESIGN_ROLE_INSTRUCTION,
        plugins: [],
      })
  })

  it('never carries the Motion pack or its role, and the Motion chat never carries the Design pack', () => {
    const both = (name: string) => (name === 'design' ? designPack : pack)
    const design = modeSessionStart('design', true, both)
    expect(design?.plugins).toEqual(['/bundle/packs/design'])
    expect(design?.instructions).not.toContain('Motion')
    const motion = modeSessionStart('motion', true, both)
    expect(motion?.plugins).toEqual(['/bundle/packs/motion'])
    expect(motion?.instructions).not.toContain('Design')
  })
})
