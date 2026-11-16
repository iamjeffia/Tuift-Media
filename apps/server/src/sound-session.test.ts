import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { modeSessionStart } from './motion-session.js'
import { detectProjectSounds, soundsSentence, SOUND_TOOL_NAMES } from './sound-session.js'
import { SOUND_TOOLS } from './sound-tools.js'

const folders: string[] = []
afterEach(() => {
  for (const folder of folders.splice(0))
    rmSync(folder, { recursive: true, force: true, maxRetries: 3 })
})

function project(files: string[]): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'tc-own-sounds-'))
  folders.push(root)
  for (const file of files) {
    const target = path.join(root, ...file.split('/'))
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, '')
  }
  return root
}

describe('finding the sounds a project already has', () => {
  it('counts audio files in the usual folders and the folders in them, and picks the fullest', () => {
    const root = project([
      'audio/voz.wav',
      'audio/musica/base.mp3',
      'audio/musica/loops/a.flac',
      'audio/musica/loops/deep/too-deep.wav',
      'audio/notes.txt',
      'sfx/a.wav',
    ])
    expect(detectProjectSounds(root)).toEqual({ dir: 'audio', files: 2 })
  })

  it('does not take what the library fetched for the project own', () => {
    expect(
      detectProjectSounds(project(['audio/clube/Cello.flac', 'audio/clube/music/x/a.wav'])),
    ).toBeUndefined()
    expect(detectProjectSounds(project(['audio/clube/Cello.flac', 'audio/mine.wav']))).toEqual({
      dir: 'audio',
      files: 1,
    })
  })

  it('finds nothing in a project without audio, and costs a bounded look when it has many', () => {
    expect(detectProjectSounds(project(['src/index.ts', 'README.md']))).toBeUndefined()
    expect(detectProjectSounds(path.join(os.tmpdir(), 'tc-does-not-exist-sounds'))).toBeUndefined()
    const crowded = project(Array.from({ length: 600 }, (_, index) => `audio/take-${index}.wav`))
    const found = detectProjectSounds(crowded)
    expect(found?.dir).toBe('audio')
    expect(found!.files).toBeLessThanOrEqual(400)
  })
})

describe('the sentence a Motion role carries about sounds', () => {
  it.each([
    ['tools', 'is available through the tools'],
    ['panel', 'Sounds tab of the side panel'],
    ['off', 'turned the app'],
    ['unlinked', 'needs a Clube do Motion account linked'],
    ['no-subscription', 'has no subscription'],
  ] as const)('says the right thing when the library is %s', (library, phrase) => {
    const text = soundsSentence({ library })
    expect(text).toContain(phrase)
    // The tools are named only where they exist, and as a thing not to call where they are closed.
    for (const name of SOUND_TOOL_NAMES)
      expect(SOUND_TOOLS.map((tool) => tool.name)).toContain(name)
  })

  it("puts the project's own sounds first and the person's folder after the library", () => {
    const text = soundsSentence({
      library: 'tools',
      own: { dir: 'audio', files: 12 },
      folder: 'D:\\Sons\\meus',
    })
    expect(text.indexOf('has its own sounds in audio/')).toBeLessThan(text.indexOf('sound library'))
    expect(text.indexOf('sound library')).toBeLessThan(text.indexOf('D:\\Sons\\meus'))
    expect(text).toContain('nothing in it is indexed or copied')
  })

  it('stays short', () => {
    expect(soundsSentence({ library: 'tools' }).length).toBeLessThan(500)
    expect(
      soundsSentence({
        library: 'tools',
        own: { dir: 'audio', files: 12 },
        folder: 'D:\\Sons\\meus',
      }).length,
    ).toBeLessThan(700)
  })

  it('is part of the Motion role only when the session gives it, and only in Motion', () => {
    const load = () => undefined
    const plain = modeSessionStart('motion', false, load)!.instructions
    expect(plain).not.toContain('sound library')
    const withSounds = modeSessionStart('motion', false, load, true, undefined, {
      library: 'tools',
    })!.instructions
    expect(withSounds).toContain('sound_search')
    // After the role's own lines, before its closing line about approvals.
    expect(withSounds.indexOf('sound_search')).toBeLessThan(withSounds.indexOf('The final wording'))
    expect(
      modeSessionStart(undefined, false, load, true, undefined, { library: 'tools' }),
    ).toBeUndefined()
  })
})
