// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { en } from '../i18n/en.js'
import { setLanguage, translate } from '../i18n/index.js'
import { RendererErrorBoundary } from '../RendererErrorBoundary.js'
import { chatCount, runningLabel, waitingLabel } from '../app-update-install.js'
import type { Transport } from '../transport.js'
import { CheckoutDiscardDialog } from './CheckoutDiscardDialog.js'
import { FeedbackDialog } from './FeedbackDialog.js'
import { SurfaceErrorBoundary } from './SurfaceErrorBoundary.js'

vi.mock('../bridge.js', () => ({
  isDesktop: true,
  canLaunchCrashAgent: true,
  crashAgents: vi.fn(async () => []),
  launchCrashAgent: vi.fn(async () => {}),
  reportRendererError: vi.fn(),
  writeClipboardText: vi.fn(async () => {}),
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Broken(): never {
  throw new Error('broken fixture')
}

describe('dialogs in Portuguese', () => {
  it('shows the window recovery screen in Portuguese', () => {
    setLanguage('pt-BR', { persist: false })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <RendererErrorBoundary>
        <Broken />
      </RendererErrorBoundary>,
    )
    expect(
      screen.getByRole('heading', { name: 'O TUIFT Code não conseguiu exibir esta janela' }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Recarregar janela' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Pedir a um agente para corrigir/ }))
    expect(screen.getByRole('heading', { name: 'Qual agente deve olhar isso?' })).toBeTruthy()
  })

  it('names the failed surface in the surface recovery screen', () => {
    setLanguage('pt-BR', { persist: false })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <SurfaceErrorBoundary name={translate('pt-BR', 'settings.title')} onClose={() => undefined}>
        <Broken />
      </SurfaceErrorBoundary>,
    )
    expect(screen.getByText('Houve um problema em Configurações')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Voltar ao app' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
  })

  it('translates the feedback dialog, its plural and its labels', () => {
    setLanguage('pt-BR', { persist: false })
    const transport = {
      state: 'open',
      request: vi.fn(async () => ({ payload: '{}', redactions: 2 })),
    } as unknown as Transport
    render(
      <FeedbackDialog
        transport={transport}
        request={{ id: 1, source: 'error_report', context: { surface: 'chat' } }}
        status={{ enabled: true }}
        onSent={vi.fn()}
        onClose={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Relatar um problema' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Dúvida' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeTruthy()
    expect(screen.getByPlaceholderText('Só se quiser uma resposta')).toBeTruthy()
  })

  it('translates the checkout discard dialog', () => {
    setLanguage('pt-BR', { persist: false })
    render(
      <CheckoutDiscardDialog
        title="Webhook retries"
        branch="feature/x"
        busy={false}
        onDiscard={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('Este checkout tem trabalho sem commit')).toBeTruthy()
    expect(
      screen.getByText(
        'Excluir “Webhook retries” agora descartaria as alterações que o agente ainda não commitou.',
      ),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Descartar alterações e excluir' })).toBeTruthy()
  })

  it('counts running chats with the language’s own plural rules', () => {
    setLanguage('pt-BR', { persist: false })
    expect(chatCount(1)).toBe('1 chat')
    expect(chatCount(3)).toBe('3 chats')
    expect(runningLabel(2)).toBe('2 chats ainda em execução')
    expect(waitingLabel(1)).toBe('Instala quando 1 chat terminar')
    expect(waitingLabel(2)).toBe('Instala quando 2 chats terminarem')
  })
})

describe('dialogs catalog', () => {
  it('keeps the English text of every dialog key non-empty', () => {
    const keys = Object.keys(en).filter((key) => key.startsWith('dialogs.'))
    expect(keys.length).toBeGreaterThan(100)
    for (const key of keys) expect(translate('en', key).trim(), key).not.toBe('')
  })
})
