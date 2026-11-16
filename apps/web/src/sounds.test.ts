import { describe, expect, it } from 'vitest'
import type { UsedSound } from '@harness/contracts'
import {
  attachmentFor,
  formatSoundDuration,
  kindOf,
  NO_FILTERS,
  searchParamsFor,
  SOUNDS_PAGE,
} from './sounds.js'

describe('what a tab asks the server', () => {
  it('asks the sound shelf for a type, with the words, the category and the key', () => {
    expect(
      searchParamsFor('tonal', { ...NO_FILTERS, query: '  cello ', category: 'Drones', key: 'A' }),
    ).toEqual({
      shelf: 'sound',
      type: 'tonal',
      query: 'cello',
      category: 'Drones',
      key: 'A',
      limit: SOUNDS_PAGE,
    })
    // Effects have no key, and no tempo to filter by.
    expect(searchParamsFor('efeito', { ...NO_FILTERS, key: 'A', bpmMin: '90' })).toEqual({
      shelf: 'sound',
      type: 'efeito',
      limit: SOUNDS_PAGE,
    })
  })

  it('asks the sound shelf for soundtracks by genre, key and a BPM range', () => {
    expect(
      searchParamsFor('trilha', {
        query: '',
        category: 'Ambient',
        key: 'D',
        bpmMin: '60',
        bpmMax: '90',
      }),
    ).toEqual({
      shelf: 'sound',
      type: 'trilha',
      category: 'Ambient',
      key: 'D',
      bpmMin: 60,
      bpmMax: 90,
      limit: SOUNDS_PAGE,
    })
    // A box that is not a number asks nothing.
    expect(searchParamsFor('trilha', { ...NO_FILTERS, bpmMin: 'abc', bpmMax: '999' })).toEqual({
      shelf: 'sound',
      type: 'trilha',
      limit: SOUNDS_PAGE,
    })
  })

  it('asks the music shelf for the Clube music by genre, key and BPM, and pages', () => {
    expect(
      searchParamsFor(
        'clube',
        { query: '', category: 'Pop', key: 'Am', bpmMin: '100', bpmMax: '' },
        30,
      ),
    ).toEqual({
      shelf: 'music',
      category: 'Pop',
      key: 'Am',
      bpmMin: 100,
      limit: SOUNDS_PAGE,
      offset: 30,
    })
  })

  it('maps a tab and a music source to what is listed', () => {
    expect(kindOf('tonal', 'clube')).toBe('tonal')
    expect(kindOf('music', 'trilha')).toBe('trilha')
    expect(kindOf('music', 'clube')).toBe('clube')
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
        version: 'Slow - instrumental',
        path: '/p/audio/clube/music/Slow/Slow - instrumental.wav',
        format: 'wav',
      },
      {
        version: 'Slow - completa',
        path: '/p/audio/clube/music/Slow/Slow - completa.wav',
        format: 'wav',
      },
    ])
    expect(attachmentFor(used)).toEqual({
      path: '/p/audio/clube/music/Slow/Slow - completa.wav',
      name: 'Slow - completa.wav',
    })
  })
})
