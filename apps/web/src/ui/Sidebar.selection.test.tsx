// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Sidebar, type Project, type Session } from './Sidebar.js'

beforeEach(() => {
  // Both projects start open, so every chat is on screen.
  localStorage.setItem('harness.openProjects', JSON.stringify(['/work/alpha', '/work/beta']))
})

afterEach(() => {
  cleanup()
  localStorage.removeItem('harness.openProjects')
})

const chat = (id: string, title: string, extra: Partial<Session> = {}): Session => ({
  id,
  title,
  provider: 'codex',
  createdAt: 1,
  status: 'idle',
  lifecycle: { state: 'active', keepActive: false },
  unread: false,
  ...extra,
})

// On screen, top to bottom: Pinned one, A1, A2, A3, B1, B2.
const projects: Project[] = [
  {
    path: '/work/alpha',
    name: 'Alpha',
    sessions: [
      chat('a1', 'A1'),
      chat('a2', 'A2'),
      chat('a3', 'A3'),
      chat('p1', 'Pinned one', { pinned: true }),
    ],
  },
  { path: '/work/beta', name: 'Beta', sessions: [chat('b1', 'B1'), chat('b2', 'B2')] },
]

function renderRail(
  overrides: Partial<Parameters<typeof Sidebar>[0]> = {},
  rail: Project[] = projects,
) {
  const handlers = {
    onSelectSession: vi.fn(),
    onDeleteSession: vi.fn(),
    onArchiveSession: vi.fn(),
  }
  const props: Parameters<typeof Sidebar>[0] = {
    projects: rail,
    activeProjectPath: undefined,
    activeSessionId: undefined,
    account: undefined,
    providerName: 'Codex',
    collapsed: false,
    width: 248,
    onWidthChange: vi.fn(),
    onClose: vi.fn(),
    onAddProject: vi.fn(),
    onNewSession: vi.fn(),
    onRenameProject: vi.fn(),
    onRemoveProject: vi.fn(),
    onTogglePin: vi.fn(),
    onRenameSession: vi.fn(),
    onArchiveProject: vi.fn(),
    onReorderSession: vi.fn(),
    onOpenSearch: vi.fn(),
    onOpenSettings: vi.fn(),
    ...handlers,
    ...overrides,
  }
  const view = render(<Sidebar {...props} />)
  return { ...view, ...handlers, props }
}

const row = (title: string) => screen.getByText(title).closest('button')!
const selectedTitles = () =>
  Array.from(document.querySelectorAll('.sessrow.is-selected .sess__title')).map(
    (node) => node.textContent,
  )
const ctrl = { ctrlKey: true }
const shift = { shiftKey: true }

