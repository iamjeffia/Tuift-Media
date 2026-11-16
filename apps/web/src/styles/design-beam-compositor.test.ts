import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * The beam around the prompt box runs for as long as Design or Motion is on, so it must cost
 * nothing while idle. Animating a registered custom property (or any paint property) every
 * frame made the renderer grow by gigabytes and burn a core. Only `transform` and `opacity`
 * may animate, so the compositor runs the beam on its own.
 */
const beamCss = readFileSync(new URL('./design-beam.css', import.meta.url), 'utf8')
const SOURCE = fileURLToPath(new URL('..', import.meta.url))
const COMPOSITOR_PROPERTIES = new Set(['transform', 'opacity'])

function keyframes(css: string): Map<string, string[]> {
  const found = new Map<string, string[]>()
  for (const match of css.matchAll(/@keyframes ([\w-]+) \{([\s\S]*?\n\})\s*(?=\n@|\n\/\*|$)/g)) {
    const body = match[2] ?? ''
    found.set(
      match[1] ?? '',
      Array.from(body.matchAll(/^\s*([-\w]+)\s*:/gm), (property) => property[1] ?? ''),
    )
  }
  return found
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(css|tsx?)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : []
  })
}

describe('the beam stays on the compositor', () => {
  const animations = keyframes(beamCss)

  it('registers no custom property and animates none', () => {
    expect(beamCss).not.toContain('@property')
    expect(animations.size).toBeGreaterThan(0)
    for (const [name, properties] of animations) {
      expect(properties.length, `${name} animates nothing`).toBeGreaterThan(0)
      for (const property of properties) {
        expect(property.startsWith('--'), `${name} animates the custom property ${property}`).toBe(
          false,
        )
      }
    }
  })

  it('animates only transform and opacity', () => {
    for (const [name, properties] of animations) {
      for (const property of properties) {
        // `from` and `to` are keyframe selectors, not properties.
        if (property === 'from' || property === 'to') continue
        expect(COMPOSITOR_PROPERTIES.has(property), `${name} animates ${property}`).toBe(true)
      }
    }
  })

  it('names, in every animation, a keyframes block that exists', () => {
    const used = Array.from(beamCss.matchAll(/^\s*animation:\s*([^;]+);/gm), (match) => match[1])
    expect(used.length).toBeGreaterThan(0)
    for (const value of used) {
      for (const item of (value ?? '').split(',')) {
        const name = item.trim().split(/\s+/)[0] ?? ''
        expect(animations.has(name), `${name} has no @keyframes`).toBe(true)
      }
    }
  })

  it('has every endless loop turn a layer with a transform and nothing else', () => {
    const loops = Array.from(
      beamCss.matchAll(/([^{}]+)\{[^{}]*animation:\s*([\w-]+)[^;]*\binfinite\b[^;]*;/g),
      (match) => ({ selector: (match[1] ?? '').trim(), name: match[2] ?? '' }),
    )
    expect(loops.length).toBeGreaterThanOrEqual(2)
    for (const loop of loops) {
      expect(new Set(animations.get(loop.name)), loop.selector).toEqual(new Set(['transform']))
    }
  })

  it('holds the travelling light in static gradients, masks and filters', () => {
    // A conic gradient "from var(...)" or a mask that follows a property is what repainted
    // every frame; the turning layer carries a plain gradient instead.
    expect(beamCss).not.toMatch(/conic-gradient\(\s*from\s+var\(/)
    expect(beamCss).not.toContain('composer-design-beam-angle')
    expect(beamCss).not.toContain('composer-design-beam-opacity')
  })

  it('pauses the loops while the page is hidden', () => {
    expect(beamCss).toMatch(
      /:root\[data-page-hidden\] :is\(\[data-beam-turn\], \[data-beam-still\]\) \{\s*animation-play-state: paused;/,
    )
  })

  it('leaves no source file reading the old angle or opacity properties', () => {
    for (const file of sourceFiles(SOURCE)) {
      const text = readFileSync(file, 'utf8')
      expect(text, file).not.toContain('composer-design-beam-angle')
      expect(text, file).not.toContain('composer-design-beam-opacity')
    }
  })
})
