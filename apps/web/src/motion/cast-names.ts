import type { CastId } from './cast.js'

/**
 * The characters' names and the order of the scene, apart from `cast.ts` so the
 * app can read them at start-up without loading the portraits. A test keeps the
 * two lists equal.
 */
export const CAST_NAMES: readonly (readonly [CastId, string])[] = [
  ['zig', 'Zig'],
  ['moss', 'Moss'],
  ['bun', 'Bun'],
  ['pip', 'Pip'],
  ['cloud', 'Cloud'],
  ['penny', 'Penny'],
]

/** What may follow a character's name inside a segment: "Zig - audio", "Bun (script)". */
const NAME_SEPARATOR = /^\s*[\-–—·|_(,]/

/**
 * The character a helper agent is named after. A name is read as segments split
 * on ":" and "/": the cast name must be a whole segment, the first or the last
 * one, in any case, so "Moss: references", "tuift-media:cloud" (a Claude Code
 * plugin agent: prefix, colon, name) and "team/penny" match. A name that is only
 * a cast name followed by a separator ("Zig - audio") matches too. "Mossy",
 * "Pipeline", "Cloud deploy", "tuift-media:mossy" and "cloud-team:explorer" are
 * other names.
 */
export function castIdOfName(name: string | undefined): CastId | undefined {
  const text = name?.trim().toLowerCase()
  if (!text) return undefined
  const segments = text.split(/[:/]/).map((segment) => segment.trim())
  const ends = [segments[0], segments.at(-1)]
  return CAST_NAMES.find(([, own]) => {
    const lower = own.toLowerCase()
    return (
      ends.includes(lower) ||
      (segments.length === 1 &&
        text.startsWith(lower) &&
        NAME_SEPARATOR.test(text.slice(lower.length)))
    )
  })?.[0]
}
