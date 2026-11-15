// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { setLanguage } from '../i18n/index.js'
import { TestTransport } from '../test-transport.js'
import { createDefaultKeybindings } from '../shortcuts.js'
import { Settings, type SettingsSection } from './Settings.js'

afterEach(cleanup)

function renderIn(initialSection: SettingsSection, showDebug = false) {
  setLanguage('pt-BR', { persist: false })
  return render(
    <Settings
      provider="codex"
      providerName="Codex"
      transport={new TestTransport()}
      projectPath={undefined}
      projectName={undefined}
      account={undefined}
      providerStatuses={[]}
      models={[]}
      hiddenModels={new Set()}
      onModelVisibilityChange={() => {}}
      onModelsVisibilityChange={() => {}}
      onConnectionsChanged={() => {}}
      projectCount={2}
      sidebarSettings={{ mode: 'classic', autoSettleDays: 3 }}
      onSidebarSettingsChange={() => {}}
      themeColorScheme="dark"
      themePreference="system"
      onThemePreferenceChange={() => {}}
      appearancePreferences={{
        light: { font: 'geist', accent: 'neutral', backdrop: 'default', glass: 0 },
        dark: { font: 'geist', accent: 'ocean', backdrop: 'default', glass: 0 },
      }}
      onAppearancePreferenceChange={() => {}}
      showMacOSFontSmoothing={false}
      macOSFontSmoothing={true}
      onMacOSFontSmoothingChange={() => {}}
      macOS={true}
      keybindings={createDefaultKeybindings()}
      onAccountChange={() => {}}
      initialSection={initialSection}
      showDebug={showDebug}
      onReset={() => {}}
      onClose={() => {}}
      onOpenChat={() => {}}
    />,
  )
}

describe('Settings in Portuguese', () => {
  it('translates Appearance, including the colour names and the font search', () => {
    renderIn('appearance')
    expect(screen.getByRole('heading', { name: 'Aparência' })).toBeTruthy()
    expect(screen.getByText('Modo claro')).toBeTruthy()
    expect(screen.getByText('Modo escuro')).toBeTruthy()
    expect(screen.getAllByText('Fonte da interface').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Translucidez da barra lateral').length).toBe(2)
    expect(screen.getByRole('radio', { name: /Escuro/ })).toBeTruthy()
    // Only the dark mode has left the neutral accent, so only it offers a reset.
    expect(screen.getAllByRole('button', { name: 'Redefinir cores' })).toHaveLength(1)
  })

  it('translates Data & privacy with the project count in the plural', () => {
    renderIn('data')
    expect(screen.getByRole('heading', { name: 'Dados e privacidade' })).toBeTruthy()
    expect(screen.getByText('Redefinir preferências do app')).toBeTruthy()
    expect(
      screen.getByText(/2 projetos, workspaces, arquivos, histórico de chats e credenciais/),
    ).toBeTruthy()
  })

  it('translates About and the Debug rows', () => {
    renderIn('about', true)
    expect(screen.getByRole('heading', { name: 'Sobre' })).toBeTruthy()
    expect(screen.getByText('Atualizações')).toBeTruthy()
    expect(screen.getByText('Código-fonte')).toBeTruthy()
    cleanup()
    renderIn('debug', true)
    expect(screen.getByRole('button', { name: 'Forçar onboarding' })).toBeTruthy()
    expect(screen.getByText('Simular atualização do app')).toBeTruthy()
  })

  it('translates the Models page', () => {
    renderIn('models')
    expect(screen.getByText('Trabalho em segundo plano')).toBeTruthy()
    expect(screen.getByText('Subagentes')).toBeTruthy()
  })
})
