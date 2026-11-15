// @vitest-environment happy-dom
import { methods } from '@harness/contracts'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TestTransport } from '../../test-transport.js'
import { WorkspaceFiles } from './WorkspaceFiles.js'

const PROJECT = 'C:\\projects\\site'
const entry = (
  path: string,
  kind: 'file' | 'directory' = 'file',
  extra: Partial<{ size: number; modifiedAt: number; restricted: boolean }> = {},
) => ({
  name: path.split('/').at(-1)!,
  path,
  kind,
  size: 12,
  modifiedAt: 1,
  restricted: false,
  ...extra,
})

type Listing = Record<string, ReturnType<typeof entry>[]>

function site(listing: Listing, contents: Record<string, string> = {}, root = PROJECT) {
  return new TestTransport((method, params) => {
    if (method === 'workspace.listDirectory') {
      const request = methods[method].params.parse(params)
      const directory = request.directory ?? ''
      const entries = listing[directory]
      if (!entries) throw new Error('missing folder')
      return { path: directory, root, entries }
    }
    if (method === 'workspace.readFile') {
      const request = methods[method].params.parse(params)
      const content = contents[request.path]
      if (content === undefined) throw new Error('ENOENT')
      return {
        name: request.path.split('/').at(-1),
        path: request.path,
        size: content.length,
        binary: false,
        truncated: false,
        content,
      }
    }
    throw new Error(`Unhandled test request: ${method}`)
  })
}

const LISTING = {
  '': [entry('src', 'directory'), entry('README.md'), entry('logo.png', 'file', { size: 900 })],
  src: [entry('src/app.ts'), entry('src/deep', 'directory')],
  'src/deep': [entry('src/deep/util.ts')],
}
const CONTENTS = { 'src/app.ts': 'export const app = 1', 'src/deep/util.ts': 'util' }

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 400 })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 600 })
})
afterEach(() => cleanup())

