// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SidebarSettings } from '@harness/contracts'
import { LANGUAGE_KEY, getLanguage, translate } from '../i18n/index.js'
import { GeneralSettings } from './GeneralSettings.js'
import { SETTINGS_SEARCH_ENTRIES, localizeSettingsEntry } from './settings/settings-search.js'

const sidebarSettings: SidebarSettings = { mode: 'inbox', autoSettleDays: 7 }

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('General settings language', () => {
  it('switches the page to Portuguese and remembers the choice', () => {
    render(<GeneralSettings sidebarSettings={sidebarSettings} onSidebarSettingsChange={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'General' })).toBeTruthy()

    fireEvent.click(screen.getByRole('combobox', { name: 'Language' }))
    fireEvent.click(screen.getByRole('option', { name: 'Português (Brasil)' }))

    expect(getLanguage()).toBe('pt-BR')
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe('pt-BR')
    expect(screen.getByRole('heading', { name: 'Geral' })).toBeTruthy()
    expect(screen.getByText('Barra lateral')).toBeTruthy()
    expect(screen.getByText('após 7 dias')).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Recolher chats parados' })).toBeTruthy()
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('7 dias')
  })
})

describe('settings search entries', () => {
  it('keep the English text in step with the catalog, so the two cannot drift', () => {
    const keyed = SETTINGS_SEARCH_ENTRIES.filter((entry) => entry.titleKey || entry.descriptionKey)
    expect(keyed.length).toBeGreaterThan(10)
    for (const entry of keyed) {
      const english = localizeSettingsEntry(entry, (key) => translate('en', key))
      expect(english.title, entry.id).toBe(entry.title)
      expect(english.description, entry.id).toBe(entry.description)
    }
  })

  it('read in Portuguese through the catalog', () => {
    const language = SETTINGS_SEARCH_ENTRIES.find((entry) => entry.id === 'general-language')!
    expect(localizeSettingsEntry(language, (key) => translate('pt-BR', key)).title).toBe('Idioma')
  })
})
