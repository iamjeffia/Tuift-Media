// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({
  chats: [] as Array<string | undefined>,
  probe: undefined as (() => boolean) | undefined,
  notice: undefined as ((text: string) => void) | undefined,
}))

vi.mock('./bridge.js', () => ({
  reportActiveChat: (chatId: string | undefined) => bridge.chats.push(chatId),
  onUnloadProbe: (isSafe: () => boolean) => {
    bridge.probe = isSafe
    return () => (bridge.probe = undefined)
  },
  onShellNotice: (listener: (text: string) => void) => {
    bridge.notice = listener
    return () => (bridge.notice = undefined)
  },
}))

const { dialogIsOpen, useShellLifecycle } = await import('./use-shell-lifecycle.js')

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  bridge.chats.length = 0
})

type Props = { activeChatId?: string | undefined; unloadSafe?: boolean }

function mount(props: Props) {
  const showNotice = vi.fn()
  const view = renderHook(
    (current: Props) =>
      useShellLifecycle({
        activeChatId: current.activeChatId,
        unloadSafe: current.unloadSafe ?? true,
        showNotice,
      }),
    { initialProps: props },
  )
  return { ...view, showNotice }
}

describe('shell lifecycle', () => {
  it('reports the chat that is open, and none for new chat or a chat still starting', () => {
    const view = mount({})
    view.rerender({ activeChatId: 'chat-1' })
    view.rerender({ activeChatId: 'pending:abc' })
    view.rerender({ activeChatId: undefined })
    expect(bridge.chats).toEqual([undefined, 'chat-1', undefined])
  })

  it('answers the unload question from the latest state, with no dialog open', () => {
    const view = mount({ unloadSafe: true })
    expect(bridge.probe?.()).toBe(true)
    view.rerender({ unloadSafe: false })
    expect(bridge.probe?.()).toBe(false)
    view.rerender({ unloadSafe: true })
    expect(bridge.probe?.()).toBe(true)
  })

  it('is not safe to unload while a dialog is on screen', () => {
    mount({ unloadSafe: true })
    for (const markup of [
      '<div role="dialog"></div>',
      '<div role="alertdialog"></div>',
      '<div aria-modal="true"></div>',
    ]) {
      document.body.innerHTML = markup
      expect(dialogIsOpen(document), markup).toBe(true)
      expect(bridge.probe?.(), markup).toBe(false)
    }
    document.body.innerHTML = '<main><textarea></textarea></main>'
    expect(bridge.probe?.()).toBe(true)
  })

  it('shows the line the shell sends and stops listening on unmount', () => {
    const view = mount({})
    bridge.notice?.('The chat was not reopened.')
    expect(view.showNotice).toHaveBeenCalledExactlyOnceWith('The chat was not reopened.')
    view.unmount()
    expect(bridge.notice).toBeUndefined()
    expect(bridge.probe).toBeUndefined()
  })
})
