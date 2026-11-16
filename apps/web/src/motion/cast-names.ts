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

/** What may follow a character's name in a helper's name: "Moss: references", "Zig - audio". */
const NAME_SEPARATOR = /^\s*[:\-–—/·|_(,]/

/**
 * The character a helper agent is named after: the whole name, or the name
 * followed by a separator, in any case. "Mossy", "Pipeline" and "Cloud deploy"
 * are other names and light nobody.
 */
export function castIdOfName(name: string | undefined): CastId | undefined {
  const text = name?.trim().toLowerCase()
  if (!text) return undefined
  return CAST_NAMES.find(([, own]) => {
    const lower = own.toLowerCase()
    return (
      text === lower || (text.startsWith(lower) && NAME_SEPARATOR.test(text.slice(lower.length)))
    )
  })?.[0]
}
