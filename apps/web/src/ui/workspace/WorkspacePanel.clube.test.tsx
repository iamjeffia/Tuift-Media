// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClubeStatus } from '@harness/contracts'
import { setLanguage } from '../../i18n/index.js'
import { TestTransport } from '../../test-transport.js'
import { WorkspacePanel } from './WorkspacePanel.js'

afterEach(() => {
  cleanup()
  setLanguage('en', { persist: false })
})

const connected: ClubeStatus = {
  state: 'connected',
  account: { name: 'Pessoa', email: 'pessoa@example.test', plan: 'mensal' },
  subscriber: true,
}

function transportWith(status: () => ClubeStatus) {
  return new TestTransport(async (method) => {
    if (method === 'clube.status') return status()
    if (method === 'clube.library.search') {
      return {
        ok: true,
        total: 0,
        items: [],
        next: null,
        facets: { kind: [], style: [], tool: [], scene: [], format: [] },
      }
    }
    if (method === 'clube.library.limits') return { ok: false, reason: 'unavailable' }
    throw new Error(`unexpected ${method}`)
  })
}

const props = (transport: TestTransport, motion: boolean | undefined) => ({
  open: true,
  expanded: false,
  width: 400,
  transport,
  theme: 'dark' as const,
  sideChatParentStatus: 'idle' as const,
  sideChatStartOptions: { approval: 'ask' as const },
  nativeSurfacesVisible: true,
  onOpen: vi.fn(),
  onClose: vi.fn(),
  onWidthChange: vi.fn(),
  motion,
  onOpenClubeSettings: vi.fn(),
})

describe('the Clube tab of the side panel', () => {
  it('is always offered in a Motion chat, without asking the account', () => {
    const transport = transportWith(() => ({ state: 'disconnected' }))
    render(<WorkspacePanel {...props(transport, true)} />)
    expect(screen.getByRole('button', { name: 'Clube' })).toBeTruthy()
    expect(transport.requests.filter((entry) => entry.method === 'clube.status')).toHaveLength(0)
  })

  it('is not offered in another chat while no account is linked', async () => {
    const transport = transportWith(() => ({ state: 'disconnected' }))
    render(<WorkspacePanel {...props(transport, false)} />)
    await waitFor(() =>
      expect(transport.requests.filter((entry) => entry.method === 'clube.status')).toHaveLength(1),
    )
    expect(screen.queryByRole('button', { name: 'Clube' })).toBeNull()
  })

  it('is offered in another chat once an account is linked, and appears when it gets linked', async () => {
    let status: ClubeStatus = { state: 'disconnected' }
    const transport = transportWith(() => status)
    render(<WorkspacePanel {...props(transport, undefined)} />)
    await waitFor(() =>
      expect(transport.requests.filter((entry) => entry.method === 'clube.status')).toHaveLength(1),
    )
    expect(screen.queryByRole('button', { name: 'Clube' })).toBeNull()
    status = connected
    act(() => transport.emit('clube.changed', {}))
    expect(await screen.findByRole('button', { name: 'Clube' })).toBeTruthy()
  })

  it('opens as a tab of its own, with the library', async () => {
    const transport = transportWith(() => connected)
    render(<WorkspacePanel {...props(transport, true)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Clube' }))
    expect(await screen.findByRole('tab', { name: 'Clube' })).toBeTruthy()
    expect(await screen.findByText('Nothing found')).toBeTruthy()
  })

  it('shows the invitation to connect in a Motion chat with no account', async () => {
    const own = props(
      transportWith(() => ({ state: 'disconnected' })),
      true,
    )
    render(<WorkspacePanel {...own} />)
    fireEvent.click(screen.getByRole('button', { name: 'Clube' }))
    expect(await screen.findByText('Connect your Clube do Motion account')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open the Clube settings' }))
    expect(own.onOpenClubeSettings).toHaveBeenCalledTimes(1)
  })

  it('is called Clube in Portuguese too', () => {
    setLanguage('pt-BR', { persist: false })
    render(
      <WorkspacePanel
        {...props(
          transportWith(() => connected),
          true,
        )}
      />,
    )
    expect(screen.getByRole('button', { name: 'Clube' })).toBeTruthy()
  })
})
