import { z } from 'zod'

/**
 * The Clube's sound library as the app's screens and agents see it. The server
 * talks to the Clube in the Clube's own words and hands out these shapes, so
 * nothing in the page depends on the Clube's field names, and none of it holds
 * a token.
 */

/** The two shelves: single sounds (tonal and effects), and music tracks. */
export const SoundShelfSchema = z.enum(['sound', 'music'])
export type SoundShelf = z.infer<typeof SoundShelfSchema>

/** Which kind of single sound: `tonal` (musical, recorded in a key) or `efeito` (a sound effect). */
export const SoundTypeSchema = z.enum(['tonal', 'efeito'])
export type SoundType = z.infer<typeof SoundTypeSchema>

/** What the person turned on or off in Settings. */
export const SoundSettingsSchema = z.object({
  /** Agents in Motion chats may search the library and fetch from it. On unless turned off. */
  enabled: z.boolean(),
  /** The person's own sounds folder: only its path is kept, nothing is copied or indexed. */
  ownFolder: z.string().optional(),
})
export type SoundSettings = z.infer<typeof SoundSettingsSchema>

/** Files fetched today, as this app counts them, and the Clube's daily ceiling. */
export const SoundDailySchema = z.object({ used: z.number(), limit: z.number() })
export type SoundDaily = z.infer<typeof SoundDailySchema>

/** One sound or track in a result. `key` and `bpm` of music are the Clube's estimates. */
export const SoundItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  shelf: SoundShelfSchema,
  /** `tonal` or `efeito` for a sound; absent for music. */
  type: z.string().optional(),
  role: z.string().optional(),
  key: z.string().optional(),
  mode: z.string().optional(),
  durationS: z.number().optional(),
  /** The category of a sound, the genre of a track. */
  category: z.string().optional(),
  artist: z.string().optional(),
  mood: z.string().optional(),
  lufs: z.number().optional(),
  bpm: z.number().optional(),
})
export type SoundItem = z.infer<typeof SoundItemSchema>

/** Why the library gave no answer. The screen words each one; the server never sends prose. */
export const SoundFailureReasonSchema = z.enum([
  /** No Clube account is linked. */
  'not-linked',
  /** The account is linked and has no subscription. */
  'no-subscription',
  /** More than 60 calls in a minute. `retryAfterS` says when. */
  'rate-limit',
  /** The day's files are used up. */
  'daily-limit',
  /** The Clube could not be reached, or answered something unusable. */
  'unreachable',
  /** The id is not one the library knows (search again). */
  'not-found',
  /** The file arrived damaged (its checksum did not match). */
  'damaged',
  /** The chat's project cannot take the file. */
  'no-project',
])
export type SoundFailureReason = z.infer<typeof SoundFailureReasonSchema>

export const SoundFailureSchema = z.object({
  ok: z.literal(false),
  reason: SoundFailureReasonSchema,
  retryAfterS: z.number().optional(),
  daily: SoundDailySchema.optional(),
})
export type SoundFailure = z.infer<typeof SoundFailureSchema>

export const SoundSearchParamsSchema = z.object({
  shelf: SoundShelfSchema,
  query: z.string().max(200).optional(),
  /** Sounds only. */
  type: SoundTypeSchema.optional(),
  /** The category of a sound, the genre of a track. */
  category: z.string().max(100).optional(),
  key: z.string().max(20).optional(),
  mode: z.string().max(40).optional(),
  /** Music only. */
  mood: z.string().max(100).optional(),
  artist: z.string().max(100).optional(),
  bpmMin: z.number().min(0).max(400).optional(),
  bpmMax: z.number().min(0).max(400).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  offset: z.number().int().min(0).max(100_000).optional(),
})
export type SoundSearchParams = z.infer<typeof SoundSearchParamsSchema>

export const SoundSearchResultSchema = z.union([
  z.object({
    ok: z.literal(true),
    total: z.number(),
    offset: z.number(),
    items: z.array(SoundItemSchema),
    daily: SoundDailySchema,
  }),
  SoundFailureSchema,
])
export type SoundSearchResult = z.infer<typeof SoundSearchResultSchema>

export const SoundFacetsResultSchema = z.union([
  z.object({
    ok: z.literal(true),
    total: z.number(),
    categories: z.array(z.object({ type: z.string(), category: z.string(), total: z.number() })),
    keys: z.array(z.string()),
    daily: SoundDailySchema,
  }),
  SoundFailureSchema,
])
export type SoundFacetsResult = z.infer<typeof SoundFacetsResultSchema>

/** A preview: at most eight seconds of Opus, handed over as base64 so the page never calls the Clube. */
export const SoundPreviewResultSchema = z.union([
  z.object({ ok: z.literal(true), mime: z.string(), data: z.string() }),
  SoundFailureSchema,
])
export type SoundPreviewResult = z.infer<typeof SoundPreviewResultSchema>

/** A file now in the chat's project. */
export const UsedSoundSchema = z.object({
  /** The folder of a track, the file of a sound. Absolute. */
  path: z.string(),
  name: z.string(),
  format: z.string(),
  durationS: z.number().optional(),
  lufs: z.number().optional(),
  /** The file was already in the project, so the day's count did not move. */
  reused: z.boolean(),
  /** A track brings several versions; each one's path. */
  files: z.array(z.object({ version: z.string(), path: z.string(), format: z.string() })),
})
export type UsedSound = z.infer<typeof UsedSoundSchema>

export const SoundUseResultSchema = z.union([
  z.object({ ok: z.literal(true), sound: UsedSoundSchema, daily: SoundDailySchema }),
  SoundFailureSchema,
])
export type SoundUseResult = z.infer<typeof SoundUseResultSchema>
