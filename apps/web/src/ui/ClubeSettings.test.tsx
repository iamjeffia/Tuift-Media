// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CLUBE_PLANS_URL, type ClubeFailure, type ClubeStatus } from '@harness/contracts'
import { setLanguage, translate } from '../i18n/index.js'
import { en } from '../i18n/en.js'
import { ptBR } from '../i18n/pt-BR.js'
import type { Transport } from '../transport.js'
import { ClubeSettings } from './ClubeSettings.js'

const picked = vi.hoisted(() => ({ folder: undefined as string | undefined }))
vi.mock('../bridge.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../bridge.js')>()),
  pickFolder: vi.fn(async () => picked.folder),
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const account = { name: 'Pessoa de Teste', email: 'pessoa@example.test', plan: 'mensal' as const }
const AUTH_URL = 'https://clubedomotion.com/oauth/autorizar?state=abc'

function client(
  initial: ClubeStatus,
  sounds: { enabled: boolean; ownFolder?: string } = { enabled: true },
) {
  let status = initial
  const listeners = new Map<string, () => void>()
  const calls: string[] = []
  const transport = {
    state: 'open',
    request: vi.fn(async (method: string, params?: unknown) => {
      calls.push(method)
      if (method === 'sounds.settings') return sounds
      if (method === 'sounds.updateSettings') {
        const patch = params as { enabled?: boolean; ownFolder?: string | null }
        if (patch.ownFolder === 'C:\\refused') throw new Error('refused')
        sounds = {
          enabled: patch.enabled ?? sounds.enabled,
          ...(patch.ownFolder === null
            ? {}
            : patch.ownFolder
              ? { ownFolder: patch.ownFolder }
              : sounds.ownFolder
                ? { ownFolder: sounds.ownFolder }
                : {}),
        }
        return sounds
      }
      if (method === 'clube.status') return status
      if (method === 'clube.connect') {
        status = { state: 'connecting' }
        return { authUrl: AUTH_URL }
      }
      if (method === 'clube.cancel' || method === 'clube.disconnect') {
        status = { state: 'disconnected' }
        return status
      }
      throw new Error(`unexpected ${method}`)
    }),
    on: vi.fn((channel: string, listener: () => void) => {
      listeners.set(channel, listener)
      return () => listeners.delete(channel)
    }),
    onState: vi.fn(() => () => {}),
  } as unknown as Transport
  return {
    transport,
    calls,
    change: (next: ClubeStatus) => {
      status = next
      listeners.get('clube.changed')?.()
    },
  }
}

