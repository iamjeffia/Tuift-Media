import { z } from 'zod'

/** The Clube do Motion plans an account can be on, as the Clube names them. */
export const ClubePlanSchema = z.enum(['mensal', 'anual', 'teste', 'grátis'])
export type ClubePlan = z.infer<typeof ClubePlanSchema>

/** Why a link is not (or no longer) working. The screen words each one; the server never sends prose. */
export const ClubeFailureSchema = z.enum([
  /** The person closed the Clube's page without allowing, or the Clube refused the sign-in. */
  'denied',
  /** Nobody finished the sign-in in time. */
  'timeout',
  /** The answer did not match this sign-in (wrong state or code), so it was ignored. */
  'mismatch',
  /** The Clube could not be reached. */
  'unreachable',
  /** The Clube refused to renew the access, so the app unlinked itself. */
  'unlinked',
  /** Anything else; the details stay in the server's log without any token. */
  'failed',
])
export type ClubeFailure = z.infer<typeof ClubeFailureSchema>

/**
 * What the screens know about the link. Never a token: the phone, the page and
 * every log see this and nothing more.
 */
export const ClubeStatusSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('disconnected'), failure: ClubeFailureSchema.optional() }),
  z.object({ state: z.literal('connecting') }),
  z.object({
    state: z.literal('connected'),
    /** Absent while the account could not be read (the Clube was unreachable). */
    account: z.object({ name: z.string(), email: z.string(), plan: ClubePlanSchema }).optional(),
    /** The plan includes the MCP server and the API; false for a free account. */
    subscriber: z.boolean().optional(),
  }),
])
export type ClubeStatus = z.infer<typeof ClubeStatusSchema>

/** The Clube's public address and the plans page a free account is sent to. */
export const CLUBE_URL = 'https://clubedomotion.com'
export const CLUBE_PLANS_URL = `${CLUBE_URL}/planos`
