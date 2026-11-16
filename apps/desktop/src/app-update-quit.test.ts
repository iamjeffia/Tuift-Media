import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { createQuitWatchdog, QUIT_DEADLINES } from './quit-watchdog.js'

// Exercise the registered handler without importing main.ts and starting Electron.
const main = readFileSync(new URL('./main.ts', import.meta.url), 'utf8')
const start = main.indexOf("  app.on('before-quit', (event) => {")
const end = main.indexOf("\n  app.on('will-quit'", start)
if (start < 0 || end < 0) throw new Error('The main before-quit handler was not found.')

function fixture(
  dispose: () => void | Promise<void>,
  status = 'preparing',
  serverSupervisor?: { stop: () => Promise<void> },
  runningAgents = 0,
  quitConfirmed = false,
) {
  const events: Array<{ preventDefault: ReturnType<typeof vi.fn> }> = []
  const app = Object.assign(new EventEmitter(), {
    quit: vi.fn(() => {
      const event = { preventDefault: vi.fn() }
      events.push(event)
      app.emit('before-quit', event)
    }),
  })
  const context = {
    app,
    appUpdater: {
      state: () => ({ status }),
      dispose: vi.fn(dispose),
      prepareForQuit: vi.fn<(agentsRunning: boolean) => void>(),
      install: vi.fn(() => true),
    },
    runningAgents,
    waitingForUpdateCleanup: false,
    waitingForServerShutdown: false,
    quitConfirmed,
    quitRequest: { request: vi.fn() },
    quitWatchdog: createQuitWatchdog({ log: vi.fn(), exit: vi.fn() }),
    QUIT_DEADLINES,
    installUpdateAfterQuit: false,
    serverSupervisor,
    appIsQuitting: false,
    previewCaptures: { cancelAll: vi.fn() },
    mainWindowStatePersistence: { saveAndStop: vi.fn() },
    Promise,
  }
  vm.runInNewContext(main.slice(start, end), context)
  return { ...context, context, events }
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

describe('quit during an app update', () => {
  it.each(['downloading', 'preparing'])(
    'blocks repeated quit while %s, then allows the final quit once',
    async (status) => {
      let finish!: () => void
      const cleanup = new Promise<void>((resolve) => (finish = resolve))
      const { app, appUpdater, context, events, mainWindowStatePersistence } = fixture(
        () => cleanup,
        status,
      )

      app.quit()
      app.quit()
      await flush()
      app.quit()
      expect(events).toHaveLength(3)
      for (const event of events) expect(event.preventDefault).toHaveBeenCalledOnce()
      expect(appUpdater.dispose).toHaveBeenCalledOnce()
      expect(context.appIsQuitting).toBe(false)
      expect(mainWindowStatePersistence.saveAndStop).not.toHaveBeenCalled()

      finish()
      await flush()
      expect(app.quit).toHaveBeenCalledTimes(4)
      expect(events[3]!.preventDefault).not.toHaveBeenCalled()
      expect(appUpdater.dispose).toHaveBeenCalledOnce()
      expect(context.waitingForUpdateCleanup).toBe(false)
      expect(context.appIsQuitting).toBe(true)
      expect(mainWindowStatePersistence.saveAndStop).toHaveBeenCalledOnce()
    },
  )

  it.each(['throw', 'reject'])(
    'finishes quitting without an unhandled failure when cleanup can %s',
    async (failure) => {
      const { app, appUpdater, events, context } = fixture(() => {
        const error = new Error('Cleanup failed')
        if (failure === 'throw') throw error
        return Promise.reject(error)
      })

      expect(() => app.quit()).not.toThrow()
      await flush()
      expect(app.quit).toHaveBeenCalledTimes(2)
      expect(events[0]!.preventDefault).toHaveBeenCalledOnce()
      expect(events[1]!.preventDefault).not.toHaveBeenCalled()
      expect(appUpdater.dispose).toHaveBeenCalledOnce()
      expect(context.waitingForUpdateCleanup).toBe(false)
      expect(context.appIsQuitting).toBe(true)
    },
  )

  it('allows an ordinary quit without starting update cleanup', () => {
    const { app, appUpdater, events } = fixture(() => {}, 'idle')
    app.quit()
    expect(events[0]!.preventDefault).not.toHaveBeenCalled()
    expect(appUpdater.dispose).not.toHaveBeenCalled()
  })

  it('holds repeated quit requests until the owned server flushes and exits', async () => {
    let finish!: () => void
    const stop = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const { app, events, context, mainWindowStatePersistence } = fixture(() => {}, 'idle', { stop })
    app.quit()
    app.quit()
    await flush()
    expect(stop).toHaveBeenCalledOnce()
    for (const event of events) expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(context.waitingForServerShutdown).toBe(true)
    finish()
    await flush()
    expect(events).toHaveLength(3)
    expect(events[2]!.preventDefault).not.toHaveBeenCalled()
    expect(context.waitingForServerShutdown).toBe(false)
    expect(mainWindowStatePersistence.saveAndStop).toHaveBeenCalledOnce()
  })

  it('tells the updater whether agents ran before the server stops them', async () => {
    const calls: string[] = []
    const stop = vi.fn(async () => {
      calls.push('server')
    })
    // The person agreed to stop the chats, or no one asked: the quit goes on.
    const { app, appUpdater, context } = fixture(() => {}, 'ready', { stop }, 2, true)
    appUpdater.prepareForQuit.mockImplementation((running) => {
      calls.push(`prepare ${running}`)
    })
    app.quit()
    // The stopped agents report in while the server shuts down.
    context.runningAgents = 0
    await flush()
    expect(calls).toEqual(['prepare true', 'server'])
    expect(appUpdater.prepareForQuit.mock.calls[0]).toEqual([true])

    const idle = fixture(() => {}, 'ready')
    idle.app.quit()
    expect(idle.appUpdater.prepareForQuit).toHaveBeenCalledWith(false)
  })

  it('detaches an update before waiting for server shutdown', async () => {
    const calls: string[] = []
    const stop = vi.fn(async () => {
      calls.push('server')
    })
    const { app, events } = fixture(
      async () => {
        calls.push('update')
      },
      'preparing',
      { stop },
    )
    app.quit()
    await flush()
    expect(calls).toEqual(['update', 'server'])
    expect(events).toHaveLength(3)
    expect(events[2]!.preventDefault).not.toHaveBeenCalled()
  })
})

describe('quit while chats are running', () => {
  it('holds the quit and asks, once per request, when a chat works', () => {
    const stop = vi.fn(async () => {})
    const { app, appUpdater, context, events, quitRequest, mainWindowStatePersistence } = fixture(
      () => {},
      'ready',
      { stop },
      2,
    )

    app.quit()

    expect(events[0]!.preventDefault).toHaveBeenCalledOnce()
    expect(quitRequest.request).toHaveBeenCalledOnce()
    // Nothing started to wind down: no update decision, no server stop, no quit flag.
    expect(appUpdater.prepareForQuit).not.toHaveBeenCalled()
    expect(stop).not.toHaveBeenCalled()
    expect(context.appIsQuitting).toBe(false)
    expect(mainWindowStatePersistence.saveAndStop).not.toHaveBeenCalled()
  })

  it('does not ask when no chat works', () => {
    const { app, events, quitRequest } = fixture(() => {}, 'idle', undefined, 0)
    app.quit()
    expect(events[0]!.preventDefault).not.toHaveBeenCalled()
    expect(quitRequest.request).not.toHaveBeenCalled()
  })

  it('lets the quit through once the person agreed, and stops the server', async () => {
    const stop = vi.fn(async () => {})
    const { app, events, quitRequest, context } = fixture(() => {}, 'idle', { stop }, 3, true)
    app.quit()
    await flush()
    expect(quitRequest.request).not.toHaveBeenCalled()
    expect(stop).toHaveBeenCalledOnce()
    expect(events[0]!.preventDefault).toHaveBeenCalledOnce()
    expect(events.at(-1)!.preventDefault).not.toHaveBeenCalled()
    expect(context.appIsQuitting).toBe(true)
  })
})

describe('quit deadlines and the installer hand-over', () => {
  it('starts the clock for the whole quit once the quit is going ahead, not while it asks', () => {
    const asking = fixture(() => {}, 'ready', { stop: vi.fn(async () => {}) }, 2)
    asking.app.quit()
    expect(asking.quitWatchdog.started).toBe(false)

    const going = fixture(() => {}, 'idle', { stop: vi.fn(async () => {}) }, 0)
    going.app.quit()
    expect(going.quitWatchdog.started).toBe(true)
  })

  it('goes on without a server that does not stop, after its deadline', async () => {
    vi.useFakeTimers()
    try {
      const stop = vi.fn(() => new Promise<void>(() => {}))
      const { app, events, context } = fixture(() => {}, 'idle', { stop })
      app.quit()
      await vi.advanceTimersByTimeAsync(QUIT_DEADLINES.serverMs - 1)
      expect(context.waitingForServerShutdown).toBe(true)
      await vi.advanceTimersByTimeAsync(2)
      expect(context.waitingForServerShutdown).toBe(false)
      expect(events.at(-1)!.preventDefault).not.toHaveBeenCalled()
      expect(context.appIsQuitting).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('goes on without an update cleanup that does not finish, after its deadline', async () => {
    vi.useFakeTimers()
    try {
      const { app, context } = fixture(() => new Promise<void>(() => {}), 'preparing', {
        stop: vi.fn(async () => {}),
      })
      app.quit()
      await vi.advanceTimersByTimeAsync(QUIT_DEADLINES.updateCleanupMs + 1)
      expect(context.waitingForUpdateCleanup).toBe(false)
      expect(context.appIsQuitting).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('starts the installer only after the server stopped and the quit is allowed through', async () => {
    const calls: string[] = []
    const stop = vi.fn(async () => {
      calls.push('server')
    })
    const { app, appUpdater, context, events } = fixture(() => {}, 'ready', { stop })
    appUpdater.install.mockImplementation(() => {
      calls.push('install')
      return true
    })
    context.installUpdateAfterQuit = true
    app.quit()
    await flush()
    expect(calls).toEqual(['server', 'install'])
    expect(context.installUpdateAfterQuit).toBe(false)
    expect(events.at(-1)!.preventDefault).not.toHaveBeenCalled()
  })

  it('does not start the installer for a quit that is not an update', async () => {
    const { app, appUpdater } = fixture(() => {}, 'ready', { stop: vi.fn(async () => {}) })
    app.quit()
    await flush()
    expect(appUpdater.install).not.toHaveBeenCalled()
  })
})
