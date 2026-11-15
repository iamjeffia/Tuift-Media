import { describe, expect, it } from 'vitest'
import { markdownSliceEnds } from './markdown-slices.js'

const paragraph = (index: number) => `Paragraph ${index} ${'word '.repeat(40)}\n\n`

describe('markdownSliceEnds', () => {
  it('keeps a short text in one slice', () => {
    const text = '# Title\n\nSome text.\n'
    expect(markdownSliceEnds(text)).toEqual([text.length])
    expect(markdownSliceEnds('')).toEqual([0])
  })

  it('cuts a long text at blank lines and covers all of it', () => {
    const text = Array.from({ length: 2_000 }, (_, index) => paragraph(index)).join('')
    const ends = markdownSliceEnds(text)

    expect(ends.length).toBeGreaterThan(1)
    expect(ends.at(-1)).toBe(text.length)
    for (const end of ends.slice(0, -1)) expect(text.slice(end - 2, end)).toBe('\n\n')
    expect(ends).toEqual([...ends].sort((a, b) => a - b))
  })

  it('never cuts inside a code fence', () => {
    const code = `\`\`\`ts\n${'const a = 1\n\n'.repeat(8_000)}\`\`\`\n\n`
    const text = `${paragraph(0)}${code}${paragraph(1)}`
    const fenceStart = text.indexOf('```')
    const fenceEnd = text.indexOf('```\n\n', fenceStart + 3) + 5

    for (const end of markdownSliceEnds(text).slice(0, -1)) {
      expect(end <= fenceStart || end >= fenceEnd).toBe(true)
    }
  })

  it('handles CRLF line breaks', () => {
    const text = Array.from({ length: 2_000 }, (_, index) => paragraph(index))
      .join('')
      .replace(/\n/g, '\r\n')
    const ends = markdownSliceEnds(text)
    expect(ends.length).toBeGreaterThan(1)
    expect(ends.at(-1)).toBe(text.length)
  })
})
