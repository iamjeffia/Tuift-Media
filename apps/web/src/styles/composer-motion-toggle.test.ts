import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const tokensCss = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
const beamCss = readFileSync(new URL('./design-beam.css', import.meta.url), 'utf8')
const userInputCss = readFileSync(
  new URL('../design-agent/user-input.css', import.meta.url),
  'utf8',
)

describe('composer Motion toggle styles', () => {
  it('defines the TUIFT Media colours as tokens next to the Design ones', () => {
    expect(tokensCss).toContain('--composer-motion-accent: #f9670e;')
    const rainbow = {
      blue: '#8fc4ff',
      lime: '#c6f06a',
      yellow: '#ffe45c',
      orange: '#ff9f3d',
      pink: '#ff5fae',
    }
    for (const [name, hex] of Object.entries(rainbow))
      expect(tokensCss).toContain(`--composer-motion-${name}: ${hex};`)
    expect(tokensCss.indexOf('--composer-motion-accent')).toBeGreaterThan(
      tokensCss.indexOf('--composer-design-beam-bloom-strength'),
    )
  })

  it('recolours only the beam gradients and leaves the geometry to Design', () => {
    const motion =
      /\.composer__design-button-beam\.composer__motion-beam \{([\s\S]*?)\n\}/.exec(beamCss)?.[1] ??
      ''
    expect(motion).toContain('--design-beam-border-gradients')
    expect(motion).toContain('--design-beam-inner-gradients')
    expect(motion).toContain('var(--composer-motion-accent)')
    expect(motion).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i)
    expect(motion).not.toMatch(/animation|radius|brightness|stroke:/)
  })

  it('tints the active chip orange, also while hovered', () => {
    expect(beamCss).toMatch(
      /\.tools \.composer__motion\.is-active \{[^}]*border-color: var\(--composer-motion-border-active\);/s,
    )
    expect(beamCss).toMatch(
      /\.tools \.composer__motion\.is-active svg \{[^}]*color: var\(--composer-motion-accent\);/s,
    )
    expect(beamCss).toMatch(
      /\.tools \.composer__motion\.is-active:hover:not\(:disabled\) \{[^}]*border-color: var\(--composer-motion-border-active\);/s,
    )
  })

  it('does not let an active Motion chip hide the chat timer the way Design does', () => {
    expect(userInputCss).toContain(
      '.shell:has(.composer__design.is-active:not(.composer__motion)) .aux--reasoning.aux--live',
    )
  })
})
