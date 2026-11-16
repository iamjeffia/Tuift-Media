import { describe, expect, it } from 'vitest'
import { PREVIEW_MEASURES_SCRIPT } from './preview-measures.js'

describe('the page measuring script', () => {
  // The script's behavior is proven in a real Chromium against the fixture pages of the design-agent
  // package (their measures are stored beside them); a unit test has no layout to measure, so it
  // checks that the text compiles as one expression and is not tied to any one page.
  it('is one expression that compiles', () => {
    expect(() => new Function(`return ${PREVIEW_MEASURES_SCRIPT}`)).not.toThrow()
  })

  it('reads the page only: it never writes, navigates or sends anything', () => {
    for (const forbidden of [
      'fetch(',
      'XMLHttpRequest',
      'localStorage',
      'sendBeacon',
      'location.href =',
      'innerHTML',
      '.click(',
    ]) {
      expect(PREVIEW_MEASURES_SCRIPT).not.toContain(forbidden)
    }
  })
})
