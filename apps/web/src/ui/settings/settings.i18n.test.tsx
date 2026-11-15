// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { McpServer, PhoneAccessStatus } from '@harness/contracts'
import { setLanguage, translate } from '../../i18n/index.js'
import type { Transport } from '../../transport.js'
import { McpServerCard } from '../McpServerCard.js'
import { PhoneSettings } from '../PhoneSettings.js'
import { UsageSheet } from '../usage/UsageSheet.js'
import { formatTokens, resetText } from '../usage/usage-format.js'
import { emptySheetText, indexedAgo, listText } from '../usage/usage-sheets.js'
import { localizeSettingsEntry, SETTINGS_SEARCH_ENTRIES } from './settings-search.js'
import { providerTuningEntries } from './provider-tuning-search.js'

vi.mock('../../bridge.js', () => ({ writeClipboardText: vi.fn() }))

afterEach(cleanup)

const NOW = Date.UTC(2026, 9, 18, 10)

describe('Settings pages in Portuguese', () => {
  it('reads the Phone page through the catalog', async () => {
    setLanguage('pt-BR', { persist: false })
    const status: PhoneAccessStatus = {
      enabled: true,
      listening: true,
      port: 4317,
      serverName: 'Studio Mac',
      addresses: [{ host: '192.168.1.20', kind: 'lan' }],
      devices: [],
    }
    const transport = {
      state: 'open',
      request: vi.fn(async () => status),
      on: vi.fn(() => () => {}),
      onState: vi.fn(() => () => {}),
    } as unknown as Transport
    render(<PhoneSettings transport={transport} />)
    expect(await screen.findByRole('switch', { name: 'Acesso pelo celular' })).toBeTruthy()
    expect(screen.getByText('Porta 4317')).toBeTruthy()
    expect(screen.getByText('Parear um celular')).toBeTruthy()
    expect(screen.getByText('Nenhum celular pareado ainda.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mostrar código de pareamento' })).toBeTruthy()
  })

  it('reads a usage sheet and its plan limits in Portuguese', () => {
    setLanguage('pt-BR', { persist: false })
    const sheet = {
      provider: 'codex' as const,
      name: 'Codex',
      activeDays: 1,
      slots: [{ tokens: 1_000, value: 10 }],
      empty: false,
      models: [],
      sessions: 1_234,
      tokens: 4_000,
      value: 40,
      accounts: [
        {
          key: 'codex',
          label: 'Codex',
          sessions: 1,
          tokens: 4_000,
          value: 40,
          limits: {
            rows: [{ label: 'Weekly', left: 5, state: 'low' as const, resetsAt: NOW + 3_600_000 }],
            retryable: false,
          },
        },
      ],
    }
    render(
      <UsageSheet
        sheet={sheet}
        index={0}
        axis={{ slots: ['17 de out.'], ticks: [], start: '17 de out.', end: 'Hoje' }}
        unit="day"
        emptyText={undefined}
        now={NOW}
        onRetry={() => {}}
      />,
    )
    expect(screen.getByText('1.234 sessões')).toBeTruthy()
    expect(screen.getByText('Limites do plano')).toBeTruthy()
    expect(screen.getByText('5% restante')).toBeTruthy()
    expect(screen.getByText('reinicia em 1h')).toBeTruthy()
  })

  it('names the state of an MCP server card in Portuguese', () => {
    setLanguage('pt-BR', { persist: false })
    const server = {
      id: 'linear',
      displayName: 'Linear',
      enabled: true,
      scope: 'project',
      transport: { type: 'http', url: 'https://example.com/mcp' },
      startup: { state: 'ready' },
      tools: [],
      resources: [],
      resourceTemplates: [],
    } as unknown as McpServer
    render(
      <McpServerCard
        server={server}
        capabilities={{ update: true, remove: true, add: true, inventory: true } as never}
        providerName="Codex"
        busy={false}
        signingIn={false}
        onSignIn={() => {}}
        onToggle={() => {}}
        onEdit={() => {}}
        onRemove={() => {}}
      />,
    )
    expect(screen.getByText('Conectado')).toBeTruthy()
    expect(screen.getByText('0 ferramentas · 0 recursos · 0 templates')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy()
  })

  it('formats numbers, resets and lists in the language', () => {
    setLanguage('pt-BR', { persist: false })
    expect(formatTokens(12_340)).toBe('12,3K')
    expect(resetText(NOW + 42 * 60_000, NOW)?.label).toBe('reinicia em 42min')
    expect(resetText(NOW + 3 * 3_600_000 + 53 * 60_000, NOW)?.label).toBe('reinicia em 3h 53min')
    expect(indexedAgo(NOW - 5 * 60_000, NOW)).toBe('há 5 min')
    expect(indexedAgo(NOW - 50 * 3_600_000, NOW)).toBe('há 2 dias')
    expect(listText(['Claude Code', 'Codex', 'Grok'])).toBe('Claude Code, Codex e Grok')
    expect(emptySheetText('7d')).toBe('Nenhuma sessão nos últimos 7 dias')
  })

  it('searches settings by their Portuguese titles and keeps provider rows readable', () => {
    setLanguage('pt-BR', { persist: false })
    const localize = (id: string) =>
      localizeSettingsEntry(
        SETTINGS_SEARCH_ENTRIES.find((entry) => entry.id === id)!,
        (key) => translate('pt-BR', key),
      )
    expect(localize('phone-access').title).toBe('Acesso pelo celular')
    expect(localize('debug-usage').title).toBe('Índice do histórico de uso')
    expect(localize('appearance:dark:accent').title).toBe('Destaque do tema escuro')
    const [first] = providerTuningEntries(
      [{ id: 'codex', displayName: 'Codex', installed: true, auth: 'authenticated' } as never],
      [],
      new Map([['codex', { signedIn: true }]]),
    )
    expect(first?.title).toBe('Modelo de Codex')
  })
})
