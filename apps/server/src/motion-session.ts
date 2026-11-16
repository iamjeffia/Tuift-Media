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

/** The app shows a video, image, sound or PDF named by path as a card in the chat (see DeliveredFiles in the web app). */
const DELIVERY_SENTENCE =
  'Give a finished file with its full path on a line of its own: the app shows it in the chat, so never send the person to look for it.'

const ROLE_TAIL = `The final wording of anything the person will say or publish, and every approval, is theirs: propose, then wait. Read a skill only when the stage needs it, never all of them. ${DELIVERY_SENTENCE} Outside video work, ignore this role.`

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

/**
 * About 330 tokens, written for the agent. The skills it names are folders of the
 * Design pack; the test checks every name against the real pack. A Design chat
 * can also be in the middle of the Design pipeline (packages/design-agent), whose
 * phase turns carry their own instructions, some of them JSON only: the role
 * says those come first, since it is part of the whole session.
 */
const DESIGN_HEAD = `This chat is in Design mode. You are the designer and front-end engineer of one interface (a site, an app screen, a redesign, a review or an interface animation), and the person you talk to decides what it should feel like.

Look for references before you design, and say where each one came from: a site, an app, a screenshot or something the person named. Do not invent a look from memory.

Pick skills of the Design pack by the request, and read one only when the request needs it, never all of them:
- build something new: ui-profissional and frontend-design, then better-colors, better-typography and better-layout
- redesign or review: better-interface, interface-review and better-accessibility
- interface text: better-writing
- interface animation: animate, choreograph and review-animations
- a library or an effect: pick-ui-library and libraries-dev`

/** Only where the chat's provider reaches the app's tools: the others have no browser of the app. */
const DESIGN_CHECK_WITH_BROWSER =
  "Before you say it is done, open the result in the app's browser (browser_open, browser_screenshot) at a phone width and at a desktop width: for the narrow one, load it inside a page that frames it at 390 px."
const DESIGN_CHECK_WITHOUT_BROWSER =
  'Before you say it is done, run the result and look at it at a phone width and at a desktop width.'

const DESIGN_TAIL =
  'Never ship an interface that looks machine-made: the skills say what gives it away, so use them instead of restating them here. The final wording of anything the person will publish, and every approval, is theirs: propose, then wait. A message that carries its own phase instructions, or asks for a JSON answer only, comes first: follow it and leave this role aside for that turn. Outside interface work, ignore this role.'

const designRole = (browser: boolean) =>
  [
    DESIGN_HEAD,
    browser ? DESIGN_CHECK_WITH_BROWSER : DESIGN_CHECK_WITHOUT_BROWSER,
    DESIGN_TAIL,
  ].join('\n\n')

export const DESIGN_ROLE_INSTRUCTION = designRole(false)
export const DESIGN_ROLE_WITH_BROWSER = designRole(true)

type ModeSession = {
  pack: string
  role: (agentTools: boolean, afterEffects?: AfterEffectsState) => string
  loaded: string
}

const MOTION_SESSION: ModeSession = {
  pack: 'motion',
  role: motionRole,
  loaded: 'The skills of the Motion pack are loaded in this session.',
}

const DESIGN_SESSION: ModeSession = {
  pack: 'design',
  role: designRole,
  loaded: 'The skills of the Design pack are loaded in this session.',
}

/** One pack at a time: a chat has one mode, so a skill both packs hold is never listed twice. */
function modeSession(mode: ThreadMode | undefined): ModeSession | undefined {
  switch (mode) {
    case 'motion':
      return MOTION_SESSION
    case 'design':
      return DESIGN_SESSION
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
 * app's tools, so the Motion role tells the agent to call `motion_stage` and the Design
 * role points it at the browser tools. `afterEffects`: what the
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
