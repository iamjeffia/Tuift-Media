import type {
  SoundFacetsResult,
  SoundFailure,
  SoundItem,
  SoundPreviewResult,
  SoundSearchParams,
  SoundSearchResult,
  SoundSettings,
  SoundUseResult,
} from '@harness/contracts'

/**
 * The Clube's sound library as the design sandbox answers it: made-up names, a short sine as every
 * preview, and no file anywhere. `?sounds=` picks what it answers, for screens and tests:
 * `empty`, `error`, `slow` (never answers), `rate` (the per-minute limit), `spent` (the day's files
 * are used up), `almost` (three files left); `?soundsFolder=1` starts with a folder chosen and
 * `?soundsOff=1` with the library turned off.
 */

const sound = (
  id: string,
  name: string,
  type: 'tonal' | 'efeito',
  durationS: number,
  extra: Partial<SoundItem> = {},
): SoundItem => ({ id, name, shelf: 'sound', type, durationS, ...extra })

const SOUNDS: SoundItem[] = [
  sound('t1', 'Cello drone', 'tonal', 42, {
    key: 'A',
    mode: 'menor',
    category: 'Drones',
    lufs: -23,
  }),
  sound('t2', 'Warm pad swell', 'tonal', 18.4, {
    key: 'A',
    mode: 'menor',
    category: 'Pads',
    lufs: -21,
  }),
  sound('t3', 'Piano loop, slow', 'tonal', 16, {
    key: 'C',
    mode: 'maior',
    category: 'Loops',
    bpm: 90,
  }),
  sound('t4', 'Felt piano melody', 'tonal', 24, { key: 'C', mode: 'maior', category: 'Melodias' }),
  sound('t5', 'Low hit with tail', 'tonal', 4, {
    key: 'A',
    mode: 'menor',
    category: 'Hits',
    lufs: -16,
  }),
  sound('t6', 'Riser, eight seconds', 'tonal', 8, { key: 'E', mode: 'menor', category: 'Risers' }),
  sound('t7', 'Strings pulse', 'tonal', 32, {
    key: 'D',
    mode: 'menor',
    category: 'Loops',
    bpm: 110,
  }),
  sound('t8', 'Glass bells', 'tonal', 12, { key: 'G', mode: 'maior', category: 'Melodias' }),
  sound('e1', 'Whoosh, fast', 'efeito', 1.2, { category: 'Whoosh' }),
  sound('e2', 'Soft click', 'efeito', 0.2, { category: 'Interface' }),
  sound('e3', 'Card slide in', 'efeito', 0.6, { category: 'Interface' }),
  sound('e4', 'Impact, deep', 'efeito', 2.8, { category: 'Impactos' }),
  sound('e5', 'Paper turn', 'efeito', 0.9, { category: 'Objetos' }),
  sound('e6', 'Keyboard burst', 'efeito', 3.4, { category: 'Objetos' }),
]

const music = (
  id: string,
  name: string,
  artist: string,
  genre: string,
  mood: string,
  key: string,
  bpm: number,
  durationS: number,
): SoundItem => ({
  id,
  name,
  shelf: 'music',
  artist,
  category: genre,
  mood,
  key,
  bpm,
  durationS,
})

const MUSIC: SoundItem[] = [
  music('m1', 'Slow burn', 'Artista Um', 'Cinematográfica', 'Tenso', 'Am', 84, 128),
  music('m2', 'Bright morning', 'Artista Dois', 'Pop', 'Alegre', 'C', 120, 96),
  music('m3', 'Night drive', 'Artista Três', 'Eletrônica', 'Noturno', 'Dm', 102, 154),
  music('m4', 'Soft landing', 'Artista Um', 'Ambiente', 'Calmo', 'F', 70, 181),
]

const DAILY = { sound: 200, music: 60 } as const

export class DemoSounds {
  #settings: SoundSettings
  #used = { sound: 0, music: 0 }
  readonly #mode: string | null

