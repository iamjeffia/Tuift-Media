import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createInstallQuit,
  INSTALL_QUIT_EXIT,
  INSTALL_QUIT_WAITS,
  openInstallQuitChannel,
  parseInstallQuitMode,
  parseInstallQuitRequest,
  processAlive,
  readInstallQuitRequest,
  readInstallQuitStatus,
  runInstallQuitClient,
  writeInstallQuitStatus,
  type InstallQuitStatus,
} from './install-quit.js'
import { en, ptBR, translate, translatePlural } from './i18n.js'

const directories: string[] = []
function folder(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'tuift-install-quit-'))
  directories.push(directory)
  return directory
}
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

const SECRET = 'a-secret-of-the-running-app'
const request = (mode: 'silent' | 'ask' = 'silent', token = SECRET) => ({
  mode,
  id: 'request-0001',
  token,
})

function appSide(options: { chats?: number; quitting?: boolean } = {}) {
  const deps = {
    token: SECRET,
    pid: 4242,
    chats: vi.fn(() => options.chats ?? 0),
    quitting: vi.fn(() => options.quitting ?? false),
    quit: vi.fn(),
    ask: vi.fn(),
    status: vi.fn<(status: InstallQuitStatus) => void>(),
    log: vi.fn(),
  }
  return { deps, quit: createInstallQuit(deps) }
}

describe('the switch an installer starts the app with', () => {
  it('names a mode, and nothing else counts', () => {
    expect(parseInstallQuitMode(['app.exe', '--quit-for-install=silent'])).toBe('silent')
    expect(parseInstallQuitMode(['app.exe', '--quit-for-install=ask'])).toBe('ask')
    expect(parseInstallQuitMode(['app.exe', '--quit-for-install'])).toBeUndefined()
    expect(parseInstallQuitMode(['app.exe', '--quit-for-install=now'])).toBeUndefined()
    expect(parseInstallQuitMode(['app.exe'])).toBeUndefined()
  })
})

describe('a request that reaches the running app', () => {
  it('is accepted from the app own channel: with its secret, a request quits an idle app', () => {
    const { deps, quit } = appSide({ chats: 0 })
    quit.handle(request())
    expect(deps.quit).toHaveBeenCalledOnce()
    expect(deps.status).toHaveBeenCalledExactlyOnceWith({
      id: 'request-0001',
      state: 'quitting',
      pid: 4242,
    })
  })

  it.each([
    ['carries a wrong secret', request('silent', 'someone-elses-secret')],
    ['carries no request at all', undefined],
  ])('is refused when it %s: nothing quits, nothing is asked, nothing is answered', (_why, bad) => {
    const { deps, quit } = appSide({ chats: 0 })
    quit.handle(bad)
    expect(deps.quit).not.toHaveBeenCalled()
    expect(deps.ask).not.toHaveBeenCalled()
    expect(deps.status).not.toHaveBeenCalled()
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('did not carry the secret'))
  })

  it('only reports a quit that is already under way, whatever is working', () => {
    const { deps, quit } = appSide({ chats: 3, quitting: true })
    quit.handle(request('silent'))
    expect(deps.quit).not.toHaveBeenCalled()
    expect(deps.ask).not.toHaveBeenCalled()
    expect(deps.status).toHaveBeenCalledExactlyOnceWith({
      id: 'request-0001',
      state: 'quitting',
      pid: 4242,
    })
  })

  it('never stops working chats for a silent request, and says so', () => {
    const { deps, quit } = appSide({ chats: 2 })
    quit.handle(request('silent'))
    expect(deps.quit).not.toHaveBeenCalled()
    expect(deps.ask).not.toHaveBeenCalled()
    expect(deps.status).toHaveBeenCalledExactlyOnceWith({
      id: 'request-0001',
      state: 'refused',
      pid: 4242,
      chats: 2,
    })
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('2 chat(s) working'))
  })

  it('puts working chats to the person when someone can answer, and quits only on yes', () => {
    const { deps, quit } = appSide({ chats: 2 })
    quit.handle(request('ask'))
    expect(deps.ask).toHaveBeenCalledOnce()
    expect(deps.quit).not.toHaveBeenCalled()
    expect(deps.status).toHaveBeenLastCalledWith({
      id: 'request-0001',
      state: 'asking',
      pid: 4242,
      chats: 2,
    })
    quit.answered(true)
    expect(deps.status).toHaveBeenLastCalledWith({
      id: 'request-0001',
      state: 'quitting',
      pid: 4242,
    })
  })

  it('reports keep working when the person says so, once', () => {
    const { deps, quit } = appSide({ chats: 2 })
    quit.handle(request('ask'))
    quit.answered(false)
    quit.answered(false)
    expect(deps.quit).not.toHaveBeenCalled()
    expect(deps.status).toHaveBeenLastCalledWith({ id: 'request-0001', state: 'kept', pid: 4242 })
    expect(deps.status).toHaveBeenCalledTimes(2)
  })

  it('ignores an answer to a question nobody asked', () => {
    const { deps, quit } = appSide({ chats: 0 })
    quit.answered(true)
    expect(deps.status).not.toHaveBeenCalled()
  })

  it('tells the client how the quit ended', () => {
    const { deps, quit } = appSide({ chats: 0 })
    quit.handle(request())
    quit.done(['server shutdown'], true)
    expect(deps.status).toHaveBeenLastCalledWith({
      id: 'request-0001',
      state: 'done',
      pid: 4242,
      forced: true,
      notClosed: ['server shutdown'],
    })
  })
})

