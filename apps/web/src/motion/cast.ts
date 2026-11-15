import type { MessageKey } from '../i18n/index.js'
import bun from './cast/bun.webp'
import cloud from './cast/cloud.webp'
import moss from './cast/moss.webp'
import penny from './cast/penny.webp'
import pip from './cast/pip.webp'
import zig from './cast/zig.webp'

/**
 * The Motion team and the stages of a video project. Local on purpose: the ids
 * match the ones the contracts will carry, so this list can be swapped for the
 * shared one without touching the scene.
 */
export const MOTION_STAGES = [
  'idea',
  'script',
  'narration',
  'audioApproval',
  'references',
  'identity',
  'soundtrack',
  'motion',
  'review',
  'delivery',
] as const
export type MotionStageId = (typeof MOTION_STAGES)[number]

export type CastId = 'zig' | 'moss' | 'bun' | 'pip' | 'cloud' | 'penny'

export type CastMember = {
  id: CastId
  /** Proper name: never translated. */
  name: string
  /** The suffix of a `--composer-motion-*` token. */
  color: 'orange' | 'lime' | 'blue' | 'pink' | 'lilac' | 'yellow'
  image: string
  role: MessageKey
}

/** Order on screen: the lead first, then the order of the work. */
export const CAST: readonly CastMember[] = [
  { id: 'zig', name: 'Zig', color: 'orange', image: zig, role: 'chat.motion.role.zig' },
  { id: 'moss', name: 'Moss', color: 'lime', image: moss, role: 'chat.motion.role.moss' },
  { id: 'bun', name: 'Bun', color: 'blue', image: bun, role: 'chat.motion.role.bun' },
  { id: 'pip', name: 'Pip', color: 'pink', image: pip, role: 'chat.motion.role.pip' },
  { id: 'cloud', name: 'Cloud', color: 'lilac', image: cloud, role: 'chat.motion.role.cloud' },
  { id: 'penny', name: 'Penny', color: 'yellow', image: penny, role: 'chat.motion.role.penny' },
]

/** Who owns each stage: that character is the highlighted one while the stage is current. */
export const STAGE_OWNER = {
  idea: 'zig',
  script: 'bun',
  narration: 'bun',
  audioApproval: 'zig',
  references: 'moss',
  identity: 'moss',
  soundtrack: 'cloud',
  motion: 'cloud',
  review: 'penny',
  delivery: 'pip',
} satisfies Record<MotionStageId, CastId>

/** The stages a character owns, in the order of the work: one or two. */
export const stagesOf = (id: CastId): MotionStageId[] =>
  MOTION_STAGES.filter((stage) => STAGE_OWNER[stage] === id)

export const STAGE_LABEL = {
  idea: 'chat.motion.stage.idea',
  script: 'chat.motion.stage.script',
  narration: 'chat.motion.stage.narration',
  audioApproval: 'chat.motion.stage.audioApproval',
  references: 'chat.motion.stage.references',
  identity: 'chat.motion.stage.identity',
  soundtrack: 'chat.motion.stage.soundtrack',
  motion: 'chat.motion.stage.motion',
  review: 'chat.motion.stage.review',
  delivery: 'chat.motion.stage.delivery',
} satisfies Record<MotionStageId, MessageKey>
