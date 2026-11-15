import { z } from 'zod'

/**
 * The video stages of a Motion chat, in the order a video goes through them.
 * A guide, not a gate: the chat may sit at any stage.
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
export const MotionStageSchema = z.enum(MOTION_STAGES)
export type MotionStage = z.infer<typeof MotionStageSchema>

/** The six characters of the Motion scene. */
export const MOTION_CHARACTERS = ['zig', 'moss', 'bun', 'pip', 'cloud', 'penny'] as const
export const MotionCharacterSchema = z.enum(MOTION_CHARACTERS)
export type MotionCharacter = z.infer<typeof MotionCharacterSchema>

/** The character that owns each stage. */
export const MOTION_STAGE_OWNERS = {
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
} as const satisfies Record<MotionStage, MotionCharacter>

/** What a chat is for, beyond plain coding. Nothing sets `design` yet. */
export const ThreadModeSchema = z.enum(['motion', 'design'])
export type ThreadMode = z.infer<typeof ThreadModeSchema>
