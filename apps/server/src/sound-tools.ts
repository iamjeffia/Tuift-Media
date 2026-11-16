import { CLUBE_PLANS_URL, type SoundFailure, type SoundItem } from '@harness/contracts'
import { z } from 'zod'
import { LIBRARY_FOLDER, SOUND_TOOL_NAMES } from './sound-session.js'
import type { SoundLibrary } from './sound-library.js'

/**
 * The sound library's tools for the agent of a Motion chat, on the app's agent
 * tools channel. Only Motion chats are offered them: sounds belong to video work,
 * a tool list costs tokens in every chat that carries it, and the Clube's daily
 * files are the person's to spend on their videos. The tools exist in every Motion
 * chat, linked or not, so a closed library answers in plain words instead of being
 * an unknown tool.
 *
 * What an answer says never includes the account, its token or where a sound came from.
 */

const FRAME =
  "The Clube's sound library, through the app's linked Clube do Motion account. Nothing is downloaded in bulk: a sound is fetched only when you use it."

export const SOUND_TOOLS = [
  {
    name: 'sound_search',
    description: `Search the sound library for tonal sounds (musical, recorded in a key: drones, loops, melodies, hits, risers) and sound effects. ${FRAME} Results carry an id for sound_use, the key and mode of a tonal sound, duration and loudness. Searching is free; the filters narrow the list, and a BPM range returns only sounds that have a measure.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Words matched against name, family, category and role.',
        },
        type: {
          type: 'string',
          enum: ['tonal', 'efeito', 'ir'],
          description: 'tonal, efeito (sound effect) or ir (impulse response).',
        },
        category: { type: 'string' },
        key: { type: 'string', description: 'A note as the results show it, for example A.' },
        mode: { type: 'string', description: 'The mode as the results show it.' },
        bpm_min: { type: 'number' },
        bpm_max: { type: 'number' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
        offset: { type: 'integer', minimum: 0, description: 'To page through a long list.' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'sound_use',
    description: `Fetch one sound from a sound_search result into this chat's project (${LIBRARY_FOLDER}/) and answer its absolute path, format, duration and loudness. A sound already there is reused without spending the day's files (about 200 a day per account), so use only what you have chosen. ${FRAME}`,
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The id from a sound_search result.' } },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'music_search',
    description: `Search the library's music tracks. ${FRAME} A track's key and BPM are estimates, so confirm them before you build on them. Results carry an id for music_use.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        genre: { type: 'string' },
        mood: { type: 'string' },
        artist: { type: 'string' },
        key: { type: 'string', description: 'An estimated key as the results show it.' },
        bpm_min: { type: 'number' },
        bpm_max: { type: 'number' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'music_use',
    description: `Fetch one track from a music_search result into this chat's project (${LIBRARY_FOLDER}/music/): its WAV versions, in a folder named after the track. Answers the folder and each file's absolute path. A track already there is reused without spending the day's files (about 60 a day per account). ${FRAME}`,
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The id from a music_search result.' } },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
] as const

export type SoundToolName = (typeof SOUND_TOOLS)[number]['name']

export const isSoundTool = (name: unknown): name is SoundToolName =>
  SOUND_TOOL_NAMES.some((tool) => tool === name)

const SearchArgs = z.strictObject({
  query: z.string().max(200).optional(),
  type: z.enum(['tonal', 'efeito', 'ir']).optional(),
  category: z.string().max(100).optional(),
  key: z.string().max(20).optional(),
  mode: z.string().max(40).optional(),
  bpm_min: z.number().min(0).max(400).optional(),
  bpm_max: z.number().min(0).max(400).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  offset: z.number().int().min(0).max(100_000).optional(),
})
const MusicSearchArgs = z.strictObject({
  query: z.string().max(200).optional(),
  genre: z.string().max(100).optional(),
  mood: z.string().max(100).optional(),
  artist: z.string().max(100).optional(),
  key: z.string().max(20).optional(),
  bpm_min: z.number().min(0).max(400).optional(),
  bpm_max: z.number().min(0).max(400).optional(),
  limit: z.number().int().min(1).max(50).optional(),
})
const UseArgs = z.strictObject({ id: z.string().min(1).max(100) })

/** A tool's answer: what the agent reads, and whether it is a failure to read. */
export type SoundToolAnswer = { text: string; isError?: true }

/** What the tools need from the app: the library and where a chat's project is. */
export interface SoundToolsHost {
  library: SoundLibrary
  /** The chat's project folder, or undefined when the chat has none. */
  projectDir(threadId: string): string | undefined
}

/** What an agent is told for each way the library can say no, and what the person can do. */
function failureText(failure: SoundFailure): string {
  switch (failure.reason) {
    case 'not-linked':
      return "No Clube do Motion account is linked to TUIFT Code, so the sound library is not available. Tell the user to link the account in Settings > Clube do Motion, or to point you to a sounds folder of their own. Meanwhile use the project's own sounds or the fallbacks of the soundtrack skill."
    case 'no-subscription':
      return `The linked Clube do Motion account has no subscription, so the sound library is not available. Tell the user: the plans are at ${CLUBE_PLANS_URL}. Meanwhile use the project's own sounds, a folder of their own, or the fallbacks of the soundtrack skill.`
    case 'rate-limit':
      return `The library's per-minute limit for this account was reached. ${
        failure.retryAfterS
          ? `Try again in ${failure.retryAfterS} seconds.`
          : 'Try again in a minute.'
      }`
    case 'daily-limit':
      return `The library's files for today are used up (the Clube allows about ${failure.daily?.limit ?? 200} a day per account). Searching and previews still work. Tell the user, and go on with the sounds already in the project (${LIBRARY_FOLDER}/) or their own folder; the count starts again tomorrow.`
    case 'not-found':
      return 'The library does not know that id. Search again and use an id from the new results.'
    case 'damaged':
      return 'The file did not arrive intact (its checksum did not match) and was not kept. Try again; if it fails again, choose another sound.'
    case 'no-project':
      return 'This chat has no project folder the app can write to, so nothing was fetched.'
    default:
      return 'The Clube do Motion could not be reached. Try again shortly, or go on without the library.'
  }
}

const refuse = (text: string): SoundToolAnswer => ({ text, isError: true })
const answer = (value: unknown): SoundToolAnswer => ({ text: JSON.stringify(value) })

function resultItem(item: SoundItem) {
  return {
    id: item.id,
    name: item.name,
    ...(item.type ? { type: item.type } : {}),
    ...(item.role ? { role: item.role } : {}),
    ...(item.key ? { key: item.key } : {}),
    ...(item.mode ? { mode: item.mode } : {}),
    ...(item.durationS === undefined ? {} : { duration_s: item.durationS }),
    ...(item.category ? { category: item.category } : {}),
    ...(item.artist ? { artist: item.artist } : {}),
    ...(item.mood ? { mood: item.mood } : {}),
    ...(item.lufs === undefined ? {} : { lufs: item.lufs }),
    ...(item.bpm === undefined ? {} : { bpm: item.bpm }),
  }
}

/**
 * Runs one of the tools for the chat `threadId`. Invalid arguments and a library that is off are
 * answers too: a call never breaks.
 */
export async function runSoundTool(
  host: SoundToolsHost,
  threadId: string,
  name: SoundToolName,
  input: unknown,
): Promise<SoundToolAnswer> {
  const { library } = host
  if (!library.settings().enabled) {
    return refuse(
      "The person turned the app's sound library off in Settings. Do not use it; use the project's own sounds or their own folder.",
    )
  }
  const invalid = (error: z.ZodError) =>
    refuse(
      `Invalid arguments: ${error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; ')}`,
    )
  switch (name) {
    case 'sound_search': {
      const args = SearchArgs.safeParse(input)
      if (!args.success) return invalid(args.error)
      const result = await library.search({
        shelf: 'sound',
        ...(args.data.query ? { query: args.data.query } : {}),
        ...(args.data.type ? { type: args.data.type as 'tonal' | 'efeito' } : {}),
        ...(args.data.category ? { category: args.data.category } : {}),
        ...(args.data.key ? { key: args.data.key } : {}),
        ...(args.data.mode ? { mode: args.data.mode } : {}),
        ...(args.data.bpm_min === undefined ? {} : { bpmMin: args.data.bpm_min }),
        ...(args.data.bpm_max === undefined ? {} : { bpmMax: args.data.bpm_max }),
        ...(args.data.limit === undefined ? {} : { limit: args.data.limit }),
        ...(args.data.offset === undefined ? {} : { offset: args.data.offset }),
      })
      if (!result.ok) return refuse(failureText(result))
      return answer({
        total: result.total,
        offset: result.offset,
        results: result.items.map(resultItem),
        files_left_today_estimate: Math.max(0, result.daily.limit - result.daily.used),
      })
    }
    case 'music_search': {
      const args = MusicSearchArgs.safeParse(input)
      if (!args.success) return invalid(args.error)
      const result = await library.search({
        shelf: 'music',
        ...(args.data.query ? { query: args.data.query } : {}),
        ...(args.data.genre ? { category: args.data.genre } : {}),
        ...(args.data.mood ? { mood: args.data.mood } : {}),
        ...(args.data.artist ? { artist: args.data.artist } : {}),
        ...(args.data.key ? { key: args.data.key } : {}),
        ...(args.data.bpm_min === undefined ? {} : { bpmMin: args.data.bpm_min }),
        ...(args.data.bpm_max === undefined ? {} : { bpmMax: args.data.bpm_max }),
        ...(args.data.limit === undefined ? {} : { limit: args.data.limit }),
      })
      if (!result.ok) return refuse(failureText(result))
      return answer({
        total: result.total,
        results: result.items.map(resultItem),
        note: 'Key and BPM are estimates.',
        tracks_left_today_estimate: Math.max(0, result.daily.limit - result.daily.used),
      })
    }
    case 'sound_use':
    case 'music_use': {
      const args = UseArgs.safeParse(input)
      if (!args.success) return invalid(args.error)
      const project = host.projectDir(threadId)
      if (!project) return refuse(failureText({ ok: false, reason: 'no-project' }))
      const shelf = name === 'sound_use' ? 'sound' : 'music'
      const result = await library.use(project, shelf, args.data.id)
      if (!result.ok) return refuse(failureText(result))
      const { sound } = result
      return answer({
        path: sound.path,
        ...(shelf === 'music'
          ? { files: sound.files.map((file) => ({ version: file.version, path: file.path })) }
          : {}),
        format: sound.format,
        ...(sound.durationS === undefined ? {} : { duration_s: sound.durationS }),
        ...(sound.lufs === undefined ? {} : { lufs: sound.lufs }),
        reused: sound.reused,
        files_left_today_estimate: Math.max(0, result.daily.limit - result.daily.used),
      })
    }
  }
}
