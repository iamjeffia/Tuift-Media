// @vitest-environment happy-dom
import type { ClubeStatus } from '@harness/contracts'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setLanguage, translate } from '../i18n/index.js'
import { Onboarding } from './Onboarding.js'

vi.mock('../bridge.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../bridge.js')>()),
  isDesktop: false,
  buildEdition: undefined,
  setDesktopTheme: vi.fn(() => Promise.resolve()),
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

type Props = Parameters<typeof Onboarding>[0]

const AUTH_URL = 'https://clubedomotion.com/oauth/autorizar?state=abc'

function setup(initial: ClubeStatus, withTransport = true) {
  let status = initial
  const listeners = new Map<string, () => void>()
  const request = vi.fn(async (method: string) => {
    if (method === 'clube.status') return status
    if (method === 'clube.connect') {
      status = { state: 'connecting' }
      return { authUrl: AUTH_URL }
    }
    if (method === 'clube.cancel') {
      status = { state: 'disconnected' }
      return status
    }
    return {}
  })
  const transport = {
    request,
    on: (channel: string, listener: () => void) => {
      listeners.set(channel, listener)
      return () => listeners.delete(channel)
    },
  } as unknown as Props['transport']
  const props: Props = {
    themePreference: 'system',
    onThemePreferenceChange: vi.fn(),
    onDisplayNameChange: vi.fn(),
    providerStatuses: [],
    providersLoading: false,
    acpAgents: [],
    providerRoster: [],
    onProviderRosterChange: vi.fn(),
    onAddProject: vi.fn(),
    onDismiss: vi.fn(),
    ...(withTransport ? { transport } : {}),
  }
  render(<Onboarding {...props} />)
  return {
    request,
    props,
    change: (next: ClubeStatus) => {
      status = next
      listeners.get('clube.changed')?.()
    },
  }
}

const next = () => fireEvent.click(screen.getByRole('button', { name: /^(Continue|Continuar)/ }))
const toClubeStep = () => {
  fireEvent.click(screen.getByRole('button', { name: /^(Get started|Começar)/ }))
  // name, appearance, agents, sub-agents
  for (let page = 0; page < 4; page += 1) next()
}

describe('the Clube do Motion step of the onboarding', () => {
  it('sits between sub-agents and the first project, optional and skippable', async () => {
    setup({ state: 'disconnected' })
    toClubeStep()
    expect(screen.getByRole('heading', { name: 'Connect the Clube do Motion' })).toBeTruthy()
    const progress = screen.getByRole('list', { name: 'Setup progress' })
    expect(progress.querySelector('[aria-current="step"]')?.textContent).toBe('Clube do Motion')
    expect(progress.querySelectorAll('li')).toHaveLength(7)

    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }))
    expect(await screen.findByRole('heading', { name: 'Open your first project' })).toBeTruthy()
  })

  it('connects through the Clube’s page and moves on once linked', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const { request, change } = setup({ state: 'disconnected' })
    toClubeStep()
    fireEvent.click(await screen.findByRole('button', { name: /^Connect/ }))
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(AUTH_URL, '_blank', 'noopener,noreferrer'),
    )
    expect(request).toHaveBeenCalledWith('clube.connect', {})
    expect(
      await screen.findByText('Finish signing in on the page that opened in your browser.'),
    ).toBeTruthy()

    act(() =>
      change({
        state: 'connected',
        account: { name: 'Pessoa de Teste', email: 'pessoa@example.test', plan: 'anual' },
        subscriber: true,
      }),
    )
    expect(await screen.findByText('Connected as Pessoa de Teste.')).toBeTruthy()
    next()
    expect(await screen.findByRole('heading', { name: 'Open your first project' })).toBeTruthy()
  })

  it('can cancel the wait', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    const { request } = setup({ state: 'connecting' })
    toClubeStep()
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(request).toHaveBeenCalledWith('clube.cancel', {})
    expect(await screen.findByRole('button', { name: /^Connect/ })).toBeTruthy()
  })

  it('says a free account has no subscription yet', async () => {
    setup({
      state: 'connected',
      account: { name: 'Pessoa', email: 'p@example.test', plan: 'grátis' },
      subscriber: false,
    })
    toClubeStep()
    expect(await screen.findByText(/no active subscription yet/)).toBeTruthy()
  })

  it('shows why the last sign-in ended', async () => {
    setup({ state: 'disconnected', failure: 'timeout' })
    toClubeStep()
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The sign-in took too long and was closed. Connect again.',
    )
  })

  it('is left out of the setup when there is no server to talk to', () => {
    setup({ state: 'disconnected' }, false)
    const progress = screen.getByRole('list', { name: 'Setup progress' })
    expect(progress.querySelectorAll('li')).toHaveLength(6)
  })

  it('reads in Portuguese through the catalog', async () => {
    setLanguage('pt-BR', { persist: false })
    setup({ state: 'disconnected' })
    toClubeStep()
    expect(
      screen.getByRole('heading', { name: translate('pt-BR', 'onboarding.clube.title') }),
    ).toBeTruthy()
    expect(screen.getByText(translate('pt-BR', 'onboarding.clube.lead'))).toBeTruthy()
    expect(
      await screen.findByRole('button', { name: translate('pt-BR', 'onboarding.clube.skip') }),
    ).toBeTruthy()
    expect(
      await screen.findByRole('button', {
        name: new RegExp(`^${translate('pt-BR', 'onboarding.clube.connect')}`),
      }),
    ).toBeTruthy()
    await waitFor(() =>
      expect(document.querySelector('[aria-current="step"]')?.textContent).toBe('Clube do Motion'),
    )
    expect(translate('pt-BR', 'onboarding.clube.connectedAs', { name: 'Ana' })).toBe(
      'Conectado como Ana.',
    )
    expect(translate('pt-BR', 'onboarding.clube.waiting')).toContain('navegador')
    expect(translate('pt-BR', 'onboarding.clube.noSubscription')).toContain('assinatura')
    expect(translate('pt-BR', 'onboarding.clube.connected')).toBe('Conectado.')
  })
})
