import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./live-feedback.css', import.meta.url), 'utf8')

describe('live feedback styles', () => {
  it('animates opacity only, so a new line of activity never costs layout', () => {
    const keyframes = css.match(/@keyframes live-now-in \{(?<body>[\s\S]*?)\n\}/)?.groups?.['body']
    expect(keyframes).toBeDefined()
    const properties = Array.from(keyframes!.matchAll(/^\s*([a-z-]+):/gm), (match) => match[1])
    expect(new Set(properties)).toEqual(new Set(['opacity']))
  })

  it('stands still under reduced motion and uses only tokens the app defines', () => {
    const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{(?<body>[\s\S]*)\n\}/)
    expect(reduced?.groups?.['body']).toContain('animation: none')
    const tokens = new Set(Array.from(css.matchAll(/var\((--[a-z0-9-]+)/g), (match) => match[1]))
    for (const token of tokens) {
      expect(
        ['--text', '--text-2', '--text-3', '--font-mono', '--font-ui', '--t-xs', '--t-sm'].concat([
          '--dur-fast',
          '--ease-out',
        ]),
      ).toContain(token)
    }
  })

  it('keeps the quiet notes hidden by the attribute that hides them', () => {
    expect(css).toContain('.idle-text:not([hidden])')
    expect(css).toContain('.work-status__calm:not([hidden])')
    expect(css).toContain('.work-status__idle:not([hidden])')
  })
})
