import { z } from 'zod'

/**
 * The Clube's library (`/api/v1/biblioteca`) as the Clube tab of the side panel sees it. The server
 * talks to the Clube in the Clube's own words and hands out these shapes, so the page depends on no
 * field name of the Clube and never holds a token or a signed link.
 */

export const ClubeKindSchema = z.enum(['animation', 'project', 'reference', 'skill', 'music'])
export type ClubeKind = z.infer<typeof ClubeKindSchema>

/** One value of a facet and how many items have it, in the order the Clube gave. */
export const ClubeFacetValueSchema = z.object({ value: z.string(), count: z.number() })
export const ClubeFacetsSchema = z.object({
  kind: z.array(ClubeFacetValueSchema),
  style: z.array(ClubeFacetValueSchema),
  tool: z.array(ClubeFacetValueSchema),
  scene: z.array(ClubeFacetValueSchema),
  format: z.array(ClubeFacetValueSchema),
})
export type ClubeFacets = z.infer<typeof ClubeFacetsSchema>

export const ClubeItemSchema = z.object({
  /** With a slash: `animacao/<slug>`, `projeto/<id>`, `referencia/<id>`, `skill/<id>`, `musica/<id>`. */
  id: z.string(),
  kind: ClubeKindSchema,
  title: z.string(),
  summary: z.string(),
  style: z.array(z.string()),
  tool: z.array(z.string()),
  scene: z.array(z.string()),
  format: z.string().optional(),
  durationS: z.number().optional(),
  /** Absolute addresses on the Clube's origin. The page does not load them: it asks `clube.library.media`. */
  cover: z.string().optional(),
  preview: z.string().optional(),
  /** The item's page on the site, which opens in the system browser. */
  page: z.string().optional(),
  access: z.enum(['free', 'subscriber']),
})
export type ClubeItem = z.infer<typeof ClubeItemSchema>

/** Why a library request gave no answer. The screen words each one; its own sentence is for the Clube's. */
export const ClubeLibraryFailureReasonSchema = z.enum([
  'not-linked',
  'no-subscription',
  /** More than 60 calls a minute. */
  'rate-limit',
  /** The day's files (or the reference credits) are used up. */
  'daily-limit',
  'unreachable',
  'not-found',
  /** The chat has no project folder to write into. */
  'no-project',
  /** The Clube refused the action and said why (`message`). */
  'refused',
  /** A file arrived damaged, or an archive was not one. */
  'damaged',
  /** A link or an entry would have left its folder or the Clube's origin. */
  'unsafe',
  /** Past the ceiling the app sets for one file or one download. */
  'too-large',
  'no-space',
  'cancelled',
])
export type ClubeLibraryFailureReason = z.infer<typeof ClubeLibraryFailureReasonSchema>

export const ClubeLibraryFailureSchema = z.object({
  ok: z.literal(false),
  reason: ClubeLibraryFailureReasonSchema,
  retryAfterS: z.number().optional(),
  /** The Clube's own sentence, in Portuguese, when it gave one. */
  message: z.string().optional(),
})
export type ClubeLibraryFailure = z.infer<typeof ClubeLibraryFailureSchema>

export const ClubeSearchParamsSchema = z.object({
  query: z.string().max(200).optional(),
  kind: ClubeKindSchema.optional(),
  style: z.array(z.string().max(100)).max(10).optional(),
  tool: z.array(z.string().max(100)).max(10).optional(),
  scene: z.array(z.string().max(100)).max(10).optional(),
  format: z.string().max(60).optional(),
  cursor: z.string().max(500).optional(),
  limit: z.number().int().min(1).max(24).optional(),
})
export type ClubeSearchParams = z.infer<typeof ClubeSearchParamsSchema>

export const ClubeSearchResultSchema = z.union([
  z.object({
    ok: z.literal(true),
    total: z.number(),
    items: z.array(ClubeItemSchema),
    /** The cursor of the next page, or null on the last. */
    next: z.string().nullable(),
    facets: ClubeFacetsSchema,
    notice: z.string().optional(),
  }),
  ClubeLibraryFailureSchema,
])
export type ClubeSearchResult = z.infer<typeof ClubeSearchResultSchema>

/** A part of a download (a project's part, an animation's file). */
export const ClubePartSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string().optional(),
  sizeMb: z.number(),
  /** How many files the part counts in the day's limit. */
  files: z.number().int().min(1),
  /** Already complete in the chat's project: it is not fetched again and counts nothing. */
  onDisk: z.boolean(),
})
export type ClubePart = z.infer<typeof ClubePartSchema>

const Aspect = z.string().optional()

