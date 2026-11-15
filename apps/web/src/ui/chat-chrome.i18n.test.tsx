// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Item } from '@harness/contracts'
import { appCommands } from '../app-commands.js'
import { savePastedFile } from '../bridge.js'
import { displayChatTitle, localizeChatTitles } from '../chat-title.js'
import { continuationNote } from '../continue-account.js'
import { setLanguage } from '../i18n/index.js'
import { ThreadFrameStore } from '../thread-frame-store.js'
import { emptyThread } from '../thread-store.js'
import type { Transport } from '../transport.js'

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 72,
        end: (index + 1) * 72,
        size: 72,
      })),
    getTotalSize: () => count * 72,
    measurementsCache: [],
    measureElement: () => undefined,
    indexFromElement: (node: Element) => Number(node.getAttribute('data-index')),
    resizeItem: () => undefined,
    getOffsetForIndex: () => [0],
    scrollToIndex: () => undefined,
  }),
}))
vi.mock('./LazyThread.js', () => ({ preloadThread: vi.fn() }))
vi.mock('../bridge.js', () => ({
  isMacOS: vi.fn(() => false),
  pickFiles: vi.fn(async () => []),
  previewViewedImage: vi.fn(async () => undefined),
  revealPath: vi.fn(),
  savePastedFile: vi.fn(),
}))

import { Composer } from './Composer.js'
import { ComposerErrors } from './ComposerErrors.js'
import { CopyButton } from './CopyButton.js'
import { MediaViewer } from './MediaViewer.js'
import { RollbackDialog } from './RollbackDialog.js'
import { Thread } from './Thread.js'
import { ThreadSearch } from './ThreadSearch.js'
import { UsageResetNotice } from './UsageResetNotice.js'

const transport = {
  state: 'open',
  request: vi.fn(async (method: string) => {
    if (method === 'commands.list') return { commands: [], loading: false }
    if (method === 'skills.list') {
      return {
        capabilities: { inventory: true, configure: true, install: true },
        skills: [],
        errors: [],
      }
    }
    return { capabilities: { inventory: true }, servers: [] }
  }),
  on: vi.fn(() => () => undefined),
  onState: vi.fn(() => () => undefined),
} as unknown as Transport

function renderComposer(overrides: Partial<Parameters<typeof Composer>[0]> = {}) {
  return render(
    <Composer
      transport={transport}
      provider="codex"
      projects={[{ path: '/work/harness', name: 'TUIFT Code' }]}
      projectPath={undefined}
      projectName={undefined}
      branch={undefined}
      branches={['main']}
      models={[]}
      modelsLoaded
      modelId={undefined}
      effort={undefined}
      serviceTier={undefined}
      approval="full"
      autoReviewSupported={false}
      attachmentsSupported
      voiceAvailable={false}
      disabled={false}
      sendAvailability="no-provider"
      running={false}
      newSession
      isolate={false}
      designMode={false}
      motionMode={false}
      focusRequest={0}
      queuedTurns={[]}
      canSteerQueue={false}
      onModelChange={vi.fn()}
      onEffortChange={vi.fn()}
      onServiceTierChange={vi.fn()}
      onApprovalChange={vi.fn()}
      onIsolateChange={vi.fn()}
      onDesignModeChange={vi.fn()}
      onMotionModeChange={vi.fn()}
      onTranscribeVoice={vi.fn()}
      onCancelVoice={vi.fn()}
      onProjectChange={vi.fn()}
      onBranchChange={vi.fn()}
      onProjectRequired={vi.fn()}
      onAddProject={vi.fn()}
      onSetupProvider={vi.fn()}
      onSend={vi.fn()}
      onSteer={vi.fn()}
      onInterrupt={vi.fn()}
      onDeleteQueuedTurn={vi.fn(async () => true)}
      onMoveQueuedTurn={vi.fn()}
      onSteerQueuedTurn={vi.fn()}
      {...overrides}
    />,
  )
}

beforeEach(() => {
  localStorage.clear()
  setLanguage('pt-BR', { persist: false })
})
afterEach(cleanup)

