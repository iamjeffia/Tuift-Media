import { describe, expect, it } from 'vitest'
import type { UsedSound } from '@harness/contracts'
import {
  attachmentFor,
  formatSoundDuration,
  NO_FILTERS,
  searchParamsFor,
  SOUNDS_PAGE,
} from './sounds.js'

describe('what a tab asks the server', () => {
  it('asks the sound shelf for a type, with the words, the category and the key', () => {
    expect(searchParamsFor('tonal', { query: '  cello ', category: 'Drones', key: 'A' })).toEqual({
      shelf: 'sound',
      type: 'tonal',
      query: 'cello',
      category: 'Drones',
      key: 'A',
      limit: SOUNDS_PAGE,
    })
    expect(searchParamsFor('efeito', { ...NO_FILTERS, key: 'A' })).toEqual({
      shelf: 'sound',
      type: 'efeito',
      limit: SOUNDS_PAGE,
    })
  })

  it('asks the music shelf for a genre, never filters a track by a single sound key, and pages', () => {
    expect(searchParamsFor('music', { query: '', category: 'Pop', key: 'A' }, 30)).toEqual({
      shelf: 'music',
      category: 'Pop',
      limit: SOUNDS_PAGE,
      offset: 30,
    })
  })
})

describe('how long a sound is', () => {
  it('says a short one in seconds and a longer one in minutes', () => {
    expect(formatSoundDuration(0.2, 'en')).toBe('0.2 s')
    expect(formatSoundDuration(1.24, 'pt-BR')).toBe('1,2 s')
    expect(formatSoundDuration(42, 'en')).toBe('0:42')
    expect(formatSoundDuration(128, 'pt-BR')).toBe('2:08')
  })
})

describe('what a used sound puts in the prompt box', () => {
  const sound = (files: UsedSound['files'], path = 'C:\\p\\audio\\clube\\x'): UsedSound => ({
    path,
    name: 'x',
    format: 'wav',
    reused: false,
    files,
  })

  it('is the file of a single sound', () => {
    const used = sound(
      [{ version: 'file', path: 'C:\\p\\audio\\clube\\Cello.flac', format: 'flac' }],
      'C:\\p\\audio\\clube\\Cello.flac',
    )
    expect(attachmentFor(used)).toEqual({
      path: 'C:\\p\\audio\\clube\\Cello.flac',
      name: 'Cello.flac',
    })
  })

  it('is the full mix of a track, the others sitting beside it', () => {
    const used = sound([
      {
        version: 'Slow - No drums',
        path: '/p/audio/clube/music/Slow/Slow - No drums.wav',
        format: 'wav',
      },
      { version: 'Slow - Full', path: '/p/audio/clube/music/Slow/Slow - Full.wav', format: 'wav' },
    ])
    expect(attachmentFor(used)).toEqual({
      path: '/p/audio/clube/music/Slow/Slow - Full.wav',
      name: 'Slow - Full.wav',
    })
  })
})
