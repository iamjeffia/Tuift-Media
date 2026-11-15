// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { setLanguage, translate } from '../i18n/index.js'
import { ArchiveToast } from './ArchiveToast.js'
import { CommandPalette, type PaletteCommand } from './CommandPalette.js'
import { Sidebar, type Session } from './Sidebar.js'
import { bulkDeleteCopy, selectedCountLabel } from './session-selection.js'
import { compactRelativeTime } from './session-clock.js'
import { StageHeader } from './StageHeader.js'

afterEach(cleanup)

const session = (id: string, title: string, extra: Partial<Session> = {}): Session => ({
  id,
  title,
  provider: 'codex',
  createdAt: 1,
  status: 'idle',
  lifecycle: { state: 'active', keepActive: false },
  unread: false,
  ...extra,
})

function sidebar() {
  return (
    <Sidebar
      projects={[
        {
          path: '/work/harness',
          name: 'TUIFT Code',
          sessions: [
            session('a', 'Current work', { pinned: true }),
            session('b', 'Needs a look', { status: 'failed', unread: true }),
            session('d', 'First plain chat'),
            session('e', 'Second plain chat'),
            session('c', 'Old work', {
              lifecycle: { state: 'settled', settledAt: 5, reason: 'manual' },
            }),
          ],
        },
      ]}
      activeProjectPath="/work/harness"
      activeSessionId={undefined}
      account={undefined}
      providerName="Codex"
      collapsed={false}
      width={248}
      onWidthChange={vi.fn()}
      onClose={vi.fn()}
      onAddProject={vi.fn()}
      onNewSession={vi.fn()}
      onSelectSession={vi.fn()}
      onRenameProject={vi.fn()}
      onRemoveProject={vi.fn()}
      onTogglePin={vi.fn()}
      onRenameSession={vi.fn()}
      onDeleteSession={vi.fn()}
      onArchiveSession={vi.fn()}
      onRestoreSession={vi.fn()}
      onArchiveProject={vi.fn()}
      onReorderSession={vi.fn()}
      onOpenSearch={vi.fn()}
      onOpenSettings={vi.fn()}
    />
  )
}

describe('sidebar in Portuguese', () => {
  it('shows the rail in Portuguese and follows the language while it is open', () => {
    setLanguage('pt-BR', { persist: false })
    render(sidebar())

    expect(screen.getByRole('button', { name: 'Buscar chats' })).toBeTruthy()
    expect(screen.getByText('Novo chat')).toBeTruthy()
    expect(screen.getByText('Novo projeto')).toBeTruthy()
    expect(screen.getByText('Fixados')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Precisa de você' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Arquivados' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Arquivados, 1 chat' })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Needs a look, falhou, TUIFT Code' }).textContent,
    ).toContain('Needs a look')

    act(() => setLanguage('en', { persist: false }))
    expect(screen.getByRole('button', { name: 'Search chats' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Needs you' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Archived, 1 chat' })).toBeTruthy()
  })

  it('names the project menu and its confirmation in Portuguese, with plurals', async () => {
    setLanguage('pt-BR', { persist: false })
    render(sidebar())

    fireEvent.contextMenu(document.querySelector('.proj__toggle')!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir chats' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Excluir 3 chats de TUIFT Code?')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Excluir 3 chats' })).toBeTruthy()
  })

  it('writes the selection bar in Portuguese, with plurals', () => {
    setLanguage('pt-BR', { persist: false })
    render(sidebar())

    const chats = ['First plain chat', 'Second plain chat']
    for (const title of chats)
      fireEvent.click(screen.getByText(title).closest('button')!, { ctrlKey: true })
    const bar = document.querySelector<HTMLElement>('.selection-bar')!
    expect(within(bar).getByText('2 selecionados')).toBeTruthy()
    expect(within(bar).getByRole('button', { name: 'Excluir 2 chats' }).textContent).toBe('Excluir')
    expect(within(bar).getByRole('button', { name: 'Limpar seleção' })).toBeTruthy()
    expect(bar.getAttribute('aria-label')).toBe('Seleção')
  })

  it('counts chats with the plural of the language', () => {
    setLanguage('pt-BR', { persist: false })
    expect(selectedCountLabel(1)).toBe('1 chat')
    expect(selectedCountLabel(4)).toBe('4 chats')
    expect(bulkDeleteCopy(1, 0).title).toBe('Excluir 1 chat?')
    expect(bulkDeleteCopy(2, 1).title).toBe('Excluir 2 chats?')
    expect(bulkDeleteCopy(2, 1).body).toContain('O chat em andamento vai parar.')
    expect(bulkDeleteCopy(2, 3).body).toContain('3 chats em andamento vão parar.')
    setLanguage('en', { persist: false })
    expect(bulkDeleteCopy(2, 1).body).toContain('The running chat will stop.')
    expect(bulkDeleteCopy(1, 0).action).toBe('Delete 1 chat')
  })

  it('writes the relative times of the rail in Portuguese', () => {
    setLanguage('pt-BR', { persist: false })
    const now = Date.UTC(2026, 10, 15, 12)
    const minute = 60_000
    const day = 24 * 60 * minute
    expect(compactRelativeTime(now, now)).toBe('agora')
    expect(compactRelativeTime(now - 5 * minute, now)).toBe('5min')
    expect(compactRelativeTime(now - 2 * 7 * day, now)).toBe('2sem')
    expect(compactRelativeTime(now - 30 * day, now)).toBe('1 mês')
    expect(compactRelativeTime(now - 90 * day, now)).toBe('3 meses')
  })
})

