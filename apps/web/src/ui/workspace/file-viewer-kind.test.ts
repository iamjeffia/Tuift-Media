import { describe, expect, it } from 'vitest'
import { codeLanguage, fileExtension, fileViewerKind, isMediaKind } from './file-viewer-kind.js'

describe('fileViewerKind', () => {
  it.each([
    ['README.md', 'markdown'],
    ['notes.MARKDOWN', 'markdown'],
    ['logo.PNG', 'image'],
    ['icon.svg', 'image'],
    ['reel.mp4', 'video'],
    ['take.webm', 'video'],
    ['voice.mp3', 'audio'],
    ['mix.wav', 'audio'],
    ['brief.pdf', 'pdf'],
    ['Annual REPORT.PDF', 'pdf'],
    ['src/app.ts', 'code'],
    ['Dockerfile', 'code'],
    ['archive.zip', 'code'],
    ['.gitignore', 'code'],
  ] as const)('shows %s as %s', (name, kind) => {
    expect(fileViewerKind(name)).toBe(kind)
  })

  it('treats only streamed kinds as media', () => {
    expect(isMediaKind('video')).toBe(true)
    expect(isMediaKind('pdf')).toBe(true)
    expect(isMediaKind('markdown')).toBe(false)
    expect(isMediaKind('code')).toBe(false)
  })

  it('reads the extension of the last path part only', () => {
    expect(fileExtension('dir.with.dots/readme')).toBe('')
    expect(fileExtension('C:\\work\\a.TS')).toBe('ts')
    expect(fileExtension('.env')).toBe('')
  })
})

describe('codeLanguage', () => {
  it.each([
    ['app.ts', 'typescript'],
    ['App.tsx', 'tsx'],
    ['main.py', 'python'],
    ['run.sh', 'shellscript'],
    ['ci.yml', 'yaml'],
    ['Dockerfile', 'docker'],
    ['Makefile', 'make'],
    ['theme.scss', 'scss'],
    ['view.h', 'c'],
    ['logo.svg', 'xml'],
  ])('picks the grammar for %s', (name, language) => {
    expect(codeLanguage(name)).toBe(language)
  })

  it('leaves a file without a shipped grammar plain', () => {
    expect(codeLanguage('notes.txt')).toBeUndefined()
    expect(codeLanguage('data.unknownext')).toBeUndefined()
    expect(codeLanguage('LICENSE')).toBeUndefined()
  })
})