  constructor(search: string) {
    const query = new URLSearchParams(search)
    this.#mode = query.get('sounds')
    this.#settings = {
      enabled: query.get('soundsOff') !== '1',
      ...(query.get('soundsFolder') === '1' ? { ownFolder: 'D:\\Sons\\meus-sons' } : {}),
    }
    if (this.#mode === 'spent') this.#used = { sound: DAILY.sound, music: DAILY.music }
    if (this.#mode === 'almost') this.#used = { sound: DAILY.sound - 3, music: DAILY.music - 3 }
  }

  settings(): SoundSettings {
    return this.#settings
  }

  update(patch: { enabled?: boolean | undefined; ownFolder?: string | null | undefined }) {
    const next: SoundSettings = { enabled: patch.enabled ?? this.#settings.enabled }
    const folder = patch.ownFolder === undefined ? this.#settings.ownFolder : patch.ownFolder
    if (folder) next.ownFolder = folder
    this.#settings = next
    return next
  }

  #daily(shelf: 'sound' | 'music') {
    return { used: this.#used[shelf], limit: DAILY[shelf] }
  }

  #failure(): SoundFailure | undefined {
    if (this.#mode === 'error') return { ok: false, reason: 'unreachable' }
    if (this.#mode === 'rate') return { ok: false, reason: 'rate-limit', retryAfterS: 24 }
    return undefined
  }

  async search(params: SoundSearchParams): Promise<SoundSearchResult> {
    if (this.#mode === 'slow') return new Promise(() => {})
    const failure = this.#failure()
    if (failure) return failure
    const query = (params.query ?? '').toLowerCase()
    const pool =
      params.shelf === 'music' ? MUSIC : SOUNDS.filter((item) => item.type === params.type)
    const found =
      this.#mode === 'empty'
        ? []
        : pool.filter(
            (item) =>
              (!query ||
                [item.name, item.category, item.artist, item.mood]
                  .join(' ')
                  .toLowerCase()
                  .includes(query)) &&
              (!params.category || item.category === params.category) &&
              (!params.key || item.key === params.key),
          )
    const offset = params.offset ?? 0
    return {
      ok: true,
      total: found.length,
      offset,
      items: found.slice(offset, offset + (params.limit ?? 30)),
      daily: this.#daily(params.shelf),
    }
  }

  facets(): SoundFacetsResult {
    const failure = this.#failure()
    if (failure && this.#mode === 'error') return failure
    const count = (items: SoundItem[], type: string) => {
      const categories = new Map<string, number>()
      for (const item of items) {
        if (item.category) categories.set(item.category, (categories.get(item.category) ?? 0) + 1)
      }
      return [...categories].map(([category, total]) => ({ type, category, total }))
    }
    return {
      ok: true,
      total: SOUNDS.length + MUSIC.length,
      categories: [
        ...count(
          SOUNDS.filter((item) => item.type === 'tonal'),
          'tonal',
        ),
        ...count(
          SOUNDS.filter((item) => item.type === 'efeito'),
          'efeito',
        ),
        ...count(MUSIC, 'trilha'),
      ],
      keys: ['A', 'C', 'D', 'E', 'G'],
      daily: this.#daily('sound'),
    }
  }

  preview(): SoundPreviewResult {
    return { ok: true, mime: 'audio/wav', data: sineWave() }
  }

  use(shelf: 'sound' | 'music', id: string): SoundUseResult {
    if (this.#used[shelf] >= DAILY[shelf]) {
      return { ok: false, reason: 'daily-limit', daily: this.#daily(shelf) }
    }
    const item = [...SOUNDS, ...MUSIC].find((entry) => entry.id === id && entry.shelf === shelf)
    if (!item) return { ok: false, reason: 'not-found' }
    this.#used[shelf] += 1
    const folder = ['C:', 'Users', 'demo', 'tuift', 'audio', 'clube'].join('\\')
    const file = `${folder}\\${item.name}.${shelf === 'music' ? 'wav' : 'flac'}`
    return {
      ok: true,
      sound: {
        path: file,
        name: `${item.name}.${shelf === 'music' ? 'wav' : 'flac'}`,
        format: shelf === 'music' ? 'wav' : 'flac',
        ...(item.durationS === undefined ? {} : { durationS: item.durationS }),
        reused: false,
        files: [{ version: 'Full', path: file, format: shelf === 'music' ? 'wav' : 'flac' }],
      },
      daily: this.#daily(shelf),
    }
  }
}

/** Half a second of a 440 Hz sine as a mono 8-bit WAV, base64: enough for the player to play. */
function sineWave(): string {
  const rate = 8_000
  const samples = rate / 2
  const bytes = new Uint8Array(44 + samples)
  const view = new DataView(bytes.buffer)
  const text = (at: number, value: string) => {
    for (let index = 0; index < value.length; index += 1)
      bytes[at + index] = value.charCodeAt(index)
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples, true)
  text(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 8, true)
  text(36, 'data')
  view.setUint32(40, samples, true)
  for (let index = 0; index < samples; index += 1) {
    bytes[44 + index] = 128 + Math.round(60 * Math.sin((2 * Math.PI * 440 * index) / rate))
  }
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
