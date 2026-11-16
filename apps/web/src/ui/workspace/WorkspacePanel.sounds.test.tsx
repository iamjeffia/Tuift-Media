// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setLanguage } from '../../i18n/index.js'
import { TestTransport } from '../../test-transport.js'
import { WorkspacePanel } from './WorkspacePanel.js'

afterEach(cleanup)

const idle = new TestTransport(async (method) => {
  if (method === 'clube.status') return { state: 'disconnected' }
  throw new Error(`unexpected ${method}`)
})

const props = (motion: boolean | undefined) => ({
  open: true,
  expanded: false,
  width: 400,
  transport: idle,
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

describe('the Sounds tab of the side panel', () => {
  it('is offered in a Motion chat, and only there', () => {
    const { rerender } = render(<WorkspacePanel {...props(false)} />)
    expect(screen.queryByRole('button', { name: 'Sounds' })).toBeNull()
    rerender(<WorkspacePanel {...props(true)} />)
    expect(screen.getByRole('button', { name: 'Sounds' })).toBeTruthy()
  })

  it('opens as a tab of its own and, with no account linked, invites to connect', async () => {
    const own = props(true)
    render(<WorkspacePanel {...own} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sounds' }))
    expect(await screen.findByText('Connect your Clube do Motion account')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Sounds' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open the Clube settings' }))
    expect(own.onOpenClubeSettings).toHaveBeenCalledTimes(1)
  })

  it('is called Sons in Portuguese', () => {
    setLanguage('pt-BR', { persist: false })
    render(<WorkspacePanel {...props(true)} />)
    expect(screen.getByRole('button', { name: 'Sons' })).toBeTruthy()
  })
})
