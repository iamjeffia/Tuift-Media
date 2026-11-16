import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../motion/motion-cast.css', import.meta.url), 'utf8')
const tokens = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
const appCss = readFileSync(new URL('./app.css', import.meta.url), 'utf8')
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

function rule(selector: string, source = css): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return (
    source.match(new RegExp(`^\\s*${escaped} \\{(?<body>[\\s\\S]*?)\\n\\s*\\}`, 'm'))?.groups?.[
      'body'
    ] ?? ''
  )
}

/** A rule that stands alone: not the last selector of a group. */
function alone(selector: string): string {
  return css.split(`\n${selector} {`).at(-1)?.split('\n}')[0] ?? ''
}

function keyframes(name: string): string[] {
  const body = css.match(new RegExp(`@keyframes ${name} \\{(?<body>[\\s\\S]*?)\\n\\}`))?.groups?.[
    'body'
  ]
  expect(body).toBeDefined()
  return Array.from(body!.matchAll(/^\s*([a-z-]+):/gm), (match) => match[1] ?? '')
}

describe('Motion cast styles', () => {
  it('animates only transform and opacity', () => {
    for (const name of ['motion-cast-in', 'motion-cast-breathe', 'motion-cast-wait-in'])
      expect(new Set(keyframes(name))).toEqual(new Set(['opacity', 'transform']))
    const transitioned = Array.from(
      css.matchAll(/transition:\s*([^;]+);/g),
      (match) => match[1] ?? '',
    )
      .join(' ')
      .match(/\b(?:opacity|transform|height|width|top|left|margin|padding)\b/g)
    expect(new Set(transitioned)).toEqual(new Set(['opacity', 'transform']))
  })

  it('uses the app motion tokens: slow overshoot entrance, 40ms stagger, fast ease-out highlight', () => {
    const member = rule('.motion-cast__member')
    expect(member).toContain(
      'animation: motion-cast-in var(--dur-slow) var(--ease-overshoot) backwards;',
    )
    expect(member).toContain('animation-delay: calc(var(--cast-index) * 40ms);')
    const head = rule('.motion-cast__head')
    expect(head).toContain('transition: transform var(--dur-fast) var(--ease-out);')
    expect(css).toMatch(
      /\.motion-cast__head::after \{\s*transform: scale\(0\.9\);\s*transition:\s*opacity var\(--dur-fast\) var\(--ease-out\)/,
    )
    // Six heads: the last starts at 200ms and lands before half a second.
    expect(5 * 40 + 260).toBeLessThan(500)
    expect(tokens).toContain('--dur-slow: 260ms;')
  })

  it('is the scene of a new chat only: no band over a chat that exists', () => {
    // The short-window fallback of a new chat is a 48px row in flow; it never animates its size.
    expect(rule('.motion-cast')).toContain('height: 48px;')
    expect(rule('.motion-cast')).not.toMatch(/transition:[^;]*(height|grid)/)
    // The new chat's own row stays; the band's grid row and the fade under it are gone.
    expect(rule('.stage__conversation.is-new-session:has(> .motion-cast)')).not.toContain(
      'transition',
    )
    expect(css).not.toContain('grid-template-rows: 48px minmax')
    expect(css).not.toContain('.motion-cast::after')
  })

  it('breathes only the highlighted head while a turn runs, and the heads a running helper lights', () => {
    expect(css).toMatch(
      /\.motion-cast\[data-running\] \.motion-cast__member\[data-current\] \.motion-cast__head::before,\s*\.motion-cast__member\[data-working\] \.motion-cast__head::before \{[^}]*animation: motion-cast-breathe/s,
    )
    expect(css.match(/animation: motion-cast-breathe/g)).toHaveLength(1)
  })

  it('sits both marks on the ring outside the face: the bubble above the line through the centre, the badge below, on the right', () => {
    const wait = alone('.motion-cast__wait')
    const mark = alone('.motion-cast__mark')
    expect(wait).toContain('top: calc(50% - var(--cast-d) * sin(var(--cast-angle))')
    expect(mark).toContain('top: calc(50% + var(--cast-d) * sin(var(--cast-angle))')
    const base = rule(['.motion-cast__mark,', '.motion-cast__wait'].join('\n'))
    expect(base).toContain('left: calc(50% + var(--cast-d) * cos(var(--cast-angle))')
    // Its own badge, from the app's tokens, so it reads over any head colour.
    expect(base).toContain('background: var(--surface);')
    expect(base).toContain('border: 1px solid var(--line-strong);')
    expect(base).toContain('color: var(--warning);')
    // Out of the flow: a mark appearing or leaving moves nothing.
    expect(base).toContain('position: absolute;')
    // The distance clears the head: its radius, the mark's radius and a pixel.
    expect(css).toContain('--cast-d: calc(var(--cast-size) / 2 + var(--cast-mark) / 2 + 1px);')
    // Nothing clips it: no overflow on the scene, its members or the heads.
    expect(rule('.motion-cast')).not.toMatch(/overflow/)
    expect(rule('.motion-cast__member')).not.toMatch(/overflow/)
    expect(rule('.motion-cast__head')).not.toMatch(/overflow/)
  })

  it('brings the waiting bubble in once, without a loop', () => {
    const wait = alone('.motion-cast__wait')
    expect(wait).toContain(
      'animation: motion-cast-wait-in var(--dur-fast) var(--ease-out) backwards;',
    )
    expect(wait).not.toContain('infinite')
  })

  it('stands still under reduced motion and keeps the ring and the label', () => {
    const reduced = Array.from(
      css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{(?<body>[\s\S]*?)\n\}/g),
      (match) => match.groups?.['body'] ?? '',
    ).join('\n')
    expect(reduced).toContain('animation: none;')
    expect(reduced).toContain('transition: none;')
    for (const target of [
      '.motion-cast,',
      '.motion-cast__member,',
      '.motion-cast__wait,',
      '.motion-cast__head::after',
    ])
      expect(reduced).toContain(target)
    expect(reduced).not.toMatch(/display:\s*none/)
  })

  it('narrows by the width of the chat pane: heads under 620px, the lead only under 480px', () => {
    expect(css).toMatch(
      /@container chat-stage \(max-width: 620px\) \{[^@]*\.motion-cast__label \{\s*display: none;/s,
    )
    expect(css).toMatch(
      /@container chat-stage \(max-width: 480px\) \{[^@]*\.motion-cast__member:not\(\[data-current\]\) \{\s*display: none;/s,
    )
  })

  it('takes its colours from the Motion tokens, with the lilac one added', () => {
    expect(tokens).toContain('--composer-motion-lilac: #b9a7f5;')
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i)
  })

  it('stays out of the startup stylesheet and loads with the scene', () => {
    expect(appCss).not.toContain('motion-cast')
    for (const eager of ['../main.tsx', '../App.tsx', '../ui/Composer.tsx', './app.css'])
      expect(read(eager)).not.toContain('motion-cast.css')
    expect(read('../motion/MotionCast.tsx')).toContain("import './motion-cast.css'")
    const lazy = read('../motion/LazyMotionCast.tsx')
    expect(lazy).toContain("import('./MotionCast.js')")
    expect(lazy).not.toMatch(/^import (?!type)[^\n]*from '\.\/MotionCast\.js'/m)
    // App.tsx imports the lazy wrapper only, and mounts it once per chat column.
    const app = read('../App.tsx')
    expect(app).toContain("from './motion/LazyMotionCast.js'")
    expect(app).not.toMatch(/from '\.\/motion\/MotionCast\.js'/)
    expect(app.match(/<LazyMotionCast\b/g)).toHaveLength(2)
  })
})
