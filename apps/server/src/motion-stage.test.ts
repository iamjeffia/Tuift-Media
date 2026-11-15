import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { MOTION_STAGE_OWNERS, MOTION_STAGES, type MotionStage } from '@harness/contracts'
import type { DefaultSkillPack } from './default-skills.js'
import {
  MOTION_STAGE_SKILLS,
  MOTION_STAGE_TOOL,
  MotionStageError,
  motionStageBroker,
  runMotionStage,
  type MotionStageBroker,
} from './motion-stage.js'
import { Store } from './store.js'

const MANIFEST = new URL('../../../packages/default-skills/skills.json', import.meta.url)

describe('the stage to skills table', () => {
  it('has a row for every stage and names only skills of the real Motion pack', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
      skills: Array<{ folder: string; pack?: string }>
    }
    const pack = new Set(
      manifest.skills.filter((entry) => entry.pack === 'motion').map((entry) => entry.folder),
    )
    expect(Object.keys(MOTION_STAGE_SKILLS)).toEqual([...MOTION_STAGES])
    const unknown = Object.values(MOTION_STAGE_SKILLS)
      .flat()
      .filter((name) => !pack.has(name))
    expect(unknown).toEqual([])
  })

  it('leaves the conversation stages without skills', () => {
    for (const stage of ['idea', 'script', 'narration', 'audioApproval'] as const) {
      expect(MOTION_STAGE_SKILLS[stage]).toEqual([])
    }
  })
})

describe('the tool definition', () => {
  it('takes only an optional stage, one of the ten ids', () => {
    expect(MOTION_STAGE_TOOL.inputSchema).toEqual({
      type: 'object',
      properties: {
        stage: { type: 'string', enum: [...MOTION_STAGES], description: expect.any(String) },
      },
      additionalProperties: false,
    })
    expect(MOTION_STAGE_TOOL.description).not.toContain('—')
  })
})

const pack: DefaultSkillPack = {
  name: 'motion',
  pluginDir: '/bundle/packs/motion',
  skills: ['composicao-trilha', 'hyperframes-audio'],
  catalog: '',
}

function fakeBroker(stage: MotionStage | undefined = 'idea', installed = pack) {
  const setStage = vi.fn()
  const broker: MotionStageBroker = {
    mode: () => 'motion',
    stage: () => stage,
    setStage,
    pack: () => installed,
  }
  return { broker, setStage }
}

describe('runMotionStage', () => {
  it('stores the stage and answers the owner, the next stage, the skills and the reminder', () => {
    const { broker, setStage } = fakeBroker()
    const answer = runMotionStage(broker, 'chat-1', { stage: 'soundtrack' })
    expect(setStage).toHaveBeenCalledWith('chat-1', 'soundtrack')
    expect(answer).toEqual({
      stage: 'soundtrack',
      owner: 'cloud',
      next: 'motion',
      skills: [
        { name: 'composicao-trilha', path: expect.stringMatching(/composicao-trilha.SKILL\.md$/) },
        { name: 'hyperframes-audio', path: expect.stringMatching(/hyperframes-audio.SKILL\.md$/) },
      ],
      reminder: expect.stringContaining('is theirs'),
    })
  })

  it('accepts every stage from every stage, backwards and forwards', () => {
    for (const from of MOTION_STAGES) {
      for (const to of MOTION_STAGES) {
        const { broker, setStage } = fakeBroker(from)
        const answer = runMotionStage(broker, 'chat-1', { stage: to })
        expect(setStage).toHaveBeenCalledWith('chat-1', to)
        expect(answer).toMatchObject({ stage: to, owner: MOTION_STAGE_OWNERS[to] })
      }
    }
  })

  it('ends the chain at delivery and has no skills for the conversation stages', () => {
    const { broker } = fakeBroker()
    expect(runMotionStage(broker, 'chat-1', { stage: 'delivery' })).toMatchObject({ next: null })
    expect(runMotionStage(broker, 'chat-1', { stage: 'script' })).toMatchObject({
      next: 'narration',
      skills: [],
    })
  })

  it('leaves out a skill the install does not have, and names them without paths without the pack', () => {
    const { broker } = fakeBroker('idea', { ...pack, skills: ['composicao-trilha'] })
    expect(runMotionStage(broker, 'c', { stage: 'soundtrack' })).toMatchObject({
      skills: [{ name: 'composicao-trilha' }],
    })
    const none: MotionStageBroker = { ...broker, pack: () => undefined }
    expect(runMotionStage(none, 'c', { stage: 'soundtrack' })).toMatchObject({
      skills: [{ name: 'composicao-trilha' }, { name: 'hyperframes-audio' }],
    })
  })

  it('answers the current stage and the list of ten, changing nothing', () => {
    const { broker, setStage } = fakeBroker('references')
    const answer = runMotionStage(broker, 'chat-1', {}) as { stages: unknown[] }
    expect(answer).toMatchObject({ stage: 'references', owner: 'moss', next: 'identity' })
    expect(answer.stages).toEqual(
      MOTION_STAGES.map((stage) => ({ stage, owner: MOTION_STAGE_OWNERS[stage] })),
    )
    expect(setStage).not.toHaveBeenCalled()
  })

  it('refuses an unknown id with the valid ones, and arguments that do not fit', () => {
    const { broker, setStage } = fakeBroker()
    expect(() => runMotionStage(broker, 'c', { stage: 'color-grade' })).toThrow(MotionStageError)
    expect(() => runMotionStage(broker, 'c', { stage: 'color-grade' })).toThrow(
      /Unknown stage "color-grade".*idea, script, narration, audioApproval, references, identity, soundtrack, motion, review, delivery/,
    )
    expect(() => runMotionStage(broker, 'c', { stage: 3 })).toThrow(/Invalid arguments/)
    // There is no note argument: the schema says so rather than ignoring it.
    expect(() => runMotionStage(broker, 'c', { stage: 'idea', note: 'x' })).toThrow(
      /Invalid arguments/,
    )
    expect(setStage).not.toHaveBeenCalled()
  })
})

describe('motionStageBroker', () => {
  it('stores the stage on the chat, keeps the mode and announces it once', () => {
    const store = new Store(':memory:')
    store.addProject('/repo')
    store.addThread({ id: 't1', projectPath: '/repo', provider: 'codex', title: 'Video' })
    store.setThreadMode('t1', 'motion')
    const announce = vi.fn()
    const broker = motionStageBroker(store, announce, () => undefined)

    expect(broker.mode('t1')).toBe('motion')
    expect(broker.stage('t1')).toBe('idea')
    broker.setStage('t1', 'review')
    expect(store.threadSettings('t1')).toMatchObject({ mode: 'motion', motionStage: 'review' })
    expect(announce).toHaveBeenCalledExactlyOnceWith('t1')
    broker.setStage('t1', 'script')
    expect(broker.stage('t1')).toBe('script')
  })
})
