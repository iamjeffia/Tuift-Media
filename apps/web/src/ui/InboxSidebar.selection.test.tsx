// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { setLanguage } from '../i18n/index.js'
import { InboxSidebar, type InboxActions } from './InboxSidebar.js'
import type { Project, Session } from './Sidebar.js'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const actions: InboxActions = {
  onSettle: vi.fn(),
  onUnsettle: vi.fn(),
  onSnooze: vi.fn(),
  onUnsnooze: vi.fn(),
  onKeepActive: vi.fn(),
}

const thread = (id: string, title: string, createdAt: number, extra: Partial<Session> = {}) =>
  ({
    id,
    title,
    provider: 'codex',
    createdAt,
    status: 'idle',
    lifecycle: { state: 'active', keepActive: false },
    unread: false,
    ...extra,
  }) as Session

// Newest first on screen: First, Second, Third, Fourth.
const project: Project = {
  path: '/alpha',
  name: 'Alpha',
  sessions: [
    thread('one', 'First task', 40),
    thread('two', 'Second task', 30),
    thread('three', 'Third task', 20),
    thread('four', 'Fourth task', 10),
  ],
}

function renderInbox(projects: Project[] = [project]) {
  const onArchiveSessions = vi.fn()
  const onArchiveSession = vi.fn()
  const view = render(
    <InboxSidebar
      projects={projects}
      scope=""
      activeProjectPath={undefined}
      activeSessionId={undefined}
      actions={actions}
      onScopeChange={vi.fn()}
      onAddProject={vi.fn()}
      onNewSession={vi.fn()}
      onSelectSession={vi.fn()}
      onRenameSession={vi.fn()}
      onArchiveSession={onArchiveSession}
      onArchiveSessions={onArchiveSessions}
    />,
  )
  return { ...view, onArchiveSessions, onArchiveSession }
}

const row = (title: string) => screen.getByText(title).closest('button')!
const selected = () =>
  Array.from(document.querySelectorAll('.is-multi-selected .inbox-card__title')).map(
    (node) => node.textContent,
  )
const command = { metaKey: true }

