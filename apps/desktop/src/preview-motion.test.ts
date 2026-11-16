import { describe, expect, it, vi } from 'vitest'
import { captureMotion, type MotionIo } from './preview-motion.js'

/** A fake page: the answers each script gets, in the order the pass asks. */
function fakeIo(options: {
  animations?: { count: number; list: unknown[] }
  reducedCount?: number
  candidates?: unknown[]
  styles?: Array<Record<string, string> | null>
  failScreenshots?: boolean
}) {
  let clock = 0
  const styles = [...(options.styles ?? [])]
  const calls: string[] = []
  const reloads = vi.fn(async () => undefined)
  const io: MotionIo = {
    reload: reloads,
    async evaluate(code) {
      if (code.includes('getAnimations().slice') || code.includes('all.slice')) {
        return options.animations ?? { count: 0, list: [] }
      }
      if (code === 'document.getAnimations().length') return options.reducedCount ?? 0
      if (code.includes('__designHoverTargets = targets')) return options.candidates ?? []
      if (code.includes('__designHoverTargets || []')) return styles.shift() ?? null
      return undefined
    },
    async send(method, params) {
      calls.push(method + (params && 'type' in params ? `:${String(params['type'])}` : ''))
      if (method === 'Page.captureScreenshot') {
        if (options.failScreenshots) throw new Error('no paint')
        return { data: Buffer.from('jpg').toString('base64') }
      }
      return undefined
    },
    async write(name) {
      return `/captures/${name}`
    },
    async sleep(ms) {
      clock += ms
    },
    now: () => clock,
  }
  return { io, calls, reloads }
}

const viewport = { width: 1440, height: 1000 }
const before = { transform: 'none', backgroundColor: 'rgb(255, 255, 255)' }
const after = { transform: 'matrix(1, 0, 0, 1, 0, -3)', backgroundColor: 'rgb(242, 201, 160)' }

describe('motion capture', () => {
  it('records the first screen at three moments and the animations running after load', async () => {
    const { io } = fakeIo({
      animations: {
        count: 2,
        list: [{ name: 'rise', target: 'body > h1', durationMs: 900, iterations: 1 }],
      },
    })
    const result = await captureMotion(io, viewport)
    expect(result.moments.map(({ atMs }) => atMs)).toEqual([0, 450, 1_200])
    expect(result.moments.map(({ path }) => path)).toEqual([
      '/captures/moment-1.jpg',
      '/captures/moment-2.jpg',
      '/captures/moment-3.jpg',
    ])
    expect(result.animationCount).toBe(2)
    expect(result.animations).toEqual([
      { name: 'rise', target: 'body > h1', durationMs: 900, iterations: 1 },
    ])
  })

  it('counts what still runs with reduced motion on, and puts the preference back', async () => {
    const { io, calls } = fakeIo({ reducedCount: 3 })
    const result = await captureMotion(io, viewport)
    expect(result.reducedMotionAnimationCount).toBe(3)
    expect(calls.filter((call) => call === 'Emulation.setEmulatedMedia')).toHaveLength(2)
  })

  it('reports the style a hovered control changes, with before and after images only when it changed', async () => {
    const { io, calls } = fakeIo({
      candidates: [
        {
          index: 0,
          selector: 'nav > a',
          label: 'Cardapio',
          x: 100,
          y: 40,
          left: 80,
          top: 20,
          width: 80,
          height: 40,
        },
        {
          index: 1,
          selector: 'nav > a',
          label: 'Contato',
          x: 200,
          y: 40,
          left: 180,
          top: 20,
          width: 80,
          height: 40,
        },
      ],
      // The first link changes, the second does not.
      styles: [before, after, before, before],
    })
    const result = await captureMotion(io, viewport)
    expect(result.hovers).toHaveLength(2)
    expect(result.hovers[0]).toMatchObject({
      label: 'Cardapio',
      changes: [
        { property: 'transform', before: 'none', after: 'matrix(1, 0, 0, 1, 0, -3)' },
        { property: 'backgroundColor', before: 'rgb(255, 255, 255)', after: 'rgb(242, 201, 160)' },
      ],
      beforePath: '/captures/hover-1-before.jpg',
      afterPath: '/captures/hover-1-after.jpg',
    })
    expect(result.hovers[1]!.changes).toEqual([])
    expect(result.hovers[1]!.afterPath).toBeUndefined()
    expect(calls.filter((call) => call === 'Input.dispatchMouseEvent:mouseMoved').length).toBe(4)
  })

  it('says what it could not do, as codes, and never claims a pass it did not see', async () => {
    const none = await captureMotion(fakeIo({ candidates: [] }).io, viewport)
    expect(none.limits).toEqual(['script_animation', 'click_not_captured', 'hover_none'])
    const blind = await captureMotion(fakeIo({ failScreenshots: true }).io, viewport)
    expect(blind.moments).toEqual([])
    expect(blind.limits).toContain('moments_failed')
  })
})