describe('Clube do Motion settings', () => {
  it('offers Connect when nothing is linked, opens the Clube’s page and waits for the browser', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const { transport, calls } = client({ state: 'disconnected' })
    render(<ClubeSettings transport={transport} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Connect' }))
    await waitFor(() => expect(screen.getByText('Waiting for the browser…')).toBeTruthy())
    expect(calls.filter((call) => call.startsWith('clube.'))).toEqual([
      'clube.status',
      'clube.connect',
    ])
    expect(open).toHaveBeenCalledWith(AUTH_URL, '_blank', 'noopener,noreferrer')
    expect(screen.getByRole('button', { name: 'Open the page again' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await screen.findByRole('button', { name: 'Connect' })
    expect(calls.at(-1)).toBe('clube.cancel')
  })

  it('follows the server when the link changes, and shows the account in plain words', async () => {
    const { transport, change } = client({ state: 'connecting' })
    render(<ClubeSettings transport={transport} />)
    await screen.findByText('Waiting for the browser…')

    act(() => change({ state: 'connected', account, subscriber: true }))
    expect(await screen.findByText('Pessoa de Teste')).toBeTruthy()
    expect(screen.getByText('pessoa@example.test')).toBeTruthy()
    expect(screen.getByText('Monthly')).toBeTruthy()
    expect(screen.getByText('On in new chats')).toBeTruthy()
    expect(screen.queryByText(/no active subscription/)).toBeNull()
  })

  it('says what is missing, with a link to the plans, for an account without a subscription', async () => {
    const { transport } = client({
      state: 'connected',
      account: { ...account, plan: 'grátis' },
      subscriber: false,
    })
    render(<ClubeSettings transport={transport} />)
    expect(await screen.findByText('Free account')).toBeTruthy()
    expect(screen.getByText(/no active subscription/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'See the plans' }).getAttribute('href')).toBe(
      CLUBE_PLANS_URL,
    )
    expect(screen.queryByText('MCP server')).toBeNull()
  })

  it('disconnects from the connected page', async () => {
    const { transport, calls } = client({ state: 'connected', account, subscriber: true })
    render(<ClubeSettings transport={transport} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }))
    await screen.findByRole('button', { name: 'Connect' })
    expect(calls.at(-1)).toBe('clube.disconnect')
  })

  it('keeps the link on screen when the account cannot be read', async () => {
    const { transport } = client({ state: 'connected' })
    render(<ClubeSettings transport={transport} />)
    expect(await screen.findByText(/Could not read the account right now/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy()
  })

  it.each([
    ['denied', 'The sign-in was not allowed on the Clube page. Connect again when you want.'],
    ['timeout', 'The sign-in took too long and was closed. Connect again.'],
    ['mismatch', 'The Clube did not accept the sign-in answer. Connect again.'],
    ['unreachable', 'Could not reach the Clube. Check your connection and connect again.'],
    [
      'unlinked',
      'The Clube refused to renew the access, so this app was disconnected. Connect again.',
    ],
    ['failed', 'The sign-in failed. Connect again.'],
  ] as Array<[ClubeFailure, string]>)('shows why a sign-in ended: %s', async (failure, words) => {
    const { transport } = client({ state: 'disconnected', failure })
    render(<ClubeSettings transport={transport} />)
    expect((await screen.findByRole('alert')).textContent).toContain(words)
    expect(screen.getByRole('button', { name: 'Connect' })).toBeTruthy()
  })

  it('says so when the server cannot be reached', async () => {
    const transport = {
      state: 'open',
      request: vi.fn(async () => {
        throw new Error('forbidden')
      }),
      on: vi.fn(() => () => {}),
      onState: vi.fn(() => () => {}),
    } as unknown as Transport
    render(<ClubeSettings transport={transport} />)
    expect((await screen.findByRole('alert')).textContent).toContain('Could not reach')
  })
})

describe('Clube do Motion settings in Portuguese', () => {
  const clubeKeys = Object.keys(en).filter((key) => /clube/i.test(key)) as Array<keyof typeof en>

  it('has a Portuguese message for every Clube string, never the English one', () => {
    expect(clubeKeys.length).toBeGreaterThan(30)
    for (const key of clubeKeys) {
      const portuguese = ptBR[key]
      expect(portuguese, key).toBeTruthy()
      // The product's own name is the same in both; every sentence is written, not copied.
      if (!['Clube do Motion', 'E-mail'].includes(en[key]))
        expect(portuguese, key).not.toBe(en[key])
    }
  })

  it('renders each state through the catalog', async () => {
    setLanguage('pt-BR', { persist: false })
    const states: Array<[ClubeStatus, string[]]> = [
      [
        { state: 'disconnected' },
        [
          translate('pt-BR', 'settings.clube.account.name'),
          translate('pt-BR', 'settings.clube.off.note'),
          translate('pt-BR', 'settings.clube.connect'),
        ],
      ],
      [
        { state: 'connecting' },
        [
          translate('pt-BR', 'settings.clube.connecting.state'),
          translate('pt-BR', 'settings.clube.connecting.note'),
          translate('pt-BR', 'settings.clube.cancel'),
        ],
      ],
      [
        { state: 'connected', account, subscriber: true },
        [
          translate('pt-BR', 'settings.clube.name'),
          translate('pt-BR', 'settings.clube.email'),
          translate('pt-BR', 'settings.clube.plan'),
          translate('pt-BR', 'settings.clube.plan.mensal'),
          translate('pt-BR', 'settings.clube.mcp.name'),
          translate('pt-BR', 'settings.clube.mcp.on'),
          translate('pt-BR', 'settings.clube.mcp.note'),
          translate('pt-BR', 'settings.clube.disconnect.note'),
        ],
      ],
      [
        { state: 'connected', account: { ...account, plan: 'grátis' }, subscriber: false },
        [
          translate('pt-BR', 'settings.clube.plan.gratis'),
          translate('pt-BR', 'settings.clube.noSubscription'),
          translate('pt-BR', 'settings.clube.plans'),
        ],
      ],
      [
        { state: 'connected', account: { ...account, plan: 'anual' }, subscriber: true },
        [translate('pt-BR', 'settings.clube.plan.anual')],
      ],
      [
        { state: 'connected', account: { ...account, plan: 'teste' }, subscriber: false },
        [translate('pt-BR', 'settings.clube.plan.teste')],
      ],
      [
        { state: 'connected', account: { ...account, plan: 'tuift' }, subscriber: true },
        [translate('pt-BR', 'settings.clube.plan.tuift')],
      ],
      [{ state: 'connected' }, [translate('pt-BR', 'settings.clube.accountUnavailable')]],
    ]
    for (const [status, words] of states) {
      const { transport } = client(status)
      const view = render(<ClubeSettings transport={transport} />)
      await screen.findByRole('heading', { name: 'Clube do Motion' })
      await waitFor(() => expect(view.container.textContent).not.toContain('Loading'))
      for (const word of words) expect(view.container.textContent, word).toContain(word)
      view.unmount()
    }
    for (const failure of [
      'denied',
      'timeout',
      'mismatch',
      'unreachable',
      'unlinked',
      'failed',
    ] as const) {
      const { transport } = client({ state: 'disconnected', failure })
      const view = render(<ClubeSettings transport={transport} />)
      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toBe(translate('pt-BR', `settings.clube.failure.${failure}`))
      view.unmount()
    }
    // The page's own description and the nav label.
    const { transport } = client({ state: 'disconnected' })
    const view = render(<ClubeSettings transport={transport} />)
    expect(await screen.findByText(translate('pt-BR', 'settings.clube.description'))).toBeTruthy()
    view.unmount()
  })
})

describe('the sounds rows of the Clube settings', () => {
  it('turns the library on and off for the agents, and names what it needs', async () => {
    const { transport, calls } = client({ state: 'connected', account, subscriber: true })
    render(<ClubeSettings transport={transport} />)
    const toggle = await screen.findByRole('switch', { name: "Use the app's sounds" })
    await waitFor(() => expect((toggle as HTMLButtonElement).disabled).toBe(false))
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText(/The Sounds tab works either way\./)).toBeTruthy()
    expect(screen.queryByText(/Needs a connected Clube do Motion account/)).toBeNull()

    fireEvent.click(toggle)
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'))
    expect(calls).toContain('sounds.updateSettings')
  })

  it('says the library needs an account with a subscription when there is none', async () => {
    const { transport } = client({ state: 'disconnected' })
    render(<ClubeSettings transport={transport} />)
    expect(
      await screen.findByText(/Needs a connected Clube do Motion account with a subscription\./),
    ).toBeTruthy()
  })

  it('keeps the folder only as a path: chooses, changes, removes, and says when it is refused', async () => {
    const { transport } = client({ state: 'connected', account, subscriber: true })
    render(<ClubeSettings transport={transport} />)
    expect(await screen.findByText('No folder chosen')).toBeTruthy()

    picked.folder = 'D:\\Sons\\meus'
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }))
    expect(await screen.findByText(/D:\\Sons\\meus/)).toBeTruthy()
    expect(screen.queryByText('No folder chosen')).toBeNull()
    expect(screen.getByRole('button', { name: 'Change' })).toBeTruthy()

    picked.folder = 'C:\\refused'
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'That folder could not be used.',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(await screen.findByText('No folder chosen')).toBeTruthy()
  })

  it('is worded in Portuguese', async () => {
    setLanguage('pt-BR', { persist: false })
    const { transport } = client(
      { state: 'connected', account, subscriber: true },
      { enabled: true, ownFolder: 'D:\\Sons\\meus' },
    )
    render(<ClubeSettings transport={transport} />)
    expect(await screen.findByRole('heading', { name: 'Sons' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Usar os sons do app' })).toBeTruthy()
    expect(screen.getByText(/A aba Sons funciona de qualquer jeito\./)).toBeTruthy()
    expect(screen.getByText('Minha pasta de sons')).toBeTruthy()
    expect(screen.getByText(/Nada é copiado nem indexado\./)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Trocar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remover' })).toBeTruthy()
    cleanup()

    const bare = client({ state: 'disconnected' })
    render(<ClubeSettings transport={bare.transport} />)
    expect(await screen.findByText('Nenhuma pasta escolhida')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Escolher pasta' })).toBeTruthy()
    expect(
      screen.getByText(/Precisa de uma conta do Clube do Motion conectada e com assinatura\./),
    ).toBeTruthy()
  })
})
