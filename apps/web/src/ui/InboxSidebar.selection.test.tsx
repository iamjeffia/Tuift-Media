// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

const thread = (id: string, title: string, createdAt: number): Session => ({
  id,
  title,
  provider: 'codex',
  createdAt,
  status: 'idle',
  lifecycle: { state: 'active', keepActive: false },
  unread: false,
})

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

function renderInbox() {
  const onArchiveSessions = vi.fn()
  const onArchiveSession = vi.fn()
  const view = render(
    <InboxSidebar
      projects={[project]}
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

  it('deletes the whole selection with Delete and focuses the nearest thread that stays', async () => {
    const { onArchiveSessions } = renderInbox()
    fireEvent.click(row('Second task'), command)
    fireEvent.click(row('Third task'), command)
    fireEvent.keyDown(row('Third task'), { key: 'Delete' })
    expect(onArchiveSessions).toHaveBeenCalledWith(['two', 'three'])
    expect(selected()).toEqual([])
    await waitFor(() => expect(document.activeElement).toBe(row('Fourth task')))
  })

  it('does nothing on Delete without a selection', () => {
    const { onArchiveSessions, onArchiveSession } = renderInbox()
    fireEvent.keyDown(row('First task'), { key: 'Delete' })
    expect(onArchiveSessions).not.toHaveBeenCalled()
    expect(onArchiveSession).not.toHaveBeenCalled()
  })

  it('leaves Delete to the rename field', () => {
    const { onArchiveSessions } = renderInbox()
    fireEvent.click(row('First task'), command)
    fireEvent.click(row('Second task'), command)
    fireEvent.doubleClick(row('Third task'))
    fireEvent.keyDown(screen.getByDisplayValue('Third task'), { key: 'Delete' })
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