describe('a file the chat cited', () => {
  it('opens its folders, selects the file and shows it', async () => {
    const transport = site(LISTING, CONTENTS)
    const view = render(
      <WorkspaceFiles
        transport={transport}
        projectPath={PROJECT}
        openRequest={{ request: 1, path: 'C:\\projects\\site\\src\\deep\\util.ts' }}
      />,
    )

    await waitFor(() =>
      expect(view.container.querySelector('.workspace-code__line code')?.textContent).toBe('util'),
    )
    expect(screen.getByTitle('src/deep/util.ts').className).toContain('is-selected')
    expect(screen.getByTitle('src').getAttribute('aria-expanded')).toBe('true')
    expect(transport.requests.filter((request) => request.method === 'workspace.readFile')).toEqual(
      [
        {
          method: 'workspace.readFile',
          params: { projectPath: PROJECT, path: 'src/deep/util.ts' },
        },
      ],
    )
  })

  it('opens the next file asked for, and the same ask only once', async () => {
    const transport = site(LISTING, CONTENTS)
    const view = render(
      <WorkspaceFiles
        transport={transport}
        projectPath={PROJECT}
        openRequest={{ request: 1, path: 'c:/projects/site/src/app.ts' }}
      />,
    )
    await screen.findByText('20 B')

    view.rerender(
      <WorkspaceFiles
        transport={transport}
        projectPath={PROJECT}
        openRequest={{ request: 2, path: 'C:\\projects\\site\\src\\deep\\util.ts' }}
      />,
    )
    await screen.findByText('4 B')
    const reads = () =>
      transport.requests.filter((request) => request.method === 'workspace.readFile')
    expect(reads()).toHaveLength(2)

    // A re-render with the same ask does not open it again.
    view.rerender(
      <WorkspaceFiles
        transport={transport}
        projectPath={PROJECT}
        openRequest={{ request: 2, path: 'C:\\projects\\site\\src\\deep\\util.ts' }}
      />,
    )
    expect(reads()).toHaveLength(2)
  })

  it('finds the file under the chat checkout the tab lists, or under the project', async () => {
    const checkout = 'C:\\checkouts\\site-chat'
    const transport = site(LISTING, CONTENTS, checkout)
    render(
      <WorkspaceFiles
        transport={transport}
        projectPath={PROJECT}
        threadId="chat-1"
        openRequest={{ request: 1, path: 'C:\\projects\\site\\src\\app.ts' }}
      />,
    )
    expect(await screen.findByText('20 B')).toBeTruthy()
  })

  it('says a file outside the project cannot be opened here', async () => {
    render(
      <WorkspaceFiles
        transport={site(LISTING, CONTENTS)}
        projectPath={PROJECT}
        openRequest={{ request: 1, path: 'C:\\elsewhere\\notes.md' }}
      />,
    )
    expect((await screen.findByRole('alert')).textContent).toContain('outside the project')
  })

  it('says a file that is gone is not in the project any more, and never reads it', async () => {
    const transport = site(LISTING, CONTENTS)
    render(
      <WorkspaceFiles
        transport={transport}
        projectPath={PROJECT}
        openRequest={{ request: 1, path: 'C:\\projects\\site\\src\\missing.ts' }}
      />,
    )
    expect((await screen.findByRole('alert')).textContent).toContain('not in the project any more')
    expect(transport.requests.some((request) => request.method === 'workspace.readFile')).toBe(
      false,
    )
  })

  it('does not open a protected file', async () => {
    const protectedListing = {
      ...LISTING,
      '': [entry('.env', 'file', { restricted: true })],
    }
    render(
      <WorkspaceFiles
        transport={site(protectedListing, {})}
        projectPath={PROJECT}
        openRequest={{ request: 1, path: 'C:\\projects\\site\\.env' }}
      />,
    )
    expect((await screen.findByRole('alert')).textContent).toContain('protected')
  })

  it('expands a cited folder without opening a file', async () => {
    const transport = site(LISTING, CONTENTS)
    render(
      <WorkspaceFiles
        transport={transport}
        projectPath={PROJECT}
        openRequest={{ request: 1, path: 'C:\\projects\\site\\src' }}
      />,
    )
    expect(await screen.findByTitle('src/app.ts')).toBeTruthy()
    expect(transport.requests.some((request) => request.method === 'workspace.readFile')).toBe(
      false,
    )
  })

  it('shows an image from the listing without reading it as text', async () => {
    const transport = site(LISTING, CONTENTS)
    render(
      <WorkspaceFiles
        transport={transport}
        projectPath={PROJECT}
        openRequest={{ request: 1, path: 'C:\\projects\\site\\logo.png' }}
      />,
    )
    expect(await screen.findByText('900 B')).toBeTruthy()
    expect(transport.requests.some((request) => request.method === 'workspace.readFile')).toBe(
      false,
    )
  })
})

describe('refreshing the open file', () => {
  const completed = (transport: TestTransport) =>
    act(() => {
      transport.emit('thread.event', {
        threadId: 'chat-1',
        event: { type: 'turn.completed', turnId: 'turn', status: 'completed' },
      })
    })

  it('reads it again only when its listing says it changed', async () => {
    let modifiedAt = 1
    let content = 'one'
    const transport = new TestTransport((method, params) => {
      if (method === 'workspace.listDirectory')
        return { path: '', entries: [entry('a.ts', 'file', { modifiedAt })] }
      if (method === 'workspace.readFile') {
        const request = methods[method].params.parse(params)
        return {
          name: 'a.ts',
          path: request.path,
          size: content.length,
          binary: false,
          truncated: false,
          content,
        }
      }
      throw new Error(`Unhandled test request: ${method}`)
    })
    render(<WorkspaceFiles transport={transport} projectPath={PROJECT} threadId="chat-1" />)
    fireEvent.click(await screen.findByTitle('a.ts'))
    await screen.findByText('3 B')
    const reads = () =>
      transport.requests.filter((request) => request.method === 'workspace.readFile')
    expect(reads()).toHaveLength(1)

    // The turn ends and nothing changed: the listing is asked, the 2 MB file is not.
    completed(transport)
    await waitFor(() =>
      expect(
        transport.requests.filter((request) => request.method === 'workspace.listDirectory'),
      ).toHaveLength(2),
    )
    await act(async () => {})
    expect(reads()).toHaveLength(1)

    modifiedAt = 2
    content = 'two lines'
    completed(transport)
    expect(await screen.findByText('9 B')).toBeTruthy()
    expect(reads()).toHaveLength(2)
  })
})
