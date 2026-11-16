import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * Every endless animation in the renderer's CSS, with what it animates.
 *
 * An animation that never ends makes the window produce a frame on every refresh for as long as
 * it lives, and the owner's display refreshes at 360 Hz. When it animates a paint property
 * (background-position, width, a custom property...) each of those frames also runs style, paint
 * and commit on the main thread: one text shimmer cost a whole core that way. `transform` and
 * `opacity` run on the compositor, so they are the only properties an endless animation may
 * animate, unless it is listed below with the reason it is fine.
 *
 * A smooth endless animation on the compositor is still a frame on every refresh: measured, one
 * 7px dot breathing cost 12% of a core in the renderer and 40% in the GPU process at 360 Hz. A
 * stepped one draws a frame per step only. The loops that run for as long as a turn does are
 * stepped, and the test says so.
 */
const SOURCE = fileURLToPath(new URL('..', import.meta.url))
// `rotate`, `translate` and `scale` are the individual transform properties: same compositor path.
const COMPOSITOR_PROPERTIES = new Set(['transform', 'opacity', 'rotate', 'translate', 'scale'])

/**
 * Endless animations that animate something else. Each one is short-lived, tiny or outside the
 * chat, and says why. Adding to this list needs a reason a reviewer would accept.
 */
const ALLOWED = {
  ".keybind-row[data-recording]:not([data-tone='error']) .set-leader":
    'Settings > Keybinds, only while a shortcut is being recorded; a 1px dashed line',
  '.settings .provider-row[data-live] > .set-leader':
    'Settings > Providers, only while the provider is live; a 1px dashed line',
  '.rollback__cut.is-loading .rollback__dots':
    'the rollback dialog, only while it loads; a row of dots that ends with the dialog',
} satisfies Record<string, string>

/** The loops that run for as long as a turn does. Each one steps instead of running smooth. */
const STEPPED_FOR_A_TURN = [
  '.sess__spinner',
  '.spinner',
  '.activity__pulse',
  '.subagent__pulse',
  '.subagent-avatar[data-running]::after',
]

/**
 * Smooth loops that belong to another front, which is stepping them. They may run smooth or
 * stepped, so nothing here fails when that lands: the Motion scene's breathing while a helper
 * works costs 12% of a core in the renderer and 40% in the GPU process on its own at 360 Hz.
 */
const OTHER_FRONT = {
  '.motion-cast[data-running] .motion-cast__member[data-current] .motion-cast__head::before':
    'the Motion scene',
  '.motion-cast__member[data-working] .motion-cast__head::before': 'the Motion scene',
} satisfies Record<string, string>

/**
 * Smooth endless loops that can show in the chat shell. Each one is transient (a loading state
 * or a state the user just asked for) and says so.
 */
const SMOOTH_ENDLESS = {
  '.attachment-preview__loading': 'while an attachment loads',
  '.orb--stop.is-stopping .orb__stop-glyph': 'the second or two while a turn stops',
  '.skeleton::after': 'loading placeholders, gone when the data arrives',
  '.workspace-browser__progress::before': 'the browser panel while a page loads',
  '.is-spinning': 'a pull request action in flight',
  '.brief-input__spinner': 'a brief being sent',
  '.account-menu__refresh.is-busy svg': 'the account menu while limits refresh',
  '.provider-update-spinner': 'Settings > Providers while an update is checked',
  '.media-viewer__video-loading': 'a video while it loads',
  '.session-search__spinner': 'a search in flight',
  '.settings .usage-page__refresh.is-busy svg': 'Settings > Usage while it refreshes',
  '.profile-activity.is-refreshing .profile-activity__refresh svg': 'Settings > Profile',
  '.preview:not([data-still]) .preview__activity-icon > .preview__spinner': 'onboarding preview',
  ".version-reel[data-turn='turning'] .version-reel__strip": 'the provider update notice',
  ".settings .mcp-card[data-state='connecting'] .mcp-card__status > i":
    'Settings only; a 6px dot while a server connects',
} satisfies Record<string, string>

interface Loop {
  file: string
  selector: string
  name: string
  properties: string[]
  stepped: boolean
}

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return cssFiles(path)
    return entry.name.endsWith('.css') ? [path] : []
  })
}

/** The text between the braces that open at `open`, and the index after the closing brace. */
function block(css: string, open: number) {
  let depth = 0
  for (let index = open; index < css.length; index++) {
    if (css[index] === '{') depth++
    else if (css[index] === '}' && --depth === 0) {
      return { body: css.slice(open + 1, index), end: index + 1 }
    }
  }
  return { body: css.slice(open + 1), end: css.length }
}

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

