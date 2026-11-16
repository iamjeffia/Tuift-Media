// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { McpServer } from '@harness/contracts'
import {
  McpServerCard,
  knownServerIcon,
  mcpCardState,
  serverIconWords,
  serverMonogram,
} from './McpServerCard.js'

afterEach(cleanup)

function server(overrides: Partial<McpServer> = {}): McpServer {
  return {
    id: 'docs',
    scope: 'project',
    enabled: true,
    tools: [],
    resources: [],
    resourceTemplates: [],
    ...overrides,
  }
}

const capabilities = {
  inventory: true,
  add: true,
  update: true,
  remove: true,
  reload: false,
  startOAuth: true,
  cancelOAuth: false,
}

function card(item: McpServer, props: { busy?: boolean; signingIn?: boolean } = {}) {
  return render(
    <McpServerCard
      server={item}
      capabilities={capabilities}
      providerName="Codex"
      busy={props.busy ?? false}
      signingIn={props.signingIn ?? false}
      onSignIn={vi.fn()}
      onToggle={vi.fn()}
      onEdit={vi.fn()}
      onRemove={vi.fn()}
    />,
  )
}

describe('MCP server icons', () => {
  it('reads known marks from the id, name, host and command, most specific first', () => {
    const github = server({ id: 'github' })
    const byHost = server({
      id: 'x1',
      transport: { type: 'http', url: 'https://mcp.notion.com/mcp' },
    })
    const byCommand = server({
      id: 'x2',
      transport: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-slack'],
      },
    })
    expect(knownServerIcon(github)).toBeDefined()
    expect(knownServerIcon(byHost)).toBeDefined()
    expect(knownServerIcon(byCommand)).toBeDefined()
    expect(knownServerIcon(github)).not.toBe(knownServerIcon(byHost))
    expect(serverIconWords(byHost)).toEqual(['x1', 'mcp', 'notion', 'com'])
  })

  it('matches whole words only, so a name that merely contains one stays a monogram', () => {
    expect(knownServerIcon(server({ id: 'githubber' }))).toBeUndefined()
    expect(knownServerIcon(server({ id: 'my-notes' }))).toBeUndefined()
    expect(serverMonogram(server({ id: '_acme' }))).toBe('A')
    expect(serverMonogram(server({ id: 'x', displayName: 'élan' }))).toBe('É')
  })

  it('draws a mark tile for a known server and a tinted letter for an unknown one', () => {
    const { container, unmount } = card(server({ id: 'figma' }))
    expect(container.querySelector('.mcp-card__icon svg')).not.toBeNull()
    expect(container.querySelector('.mcp-card__icon--monogram')).toBeNull()
    unmount()
    const unknown = card(server({ id: 'acme-tools' }))
    const tile = unknown.container.querySelector<HTMLElement>('.mcp-card__icon--monogram')
    expect(tile?.textContent).toBe('A')
  })
})

describe('MCP card state', () => {
  it('ranks disabled, failed, sign-in, then the startup report', () => {
    const ready = { state: 'ready' } as const
    const failed = { state: 'failed', message: 'boom' } as const
    const signin = { status: 'sign_in_required', method: 'oauth' } as const
    expect(mcpCardState(server({ enabled: false, startup: failed }))).toBe('disabled')
    expect(mcpCardState(server({ startup: failed, auth: signin }))).toBe('failed')
    expect(mcpCardState(server({ startup: ready, auth: signin }))).toBe('signin')
    expect(mcpCardState(server({ startup: { state: 'starting' } }))).toBe('connecting')
    expect(mcpCardState(server({ startup: ready }))).toBe('connected')
    expect(mcpCardState(server({ startup: { state: 'stopped' } }))).toBe('idle')
    expect(mcpCardState(server())).toBe('unknown')
  })

  it.each([
    ['connected', { startup: { state: 'ready' } }, 'Connected'],
    ['signin', { auth: { status: 'sign_in_required', method: 'oauth' } }, 'Needs sign-in'],
    ['connecting', { startup: { state: 'starting' } }, 'Connecting…'],
    ['disabled', { enabled: false }, 'Disabled'],
    ['unknown', {}, 'Status unavailable'],
  ] as const)('shows the %s card with its own status', (state, overrides, label) => {
    const { container } = card(server(overrides as Partial<McpServer>))
    const element = container.querySelector<HTMLElement>('.mcp-card')
    expect(element?.dataset['state']).toBe(state)
    expect(container.querySelector('.mcp-card__status')?.textContent).toBe(label)
  })

  it('shows a spinner and locks the controls while a change is in flight', () => {
    const { container } = card(server({ startup: { state: 'ready' } }), { busy: true })
    expect(container.querySelector('.mcp-card__status .spinner')).not.toBeNull()
    expect(container.querySelector('.mcp-card__status')?.textContent).toBe('Updating…')
    expect(container.querySelector('.mcp-card')?.getAttribute('aria-busy')).toBe('true')
    for (const button of screen.getAllByRole('button')) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it('reads a failure in place and keeps Sign in beside it', () => {
    const { container } = card(
      server({
        startup: { state: 'failed', message: 'OAuth token expired' },
        auth: { status: 'sign_in_required', method: 'oauth' },
      }),
    )
    expect(screen.getByRole('alert').textContent).toBe('OAuth token expired')
    expect(container.querySelector('.mcp-card__status')?.textContent).toBe('Failed')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  })
})

describe('the server provided by the Clube link', () => {
  it('says who provides it and offers no control over it', () => {
    const { container } = card(
      server({
        id: 'tuift-clube',
        displayName: 'Clube do Motion',
        scope: 'global',
        providedBy: 'clube',
        transport: { type: 'http', url: 'https://clubedomotion.com/mcp' },
        startup: { state: 'ready' },
      }),
    )
    expect(screen.getByText('Provided by your Clube do Motion account link.')).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(container.querySelector('details')?.hasAttribute('hidden')).toBe(true)
  })
})