describe('Sidebar chat multi-selection', () => {
  it('keeps a plain click opening the chat, and ends any selection', () => {
    const { onSelectSession } = renderRail()
    fireEvent.click(row('A1'))
    expect(onSelectSession).toHaveBeenCalledWith('a1')
    expect(selectedTitles()).toEqual([])

    fireEvent.click(row('A2'), ctrl)
    fireEvent.click(row('A3'), ctrl)
    expect(selectedTitles()).toEqual(['A2', 'A3'])
    // Selecting never opens a chat.
    expect(onSelectSession).toHaveBeenCalledTimes(1)

    fireEvent.click(row('B1'))
    expect(onSelectSession).toHaveBeenLastCalledWith('b1')
    expect(selectedTitles()).toEqual([])
  })

  it('toggles a chat with Ctrl+click', () => {
    renderRail()
    fireEvent.click(row('A1'), ctrl)
    fireEvent.click(row('B1'), ctrl)
    expect(selectedTitles()).toEqual(['A1', 'B1'])
    fireEvent.click(row('A1'), ctrl)
    expect(selectedTitles()).toEqual(['B1'])
  })

  it('selects the range between two chats in the order shown, across projects', () => {
    renderRail()
    // The pinned chat sits first on screen, above both projects.
    fireEvent.click(row('A2'), ctrl)
    fireEvent.click(row('B1'), shift)
    expect(selectedTitles()).toEqual(['A2', 'A3', 'B1'])

    fireEvent.click(row('Pinned one'), shift)
    expect(selectedTitles()).toEqual(['Pinned one', 'A1', 'A2'])

    fireEvent.click(row('B2'), shift)
    expect(selectedTitles()).toEqual(['A2', 'A3', 'B1', 'B2'])
  })

  it('starts Shift+click at the open chat when nothing was clicked yet', () => {
    renderRail({ activeProjectPath: '/work/alpha', activeSessionId: 'a1' })
    fireEvent.click(row('A3'), shift)
    expect(selectedTitles()).toEqual(['A1', 'A2', 'A3'])
  })

  it('clears the selection with Escape and not with other keys', () => {
    renderRail()
    fireEvent.click(row('A1'), ctrl)
    fireEvent.click(row('A2'), ctrl)
    fireEvent.keyDown(row('A1'), { key: 'ArrowDown' })
    expect(selectedTitles()).toEqual(['A1', 'A2'])
    fireEvent.keyDown(row('A1'), { key: 'Escape' })
    expect(selectedTitles()).toEqual([])
  })

  it('leaves Delete to a rename field', () => {
    renderRail()
    fireEvent.click(row('A1'), ctrl)
    fireEvent.click(row('A2'), ctrl)
    fireEvent.doubleClick(row('A3'))
    const field = screen.getByDisplayValue('A3')
    fireEvent.keyDown(field, { key: 'Delete' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(selectedTitles()).toEqual(['A1', 'A2'])
  })

  it('does not rename a chat on a modified double click', () => {
    renderRail()
    fireEvent.doubleClick(row('A1'), ctrl)
    expect(screen.queryByDisplayValue('A1')).toBeNull()
  })

  it('announces the count and marks selected chats for a screen reader', () => {
    const { container } = renderRail()
    const live = container.querySelector('[aria-live="polite"]')!
    fireEvent.click(row('A1'), ctrl)
    expect(live.textContent).toBe('1 chat selected')
    fireEvent.click(row('A2'), ctrl)
    expect(live.textContent).toBe('2 chats selected')
    expect(row('A2').getAttribute('aria-label')).toBe('A2, Codex, selected')
    expect(row('A3').getAttribute('aria-label')).toBe('A3, Codex')
    fireEvent.keyDown(row('A1'), { key: 'Escape' })
    expect(live.textContent).toBe('Selection cleared')
    expect(row('A2').getAttribute('aria-label')).toBe('A2, Codex')
  })

  it('offers the bulk actions on a selected chat and calls the handler for each chat', async () => {
    const { onDeleteSession, onArchiveSession } = renderRail()
    fireEvent.click(row('A1'), ctrl)
    fireEvent.click(row('A3'), ctrl)
    fireEvent.click(row('B1'), ctrl)

    fireEvent.contextMenu(row('A3'))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Archive 3 chats',
      'Delete 3 chats',
    ])
    expect(
      screen
        .getByRole('menuitem', { name: 'Delete 3 chats' })
        .classList.contains('menu__item--danger'),
    ).toBe(true)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete 3 chats' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete 3 chats?' })
    const confirm = within(dialog).getByRole('button', { name: 'Delete 3 chats' })
    expect(confirm.classList.contains('is-destructive')).toBe(true)
    // Nothing goes until the user confirms.
    expect(onDeleteSession).not.toHaveBeenCalled()
    fireEvent.click(confirm)
    expect(onDeleteSession.mock.calls.map(([id]) => id)).toEqual(['a1', 'a3', 'b1'])
    expect(onArchiveSession).not.toHaveBeenCalled()
    expect(selectedTitles()).toEqual([])
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('archives only the chats that are not running', () => {
    const rail: Project[] = [
      {
        path: '/work/alpha',
        name: 'Alpha',
        sessions: [chat('a1', 'A1'), chat('a2', 'A2', { status: 'working' }), chat('a3', 'A3')],
      },
    ]
    const { onArchiveSession, onDeleteSession } = renderRail({}, rail)
    fireEvent.click(row('A1'), ctrl)
    fireEvent.click(row('A3'), shift)
    fireEvent.contextMenu(row('A1'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive 2 chats' }))
    expect(onArchiveSession.mock.calls.map(([id]) => id)).toEqual(['a1', 'a3'])
    expect(onDeleteSession).not.toHaveBeenCalled()
    expect(selectedTitles()).toEqual([])
  })

  it('leaves Archive out when the app cannot archive chats', () => {
    renderRail({ onArchiveSession: undefined })
    fireEvent.click(row('A1'), ctrl)
    fireEvent.click(row('A2'), ctrl)
    fireEvent.contextMenu(row('A1'))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Delete 2 chats',
    ])
  })

  it('deletes the selection with the Delete key, after confirming, and Cancel keeps it', async () => {
    const { onDeleteSession } = renderRail()
    fireEvent.click(row('A1'), ctrl)
    fireEvent.click(row('A2'), ctrl)
    fireEvent.keyDown(row('A2'), { key: 'Delete' })

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete 2 chats?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(onDeleteSession).not.toHaveBeenCalled()
    expect(selectedTitles()).toEqual(['A1', 'A2'])

    fireEvent.keyDown(row('A2'), { key: 'Delete' })
    const again = await screen.findByRole('alertdialog')
    fireEvent.click(within(again).getByRole('button', { name: 'Delete 2 chats' }))
    expect(onDeleteSession.mock.calls.map(([id]) => id)).toEqual(['a1', 'a2'])
  })

  it('ignores Delete when nothing is selected', () => {
    const { onDeleteSession } = renderRail()
    fireEvent.keyDown(row('A1'), { key: 'Delete' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(onDeleteSession).not.toHaveBeenCalled()
  })

  it('warns that a running chat in the selection will stop', async () => {
    const rail: Project[] = [
      {
        path: '/work/alpha',
        name: 'Alpha',
        sessions: [chat('a1', 'A1', { status: 'working' }), chat('a2', 'A2')],
      },
    ]
    renderRail({}, rail)
    fireEvent.click(row('A1'), ctrl)
    fireEvent.click(row('A2'), ctrl)
    fireEvent.keyDown(row('A1'), { key: 'Delete' })
    expect((await screen.findByRole('alertdialog')).textContent).toContain(
      'The running chat will stop.',
    )
  })

  it('puts focus on the nearest chat that stays after a bulk delete', async () => {
    renderRail()
    fireEvent.click(row('A1'), ctrl)
    fireEvent.click(row('A2'), ctrl)
    fireEvent.keyDown(row('A2'), { key: 'Delete' })
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete 2 chats' }))
    await waitFor(() => expect(document.activeElement).toBe(row('A3')))
  })

  it('shows the single-chat menu after a right click outside the selection', () => {
    renderRail()
    fireEvent.click(row('A1'), ctrl)
    fireEvent.click(row('A2'), ctrl)
    fireEvent.contextMenu(row('B2'))
    expect(selectedTitles()).toEqual([])
    expect(screen.getByRole('menuitem', { name: 'Delete chat' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: /Delete 2 chats/ })).toBeNull()
  })

  it('drops a chat from the selection when it leaves the list', () => {
    const view = renderRail()
    fireEvent.click(row('A1'), ctrl)
    fireEvent.click(row('A2'), ctrl)
    const [alpha, beta] = projects
    view.rerender(
      <Sidebar
        {...view.props}
        projects={[{ ...alpha!, sessions: alpha!.sessions.filter(({ id }) => id !== 'a1') }, beta!]}
      />,
    )
    expect(selectedTitles()).toEqual(['A2'])
  })
})
