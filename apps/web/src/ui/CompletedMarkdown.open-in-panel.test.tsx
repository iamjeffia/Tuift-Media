// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerProjectFileOpener } from '../project-file-open.js'

const shell = vi.hoisted(() => ({
  reveal: vi.fn(async (_path: string, _root: string) => {}),
  copy: vi.fn(async (_text: string) => {}),
}))

vi.mock('../bridge.js', () => ({
  canRevealProjectFile: true,
  revealProjectFile: shell.reveal,
  writeClipboardText: shell.copy,
}))

const { CompletedMarkdown } = await import('./CompletedMarkdown.js')

const PROJECT = 'C:\\projects\\site'
const TEXT = 'Changed [index](C:\\projects\\site\\src\\index.ts) and `src/app.ts` today.'
let unregister: (() => void) | undefined

afterEach(() => {
  cleanup()
  unregister?.()
  unregister = undefined
  shell.reveal.mockClear()
  shell.copy.mockClear()
})

describe('a file the chat cites', () => {
  it('opens in the side panel when the app has one, not in Explorer', async () => {
    const open = vi.fn()
    unregister = registerProjectFileOpener(open)
    render(<CompletedMarkdown text={TEXT} projectPath={PROJECT} />)

    fireEvent.click(await screen.findByRole('button', { name: 'index' }))
    fireEvent.click(screen.getByRole('button', { name: 'src/app.ts' }))

    expect(open.mock.calls.map(([request]) => request)).toEqual([
      { path: 'C:\\projects\\site\\src\\index.ts', projectPath: PROJECT },
      { path: 'C:\\projects\\site\\src\\app.ts', projectPath: PROJECT },
    ])
    expect(shell.reveal).not.toHaveBeenCalled()
  })

  it('is shown in Explorer, as before, where no panel can open it', async () => {
    render(<CompletedMarkdown text={TEXT} projectPath={PROJECT} />)

    fireEvent.click(await screen.findByRole('button', { name: 'index' }))
    expect(shell.reveal).toHaveBeenCalledWith('C:\\projects\\site\\src\\index.ts', PROJECT)
  })

  it('keeps a file outside the project as a label with a reason, never a button', async () => {
    const view = render(
      <CompletedMarkdown
        text="See [notes](C:\\other\\notes.md) and [a](C:\\projects\\site\\a.md)"
        projectPath={PROJECT}
      />,
    )
    await screen.findByRole('button', { name: 'a' })
    // A file outside the project stays a label with a reason, never a button.
    expect(screen.queryByRole('button', { name: 'notes' })).toBeNull()
    expect(view.container.querySelector('.md-file-link--blocked')).not.toBeNull()
  })

  it('offers Open in panel, Open in Explorer and Copy path on right-click', async () => {
    const open = vi.fn()
    unregister = registerProjectFileOpener(open)
    render(<CompletedMarkdown text={TEXT} projectPath={PROJECT} />)

    fireEvent.contextMenu(await screen.findByRole('button', { name: 'index' }))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Open in panel',
      'Open in Explorer',
      'Copy path',
    ])

    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in Explorer' }))
    expect(shell.reveal).toHaveBeenCalledWith('C:\\projects\\site\\src\\index.ts', PROJECT)

    fireEvent.contextMenu(screen.getByRole('button', { name: 'index' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy path' }))
    expect(shell.copy).toHaveBeenCalledWith('C:\\projects\\site\\src\\index.ts')

    fireEvent.contextMenu(screen.getByRole('button', { name: 'index' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in panel' }))
    expect(open).toHaveBeenCalledOnce()
  })
})
