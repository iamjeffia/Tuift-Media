import path from 'node:path'
import {
  MOTION_STAGE_OWNERS,
  MOTION_STAGES,
  MotionStageSchema,
  type MotionStage,
  type ThreadMode,
} from '@harness/contracts'
import { z } from 'zod'
import type { DefaultSkillPack } from './default-skills.js'
import type { Store } from './store.js'

/**
 * The `motion_stage` agent tool: how an agent in a Motion chat says which stage of
 * the video it is in. A guide, never a gate: it stores and announces the stage and
 * tells the agent which skills of the Motion pack to read. It refuses nothing but
 * an id that is not a stage.
 */

/**
 * The Motion pack skills (folder names in `packages/default-skills/skills.json`) that
 * each stage reads. Stages with no skill are work the person and the agent do in
 * conversation; the test checks every name against the real pack.
 */
export const MOTION_STAGE_SKILLS = {
  idea: [],
  script: [],
  narration: [],
  audioApproval: [],
  references: ['video-referencias', 'watch', 'captura-de-movimento', 'media-use'],
  identity: ['stageshow', 'hyperframes-creative'],
  soundtrack: ['composicao-trilha', 'hyperframes-audio'],
  motion: [
    'motion-app-ae',
    'animacao-saas',
    'motion-narrado',
    'captura-de-movimento',
    'hyperframes',
    'motion-graphics',
  ],
  review: ['watch'],
  delivery: ['hyperframes-cli'],
} as const satisfies Record<MotionStage, readonly string[]>

export const MOTION_STAGE_TOOL = {
  name: 'motion_stage',
  description: [
    'Tell TUIFT Code which stage of the video you are in. Call it when you move to another stage: the app shows the stage to the person, and the answer names the stage owner, the next stage and the skills of the Motion pack to read for it.',
    'It is a guide, not a gate: any stage can be set from any stage, going back included. Without stage it changes nothing and answers the current stage and the list of stages. It acts only on this chat.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      stage: {
        type: 'string',
        enum: [...MOTION_STAGES],
        description: 'The stage you are moving to. Absent: only report the current one.',
      },
    },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
} as const

const REMINDER =
  'Every approval, and the final wording of anything the person will say or publish, is theirs: propose, then wait.'

const ArgsSchema = z.strictObject({ stage: z.string().optional() })

/** A refusal the agent should read: an id that is not a stage, or arguments that do not fit. */
export class MotionStageError extends Error {}

/** What the tool needs from the app; the orchestrator holds the chats and the bundled pack. */
export interface MotionStageBroker {
  mode(threadId: string): ThreadMode | undefined
  stage(threadId: string): MotionStage | undefined
  /** Stores the stage and tells every client. Never restarts the provider session. */
  setStage(threadId: string, stage: MotionStage): void
  /** The Motion pack as installed, or undefined when it is not on disk. */
  pack(): DefaultSkillPack | undefined
}

/** The broker over the store: a stage change is announced through `announce`. */
export function motionStageBroker(
  store: Pick<Store, 'threadSettings' | 'setThreadMode'>,
  announce: (threadId: string) => void,
  pack: () => DefaultSkillPack | undefined,
): MotionStageBroker {
  return {
    mode: (threadId) => store.threadSettings(threadId).mode,
    stage: (threadId) => store.threadSettings(threadId).motionStage,
    setStage: (threadId, stage) => {
      store.setThreadMode(threadId, 'motion', stage)
      announce(threadId)
    },
    pack,
  }
}

function describeStage(stage: MotionStage, pack: DefaultSkillPack | undefined) {
  const index = MOTION_STAGES.indexOf(stage)
  // A skill missing from this install is left out rather than pointed at.
  const skills = MOTION_STAGE_SKILLS[stage]
    .filter((folder) => !pack || pack.skills.includes(folder))
    .map((folder) => ({
      name: folder,
      ...(pack ? { path: path.join(pack.pluginDir, 'skills', folder, 'SKILL.md') } : {}),
    }))
  return {
    stage,
    owner: MOTION_STAGE_OWNERS[stage],
    next: MOTION_STAGES[index + 1] ?? null,
    skills,
    reminder: REMINDER,
  }
}

/** Runs the tool for the chat `threadId`. The caller has checked that the chat is in Motion mode. */
export function runMotionStage(broker: MotionStageBroker, threadId: string, input: unknown) {
  const args = ArgsSchema.safeParse(input)
  if (!args.success) {
    throw new MotionStageError(
      `Invalid arguments: ${args.error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; ')}`,
    )
  }
  if (args.data.stage === undefined) {
    const current = broker.stage(threadId)
    return {
      ...(current ? describeStage(current, broker.pack()) : { stage: null }),
      stages: MOTION_STAGES.map((stage) => ({ stage, owner: MOTION_STAGE_OWNERS[stage] })),
    }
  }
  const stage = MotionStageSchema.safeParse(args.data.stage)
  if (!stage.success) {
    throw new MotionStageError(
      `Unknown stage "${args.data.stage}". Valid stages: ${MOTION_STAGES.join(', ')}.`,
    )
  }
  broker.setStage(threadId, stage.data)
  return describeStage(stage.data, broker.pack())
}
