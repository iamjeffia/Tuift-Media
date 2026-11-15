/** What the first slice and each later one aim for, in characters of Markdown source. */
const FIRST_SLICE_CHARACTERS = 6_000
const SLICE_CHARACTERS = 16_000

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/

/**
 * Offsets that cut a Markdown text at blank lines outside code fences, so the preview can
 * render it a slice at a time: each one ends the text it covers, the last is the text's length.
 * A text shorter than the first slice is a single one.
 */
export function markdownSliceEnds(text: string): number[] {
  const ends: number[] = []
  let sliceStart = 0
  let budget = FIRST_SLICE_CHARACTERS
  let fence: { marker: string; length: number } | undefined
  let position = 0
  while (position < text.length) {
    let lineEnd = text.indexOf('\n', position)
    if (lineEnd < 0) lineEnd = text.length
    const line = text.slice(position, lineEnd).replace(/\r$/, '')
    const match = FENCE.exec(line)
    if (match) {
      const marker = match[1]![0]!
      const length = match[1]!.length
      if (!fence) fence = { marker, length }
      else if (marker === fence.marker && length >= fence.length && match[2]!.trim() === '') {
        fence = undefined
      }
    }
    position = Math.min(lineEnd + 1, text.length)
    if (!fence && line.trim() === '' && position - sliceStart >= budget) {
      ends.push(position)
      sliceStart = position
      budget = SLICE_CHARACTERS
    }
  }
  if (ends.at(-1) !== text.length) ends.push(text.length)
  return ends
}