describe('InboxSidebar multi-selection keys', () => {
  it('clears the selection with Escape', () => {
    renderInbox()
    fireEvent.click(row('First task'), command)
    fireEvent.click(row('Second task'), command)
    expect(selected()).toEqual(['First task', 'Second task'])
    fireEvent.keyDown(row('First task'), { key: 'ArrowDown' })
    expect(selected()).toEqual(['First task', 'Second task'])
    fireEvent.keyDown(row('First task'), { key: 'Escape' })
    expect(selected()).toEqual([])
  })

  it('asks before deleting the selection with Delete, then focuses the nearest thread that stays', async () => {
    const { onArchiveSessions } = renderInbox()
    fireEvent.click(row('Second task'), command)
    fireEvent.click(row('Third task'), command)
    fireEvent.keyDown(row('Third task'), { key: 'Delete' })
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete 2 chats?' })
    expect(onArchiveSessions).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete 2 chats' }))
    expect(onArchiveSessions).toHaveBeenCalledWith(['two', 'three'])
    expect(selected()).toEqual([])
    await waitFor(() => expect(document.activeElement).toBe(row('Fourth task')))
  })

  it('keeps the selection when the confirmation is cancelled', async () => {
    const { onArchiveSessions } = renderInbox()
    fireEvent.click(row('First task'), command)
    fireEvent.click(row('Second task'), command)
    fireEvent.keyDown(row('Second task'), { key: 'Delete' })
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(onArchiveSessions).not.toHaveBeenCalled()
    expect(selected()).toEqual(['First task', 'Second task'])
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('confirms the menu delete of several threads too', async () => {
    const { onArchiveSessions } = renderInbox()
    fireEvent.click(row('First task'), command)
    fireEvent.click(row('Second task'), command)
    fireEvent.contextMenu(row('First task'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete 2 threads' }))
    expect(onArchiveSessions).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete 2 chats?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete 2 chats' }))
    expect(onArchiveSessions).toHaveBeenCalledWith(['one', 'two'])
  })

  it('does nothing on Delete without a selection', () => {
    const { onArchiveSessions, onArchiveSession } = renderInbox()
    fireEvent.keyDown(row('First task'), { key: 'Delete' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(onArchiveSessions).not.toHaveBeenCalled()
    expect(onArchiveSession).not.toHaveBeenCalled()
  })

  it('leaves Delete to the rename field', () => {
    const { onArchiveSessions } = renderInbox()
    fireEvent.click(row('First task'), command)
    fireEvent.click(row('Second task'), command)
    fireEvent.doubleClick(row('Third task'))
    fireEvent.keyDown(screen.getByDisplayValue('Third task'), { key: 'Delete' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(onArchiveSessions).not.toHaveBeenCalled()
    expect(selected()).toEqual(['First task', 'Second task'])
  })

  it('announces the selection and marks selected threads for a screen reader', () => {
    const { container } = renderInbox()
    const live = container.querySelector('[aria-live="polite"]')!
    fireEvent.click(row('First task'), command)
    fireEvent.click(row('Second task'), command)
    expect(live.textContent).toBe('Selected 2 threads')
    expect(row('First task').getAttribute('aria-description')).toBe('Selected')
    expect(row('Third task').hasAttribute('aria-description')).toBe(false)
    fireEvent.keyDown(row('First task'), { key: 'Escape' })
    expect(live.textContent).toBe('Selection cleared')
    expect(row('First task').hasAttribute('aria-description')).toBe(false)
  })
})

describe('InboxSidebar selection bar', () => {
  const bar = () => document.querySelector<HTMLElement>('.selection-bar')

  it('shows only with two or more threads selected, with the count', () => {
    renderInbox()
    expect(bar()).toBeNull()
    fireEvent.click(row('First task'), command)
    expect(bar()).toBeNull()
    fireEvent.click(row('Second task'), command)
    expect(bar()?.textContent).toContain('2 selected')
    fireEvent.click(row('Third task'), command)
    expect(bar()?.textContent).toContain('3 selected')
    fireEvent.click(row('Third task'), command)
    fireEvent.click(row('Second task'), command)
    expect(bar()).toBeNull()
  })

  it('sits after the list inside the scrolling body, so no thread moves', () => {
    renderInbox()
    fireEvent.click(row('First task'), command)
    fireEvent.click(row('Second task'), command)
    expect(bar()?.parentElement?.classList.contains('inbox__body')).toBe(true)
    expect(bar()?.nextElementSibling).toBeNull()
  })

  it('asks before deleting and names the count', async () => {
    const { onArchiveSessions } = renderInbox()
    fireEvent.click(row('First task'), command)
    fireEvent.click(row('Third task'), command)
    fireEvent.click(row('Fourth task'), command)
    fireEvent.click(within(bar()!).getByRole('button', { name: 'Delete 3 chats' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete 3 chats?' })
    expect(onArchiveSessions).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete 3 chats' }))
    expect(onArchiveSessions).toHaveBeenCalledWith(['one', 'three', 'four'])
    expect(bar()).toBeNull()
  })

  it('warns that a running thread in the selection will stop', async () => {
    const running: Project = {
      ...project,
      sessions: project.sessions.map((session) =>
        session.id === 'one' ? { ...session, status: 'working' } : session,
      ),
    }
    renderInbox([running])
    fireEvent.click(row('First task'), command)
    fireEvent.click(row('Second task'), command)
    fireEvent.click(within(bar()!).getByRole('button', { name: 'Delete 2 chats' }))
    expect((await screen.findByRole('alertdialog')).textContent).toContain(
      'The running chat will stop.',
    )
  })

  it('clears the selection from its button and puts focus back on a thread', async () => {
    renderInbox()
    fireEvent.click(row('Second task'), command)
    fireEvent.click(row('Third task'), command)
    fireEvent.click(within(bar()!).getByRole('button', { name: 'Clear selection' }))
    expect(selected()).toEqual([])
    expect(bar()).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(row('Second task')))
  })

  it('writes the bar and its confirmation in Portuguese', async () => {
    setLanguage('pt-BR', { persist: false })
    try {
      renderInbox()
      fireEvent.click(row('First task'), command)
      fireEvent.click(row('Second task'), command)
      expect(within(bar()!).getByText('2 selecionados')).toBeTruthy()
      expect(within(bar()!).getByRole('button', { name: 'Limpar seleção' })).toBeTruthy()
      fireEvent.click(within(bar()!).getByRole('button', { name: 'Excluir 2 chats' }))
      const dialog = await screen.findByRole('alertdialog', { name: 'Excluir 2 chats?' })
      expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeTruthy()
    } finally {
      setLanguage('en', { persist: false })
    }
  })
})
