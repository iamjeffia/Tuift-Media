import { describe, expect, it, vi } from 'vitest'
import type { NotificationMode, ReportedChat } from './chat-attention.js'
import type { Language } from './i18n.js'
import { ChatNotifier, type ChatNotifierHost } from './chat-notifier.js'

function setup(
  options: { away?: boolean; language?: Language; server?: boolean; mode?: NotificationMode } = {},
) {
  let away = options.away ?? true
  const shown: Array<{ title: string; body: string; click: () => void; close: () => void }> = []
  const host = {
    isAway: () => away,
    show: vi.fn((title: string, body: string, onClick: () => void) => {
      const notification = { title, body, click: onClick, close: vi.fn() }
      shown.push(notification)
      return notification
    }),
    setBadge: vi.fn(),
    openChat: vi.fn(),
    language: () => options.language ?? 'en',
    serverReports: () => options.server ?? false,
    loadMode: () => options.mode,
    saveMode: vi.fn(),
  } satisfies ChatNotifierHost
  const notifier = new ChatNotifier(host)
  return {
    host,
    notifier,
    shown,
    setAway: (value: boolean) => {
      away = value
    },
  }
}

const working = (id: string, title = `Chat ${id}`) => ({ id, title, state: 'working' })
const waiting = (id: string, state: 'approval' | 'input' | 'failed', title = `Chat ${id}`) => ({
  id,
  title,
  state,
})

describe('ChatNotifier', () => {
  it('shows the chat title and what it needs, and badges it', () => {
    const { host, notifier, shown } = setup()
    notifier.report({ mode: 'needs-you', chats: [working('a', 'Fix login')] })
    notifier.report({ mode: 'needs-you', chats: [waiting('a', 'approval', 'Fix login')] })
    expect(shown.map(({ title, body }) => ({ title, body }))).toEqual([
      { title: 'Fix login', body: 'Needs your approval' },
    ])
    expect(host.setBadge).toHaveBeenLastCalledWith(1)
  })

  it('says what the chat needs in the interface language', () => {
    const { notifier, shown } = setup({ language: 'pt-BR' })
    notifier.report({ mode: 'needs-you', chats: [working('a', 'Corrigir login')] })
    notifier.report({ mode: 'needs-you', chats: [waiting('a', 'approval', 'Corrigir login')] })
    expect(shown.map(({ title, body }) => ({ title, body }))).toEqual([
      { title: 'Corrigir login', body: 'Precisa da sua aprovação' },
    ])
  })

  it('opens the chat when its notification is clicked', () => {
    const { host, notifier, shown } = setup()
    notifier.report({ mode: 'needs-you', chats: [working('a')] })
    notifier.report({ mode: 'needs-you', chats: [waiting('a', 'input')] })
    shown[0]!.click()
    expect(host.openChat).toHaveBeenCalledWith('a')
    // A clicked notification leaves the centre; coming back does not close it twice.
    expect(shown[0]!.close).toHaveBeenCalledTimes(1)
    notifier.windowFocused()
    expect(shown[0]!.close).toHaveBeenCalledTimes(1)
  })

  it('replaces a chat notification when the chat moves on', () => {
    const { notifier, shown } = setup()
    notifier.report({ mode: 'needs-you-or-finished', chats: [working('a')] })
    notifier.report({ mode: 'needs-you-or-finished', chats: [waiting('a', 'approval')] })
    notifier.report({ mode: 'needs-you-or-finished', chats: [] })
    expect(shown.map(({ body }) => body)).toEqual(['Needs your approval', 'Finished'])
    expect(shown[0]!.close).toHaveBeenCalledTimes(1)
    expect(shown[1]!.close).not.toHaveBeenCalled()
  })

  it('closes a notification whose chat stopped waiting without showing another', () => {
    const { notifier, shown } = setup()
    notifier.report({ mode: 'needs-you', chats: [working('a')] })
    notifier.report({ mode: 'needs-you', chats: [waiting('a', 'approval')] })
    notifier.report({ mode: 'needs-you', chats: [working('a')] })
    expect(shown).toHaveLength(1)
    expect(shown[0]!.close).toHaveBeenCalledTimes(1)
  })

  it('clears every notification and the badge when the window comes back', () => {
    const { host, notifier, shown } = setup()
    notifier.report({ mode: 'needs-you', chats: [working('a'), working('b')] })
    notifier.report({
      mode: 'needs-you',
      chats: [waiting('a', 'approval'), waiting('b', 'failed')],
    })
    expect(host.setBadge).toHaveBeenLastCalledWith(2)
    notifier.windowFocused()
    expect(shown.every((notification) => notification.close.mock.calls.length === 1)).toBe(true)
    expect(host.setBadge).toHaveBeenLastCalledWith(0)
  })

  it('shows nothing for a chat that changes while the window is in front', () => {
    const { host, notifier } = setup({ away: false })
    notifier.report({ mode: 'needs-you-or-finished', chats: [working('a')] })
    notifier.report({ mode: 'needs-you-or-finished', chats: [waiting('a', 'approval')] })
    notifier.report({ mode: 'needs-you-or-finished', chats: [] })
    expect(host.show).not.toHaveBeenCalled()
    expect(host.setBadge).not.toHaveBeenCalled()
  })

  it('takes notifications and the badge down when they are turned off', () => {
    const { host, notifier, shown } = setup()
    notifier.report({ mode: 'needs-you', chats: [working('a')] })
    notifier.report({ mode: 'needs-you', chats: [waiting('a', 'approval')] })
    notifier.report({ mode: 'off', chats: [waiting('a', 'approval')] })
    expect(shown[0]!.close).toHaveBeenCalledTimes(1)
    expect(host.setBadge).toHaveBeenLastCalledWith(0)
  })

  it('does not repeat a notification after the page reloads', () => {
    const { host, notifier } = setup()
    notifier.report({ mode: 'needs-you', chats: [working('a')] })
    notifier.report({ mode: 'needs-you', chats: [waiting('a', 'approval')] })
    notifier.pageReplaced()
    // The reloaded page reports once its chat list has loaded.
    notifier.report({ mode: 'needs-you', chats: [waiting('a', 'approval'), waiting('b', 'input')] })
    notifier.report({ mode: 'needs-you', chats: [waiting('a', 'approval'), waiting('b', 'input')] })
    expect(host.show).toHaveBeenCalledTimes(1)
  })

  it('ignores a malformed report', () => {
    const { host, notifier } = setup()
    notifier.report({ mode: 'needs-you', chats: [working('a')] })
    notifier.report({ mode: 'loud', chats: [waiting('a', 'approval')] })
    notifier.report('approval')
    expect(host.show).not.toHaveBeenCalled()
  })

  it('touches the badge only when its count changes', () => {
    const { host, notifier } = setup()
    notifier.report({ mode: 'needs-you', chats: [working('a')] })
    notifier.report({ mode: 'needs-you', chats: [waiting('a', 'approval')] })
    notifier.report({ mode: 'needs-you', chats: [waiting('a', 'approval'), working('b')] })
    expect(host.setBadge).toHaveBeenCalledTimes(1)
  })

  it('carries on when the OS cannot show a notification', () => {
    const { host, notifier } = setup()
    host.show.mockReturnValueOnce(undefined as never)
    notifier.report({ mode: 'needs-you', chats: [working('a')] })
    notifier.report({ mode: 'needs-you', chats: [waiting('a', 'approval')] })
    expect(host.setBadge).toHaveBeenLastCalledWith(1)
    notifier.dispose()
    expect(host.setBadge).toHaveBeenLastCalledWith(0)
  })
})

