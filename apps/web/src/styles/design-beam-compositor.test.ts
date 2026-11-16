import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * The beam around the prompt box is lit for as long as Design or Motion is on, so it must cost
 * nothing while it stays lit. Animating a registered custom property (or any paint property)
 * every frame made the renderer grow by gigabytes and burn a core. Only `transform` and
 * `opacity` may animate, so the compositor runs the beam on its own. And it may not go round
 * for ever: every endless animation makes the window draw a frame on every refresh (360 a
 * second on the owner's display), at about a core of the GPU process for the beam's layers. It
 * travels for a few laps when it has something to say, eases to a stop and rests.
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

/** Splits on commas outside parentheses: the animations of one `animation` declaration. */
function splitList(value: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < value.length; index++) {
    const char = value[index]
    if (char === '(') depth++
    else if (char === ')') depth--
    else if (char === ',' && depth === 0) {
      parts.push(value.slice(start, index))
      start = index + 1
    }
  }
  parts.push(value.slice(start))
  return parts.map((part) => part.replace(/\s+/g, ' ').trim()).filter(Boolean)
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
      for (const item of splitList(value ?? '')) {
        if (item === 'none') continue
        const name = item.split(' ')[0] ?? ''
        expect(animations.has(name), `${name} has no @keyframes`).toBe(true)
      }
    }
  })

  it('never loops: nothing in the beam is endless', () => {
    expect(beamCss).not.toMatch(/infinite/)
    expect(beamCss).not.toMatch(/animation-iteration-count\s*:/)
  })

  it('takes the number of laps from one token and eases the last lap to a stop', () => {
    const runs = Array.from(beamCss.matchAll(/--design-beam-runs:\s*([^;]+);/g), (m) => m[1])
    expect(runs, 'one place sets the run count').toHaveLength(1)
    expect(Number(runs[0])).toBeGreaterThanOrEqual(1)
    expect(Number(runs[0])).toBeLessThanOrEqual(4)
    const lap = Number(/--design-beam-lap:\s*([\d.]+)s;/.exec(beamCss)?.[1])
    const settle = Number(/--design-beam-settle:\s*([\d.]+)s;/.exec(beamCss)?.[1])
    // Twice a lap for one lap that starts at the lap's pace and slows to nothing.
    expect(settle).toBeCloseTo(lap * 2, 5)

    const travel = /\[data-beam-turn\],\s*\[data-beam-still\] \{\s*animation:([^;]+);/.exec(
      beamCss,
    )?.[1]
    const items = splitList(travel ?? '')
    expect(items).toHaveLength(2)
    expect(items[0]).toContain('var(--design-beam-runs)')
    expect(items[0]).not.toContain('infinite')
    expect(items[1]).toMatch(/^composer-design-beam-settle var\(--design-beam-settle\)/)
    expect(items[1]).toMatch(/calc\(var\(--design-beam-lap\) \* var\(--design-beam-runs\)\)/)
    expect(items[1]).toMatch(/ 1 forwards$/)
    // The colours' layer turns the other way through the same angles, ease included.
    expect(beamCss).toMatch(/\[data-beam-still\] \{\s*--beam-way: -1;/)
    expect(beamCss).toMatch(/rotate\(calc\(360deg \* var\(--beam-way\)\)\)/)
  })

  it('rests: no animation at all on the layers once the travel is over', () => {
    expect(beamCss).toMatch(
      /:is\(\[data-beam-glow\], \[data-beam-stroke\], \[data-beam-bloom\]\)\[data-resting\]\s*:is\(\[data-beam-turn\], \[data-beam-still\]\) \{\s*animation: none;/,
    )
    expect(beamCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*:is\(\[data-beam-turn\], \[data-beam-still\]\) \{\s*animation: none;/,
    )
    const component = readFileSync(new URL('../ui/DesignBeam.tsx', import.meta.url), 'utf8')
    expect(component).toContain("'composer-design-beam-settle'")
    expect(component).toContain('data-resting')
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
