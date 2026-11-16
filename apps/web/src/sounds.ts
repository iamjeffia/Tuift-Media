import type { SoundSearchParams, UsedSound } from '@harness/contracts'
import type { PickedAttachment } from './bridge.js'
import type { Language } from './i18n/index.js'

/**
 * What the Sounds tab can list. Three tabs (tonal sounds, effects, music) and, under Music, two
 * sources: the soundtracks (`trilha`, sounds of the library: one MP3 each, key and BPM estimated,
 * counted with the sounds) and the Clube's music (full songs with instrumental and vocal versions,
 * counted apart, key and BPM catalogued).
 */
export type SoundTab = 'tonal' | 'efeito' | 'music'
export const SOUND_TABS: readonly SoundTab[] = ['tonal', 'efeito', 'music']
export type MusicSource = 'trilha' | 'clube'
export const MUSIC_SOURCES: readonly MusicSource[] = ['trilha', 'clube']
export type SoundKind = 'tonal' | 'efeito' | 'trilha' | 'clube'

export function kindOf(tab: SoundTab, source: MusicSource): SoundKind {
  return tab === 'music' ? (source === 'trilha' ? 'trilha' : 'clube') : tab
}

/** How many rows a page of results holds. */
export const SOUNDS_PAGE = 30

export type SoundFilters = {
  query: string
  category: string
  key: string
  /** What is typed in the BPM boxes; a number, or nothing. */
  bpmMin: string
  bpmMax: string
}
export const NO_FILTERS: SoundFilters = { query: '', category: '', key: '', bpmMin: '', bpmMax: '' }

const bpm = (value: string): number | undefined => {
  const parsed = Number(value)
  return value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed <= 400
    ? parsed
    : undefined
}

/** What a tab and its filters ask the server, starting at `offset`. */
export function searchParamsFor(
  kind: SoundKind,
  filters: SoundFilters,
  offset = 0,
): SoundSearchParams {
  const query = filters.query.trim()
  const min = bpm(filters.bpmMin)
  const max = bpm(filters.bpmMax)
  const tempo = kind === 'trilha' || kind === 'clube'
  return {
    shelf: kind === 'clube' ? 'music' : 'sound',
    ...(kind === 'clube' ? {} : { type: kind }),
    ...(query ? { query } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    // Effects have no key.
    ...(kind !== 'efeito' && filters.key ? { key: filters.key } : {}),
    ...(tempo && min !== undefined ? { bpmMin: min } : {}),
    ...(tempo && max !== undefined ? { bpmMax: max } : {}),
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
      ? (files.find((file) => /completa|full/i.test(file.version)) ?? files[0])
      : files[0]
  const path = pick?.path ?? sound.path
  return { path, name: path.split(/[\\/]/).at(-1) ?? sound.name }
}
