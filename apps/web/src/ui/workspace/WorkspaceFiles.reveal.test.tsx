// @vitest-environment happy-dom
import { methods } from '@harness/contracts'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TestTransport } from '../../test-transport.js'

const shell = vi.hoisted(() => ({
  reveal: vi.fn(async (_path: string, _root: string) => {}),
  copy: vi.fn(async (_text: string) => {}),
}))

vi.mock('../../bridge.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../bridge.js')>()),
  canRevealProjectFile: true,
  revealProjectFile: shell.reveal,
  writeClipboardText: shell.copy,
}))

const { WorkspaceFiles } = await import('./WorkspaceFiles.js')

// An isolated chat lists its own checkout; the files there are not the project's copies.
const ROOT = 'C:\\checkouts\\site-chat-1'

const entry = (name: string, path: string, kind: 'file' | 'directory', restricted = false) => ({
  name,
  path,
  kind,
  size: 0,
  modifiedAt: 0,
  restricted,
})

function transport(root: string | null = ROOT) {
  return new TestTransport((method, params) => {
    if (method === 'workspace.listDirectory') {
      const request = methods[method].params.parse(params)
      return request.directory === 'src'
        ? {
            path: 'src',
            ...(root ? { root } : {}),
            entries: [entry('app.ts', 'src/app.ts', 'file')],
          }
        : {
            path: '',
            ...(root ? { root } : {}),
            entries: [entry('src', 'src', 'directory'), entry('.env', '.env', 'file', true)],
          }
    }
    if (method === 'workspace.readFile') {
      const request = methods[method].params.parse(params)
      return {
        name: 'app.ts',
        path: request.path,
        size: 6,
        binary: false,
        truncated: false,
        content: 'app',
      }
    }
    throw new Error(`Unhandled test request: ${method}`)
  })
}

afterEach(() => {
  cleanup()
  shell.reveal.mockReset()
  shell.copy.mockReset()
})

/** Right-click a row and choose an entry of its menu. */
function openFromMenu(row: HTMLElement, name: string) {
  fireEvent.contextMenu(row)
  fireEvent.click(screen.getByRole('menuitem', { name }))
}

describe('WorkspaceFiles paths', () => {
  it('shows the checkout, a folder, a file and the open file where they are', async () => {
    render(
      <WorkspaceFiles
        transport={transport()}
        projectPath="C:\\projects\\site"
        projectName="site"
        threadId="chat-1"
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'site' }))
    expect(shell.reveal).toHaveBeenLastCalledWith(ROOT, ROOT)

    const folder = await screen.findByTitle('src')
    openFromMenu(folder, 'Open in Explorer')
    expect(shell.reveal).toHaveBeenLastCalledWith(`${ROOT}\\src`, ROOT)

    fireEvent.click(folder)
    const file = await screen.findByTitle('src/app.ts')
    openFromMenu(file, 'Open in Explorer')
    expect(shell.reveal).toHaveBeenLastCalledWith(`${ROOT}\\src\\app.ts`, ROOT)

    fireEvent.click(file)
    fireEvent.click(await screen.findByRole('button', { name: 'src/app.ts' }))
    expect(shell.reveal).toHaveBeenLastCalledWith(`${ROOT}\\src\\app.ts`, ROOT)

    // A protected entry is not offered.
    const calls = shell.reveal.mock.calls.length
    fireEvent.contextMenu(screen.getByTitle('.env is protected'))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(shell.reveal).toHaveBeenCalledTimes(calls)
  })

  it('offers Open in panel, Open in Explorer and Copy path on a file, and no panel entry on a folder', async () => {
    render(
      <WorkspaceFiles transport={transport()} projectPath="C:/projects/site" threadId="chat-1" />,
    )

    fireEvent.contextMenu(await screen.findByTitle('src'))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Open in Explorer',
      'Copy path',
    ])
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })

    fireEvent.click(screen.getByTitle('src'))
    fireEvent.contextMenu(await screen.findByTitle('src/app.ts'))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Open in panel',
      'Open in Explorer',
      'Copy path',
    ])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in panel' }))
    expect(await screen.findByText('6 B')).toBeTruthy()
  })

  it('copies the absolute path of a row', async () => {
    render(
      <WorkspaceFiles transport={transport()} projectPath="C:/projects/site" threadId="chat-1" />,
    )

    openFromMenu(await screen.findByTitle('src'), 'Copy path')
    expect(shell.copy).toHaveBeenCalledWith(`${ROOT}\\src`)
  })

  it('says when a file could not be shown', async () => {
    shell.reveal.mockRejectedValueOnce(new Error('ENOENT'))
    render(<WorkspaceFiles transport={transport()} projectPath="C:\\projects\\site" />)
    openFromMenu(await screen.findByTitle('src'), 'Open in Explorer')
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Could not show src'))
  })

  it('keeps the paths as text when the server does not name its folder', async () => {
    render(
      <WorkspaceFiles
        transport={transport(null)}
        projectPath="/projects/site"
        projectName="site"
      />,
    )
    await screen.findByTitle('src')
    expect(screen.queryByRole('button', { name: 'site' })).toBeNull()
    // Without the server's folder there is no path to show, so the menu has no Explorer entry.
    fireEvent.contextMenu(screen.getByTitle('src'))
    expect(screen.queryByRole('menuitem', { name: 'Open in Explorer' })).toBeNull()
    expect(shell.reveal).not.toHaveBeenCalled()
  })
})
