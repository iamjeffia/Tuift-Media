import type { DomainEvent, Item, Subagent } from '@harness/contracts'

/**
 * Scripted states of a long turn, to look at how the chat tells "still working" from
 * "nothing is happening". Start the sandbox and open
 * `sandbox.html?feedbackScene=helper&chat=demo-focus-ring`, with one of:
 *
 * - `helper`: a helper agent has worked for fourteen minutes and reports every few seconds.
 * - `quiet`: the same helper, but its provider sends nothing about its steps.
 * - `command`: a long command that prints a line every few seconds.
 * - `idle`: a helper and then silence, so the quiet-agent note shows up on its own clock.
 * - `interrupted`: a turn that ended because the agent's process died.
 *
 * Everything is invented; nothing reaches a provider.
 */
export type FeedbackScene = 'helper' | 'quiet' | 'command' | 'idle' | 'interrupted'

const SCENES: readonly FeedbackScene[] = ['helper', 'quiet', 'command', 'idle', 'interrupted']

export function feedbackSceneFromSearch(search: string): FeedbackScene | undefined {
  const value = new URLSearchParams(search).get('feedbackScene')
  return SCENES.find((scene) => scene === value)
}

export const FEEDBACK_CHAT = 'demo-focus-ring'
const MINUTE = 60_000

/** What the helper reports, one line each, as its provider words a step. */
export const HELPER_STEPS = [
  'Reading storyboard.md',
  'Placing sound effects on the timeline',
  'Rendering frame 45 of 450',
  'Checking the narration timing',
  'Rendering frame 180 of 450',
  'Exporting the mix',
  'Rendering frame 330 of 450',
]
export const HELPER_TOOLS = ['Read', 'Bash', 'Edit', 'Read', 'Bash', 'Edit', 'Bash']

/** Lines an encoder prints while it works. */
export const COMMAND_LINES = [
  'frame=  240 fps= 31 q=28.0 size=    2048KiB time=00:00:08.00 bitrate=2097.2kbits/s',
  'frame=  480 fps= 32 q=28.0 size=    4352KiB time=00:00:16.00 bitrate=2228.2kbits/s',
  'frame=  720 fps= 32 q=27.0 size=    6912KiB time=00:00:24.00 bitrate=2359.3kbits/s',
  'frame=  960 fps= 33 q=27.0 size=    9216KiB time=00:00:32.00 bitrate=2359.3kbits/s',
  'frame= 1200 fps= 33 q=27.0 size=   11520KiB time=00:00:40.00 bitrate=2359.3kbits/s',
  'frame= 1440 fps= 33 q=27.0 size=   13824KiB time=00:00:48.00 bitrate=2359.3kbits/s',
]

export const HELPER_NAME = 'tuift-media:cloud'
/** The title ends in a number on purpose: it must never read as the helper's timer. */
export const HELPER_TASK = 'Montagem AE e render 15s'
export const FFMPEG_COMMAND = 'ffmpeg -y -i scene.mov -c:v libx264 -crf 18 launch-15s.mp4'

type Seed = { events: DomainEvent[]; running: boolean }

function done(id: string, turnId: string, createdAt: number, fields: Partial<Item>): Item {
  return { id, turnId, type: 'tool_call', status: 'completed', createdAt, ...fields }
}

/** The finished work every scene starts from: a prompt, a note and five completed steps. */
function groundwork(turnId: string, startedAt: number): Item[] {
  const step = (index: number) => startedAt + 20_000 + index * 25_000
  return [
    {
      id: `${turnId}-prompt`,
      turnId,
      type: 'message',
      role: 'user',
      status: 'completed',
      text: 'Build the 15 second launch video and render it.',
      createdAt: startedAt,
    },
    {
      id: `${turnId}-note`,
      turnId,
      type: 'message',
      role: 'assistant',
      status: 'completed',
      text: 'I will hand the assembly to the media helper and check what it renders.',
      createdAt: startedAt + 10_000,
    },
    done(`${turnId}-read`, turnId, step(0), {
      text: 'Read\n{"file_path":"storyboard.md"}\nStoryboard of the launch video.',
    }),
    done(`${turnId}-glob`, turnId, step(1), {
      text: 'Glob\n{"pattern":"assets/**/*.png"}\n42 files',
    }),
    {
      id: `${turnId}-probe`,
      turnId,
      type: 'command',
      status: 'completed',
      command: 'ffprobe -v error -show_streams narration.wav',
      exitCode: 0,
      text: 'codec_name=pcm_s16le',
      durationMs: 1_200,
      createdAt: step(2),
    },
    done(`${turnId}-grep`, turnId, step(3), {
      text: 'Grep\n{"pattern":"sfx"}\n7 matches',
    }),
    {
      id: `${turnId}-copy`,
      turnId,
      type: 'command',
      status: 'completed',
      command: 'cp narration.wav work/narration.wav',
      exitCode: 0,
      text: '',
      durationMs: 300,
      createdAt: step(4),
    },
  ]
}