export const ClubeRecordSchema = z.object({
  item: ClubeItemSchema,
  /** Markdown; for a skill it is the whole SKILL.md. */
  analysis: z.string().optional(),
  aspects: z.object({
    animation: Aspect,
    colors: Aspect,
    typography: Aspect,
    transition: Aspect,
    sound: Aspect,
  }),
  prompt: z.string().optional(),
  parts: z.array(ClubePartSchema),
  /** A reference's original link. */
  original: z.string().optional(),
  /** A reference's credits after this opening. */
  credits: z.object({ used: z.number(), of: z.number(), period: z.string().optional() }).optional(),
  /** Music: the three previews (addresses for `clube.library.media`), and the catalogued facts. */
  music: z
    .object({
      previews: z.object({
        full: z.string().optional(),
        instrumental: z.string().optional(),
        vocal: z.string().optional(),
      }),
      bpm: z.number().optional(),
      key: z.string().optional(),
      genre: z.string().optional(),
      moods: z.array(z.string()),
    })
    .optional(),
  /** The Clube's sentence about this record (a day's limit, for one). */
  notice: z.string().optional(),
})
export type ClubeRecord = z.infer<typeof ClubeRecordSchema>

export const ClubeRecordResultSchema = z.union([
  z.object({ ok: z.literal(true), record: ClubeRecordSchema }),
  ClubeLibraryFailureSchema,
])
export type ClubeRecordResult = z.infer<typeof ClubeRecordResultSchema>

export const ClubeMediaResultSchema = z.union([
  z.object({ ok: z.literal(true), mime: z.string(), data: z.string() }),
  ClubeLibraryFailureSchema,
])
export type ClubeMediaResult = z.infer<typeof ClubeMediaResultSchema>

export const ClubeLimitSchema = z.object({ used: z.number(), limit: z.number() })
export type ClubeLimit = z.infer<typeof ClubeLimitSchema>

/** The day's limits. `unavailable` is the Clube not having the route yet: the page hides them. */
export const ClubeLimitsResultSchema = z.union([
  z.object({
    ok: z.literal(true),
    files: ClubeLimitSchema.optional(),
    sounds: ClubeLimitSchema.optional(),
    references: ClubeLimitSchema.optional(),
    /** The account has no limit (`sem_limite`). */
    unlimited: z.boolean(),
  }),
  z.object({ ok: z.literal(false), reason: z.literal('unavailable') }),
])
export type ClubeLimitsResult = z.infer<typeof ClubeLimitsResultSchema>

export const ClubeSignalSchema = z.enum(['used', 'hide'])
export type ClubeSignal = z.infer<typeof ClubeSignalSchema>

export const ClubeDownloadStateSchema = z.enum(['queued', 'running', 'done', 'failed', 'cancelled'])

export const ClubeJobSchema = z.object({
  state: ClubeDownloadStateSchema,
  /** The file being fetched now. */
  file: z.string().optional(),
  filesDone: z.number(),
  filesTotal: z.number(),
  receivedBytes: z.number(),
  /** What the Clube declared for the files of this download. */
  totalBytes: z.number(),
  result: z
    .object({
      /** Absolute. */
      folder: z.string(),
      files: z.number(),
      bytes: z.number(),
      /** Parts that were already complete and were not fetched. */
      reusedParts: z.number(),
    })
    .optional(),
  failure: ClubeLibraryFailureSchema.optional(),
})
export type ClubeJob = z.infer<typeof ClubeJobSchema>

export const ClubeDownloadStartResultSchema = z.union([
  z.object({ ok: z.literal(true), jobId: z.string() }),
  ClubeLibraryFailureSchema,
])
export type ClubeDownloadStartResult = z.infer<typeof ClubeDownloadStartResultSchema>

export const ClubeJobResultSchema = z.union([
  z.object({ ok: z.literal(true), job: ClubeJobSchema }),
  ClubeLibraryFailureSchema,
])
export type ClubeJobResult = z.infer<typeof ClubeJobResultSchema>

export const ClubeExportResultSchema = z.union([
  /** The file written in the project, absolute. */
  z.object({ ok: z.literal(true), path: z.string() }),
  ClubeLibraryFailureSchema,
])
export type ClubeExportResult = z.infer<typeof ClubeExportResultSchema>

export const ClubeSkillInstallResultSchema = z.union([
  z.object({ ok: z.literal(true), name: z.string() }),
  ClubeLibraryFailureSchema,
])
export type ClubeSkillInstallResult = z.infer<typeof ClubeSkillInstallResultSchema>

export const ClubeSimpleResultSchema = z.union([
  z.object({ ok: z.literal(true) }),
  ClubeLibraryFailureSchema,
])
export type ClubeSimpleResult = z.infer<typeof ClubeSimpleResultSchema>
