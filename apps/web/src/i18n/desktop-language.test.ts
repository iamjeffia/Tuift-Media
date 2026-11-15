// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyDocumentLanguage, setLanguage } from './i18n.js'

afterEach(() => {
  delete window.harness
})

function installBridge(setDesktopLanguage: (language: string) => Promise<void>) {
  window.harness = { isDesktop: true, setLanguage: setDesktopLanguage } as never
}

describe('desktop language hand-off', () => {
  it('tells the desktop shell when the language changes and at startup', () => {
    const setDesktopLanguage = vi.fn(() => Promise.resolve())
    installBridge(setDesktopLanguage)
    applyDocumentLanguage()
    expect(setDesktopLanguage).toHaveBeenLastCalledWith('en')
    setLanguage('pt-BR', { persist: false })
    expect(setDesktopLanguage).toHaveBeenLastCalledWith('pt-BR')
    expect(setDesktopLanguage).toHaveBeenCalledTimes(2)
    setLanguage('pt-BR', { persist: false })
    expect(setDesktopLanguage).toHaveBeenCalledTimes(2)
  })

  it('keeps working in a browser and when the shell rejects or throws', () => {
    expect(() => applyDocumentLanguage()).not.toThrow()
    installBridge(() => Promise.reject(new Error('shell is gone')))
    expect(() => applyDocumentLanguage()).not.toThrow()
    installBridge(() => {
      throw new Error('bridge broke')
    })
    expect(() => setLanguage('pt-BR', { persist: false })).not.toThrow()
  })
})
