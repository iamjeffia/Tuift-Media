import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../motion/motion-strip.css', import.meta.url), 'utf8')
const appCss = readFileSync(new URL('./app.css', import.meta.url), 'utf8')
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

function keyframes(name: string): string[] {
  const body = css.match(new RegExp(`@keyframes ${name} \\{(?<body>[\\s\\S]*?)\\n\\}`))?.groups?.[
    'body'
  ]
  expect(body).toBeDefined()
  return Array.from(body!.matchAll(/^\s*([a-z-]+):/gm), (match) => match[1] ?? '')
}

describe('Motion team in the status strip: styles', () => {
  it('animates only transform and opacity', () => {
    for (const name of ['motion-strip-in', 'motion-strip-arrive', 'motion-strip-leave'])
      expect(new Set(keyframes(name)).size).toBeGreaterThan(0)
    expect(new Set(keyframes('motion-strip-arrive'))).toEqual(new Set(['opacity', 'transform']))
    expect(new Set(keyframes('motion-strip-leave'))).toEqual(new Set(['opacity', 'transform']))
    expect(new Set(keyframes('motion-strip-in'))).toEqual(new Set(['opacity']))
    const transitioned = Array.from(
      css.matchAll(/transition:\s*([^;]+);/g),
      (match) => match[1] ?? '',
    )
      .join(' ')
      .match(/\b(?:opacity|transform|height|width|top|left|margin|padding)\b/g)
    expect(new Set(transitioned)).toEqual(new Set(['opacity', 'transform']))
  })

  it('uses the app motion tokens and no timing of its own but the scene’s breath', () => {
    const durations = Array.from(css.matchAll(/animation:\s*([^;]+);/g), (match) => match[1] ?? '')
    for (const animation of durations) {
      expect(animation).toMatch(
        /var\(--dur-fast\) var\(--ease-out\)|motion-cast-breathe 1\.6s|none/,
      )
    }
  })

  it('breathes only the leading head and pauses behind Settings with the exact looping selector', () => {
    const loop =
      '.motion-strip[data-running] .motion-cast__member[data-current] .motion-cast__head::before'
    expect(css.match(/animation: motion-cast-breathe/g)).toHaveLength(1)
    expect(css).toContain(`${loop} {\n  animation: motion-cast-breathe`)
    expect(css).toMatch(
      /\.shell__body\[data-covered\]\s+\.motion-strip\[data-running\]\s+\.motion-cast__member\[data-current\]\s+\.motion-cast__head::before \{\s*animation-play-state: paused !important;/,
    )
  })

  it('does nothing under prefers-reduced-motion', () => {
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced).toContain('.motion-strip,')
    expect(reduced).toContain(
      '.motion-strip[data-running] .motion-cast__member[data-current] .motion-cast__head::before',
    )
    expect(reduced).toContain('animation: none;')
    expect(reduced).toMatch(/\.motion-strip__leaving \{\s*display: none;/)
  })

  it('narrow: the other heads go first, then the stage name', () => {
    expect(css).toMatch(
      /@container chat-stage \(max-width: 620px\) \{[^@]*\.motion-strip__tail,\s*\.motion-strip\[data-state='idle'\] \.motion-cast__member:not\(\[data-current\]\) \{\s*display: none;/s,
    )
    expect(css).toMatch(
      /@container chat-stage \(max-width: 400px\) \{[^@]*\.motion-strip\[data-state='idle'\] \.motion-cast__label \{\s*display: none;/s,
    )
  })

  it('scales the scene’s own heads down and never sets a height on the row', () => {
    expect(css).toContain('--cast-size: 20px;')
    expect(css).toContain('--cast-size: 16px;')
    // The row is the strip's own (min-height in live-feedback.css): nothing here sizes it.
    expect(css).not.toMatch(/\.motion-strip \{[^}]*\bheight:/)
  })

  it('is lazy: no startup stylesheet, and the heads are not in the strip’s startup module', () => {
    expect(appCss).not.toContain('motion-strip')
    expect(read('../motion/MotionStrip.tsx')).toContain("import './motion-strip.css'")
    const lazy = read('../motion/LazyMotionStrip.tsx')
    expect(lazy).toContain("import('./MotionStrip.js')")
    expect(lazy).not.toMatch(/^import (?!type)[^\n]*from '\.\/MotionStrip\.js'/m)
    const status = read('../ui/ComposerWorkStatus.tsx')
    expect(status).not.toMatch(/from '\.\.\/motion\/(MotionStrip|cast)\.js'/)
    expect(status).toContain("from '../motion/LazyMotionStrip.js'")
  })

  it('leaves the band out of a chat that exists: the scene stays only in a new chat', () => {
    const app = read('../App.tsx')
    expect(app.match(/<LazyMotionCast\b/g)).toHaveLength(2)
    expect(app).toMatch(/\{activeId \? null : \(\s*<LazyMotionCast/)
    expect(app).toMatch(/\{besideId \? null : \(\s*<LazyMotionCast/)
  })
})