describe('other sidebar surfaces in Portuguese', () => {
  it('speaks the archive toast in Portuguese', () => {
    setLanguage('pt-BR', { persist: false })
    const view = render(<ArchiveToast count={1} visible onUndo={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByRole('status').textContent).toContain('Chat excluído')
    expect(screen.getByRole('button', { name: 'Desfazer' })).toBeTruthy()
    view.rerender(<ArchiveToast count={3} visible onUndo={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByRole('status').textContent).toContain('3 chats excluídos')
  })

  it('translates the stage header menu and its untitled chat', () => {
    setLanguage('pt-BR', { persist: false })
    render(
      <StageHeader
        sessionId={undefined}
        title={undefined}
        pinned={false}
        projectPath={undefined}
        checkpointCount={0}
        worktreeBranch={undefined}
        menuActions={{
          commandPalette: vi.fn(),
          keybindings: vi.fn(),
          newChat: vi.fn(),
          openPullRequests: vi.fn(),
          searchSessions: vi.fn(),
          settings: vi.fn(),
          toggleSidebar: vi.fn(),
          toggleTerminal: vi.fn(),
          toggleWorkspace: vi.fn(),
        }}
        onOpenRollback={vi.fn()}
        onRenameSession={vi.fn()}
        onToggleSessionPin={vi.fn()}
        onArchiveSession={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Opções de Novo chat' }))
    expect(screen.getByRole('menuitem', { name: /Alternar barra lateral/ })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /Paleta de comandos/ })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /Atalhos de teclado/ })).toBeTruthy()
  })

  it('translates the command palette chrome and its group headings', () => {
    setLanguage('pt-BR', { persist: false })
    const commands: PaletteCommand[] = [
      { id: 'one', title: 'Novo chat', group: 'Actions', run: vi.fn() },
      { id: 'two', title: 'Projeto', group: 'Projects', run: vi.fn() },
    ]
    render(<CommandPalette commands={commands} scope="all" onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Paleta de comandos' })).toBeTruthy()
    expect(screen.getByPlaceholderText('Buscar comandos, projetos, chats…')).toBeTruthy()
    expect(screen.getByText('Ações')).toBeTruthy()
    expect(screen.getByText('Projetos')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar comandos' }), {
      target: { value: 'zzz' },
    })
    expect(screen.getByText('Nenhum comando encontrado.')).toBeTruthy()
  })

  it('keeps English text of the catalog identical to what the screens showed before', () => {
    expect(translate('en', 'sidebar.rail.showMore', { count: 25 })).toBe('Show 25 more')
    expect(translate('en', 'sidebar.empty.buildIn', { project: 'x' })).toBe(
      'What should we build in x?',
    )
  })
})