describe('what a second instance carries', () => {
  it('is checked field by field', () => {
    const good = { quitForInstall: { mode: 'ask', id: 'abcdefgh1', token: 'x'.repeat(32) } }
    expect(parseInstallQuitRequest(good)).toEqual(good.quitForInstall)
    expect(parseInstallQuitRequest(undefined)).toBeUndefined()
    expect(parseInstallQuitRequest({})).toBeUndefined()
    expect(
      parseInstallQuitRequest({ quitForInstall: { ...good.quitForInstall, mode: 'x' } }),
    ).toBeUndefined()
    expect(
      parseInstallQuitRequest({ quitForInstall: { ...good.quitForInstall, id: '../x' } }),
    ).toBeUndefined()
    expect(
      parseInstallQuitRequest({ quitForInstall: { ...good.quitForInstall, token: 'short' } }),
    ).toBeUndefined()
  })
})

describe('the secret the running app leaves in its data folder', () => {
  it('is read by the client of the same folder and by no other', () => {
    const mine = folder()
    const other = folder()
    const channel = openInstallQuitChannel(mine)
    const found = readInstallQuitRequest(mine, 'silent')
    expect(found?.token).toBe(channel.token)
    expect(found?.mode).toBe('silent')
    expect(readInstallQuitRequest(other, 'silent')).toBeUndefined()
    channel.dispose()
    expect(readInstallQuitRequest(mine, 'silent')).toBeUndefined()
  })

  it('is new for every run and clears a status an earlier run left', () => {
    const directory = folder()
    const first = openInstallQuitChannel(directory)
    writeInstallQuitStatus(directory, { id: 'old-request', state: 'done', pid: 1 })
    expect(readInstallQuitStatus(directory)?.id).toBe('old-request')
    const second = openInstallQuitChannel(directory)
    expect(second.token).not.toBe(first.token)
    expect(readInstallQuitStatus(directory)).toBeUndefined()
  })

  it('is kept out of the status the client reads', () => {
    const directory = folder()
    openInstallQuitChannel(directory)
    writeInstallQuitStatus(directory, { id: 'request-0001', state: 'asking', pid: 7, chats: 1 })
    expect(
      readFileSync(path.join(directory, 'quit-for-install-status.json'), 'utf8'),
    ).not.toContain('token')
    if (process.platform !== 'win32')
      expect(statSync(path.join(directory, 'quit-for-install.json')).mode & 0o077).toBe(0)
  })

  it('reads a damaged status as no status', () => {
    const directory = folder()
    const file = path.join(directory, 'quit-for-install-status.json')
    writeFileSync(file, '{"id": 1')
    expect(readInstallQuitStatus(directory)).toBeUndefined()
    writeFileSync(file, '{"id":"a","pid":1,"state":"x"}')
    expect(readInstallQuitStatus(directory)).toBeUndefined()
  })
})

