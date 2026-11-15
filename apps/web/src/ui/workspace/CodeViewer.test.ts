import { describe, expect, it } from 'vitest'
import { indexTextLines } from '../text-line-index.js'
import { chunkStarts } from './CodeViewer.js'

const chunks = (content: string) => chunkStarts(content, indexTextLines(content))

describe('chunkStarts', () => {
  it('keeps a short file in one chunk', () => {
    expect(chunks('a\nb\nc\n')).toEqual([0])
    expect(chunks('')).toEqual([0])
  })

  it('cuts a long file into chunks of whole lines that cover every line once', () => {
    const content = Array.from(
      { length: 10_000 },
      (_, line) => `const value${line} = ${line}`,
    ).join('\n')
    const starts = chunks(content)
    expect(starts[0]).toBe(0)
    expect(starts.length).toBeGreaterThan(10)
    expect([...starts].sort((a, b) => a - b)).toEqual(starts)
    expect(new Set(starts).size).toBe(starts.length)
    expect(starts.at(-1)!).toBeLessThan(10_000)
  })

  it('keeps each chunk under the highlighter ceiling even for long lines', () => {
    const content = Array.from({ length: 200 }, () => 'x'.repeat(2_000)).join('\n')
    const lines = indexTextLines(content)
    const starts = chunkStarts(content, lines)
    for (let index = 0; index < starts.length; index += 1) {
      const from = lines[starts[index]!]!
      const to = lines[starts[index + 1] ?? lines.length] ?? content.length
      expect(to - from).toBeLessThanOrEqual(64 * 1024)
    }
  })
})
