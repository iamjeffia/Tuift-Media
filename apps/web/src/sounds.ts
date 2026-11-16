import type { SoundSearchParams, SoundType, UsedSound } from '@harness/contracts'
import type { PickedAttachment } from './bridge.js'
import type { Language } from './i18n/index.js'

/** The three tabs of the Sounds tab: the library's two kinds of single sound, and its music. */
export type SoundKind = 'tonal' | 'efeito' | 'music'
export const SOUND_KINDS: readonly SoundKind[] = ['tonal', 'efeito', 'music']

/** How many rows a page of results holds. */
export const SOUNDS_PAGE = 30

export type SoundFilters = { query: string; category: string; key: string }
export const NO_FILTERS: SoundFilters = { query: '', category: '', key: '' }

/** What a tab and its filters ask the server, starting at `offset`. */
export function searchParamsFor(
  kind: SoundKind,
  filters: SoundFilters,
  offset = 0,
): SoundSearchParams {
  const query = filters.query.trim()
  return {
    shelf: kind === 'music' ? 'music' : 'sound',
    ...(kind === 'music' ? {} : { type: kind satisfies SoundType }),
    ...(query ? { query } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    // A music key is the Clube's estimate in its own notation; only a single sound is filtered by key.
    ...(kind === 'tonal' && filters.key ? { key: filters.key } : {}),
    limit: SOUNDS_PAGE,
    ...(offset > 0 ? { offset } : {}),
  }
}

/**
 * The length of a sound the way it is read: a short one in seconds with a decimal, a longer one
 * as minutes and seconds.
 */
export function formatSoundDuration(seconds: number, language: Language): string {
  if (seconds < 10) {
    return `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(seconds)} s`
  }
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/**
 * The file a used sound puts in the prompt box: a single sound is its file; a track brings
 * several versions, and the full mix is the one to attach (the others sit beside it).
 */
export function attachmentFor(sound: UsedSound): PickedAttachment {
  const files = sound.files
  const pick =
    sound.files.length > 1
      ? (files.find((file) => /full/i.test(file.version)) ?? files[0])
      : files[0]
  const path = pick?.path ?? sound.path
  return { path, name: path.split(/[\\/]/).at(-1) ?? sound.name }
}