describe('the client an installer waits for', () => {
  function client(script: Array<InstallQuitStatus | undefined>, alive: boolean[] = []) {
    let time = 0
    let index = 0
    let lives = 0
    const log = vi.fn()
    const deps = {
      ownsLock: false,
      request: request('silent') as ReturnType<typeof request> | undefined,
      status: () => script[Math.min(index++, script.length - 1)],
      alive: vi.fn(() => alive[Math.min(lives++, alive.length - 1)] ?? false),
      now: () => time,
      sleep: (ms: number) => {
        time += ms
        return Promise.resolve()
      },
      log,
    }
    return { deps, log, time: () => time }
  }
  const status = (state: InstallQuitStatus['state'], extra: Partial<InstallQuitStatus> = {}) => ({
    id: 'request-0001',
    state,
    pid: 4242,
    ...extra,
  })

  it('has nothing to wait for when no app is running', async () => {
    const { deps } = client([])
    expect(await runInstallQuitClient({ ...deps, ownsLock: true })).toBe(INSTALL_QUIT_EXIT.gone)
  })

  it('gives up on an app that leaves nothing to ask it with, or does not answer', async () => {
    const { deps } = client([undefined])
    expect(await runInstallQuitClient({ ...deps, request: undefined })).toBe(
      INSTALL_QUIT_EXIT.noAnswer,
    )
    const silent = client([undefined, status('done', { id: 'someone-elses-request' })])
    expect(await runInstallQuitClient(silent.deps)).toBe(INSTALL_QUIT_EXIT.noAnswer)
    expect(silent.time()).toBeGreaterThanOrEqual(INSTALL_QUIT_WAITS.answerMs)
    expect(silent.time()).toBeLessThan(INSTALL_QUIT_WAITS.answerMs + 2 * INSTALL_QUIT_WAITS.pollMs)
  })

  it('exits with the code for working chats when the app refused a silent request', async () => {
    const { deps, log } = client([status('refused', { chats: 2 })])
    expect(await runInstallQuitClient(deps)).toBe(INSTALL_QUIT_EXIT.chatsWorking)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('2 chat(s) working'))
  })

  it('exits with the code for kept chats when the person chose to keep working', async () => {
    const { deps } = client([status('asking', { chats: 1 }), status('kept')])
    expect(await runInstallQuitClient(deps)).toBe(INSTALL_QUIT_EXIT.kept)
  })

  it('gives up on a question left open for the whole wait', async () => {
    const asking = client([status('asking', { chats: 1 })])
    expect(await runInstallQuitClient(asking.deps)).toBe(INSTALL_QUIT_EXIT.unanswered)
    expect(asking.time()).toBeGreaterThanOrEqual(INSTALL_QUIT_WAITS.questionMs)
  })

  it('waits for the app to end after it agreed, then reports it gone', async () => {
    const { deps, log } = client([status('quitting')], [true, true, true, false])
    expect(await runInstallQuitClient(deps)).toBe(INSTALL_QUIT_EXIT.gone)
    expect(deps.alive).toHaveBeenCalledWith(4242)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('the app ended in'))
  })

  it('says when the app had to end by its own deadline', async () => {
    const { deps, log } = client(
      [status('done', { forced: true, notClosed: ['server shutdown'] })],
      [false],
    )
    expect(await runInstallQuitClient(deps)).toBe(INSTALL_QUIT_EXIT.gone)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('by its own deadline'))
    expect(log).toHaveBeenCalledWith(expect.stringContaining('late: server shutdown'))
  })

  it('keeps waiting for the app it was told would quit when another request replaces the status', async () => {
    const { deps } = client(
      [status('quitting'), status('quitting', { id: 'another-request' })],
      [true, true, true, false],
    )
    expect(await runInstallQuitClient(deps)).toBe(INSTALL_QUIT_EXIT.gone)
  })

  it('stops waiting at the stated time for an app that agreed and is still there', async () => {
    const { deps, time } = client([status('quitting')], [true])
    expect(await runInstallQuitClient(deps)).toBe(INSTALL_QUIT_EXIT.stillRunning)
    expect(time()).toBeGreaterThanOrEqual(INSTALL_QUIT_WAITS.quitMs)
    expect(time()).toBeLessThan(INSTALL_QUIT_WAITS.quitMs + 2 * INSTALL_QUIT_WAITS.pollMs)
  })

  it('knows a process that is gone from one that is not', () => {
    expect(processAlive(process.pid)).toBe(true)
    expect(processAlive(2 ** 22 + 12345)).toBe(false)
  })
})