function strip(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

const keyframes = new Map<string, Set<string>>()
const loops: Loop[] = []

for (const file of cssFiles(SOURCE)) {
  const css = strip(readFileSync(file, 'utf8'))
  for (const match of css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    const { body } = block(css, match.index + match[0].length - 1)
    const properties = new Set<string>()
    for (const frame of body.matchAll(/\{([^{}]*)\}/g)) {
      for (const declaration of (frame[1] ?? '').matchAll(/(?:^|;)\s*([-\w]+)\s*:/g)) {
        const property = declaration[1] ?? ''
        // The timing function of a frame is not something that animates.
        if (property !== 'animation-timing-function') properties.add(property)
      }
    }
    keyframes.set(match[1] ?? '', properties)
  }
}

for (const file of cssFiles(SOURCE)) {
  const css = strip(readFileSync(file, 'utf8'))
  // Walk the rules; a keyframes block is skipped, anything else is searched inside.
  const walk = (text: string): void => {
    let index = 0
    while (index < text.length) {
      const open = text.indexOf('{', index)
      if (open < 0) return
      const prelude = text.slice(index, open).trim()
      const { body, end } = block(text, open)
      index = end
      if (prelude.startsWith('@keyframes')) continue
      if (prelude.startsWith('@')) {
        walk(body)
        continue
      }
      const animation = /(?:^|[;\s])animation\s*:([^;]*)/.exec(body)?.[1]
      if (!animation) continue
      for (const item of splitList(animation)) {
        if (!/\binfinite\b/.test(item)) continue
        const name = item.split(' ').find((word) => keyframes.has(word)) ?? ''
        for (const selector of splitList(prelude)) {
          loops.push({
            file: relative(SOURCE, file),
            selector,
            name,
            properties: [...(keyframes.get(name) ?? [])],
            stepped: /steps\(/.test(item),
          })
        }
      }
    }
  }
  walk(css)
}

describe('endless animations', () => {
  it('finds them all, each with keyframes that animate something', () => {
    expect(loops.length).toBeGreaterThan(20)
    for (const loop of loops) {
      expect(
        loop.properties.length,
        `${loop.selector} (${loop.name}) animates nothing`,
      ).toBeGreaterThan(0)
    }
  })

  it('animates only transform and opacity, unless the loop is listed with a reason', () => {
    for (const loop of loops) {
      const heavy = loop.properties.filter(
        (property) => !property.startsWith('--') && !COMPOSITOR_PROPERTIES.has(property),
      )
      const custom = loop.properties.filter((property) => property.startsWith('--'))
      if (heavy.length === 0 && custom.length === 0) continue
      expect(
        loop.selector in ALLOWED,
        `${loop.file}: ${loop.selector} loops forever on ${loop.name} and animates ${[...heavy, ...custom].join(', ')}`,
      ).toBe(true)
    }
  })

  it('lists no allowance that no longer loops or no longer needs one', () => {
    for (const selector of Object.keys(ALLOWED)) {
      const loop = loops.find((item) => item.selector === selector)
      expect(loop, `${selector} no longer loops`).toBeTruthy()
      const heavy = (loop?.properties ?? []).filter((p) => !COMPOSITOR_PROPERTIES.has(p))
      expect(heavy.length, `${selector} only animates transform and opacity now`).toBeGreaterThan(0)
    }
  })

  it('steps the loops that run for as long as a turn does', () => {
    for (const selector of STEPPED_FOR_A_TURN) {
      const found = loops.filter((loop) => loop.selector === selector)
      expect(found.length, `${selector} no longer loops: drop it from the list`).toBeGreaterThan(0)
      for (const loop of found) expect(loop.stepped, `${selector} runs smooth`).toBe(true)
    }
  })

  it('lets only the listed loops run smooth', () => {
    for (const loop of loops) {
      if (loop.stepped || STEPPED_FOR_A_TURN.includes(loop.selector)) continue
      if (loop.selector in ALLOWED || loop.selector in SMOOTH_ENDLESS) continue
      if (loop.selector in OTHER_FRONT) continue
      expect.fail(`${loop.file}: ${loop.selector} loops smooth on ${loop.name}: step it or list it`)
    }
    for (const selector of Object.keys(SMOOTH_ENDLESS)) {
      expect(
        loops.some((loop) => loop.selector === selector && !loop.stepped),
        `${selector} no longer loops smooth: drop it from the list`,
      ).toBe(true)
    }
  })

  it('keeps the beam and the working label off the list', () => {
    const names = new Set(loops.map((loop) => loop.name))
    expect(names.has('activity-label-shine')).toBe(false)
    expect([...names].filter((name) => name.startsWith('composer-design-beam'))).toEqual([])
  })
})
