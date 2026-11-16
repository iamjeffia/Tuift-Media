/**
 * What a page does over time and under input, recorded for a change that one still image cannot
 * prove (an animation, a hover). Everything runs in the hidden capture window through the same
 * debugger connection as the screenshots, so nothing is shown and no focus is taken:
 *
 * - the first screen at three moments after load, with the CSS animations, transitions and Web
 *   Animations that are running listed at the first one;
 * - the same load again with `prefers-reduced-motion: reduce` emulated, counting what still runs;
 * - the first controls hovered: the style each one changes, and before and after images of the
 *   ones that change.
 *
 * Animation driven by script (requestAnimationFrame, GSAP) is not in the animation list, and
 * clicks and key presses are not tried; the result says so in `limits`, as codes.
 */

export interface MotionIo {
  /** Loads the preview again, so the page starts over. */
  reload(): Promise<void>
  evaluate(code: string): Promise<unknown>
  send(method: string, params?: Record<string, unknown>): Promise<{ data?: string } | undefined>
  /** Writes a JPEG (base64) beside the screenshots and returns its path. */
  write(name: string, base64: string): Promise<string>
  sleep(ms: number): Promise<void>
  now(): number
}

export interface MotionResult {
  moments: Array<{ atMs: number; path: string }>
  animations: Array<{ name: string; target: string; durationMs: number; iterations: number | null }>
  animationCount: number
  reducedMotionAnimationCount: number
  hovers: Array<{
    selector: string
    label: string
    changes: Array<{ property: string; before: string; after: string }>
    beforePath?: string
    afterPath?: string
  }>
  limits: string[]
}

const MOMENT_DELAYS_MS = [0, 450, 1_200]
const HOVER_SETTLE_MS = 350
const MAX_HOVERS = 3

const ANIMATIONS_SCRIPT = `(() => {
  const selectorFor = (element) => {
    const parts = []
    for (let current = element; current && current.nodeType === 1 && parts.length < 3; current = current.parentElement) {
      let part = current.localName
      if (current.id) { parts.unshift(part + '#' + CSS.escape(current.id)); break }
      const classes = Array.from(current.classList || []).slice(0, 2)
      if (classes.length) part += '.' + classes.map((name) => CSS.escape(name)).join('.')
      parts.unshift(part)
    }
    return parts.join(' > ').slice(0, 300)
  }
  const all = document.getAnimations()
  const list = all.slice(0, 12).map((animation) => {
    const timing = animation.effect && animation.effect.getComputedTiming ? animation.effect.getComputedTiming() : {}
    const target = animation.effect && animation.effect.target ? selectorFor(animation.effect.target) : ''
    return {
      name: String(animation.animationName || animation.transitionProperty || animation.id || 'animation').slice(0, 120),
      target,
      durationMs: Number.isFinite(timing.duration) ? Math.round(timing.duration) : 0,
      iterations: Number.isFinite(timing.iterations) ? timing.iterations : null,
    }
  })
  return { count: all.length, list }
})()`

const COUNT_SCRIPT = `document.getAnimations().length`

const HOVER_CANDIDATES_SCRIPT = `(() => {
  const selectorFor = (element) => {
    const parts = []
    for (let current = element; current && current.nodeType === 1 && parts.length < 3; current = current.parentElement) {
      let part = current.localName
      if (current.id) { parts.unshift(part + '#' + CSS.escape(current.id)); break }
      const classes = Array.from(current.classList || []).slice(0, 2)
      if (classes.length) part += '.' + classes.map((name) => CSS.escape(name)).join('.')
      parts.unshift(part)
    }
    return parts.join(' > ').slice(0, 300)
  }
  const result = []
  const seen = new Set()
  // The elements themselves are kept in this world, because a selector of a few levels is not
  // unique (three links of one nav list look the same to it).
  const targets = []
  globalThis.__designHoverTargets = targets
  for (const element of document.querySelectorAll('a[href], button, [role="button"], [role="tab"]')) {
    const rect = element.getBoundingClientRect()
    if (rect.width < 8 || rect.height < 8 || rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) continue
    const style = getComputedStyle(element)
    if (style.visibility === 'hidden' || style.display === 'none' || style.pointerEvents === 'none') continue
    const label = (element.textContent || element.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0, 80)
    // Distinct controls only: the same label twice (header and hero) would test the same thing.
    const key = label.toLowerCase()
    if (key && seen.has(key)) continue
    seen.add(key)
    targets.push(element)
    result.push({
      index: targets.length - 1,
      selector: selectorFor(element),
      label,
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      left: Math.max(0, Math.round(rect.left)),
      top: Math.max(0, Math.round(rect.top)),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    })
    if (result.length >= ${MAX_HOVERS + 3}) break
  }
  return result
})()`

