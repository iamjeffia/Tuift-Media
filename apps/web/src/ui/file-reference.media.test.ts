import { describe, expect, it } from 'vitest'
import { fileReferenceKind, isInlineFileReference } from './file-reference.js'

describe('media file references', () => {
  it.each([
    ['out/final.mp4', 'video'],
    ['clips/take.MOV', 'video'],
    ['audio/voice.wav', 'audio'],
    ['audio/track.mp3', 'audio'],
    ['docs/brief.pdf', 'pdf'],
  ] as const)('names %s a %s file, so a reply that cites it can open it', (path, kind) => {
    expect(fileReferenceKind(path)).toBe(kind)
    expect(isInlineFileReference(path)).toBe(true)
  })

  it('keeps a command that merely mentions one as code', () => {
    expect(isInlineFileReference('ffmpeg -i in.mp4')).toBe(false)
  })
})
