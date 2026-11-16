import { describe, expect, it, vi } from 'vitest'
import type { StartupNotice } from '@harness/contracts'
import type { Connection } from '../link/connection'
import { StartupNotices } from './startup-notice'

const notice: StartupNotice = {
  kind: 'database.restored',
  at: 1,
  backupAt: 2,
  asidePath: 'chats.sqlite.damaged',
}

/** A link that only records who listens and what is asked. */
function fakeConnection(request: () => Promise<unknown> = () => Promise.resolve({})) {
  const channels = new Map<string, (data: unknown) => void>()
  const opens: Array<() => void> = []
  const calls: Array<[string, unknown]> = []
  const connection = {
    on: (channel: string, listener: (data: unknown) => void) => channels.set(channel, listener),
    onOpen: (listener: () => void) => opens.push(listener),
    request: (method: string, params: unknown) => {
      calls.push([method, params])
      return request()
    },
  } as unknown as Connection
  return {
    connection,
    calls,
    push: (data: unknown) => channels.get('server.startupNotice')?.(data),
    open: () => opens.forEach((listener) => listener()),
  }
}

describe('start-up notices on the phone', () => {
  it('keeps the notice the computer sends until it is dismissed', () => {
    const link = fakeConnection()
    const notices = new StartupNotices(link.connection)
    expect(notices.state.get()).toBeUndefined()
    link.push({ notice })
    expect(notices.state.get()).toEqual(notice)
  })

  it('drops it when another window or phone dismissed it', () => {
    const link = fakeConnection()
    const notices = new StartupNotices(link.connection)
    link.push({ notice })
    link.push({ notice: null })
    expect(notices.state.get()).toBeUndefined()
  })

  it('forgets a notice when the link reopens: the computer sends it again if it still holds one', () => {
    const link = fakeConnection()
    const notices = new StartupNotices(link.connection)
    link.push({ notice })
    link.open()
    expect(notices.state.get()).toBeUndefined()
    link.push({ notice })
    expect(notices.state.get()).toEqual(notice)
  })

  it('dismissing tells the computer, which stops it everywhere, and hides it at once', async () => {
    const link = fakeConnection()
    const notices = new StartupNotices(link.connection)
    link.push({ notice })
    await notices.dismiss()
    expect(notices.state.get()).toBeUndefined()
    expect(link.calls).toEqual([['startup.dismissNotice', {}]])
  })

  it('stays dismissed here when the computer cannot be reached', async () => {
    const link = fakeConnection(() => Promise.reject(new Error('The computer is not reachable')))
    const notices = new StartupNotices(link.connection)
    link.push({ notice })
    await expect(notices.dismiss()).resolves.toBeUndefined()
    expect(notices.state.get()).toBeUndefined()
    vi.restoreAllMocks()
  })
})