describe('ChatNotifier with the server as the source of the chats', () => {
  const run = (id: string, title = `Chat ${id}`): ReportedChat => ({ id, title, state: 'working' })
  const wait = (
    id: string,
    state: 'approval' | 'input' | 'failed' = 'approval',
    title = `Chat ${id}`,
  ): ReportedChat => ({ id, title, state })

  it('announces a chat that finishes, with no page at all', () => {
    const { host, notifier, shown } = setup({ server: true, mode: 'needs-you-or-finished' })
    notifier.serverStarted()
    notifier.serverReport([])
    notifier.serverReport([run('a', 'Fix login')])
    notifier.serverReport([])
    expect(shown.map(({ title, body }) => ({ title, body }))).toEqual([
      { title: 'Fix login', body: 'Finished' },
    ])
    expect(host.setBadge).not.toHaveBeenCalled()
  })

  it('announces an approval and a question, with no page at all', () => {
    const { host, notifier, shown } = setup({ server: true })
    notifier.serverStarted()
    notifier.serverReport([])
    notifier.serverReport([run('a', 'Fix login'), run('b', 'Add tests')])
    notifier.serverReport([wait('a', 'approval', 'Fix login'), wait('b', 'input', 'Add tests')])
    expect(shown.map(({ title, body }) => ({ title, body }))).toEqual([
      { title: 'Fix login', body: 'Needs your approval' },
      { title: 'Add tests', body: 'Has a question' },
    ])
    expect(host.setBadge).toHaveBeenLastCalledWith(2)
  })

  it('says nothing about a finished chat in the default mode', () => {
    const { host, notifier } = setup({ server: true })
    notifier.serverStarted()
    notifier.serverReport([run('a')])
    notifier.serverReport([])
    expect(host.show).not.toHaveBeenCalled()
  })

  it('says nothing while the window is in front', () => {
    const { host, notifier } = setup({ server: true, away: false, mode: 'needs-you-or-finished' })
    notifier.serverStarted()
    notifier.serverReport([])
    notifier.serverReport([run('a')])
    notifier.serverReport([wait('a')])
    notifier.serverReport([])
    expect(host.show).not.toHaveBeenCalled()
    expect(host.setBadge).not.toHaveBeenCalled()
  })

  it('announces nothing for what was already waiting when the server started', () => {
    const { host, notifier } = setup({ server: true, mode: 'needs-you-or-finished' })
    notifier.serverStarted()
    notifier.serverReport([wait('a'), wait('b', 'failed')])
    notifier.serverReport([wait('a'), wait('b', 'failed')])
    expect(host.show).not.toHaveBeenCalled()
  })

  it('treats the first report of a restarted server as a baseline again', () => {
    const { host, notifier } = setup({ server: true, mode: 'needs-you-or-finished' })
    notifier.serverStarted()
    notifier.serverReport([run('a')])
    // The server died and came back: what it says first replaces the stale picture, silently.
    notifier.serverStarted()
    notifier.serverReport([wait('a')])
    expect(host.show).not.toHaveBeenCalled()
    notifier.serverReport([])
    expect(host.show).toHaveBeenCalledOnce()
  })

  it('ignores the chats of a page, and a page that was replaced is not a new baseline', () => {
    const { host, notifier } = setup({ server: true })
    notifier.serverStarted()
    notifier.serverReport([run('a')])
    // The page says another chat waits; the server did not, so nothing is announced.
    notifier.report({ mode: 'needs-you', chats: [waiting('b', 'approval')] })
    notifier.pageReplaced()
    notifier.report({ mode: 'needs-you', chats: [waiting('c', 'approval')] })
    expect(host.show).not.toHaveBeenCalled()
    notifier.serverReport([wait('a')])
    expect(host.show).toHaveBeenCalledExactlyOnceWith(
      'Chat a',
      'Needs your approval',
      expect.any(Function),
    )
  })

  it('keeps the mode the page sent, for when there is no page', () => {
    const { host, notifier } = setup({ server: true })
    expect(host.saveMode).not.toHaveBeenCalled()
    notifier.report({ mode: 'needs-you-or-finished', chats: [] })
    expect(host.saveMode).toHaveBeenCalledExactlyOnceWith('needs-you-or-finished')
    // The same mode again is not written again.
    notifier.report({ mode: 'needs-you-or-finished', chats: [] })
    expect(host.saveMode).toHaveBeenCalledOnce()
    // The page is gone; the server's chats still follow the mode it left.
    notifier.serverStarted()
    notifier.serverReport([run('a')])
    notifier.serverReport([])
    expect(host.show).toHaveBeenCalledOnce()
  })

  it('starts from the saved mode, so a run with no page already follows it', () => {
    const { host, notifier } = setup({ server: true, mode: 'off' })
    notifier.serverStarted()
    notifier.serverReport([run('a')])
    notifier.serverReport([wait('a')])
    expect(host.show).not.toHaveBeenCalled()
    expect(host.setBadge).not.toHaveBeenCalled()
  })

  it('takes everything down when the page turns notifications off between server reports', () => {
    const { host, notifier, shown } = setup({ server: true })
    notifier.serverStarted()
    notifier.serverReport([run('a')])
    notifier.serverReport([wait('a')])
    expect(host.setBadge).toHaveBeenLastCalledWith(1)
    notifier.report({ mode: 'off', chats: [] })
    expect(shown[0]!.close).toHaveBeenCalledTimes(1)
    expect(host.setBadge).toHaveBeenLastCalledWith(0)
  })

  it('opens the chat of a clicked notification when there is no window', () => {
    // Opening is the host's job: it creates the window and hands the chat to the new page.
    const { host, notifier, shown } = setup({ server: true })
    notifier.serverStarted()
    notifier.serverReport([run('a')])
    notifier.serverReport([wait('a')])
    shown[0]!.click()
    expect(host.openChat).toHaveBeenCalledExactlyOnceWith('a')
  })

  it('carries on when the mode cannot be saved', () => {
    const { host, notifier } = setup({ server: true })
    host.saveMode.mockImplementation(() => {
      throw new Error('disk full')
    })
    expect(() => notifier.report({ mode: 'off', chats: [] })).not.toThrow()
  })
})
