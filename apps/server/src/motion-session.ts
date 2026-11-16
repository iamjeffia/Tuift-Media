import type { AfterEffectsState, ProviderId, ThreadMode } from '@harness/contracts'
import type { DefaultSkillPack } from './default-skills.js'

/**
 * What a chat in a mode adds to the session it starts: a short role instruction
 * and the mode's skill pack. The pack's skills come as one more plugin where the
 * provider loads plugins itself, and as the pack's catalog in the instruction
 * everywhere else. A chat with no mode adds nothing.
 */

/** About 250 tokens, written for the agent. Lists the stage ids of `MOTION_STAGES`, in order. */
const ROLE_HEAD = `This chat is in Motion mode. You are the video editor and motion designer of one video, and the person you talk to is its director.

Work through the video in these stages, in order. They are a guide, not a gate: move between them when the work asks for it.
1. idea: the idea and what "done" means
2. script: the structure and the points of each part
3. narration: the voice-over
4. audioApproval: the person approves the audio before any editing starts
5. references: references and real assets
6. identity: the visual identity, three directions in still frames first
7. soundtrack: music and sound design
8. motion: animate and render the video
9. review: frame-by-frame review with the audio
10. delivery: the final files and notes`

/** Only where the chat's provider reaches the app's tools: the others have the person set the stage. */
const STAGE_TOOL_SENTENCE =
  'When you move to another stage, call the motion_stage tool: the app shows the stage to the person and answers with the skills to read. ' +
  // The scene lights a character while a helper with its name runs.
  'A helper agent named after a character (Zig, Bun, Moss, Cloud, Penny or Pip) lights that character in the app; motion_stage says who owns each stage.'

const ROLE_TAIL = `The final wording of anything the person will say or publish, and every approval, is theirs: propose, then wait. Read a skill only when the stage needs it, never all of them. Outside video work, ignore this role.`

/** Chosen by what the chat's session actually has: the agent must not plan around a tool it lacks. */
export const AFTER_EFFECTS_SENTENCES = {
  ready:
    'After Effects is available through its tools (the after-effects server): build the motion stage there.',
  unavailable:
    'After Effects is not available here: build the video in HyperFrames (the pack has those skills).',
} as const

const afterEffectsSentence = (state: AfterEffectsState | undefined) =>
  state === undefined ? '' : AFTER_EFFECTS_SENTENCES[state === 'ready' ? 'ready' : 'unavailable']

const motionRole = (stageTool: boolean, afterEffects?: AfterEffectsState) =>
  [ROLE_HEAD, afterEffectsSentence(afterEffects), stageTool ? STAGE_TOOL_SENTENCE : '', ROLE_TAIL]
    .filter(Boolean)
    .join('\n\n')

export const MOTION_ROLE_INSTRUCTION = motionRole(false)
export const MOTION_ROLE_WITH_STAGE_TOOL = motionRole(true)

const PACK_LOADED = 'The skills of the Motion pack are loaded in this session.'

type ModeSession = {
  pack: string
  role: (stageTool: boolean, afterEffects?: AfterEffectsState) => string
  loaded: string
}

const MOTION_SESSION: ModeSession = {
  pack: 'motion',
  role: motionRole,
  loaded: PACK_LOADED,
}

/** The Design pack will get its own case, with its own role instruction. */
function modeSession(mode: ThreadMode | undefined): ModeSession | undefined {
  switch (mode) {
    case 'motion':
      return MOTION_SESSION
    default:
      return undefined
  }
}

export type ModeSessionStart = {
  /** The role instruction, then the pack's catalog when the provider has no plugin loader. */
  instructions: string
  /** Plugin folders to load next to the base skills; empty when the pack is not on disk. */
  plugins: string[]
}

/**
 * The session start of a chat in `mode`, or undefined when the mode adds nothing.
 * `native`: the provider loads plugin folders itself. A pack missing on disk
 * leaves the role instruction alone. `stageTool`: the chat's provider reaches the
 * `motion_stage` tool, so the role tells the agent to call it. `afterEffects`: what the
 * session has of After Effects; absent, the role says nothing about it.
 */
export function modeSessionStart(
  mode: ThreadMode | undefined,
  native: boolean,
  loadPack: (name: string) => DefaultSkillPack | undefined,
  stageTool = false,
  afterEffects?: AfterEffectsState,
): ModeSessionStart | undefined {
  const session = modeSession(mode)
  if (!session) return undefined
  const pack = loadPack(session.pack)
  const skills = !pack ? '' : native ? session.loaded : pack.catalog
  return {
    instructions: [session.role(stageTool, afterEffects), skills].filter(Boolean).join('\n\n'),
    plugins: pack && native ? [pack.pluginDir] : [],
  }
}

/**
 * Providers whose `resume` applies the instructions it is given. The others
 * (Grok, Cursor, Pi, Antigravity, ACP agents) carry them only in the first prompt of a
 * new session, so a resumed session never sees a changed instruction.
 */
const RESUME_APPLIES_INSTRUCTIONS: ReadonlySet<ProviderId> = new Set([
  'claude-code',
  'codex',
  'opencode',
])

/**
 * How a chat's next turn starts after its mode changed. `resume`: the provider's
 * own saved session is resumed with the new instructions. `fresh`: a new session
 * starts and the next prompt carries the conversation, as after a provider move.
 * `none`: nothing to restart.
 */
export function modeChangeRestart(provider: ProviderId): 'resume' | 'fresh' | 'none' {
  if (provider === 'api') return 'none'
  return RESUME_APPLIES_INSTRUCTIONS.has(provider) ? 'resume' : 'fresh'
}
