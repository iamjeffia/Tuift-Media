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

function keyframes(name: string): string[] {
  const body = css.match(new RegExp(`@keyframes ${name} \\{(?<body>[\\s\\S]*?)\\n\\}`))?.groups?.[
    'body'
  ]
  expect(body).toBeDefined()
  return Array.from(body!.matchAll(/^\s*([a-z-]+):/gm), (match) => match[1] ?? '')
}

describe('Motion cast styles', () => {
  it('animates only transform and opacity', () => {
    for (const name of ['motion-cast-in', 'motion-cast-breathe'])
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

  it('appears in one layout step: the band never animates its size', () => {
    expect(rule('.motion-cast')).toContain('height: 48px;')
    expect(rule('.motion-cast')).not.toMatch(/transition:[^;]*(height|grid)/)
    expect(css).toContain('.stage__conversation:has(> .motion-cast)')
    expect(rule('.stage__conversation:has(> .motion-cast)')).not.toContain('transition')
  })

  it('breathes only while a turn is running, and only the highlighted head', () => {
    expect(css).toMatch(
      /\.motion-cast\[data-running\] \.motion-cast__member\[aria-current='step'\] \.motion-cast__head::before \{[^}]*animation: motion-cast-breathe/s,
    )
    expect(css.match(/animation: motion-cast-breathe/g)).toHaveLength(1)
  })

  it('stands still under reduced motion and keeps the ring and the label', () => {
    const reduced = Array.from(
      css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{(?<body>[\s\S]*?)\n\}/g),
      (match) => match.groups?.['body'] ?? '',
    ).join('\n')
    expect(reduced).toContain('animation: none;')
    expect(reduced).toContain('transition: none;')
    for (const target of ['.motion-cast,', '.motion-cast__member,', '.motion-cast__head::after'])
      expect(reduced).toContain(target)
    expect(reduced).not.toMatch(/display:\s*none/)
  })

  it('narrows by the width of the chat pane: heads under 620px, the lead only under 480px', () => {
    expect(css).toMatch(
      /@container chat-stage \(max-width: 620px\) \{[^@]*\.motion-cast__label \{\s*display: none;/s,
    )
    expect(css).toMatch(
      /@container chat-stage \(max-width: 480px\) \{[^@]*\.motion-cast__member:not\(\[aria-current='step'\]\) \{\s*display: none;/s,
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
    expect(app.match(/<LazyMotionCastb/g)).toHaveLength(2)
  })
})