function helperSnapshot(scene: FeedbackScene, index: number): Subagent {
  const base: Subagent = {
    id: 'demo-media-helper',
    name: HELPER_NAME,
    description: HELPER_TASK,
    state: 'running',
  }
  // A provider that reports nothing about its helper's steps gives the row nothing to show.
  if (scene !== 'helper') return base
  return {
    ...base,
    toolUses: 12 + index,
    tokens: 48_000 + index * 3_100,
    lastTool: HELPER_TOOLS[index % HELPER_TOOLS.length]!,
    summary: HELPER_STEPS[index % HELPER_STEPS.length]!,
  }
}

export function helperItem(
  scene: FeedbackScene,
  turnId: string,
  createdAt: number,
  index = 0,
): Item {
  return {
    id: `${turnId}-helper`,
    turnId,
    type: 'tool_call',
    status: 'started',
    text: `Agent\n${JSON.stringify({ description: HELPER_TASK, prompt: 'Assemble the video in After Effects and render it.' })}`,
    subagent: helperSnapshot(scene, index),
    createdAt,
  }
}

/** The log of a scene, as the server would have written it by `now`. */
export function seedFeedbackScene(
  scene: FeedbackScene,
  threadId: string,
  now: number,
): Seed & { turnId: string; startedAt: number; helperId: string; commandId: string } {
  const turnId = `demo-feedback-${scene}`
  const startedAt = now - (scene === 'command' ? 6 * MINUTE : 14 * MINUTE + 20_000)
  const base = groundwork(turnId, startedAt)
  const events: DomainEvent[] = [
    {
      type: 'turn.started',
      turn: { id: turnId, threadId, status: 'running', createdAt: startedAt },
    },
    ...base.map((item): DomainEvent => ({ type: 'item.completed', item })),
  ]
  const helperId = `${turnId}-helper`
  const commandId = `${turnId}-ffmpeg`
  if (scene === 'command') {
    events.push({
      type: 'item.started',
      item: {
        id: commandId,
        turnId,
        type: 'command',
        status: 'started',
        command: FFMPEG_COMMAND,
        text: 'ffmpeg version 7.1 Copyright (c) 2000-2025 the FFmpeg developers\n',
        createdAt: now - 5 * MINUTE - 10_000,
      },
    })
    return { events, running: true, turnId, startedAt, helperId, commandId }
  }
  const helper = helperItem(
    scene === 'interrupted' ? 'quiet' : scene,
    turnId,
    now - 13 * MINUTE - 50_000,
    scene === 'helper' ? 3 : 0,
  )
  if (scene !== 'interrupted') {
    events.push({ type: 'item.started', item: helper })
    return { events, running: true, turnId, startedAt, helperId, commandId }
  }
  // The agent's process died under the helper: its row says interrupted, the turn says so too.
  events.push({
    type: 'item.completed',
    item: {
      ...helper,
      status: 'failed',
      subagent: { ...helper.subagent!, state: 'interrupted', toolUses: 14 },
    },
  })
  events.push({
    type: 'thread.error',
    threadId,
    message: 'Claude Code session ended before the turn completed.',
  })
  events.push({ type: 'turn.completed', turnId, status: 'failed', completedAt: now })
  return { events, running: false, turnId, startedAt, helperId, commandId }
}
