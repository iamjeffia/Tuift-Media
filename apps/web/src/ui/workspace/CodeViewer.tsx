import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { HighlightOptions } from 'streamdown'
import { formatNumber } from '../../i18n/index.js'
import { DARK_THEME, LIGHT_THEME } from '../highlighter-config.js'
import type { HighlightResult } from '../highlighter-protocol.js'
import { shikiPlugin } from '../highlighter.js'
import { indexedTextLine, indexTextLines } from '../text-line-index.js'

const LINE_HEIGHT = 22
/** A chunk is what one highlight request covers: under the highlighter's own 64 KB ceiling. */
const CHUNK_LINES = 240
const CHUNK_CHARACTERS = 40_000
/** A longer line (a minified bundle) is cut: laying out one huge line freezes the tab. */
export const MAX_DISPLAY_LINE = 4_000
/** Chunks kept coloured while scrolling; older ones are highlighted again if revisited. */
const KEPT_CHUNKS = 48

type Token = HighlightResult['tokens'][number][number]
type ChunkTokens = HighlightResult['tokens']

/** Where each highlight chunk starts: whole lines, never more than the chunk budget. */
export function chunkStarts(content: string, lines: Uint32Array): number[] {
  const starts = [0]
  let characters = 0
  for (let line = 0; line < lines.length; line += 1) {
    const start = lines[line]!
    const end = lines[line + 1] ?? content.length + 1
    characters += end - start
    const next = line + 1
    if (
      next < lines.length &&
      (next - starts.at(-1)! >= CHUNK_LINES || characters >= CHUNK_CHARACTERS)
    ) {
      starts.push(next)
      characters = 0
    }
  }
  return starts
}

function chunkOf(starts: readonly number[], line: number): number {
  let low = 0
  let high = starts.length - 1
  while (low < high) {
    const middle = (low + high + 1) >> 1
    if (starts[middle]! <= line) low = middle
    else high = middle - 1
  }
  return low
}

function hasColors(tokens: ChunkTokens): boolean {
  return tokens.some((line) => line.some((token) => token.color || token.htmlStyle))
}

/**
 * Colours the lines in view and a chunk around them, off the main thread (the app's Shiki
 * worker). Each chunk is highlighted alone, so a block comment that spans two chunks loses
 * its colour at the seam: the price of not parsing a multi-megabyte file in one go.
 */
function useChunkColors(
  content: string,
  language: string | undefined,
  starts: readonly number[],
  lines: Uint32Array,
  wanted: { first: number; last: number } | undefined,
): ReadonlyMap<number, ChunkTokens> {
  const colored = useRef(new Map<number, ChunkTokens>())
  const requested = useRef(new Set<number>())
  // An answer for an earlier text or grammar must not colour the current one.
  const generation = useRef(0)
  const [, setVersion] = useState(0)

  useEffect(() => {
    generation.current += 1
    colored.current.clear()
    requested.current.clear()
    setVersion((current) => current + 1)
  }, [content, language])

  const first = wanted ? chunkOf(starts, wanted.first) : -1
  const last = wanted ? Math.min(starts.length - 1, chunkOf(starts, wanted.last) + 1) : -1
  useEffect(() => {
    if (!language || first < 0) return
    const mine = generation.current
    for (let chunk = first; chunk <= last; chunk += 1) {
      if (requested.current.has(chunk)) continue
      requested.current.add(chunk)
      const startLine = starts[chunk]!
      const endLine = starts[chunk + 1] ?? lines.length
      const code = content.slice(
        lines[startLine]!,
        endLine < lines.length ? lines[endLine]! - 1 : content.length,
      )
      const accept = (result: HighlightResult) => {
        if (generation.current !== mine || !hasColors(result.tokens)) return
        colored.current.set(chunk, result.tokens)
        // Oldest first: a Map iterates in insertion order. A dropped chunk can be asked for again.
        while (colored.current.size > KEPT_CHUNKS) {
          const oldest = colored.current.keys().next().value
          if (oldest === undefined) break
          colored.current.delete(oldest)
          requested.current.delete(oldest)
        }
        setVersion((current) => current + 1)
      }
      const immediate = shikiPlugin.highlight(
        {
          code,
          language: language as HighlightOptions['language'],
          themes: [LIGHT_THEME, DARK_THEME],
        },
        accept,
      )
      if (immediate) accept(immediate)
    }
  }, [content, first, language, last, lines, starts])

  return colored.current
}

function tokenStyle(token: Token): CSSProperties | undefined {
  const style: Record<string, string> = {}
  if (token.color) style['--sdm-c'] = token.color
  for (const [name, value] of Object.entries(token.htmlStyle ?? {})) {
    style[name === 'color' ? '--sdm-c' : name] = value
  }
  return Object.keys(style).length ? style : undefined
}

const CodeLine = memo(function CodeLine(props: {
  number: number
  top: number
  text: string
  tokens: Token[] | undefined
}) {
  const cut = props.text.length > MAX_DISPLAY_LINE
  return (
    <div className="workspace-code__line" style={{ transform: `translateY(${props.top}px)` }}>
      <span>{props.number}</span>
      <code>
        {cut
          ? `${props.text.slice(0, MAX_DISPLAY_LINE)}… (${formatNumber(props.text.length - MAX_DISPLAY_LINE)} more characters)`
          : props.tokens
            ? props.tokens.map((token, index) => (
                <span key={index} style={tokenStyle(token)}>
                  {token.content}
                </span>
              ))
            : props.text || ' '}
      </code>
    </div>
  )
})

/** Line numbers, Shiki colours and a window of rows: a multi-megabyte file opens at once. */
export function CodeViewer(props: { content: string; language?: string | undefined }) {
  const scroller = useRef<HTMLDivElement>(null)
  const lines = useMemo(() => indexTextLines(props.content), [props.content])
  const starts = useMemo(() => chunkStarts(props.content, lines), [lines, props.content])
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => LINE_HEIGHT,
    overscan: 24,
  })
  const rows = virtualizer.getVirtualItems()
  const firstRow = rows[0]?.index
  const lastRow = rows.at(-1)?.index
  const wanted = useMemo(
    () =>
      firstRow === undefined || lastRow === undefined
        ? undefined
        : { first: firstRow, last: lastRow },
    [firstRow, lastRow],
  )
  const chunks = useChunkColors(props.content, props.language, starts, lines, wanted)

  return (
    <div ref={scroller} className="workspace-code" tabIndex={0}>
      <div className="workspace-code__canvas" style={{ height: virtualizer.getTotalSize() }}>
        {rows.map((row) => {
          const chunk = chunkOf(starts, row.index)
          const tokens = chunks.get(chunk)?.[row.index - starts[chunk]!]
          return (
            <CodeLine
              key={row.key}
              number={row.index + 1}
              top={row.start}
              text={indexedTextLine(props.content, lines, row.index)}
              tokens={tokens}
            />
          )
        })}
      </div>
    </div>
  )
}
