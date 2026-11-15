// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { setLanguage } from '../../i18n/index.js'
import { formatBytes } from './workspace-paths.js'

describe('formatBytes', () => {
  it('writes the decimal the way the language does', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB')
    setLanguage('pt-BR', { persist: false })
    expect(formatBytes(1536)).toBe('1,5 KB')
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2,5 MB')
  })
})