describe('the chrome around the chat, in Portuguese', () => {
  it('translates the start screen labels and the setup notice, and keeps the composer in English', () => {
    renderComposer()
    // App chrome next to the chat: translated.
    expect(screen.getByText('Escolher projeto')).toBeTruthy()
    expect(screen.getByText('Adicione um provedor para começar a conversar.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Adicionar provedor' })).toBeTruthy()
    // The chat itself: the field, the access mode, Design and Motion stay English.
    expect(screen.getByPlaceholderText('Do anything')).toBeTruthy()
    expect(screen.getAllByText('Full access').length).toBeGreaterThan(0)
    expect(screen.getByText('Design')).toBeTruthy()
    expect(screen.getByText('Motion')).toBeTruthy()
    expect(screen.queryByText('Choose project')).toBeNull()
    expect(screen.queryByText('Add a provider to start chatting.')).toBeNull()
  })

  it('translates the "/" menu rows and keeps the command names', async () => {
    renderComposer({
      projectPath: '/work/harness',
      projectName: 'TUIFT Code',
      sendAvailability: 'ready',
      onNewChatCommand: vi.fn(),
    })
    fireEvent.change(screen.getByPlaceholderText('Do anything'), {
      target: { value: '/new', selectionStart: 4 },
    })
    const row = await screen.findByRole('option', { name: /\/new/ })
    expect(row.textContent).toContain('Começar um novo chat')
    expect(row.textContent).not.toContain('Start a new chat')
  })

  it('translates the notice tray but not what the server wrote', () => {
    render(
      <ComposerErrors
        errors={[
          { id: 'turn:1', message: 'Codex exited unexpectedly', report: vi.fn() },
          {
            id: 'continues',
            message: continuationNote('Webhook retries', 'Work', undefined),
            tone: 'info',
            action: { label: 'Abrir', run: vi.fn() },
          },
        ]}
      />,
    )
    expect(screen.getByLabelText('Erros')).toBeTruthy()
    expect(screen.getByText('Codex exited unexpectedly')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reportar' })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Fechar erro: Codex exited unexpectedly' }),
    ).toBeTruthy()
    expect(
      screen.getByText(
        'Continua “Webhook retries” em Work. A conversa vai junto com a sua primeira mensagem.',
      ),
    ).toBeTruthy()
  })

  it('translates the resume notice', async () => {
    const schedule = vi.fn(async () => undefined)
    render(
      <UsageResetNotice
        source="Codex"
        resetsAt={Date.now() + 3_600_000}
        scheduled={false}
        schedule={schedule}
        cancel={vi.fn()}
      />,
    )
    expect(screen.getByText('Continuar quando o limite reiniciar')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retomar ao reiniciar' }))
    await waitFor(() => expect(schedule).toHaveBeenCalledOnce())
  })

  it('keeps the process rows of the transcript in English', () => {
    const prompt: Item = {
      id: 'prompt',
      turnId: 'turn-1',
      type: 'message',
      role: 'user',
      status: 'completed',
      text: 'Check this',
      createdAt: 1_000,
    }
    const answer: Item = {
      ...prompt,
      id: 'answer',
      role: 'assistant',
      phase: 'final_answer',
      text: 'The result',
      createdAt: 4_000,
    }
    const { container } = render(
      <Thread
        frameStore={
          new ThreadFrameStore({
            ...emptyThread,
            items: [prompt, answer],
            turnTiming: { 'turn-1': { startedAt: 1_000, completedAt: 4_000 } },
          })
        }
        onDecide={() => undefined}
        onAnswerUserInput={() => undefined}
      />,
    )
    expect(container.querySelector('.activity__summary')?.textContent).toBe('Worked for 3s')
  })

  it('translates the neighbours of the chat: find bar, restore dialog, copy and media viewer', () => {
    const checkpoint = { id: 1, seq: 1, label: 'Fix the login bug', createdAt: 1_000 }
    render(
      <>
        <ThreadSearch items={[]} onJump={vi.fn()} onClose={vi.fn()} />
        <RollbackDialog
          checkpoints={[checkpoint]}
          inspection={{ checkpoint, files: ['a.ts', 'b.ts'] }}
          loadingId={undefined}
          restoring={false}
          onInspect={vi.fn()}
          onRestore={vi.fn()}
          onClose={vi.fn()}
        />
        <CopyButton text="x" label="Copy response" />
        <MediaViewer src="blob:x" name="shot.png" mediaType="image" onClose={vi.fn()} />
      </>,
    )
    expect(screen.getByPlaceholderText('Buscar no chat')).toBeTruthy()
    expect(document.querySelector('.rollback__files')?.textContent).toBe('a.ts e b.ts voltam junto')
    expect(screen.getByRole('button', { name: 'Antes de “Fix the login bug”' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Restaurar' })).toBeTruthy()
    expect(screen.getByTitle('Copiar')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Aumentar zoom' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Baixar imagem' })).toBeTruthy()
  })

  it('translates the command descriptions and hints only in the menu', () => {
    const [side] = appCommands({ sideChat: true, feedback: false })
    expect(side).toMatchObject({
      name: 'side',
      description: 'Fazer uma pergunta paralela em um chat temporário',
      argumentHint: '[pergunta]',
    })
    act(() => setLanguage('en', { persist: false }))
    expect(appCommands({ sideChat: true, feedback: false })[0]).toMatchObject({
      name: 'side',
      description: 'Ask a side question in a temporary chat',
      argumentHint: '[question]',
    })
  })

  it('maps only the stored default chat titles, at render time', () => {
    expect(displayChatTitle('New session')).toBe('Novo chat')
    expect(displayChatTitle('Untitled chat')).toBe('Chat sem título')
    expect(displayChatTitle('Side chat')).toBe('Chat lateral')
    expect(displayChatTitle('Fix the login bug')).toBe('Fix the login bug')
    const stored = [{ sessions: [{ id: 'a', title: 'New session' }] }, { sessions: [] }]
    const shown = localizeChatTitles(stored)
    expect(shown[0]!.sessions[0]!.title).toBe('Novo chat')
    expect(shown[1]).toBe(stored[1])
    expect(stored[0]!.sessions[0]!.title).toBe('New session')
    expect(localizeChatTitles(stored)).toBe(shown)
    setLanguage('en', { persist: false })
    expect(localizeChatTitles(stored)).toBe(stored)
  })
  it('translates the attachment and queue errors of the composer', async () => {
    const view = renderComposer({
      projectPath: '/work/harness',
      projectName: 'TUIFT Code',
      sendAvailability: 'ready',
      attachmentsSupported: false,
    })
    const field = screen.getByPlaceholderText('Do anything')
    fireEvent.paste(field, { clipboardData: { files: [new File(['n'], 'notes.txt')] } })
    expect(await screen.findByText('Este provedor não aceita anexos.')).toBeTruthy()
    view.unmount()

    renderComposer({
      projectPath: '/work/harness',
      projectName: 'TUIFT Code',
      sendAvailability: 'ready',
    })
    vi.mocked(savePastedFile).mockResolvedValueOnce(undefined)
    const supported = screen.getByPlaceholderText('Do anything')
    fireEvent.paste(supported, { clipboardData: { files: [new File(['n'], 'notes.txt')] } })
    expect(await screen.findByText('Colar arquivos só funciona no app desktop.')).toBeTruthy()
    const large = new File(['x'], 'big.zip')
    Object.defineProperty(large, 'size', { value: 26 * 1024 * 1024 })
    fireEvent.paste(supported, { clipboardData: { files: [large] } })
    expect(
      await screen.findByText('“big.zip” tem mais de 25 MB. Use o seletor de arquivos.'),
    ).toBeTruthy()
  })

  it('translates the queue errors the app words itself and keeps the server reason', async () => {
    const onDeleteQueuedTurn = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce('gone')
      .mockRejectedValueOnce(new Error('That queued prompt already started or was removed.'))
    renderComposer({
      projectPath: '/work/harness',
      projectName: 'TUIFT Code',
      sendAvailability: 'ready',
      queuedTurns: [{ id: 'q1', text: 'Queued prompt', attachments: [], createdAt: 1 }],
      onDeleteQueuedTurn,
    })
    const edit = () => fireEvent.click(screen.getByRole('button', { name: 'Edit Queued prompt' }))
    edit()
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Não foi possível remover o prompt da fila. Ele pode já ter começado; nenhuma cópia foi adicionada.',
    )
    edit()
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Não foi possível remover o prompt da fila.',
      ),
    )
    edit()
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'That queued prompt already started or was removed.',
      ),
    )
  })

  it('names the copy buttons from the catalog, so the name and the tooltip share a language', () => {
    const prompt: Item = {
      id: 'prompt',
      turnId: 'turn-1',
      type: 'message',
      role: 'user',
      status: 'completed',
      text: 'Check this',
      createdAt: 1_000,
    }
    const answer: Item = {
      ...prompt,
      id: 'answer',
      role: 'assistant',
      phase: 'final_answer',
      text: 'The result',
      createdAt: 4_000,
    }
    render(
      <Thread
        frameStore={
          new ThreadFrameStore({
            ...emptyThread,
            items: [prompt, answer],
            turnTiming: { 'turn-1': { startedAt: 1_000, completedAt: 4_000 } },
          })
        }
        onDecide={() => undefined}
        onAnswerUserInput={() => undefined}
      />,
    )
    expect(screen.getByRole('button', { name: 'Copiar resposta' }).getAttribute('title')).toBe(
      'Copiar',
    )
    expect(screen.getByRole('button', { name: 'Copiar prompt' }).getAttribute('title')).toBe(
      'Copiar',
    )
    act(() => setLanguage('en', { persist: false }))
    expect(screen.getByRole('button', { name: 'Copy response' }).getAttribute('title')).toBe('Copy')
    expect(screen.getByRole('button', { name: 'Copy prompt' })).toBeTruthy()
  })
})
