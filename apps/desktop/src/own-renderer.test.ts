import { describe, expect, it } from 'vitest'
import { isRendererFileUrl, rendererFileUrl } from './own-renderer.js'

// Chromium reports the canonical form of whatever URL was loaded.
const loaded = (index: string, windows: boolean) => new URL(rendererFileUrl(index, windows)).href

describe('isRendererFileUrl', () => {
  it('matches the loaded renderer whatever case Windows started it with', () => {
    const index = 'c:\\Users\\me\\AppData\\Local\\Programs\\TUIFT Code\\resources\\web\\index.html'
    const url =
      'file:///C:/Users/me/AppData/Local/Programs/TUIFT Code/resources/web/index.html#/chat?x=1'
    expect(isRendererFileUrl(url, index, true)).toBe(true)
  })

  it('rejects other files and schemes', () => {
    const index = 'C:\\TUIFT Code\\resources\\web\\index.html'
    expect(isRendererFileUrl('file:///C:/TUIFT Code/resources/web/other.html', index, true)).toBe(
      false,
    )
    expect(isRendererFileUrl('file:///D:/TUIFT Code/resources/web/index.html', index, true)).toBe(
      false,
    )
    expect(isRendererFileUrl('https://example.com/index.html', index, true)).toBe(false)
  })

  it('stays exact on case-sensitive POSIX paths', () => {
    const index = '/Applications/TUIFT Code.app/Contents/Resources/web/index.html'
    expect(isRendererFileUrl(`file://${index}`, index, false)).toBe(true)
    expect(isRendererFileUrl(`file://${index.toLowerCase()}`, index, false)).toBe(false)
  })

  it('recognizes the URL it loads the renderer from', () => {
    const windows = 'C:\\Program Files\\TUIFT Code\\resources\\web\\index.html'
    const posix = '/Applications/TUIFT Code.app/Contents/Resources/web/index.html'
    expect(isRendererFileUrl(loaded(windows, true), windows, true)).toBe(true)
    expect(isRendererFileUrl(loaded(posix, false), posix, false)).toBe(true)
  })

  it('recognizes its renderer under an install path containing a percent sign', () => {
    for (const index of [
      'C:\\Users\\100%Dev\\AppData\\Local\\Programs\\TUIFT Code\\resources\\web\\index.html',
      'C:\\Users\\50% off\\TUIFT Code\\resources\\web\\index.html',
    ])
      expect(isRendererFileUrl(loaded(index, true), index, true)).toBe(true)
    for (const index of [
      '/Users/x/100%Dev/TUIFT Code.app/Contents/Resources/web/index.html',
      '/Users/x/50% off/TUIFT Code.app/Contents/Resources/web/index.html',
    ])
      expect(isRendererFileUrl(loaded(index, false), index, false)).toBe(true)
  })
})