describe('a request to quit for an install, in the main process', () => {
  // The handler main.ts registers, run on its own, as app-update-quit.test.ts does for before-quit.
  const main = readFileSync(new URL('./main.ts', import.meta.url), 'utf8')
  const start = main.indexOf("  app.on('second-instance'")
  const end = main.indexOf("\n  app.on('before-quit'", start)
  if (start < 0 || end < 0) throw new Error('The main second-instance handler was not found.')

  function handler() {
    const app = new EventEmitter()
    const context = {
      app,
      showMainWindow: vi.fn(),
      installQuit: { handle: vi.fn() },
      parseInstallQuitMode,
      parseInstallQuitRequest,
    }
    vm.runInNewContext(main.slice(start, end), context)
    return { app, context }
  }

  it('is handed to the install handler and shows no window', () => {
    const { app, context } = handler()
    const data = { quitForInstall: request('silent') }
    app.emit('second-instance', {}, ['app.exe', '--quit-for-install=silent'], '', data)
    expect(context.installQuit.handle).toHaveBeenCalledExactlyOnceWith(request('silent'))
    expect(context.showMainWindow).not.toHaveBeenCalled()
  })

  it('is refused, still without a window, when the data is missing or malformed', () => {
    const { app, context } = handler()
    app.emit('second-instance', {}, ['app.exe', '--quit-for-install=silent'], '', { other: 1 })
    expect(context.installQuit.handle).toHaveBeenCalledExactlyOnceWith(undefined)
    expect(context.showMainWindow).not.toHaveBeenCalled()
  })

  it('leaves an ordinary second launch as it was: the window comes forward', () => {
    const { app, context } = handler()
    app.emit('second-instance', {}, ['app.exe'], '', undefined)
    expect(context.showMainWindow).toHaveBeenCalledOnce()
    expect(context.installQuit.handle).not.toHaveBeenCalled()
  })
})

describe('the words of the install question', () => {
  it('are in both languages, and Portuguese reads as the interface does', () => {
    expect(en['dialog.installQuit.quit']).toBe('Install and stop')
    expect(ptBR['dialog.installQuit.quit']).toBe('Instalar e parar')
    expect(ptBR['dialog.installQuit.detail']).toBe(
      'Uma nova versão está pronta para instalar. Instalar interrompe o trabalho onde está. Você pode continuar quando abrir o app de novo.',
    )
    expect(translate('pt-BR', 'dialog.installQuit.quit')).toBe('Instalar e parar')
    expect(translatePlural('pt-BR', 'dialog.quitRunning.message', 2)).toBe(
      '2 chats ainda estão trabalhando.',
    )
  })
})