const STYLE_PROPERTIES = [
  'transform',
  'boxShadow',
  'backgroundColor',
  'color',
  'opacity',
  'borderColor',
  'textDecorationLine',
  'filter',
  'outlineStyle',
  'translate',
  'scale',
] as const

function styleScript(index: number): string {
  return `(() => {
    const element = (globalThis.__designHoverTargets || [])[${index}]
    if (!element || !element.isConnected) return null
    const style = getComputedStyle(element)
    const result = {}
    for (const property of ${JSON.stringify(STYLE_PROPERTIES)}) result[property] = String(style[property] ?? '').slice(0, 120)
    return result
  })()`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function captureMotion(
  io: MotionIo,
  viewport: { width: number; height: number },
): Promise<MotionResult> {
  const result: MotionResult = {
    moments: [],
    animations: [],
    animationCount: 0,
    reducedMotionAnimationCount: 0,
    hovers: [],
    limits: ['script_animation', 'click_not_captured'],
  }
  const clip = { x: 0, y: 0, width: viewport.width, height: viewport.height, scale: 1 }
  const shoot = async (name: string, area: typeof clip): Promise<string | undefined> => {
    const image = await io.send('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 80,
      fromSurface: true,
      clip: area,
    })
    return image?.data ? io.write(name, image.data) : undefined
  }

  // The first screen at three moments after the page loaded; the animations at the first.
  try {
    await io.reload()
    const loaded = io.now()
    const animations = await io.evaluate(ANIMATIONS_SCRIPT)
    if (isRecord(animations)) {
      result.animationCount = typeof animations.count === 'number' ? animations.count : 0
      if (Array.isArray(animations.list)) {
        result.animations = animations.list.filter(isRecord).map((entry) => ({
          name: String(entry.name ?? 'animation'),
          target: String(entry.target ?? ''),
          durationMs: typeof entry.durationMs === 'number' ? entry.durationMs : 0,
          iterations: typeof entry.iterations === 'number' ? entry.iterations : null,
        }))
      }
    }
    for (const [index, delay] of MOMENT_DELAYS_MS.entries()) {
      const wait = delay - (io.now() - loaded)
      if (wait > 0) await io.sleep(wait)
      const at = Math.round(io.now() - loaded)
      const file = await shoot(`moment-${index + 1}.jpg`, clip)
      if (file) result.moments.push({ atMs: at, path: file })
    }
    if (result.moments.length === 0) result.limits.push('moments_failed')
  } catch {
    result.limits.push('moments_failed')
  }

  // The same load with reduced motion on.
  try {
    await io.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    })
    await io.reload()
    await io.sleep(60)
    const count = await io.evaluate(COUNT_SCRIPT)
    result.reducedMotionAnimationCount = typeof count === 'number' ? count : 0
  } catch {
    // The count stays zero and the answer does not claim a pass it did not see.
  } finally {
    await io
      .send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
      })
      .catch(() => undefined)
  }

  // Hover on the first distinct controls.
  try {
    await io.reload()
    await io.sleep(200)
    const found = await io.evaluate(HOVER_CANDIDATES_SCRIPT)
    const candidates = Array.isArray(found) ? found.filter(isRecord).slice(0, MAX_HOVERS) : []
    if (candidates.length === 0) result.limits.push('hover_none')
    for (const [index, candidate] of candidates.entries()) {
      const selector = String(candidate.selector ?? '')
      const target = Number(candidate.index)
      const before = await io.evaluate(styleScript(target))
      const area = {
        x: Math.max(0, Number(candidate.left) - 24),
        y: Math.max(0, Number(candidate.top) - 24),
        width: Math.min(viewport.width, Number(candidate.width) + 48),
        height: Math.min(viewport.height, Number(candidate.height) + 48),
        scale: 1,
      }
      const beforePath = await shoot(`hover-${index + 1}-before.jpg`, area)
      await io.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: Number(candidate.x),
        y: Number(candidate.y),
      })
      await io.sleep(HOVER_SETTLE_MS)
      const after = await io.evaluate(styleScript(target))
      const changes: Array<{ property: string; before: string; after: string }> = []
      if (isRecord(before) && isRecord(after)) {
        for (const property of STYLE_PROPERTIES) {
          if (before[property] !== after[property]) {
            changes.push({
              property,
              before: String(before[property]).slice(0, 120),
              after: String(after[property]).slice(0, 120),
            })
          }
        }
      }
      const afterPath = changes.length
        ? await shoot(`hover-${index + 1}-after.jpg`, area)
        : undefined
      await io.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 })
      await io.sleep(120)
      result.hovers.push({
        selector,
        label: String(candidate.label ?? ''),
        changes: changes.slice(0, 8),
        ...(changes.length && beforePath ? { beforePath } : {}),
        ...(afterPath ? { afterPath } : {}),
      })
    }
  } catch {
    result.limits.push('hover_none')
  }
  return result
}
