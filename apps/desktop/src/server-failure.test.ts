import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { ChildProcess } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { translate, type MessageKey } from './i18n.js'
import { RETRIES_BY_CAUSE, SERVER_EXIT, type ServerExitCause } from './server-exit-codes.js'
import { recordServerExit, serverExitLogFile, serverFailureText } from './server-failure.js'
import { ServerSupervisor, type ServerExit } from './server-supervisor.js'

describe('the exit-code table', () => {
  it('is the same table the server uses', () => {
    const source = readFileSync(
      path.join(__dirname, '..', '..', 'server', 'src', 'exit-codes.ts'),
      'utf8',
    )
    const block = /export const SERVER_EXIT = \{([\s\S]*?)\} as const/.exec(source)?.[1] ?? ''
    const server = Object.fromEntries(
      [...block.matchAll(/^\s*(\w+):\s*(\d+),/gm)].map(([, name, code]) => [name, Number(code)]),
    )
    expect(Object.keys(server).length).toBeGreaterThan(0)
    expect(SERVER_EXIT).toEqual(server)
  })
})

class FakeChild extends ChildProcess {
  override stdout = new PassThrough()
  override stderr = new PassThrough()
}

describe('the supervisor and the cause the server names', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function run(codes: number[]) {
    const children: FakeChild[] = []
    const exits: ServerExit[] = []
    const gaveUp = vi.fn()
    const sup = new ServerSupervisor({
      command: 'node',
      args: [],
      env: {},
      onLog: () => {},
      onExit: (exit) => exits.push(exit),
      onGaveUp: gaveUp,
      spawnFn: () => {
        const child = new FakeChild()
        children.push(child)
        return child
      },
    })
    sup.start()
    for (const code of codes) {
      children.at(-1)!.stderr.write('[server] something went wrong\n')
      children.at(-1)!.emit('exit', code, null)
      vi.advanceTimersByTime(20_000)
    }
    return { sup, children, exits, gaveUp }
  }

  it.each([
    ['databaseDamaged', 0],
    ['databaseNoAccess', 0],
    ['diskFull', 0],
    ['portInUse', 2],
    ['dataFolderInUse', 2],
    ['databaseLocked', 2],
  ] as Array<[ServerExitCause, number]>)(
    'for %s starts the server again %i times, then gives up with the cause',
    (cause, retries) => {
      expect(RETRIES_BY_CAUSE[cause]).toBe(retries)
      const { children, gaveUp, exits, sup } = run(Array(retries + 1).fill(SERVER_EXIT[cause]))
      expect(children).toHaveLength(retries + 1)
      expect(sup.gaveUp).toBe(true)
      expect(gaveUp).toHaveBeenCalledOnce()
      expect(gaveUp.mock.calls[0]![0]).toMatchObject({ cause, code: SERVER_EXIT[cause] })
      expect(exits.at(-1)?.tail).toEqual(['[server] something went wrong'])
    },
  )

  it('keeps the long retry for an exit it cannot name', () => {
    const { children, gaveUp } = run([1, 1, 1])
    expect(children).toHaveLength(4)
    expect(gaveUp).not.toHaveBeenCalled()
  })
})

describe('what the person is told', () => {
  const context = { port: '4317', file: 'C:/x/server-exit.log' }
  const causes: Array<ServerExitCause | undefined> = [
    'portInUse',
    'dataFolderInUse',
    'databaseLocked',
    'databaseDamaged',
    'databaseNoAccess',
    'diskFull',
    undefined,
  ]
  const say = (language: 'pt-BR' | 'en', key: MessageKey, vars?: Record<string, string>) =>
    translate(language, key, { appName: 'TUIFT Code', ...vars })

  it('names the busy port and says what to do, in both languages', () => {
    const text = serverFailureText('portInUse', context)
    expect(say('pt-BR', text.message.key, text.message.vars)).toBe('A porta 4317 já está em uso.')
    expect(say('pt-BR', text.detail.key, text.detail.vars)).toBe(
      'Outra cópia do TUIFT Code ou outro programa está usando a porta 4317. Feche-o e tente de novo.',
    )
    expect(say('en', text.message.key, text.message.vars)).toBe('Port 4317 is already in use.')
  })

  it.each([
    [
      'dataFolderInUse',
      'Outra cópia do TUIFT Code está usando seus dados.',
      'Feche a outra cópia e tente de novo.',
    ],
    [
      'databaseLocked',
      'O banco de dados dos chats está ocupado.',
      'Outra cópia do TUIFT Code ou outro programa está com ele aberto. Feche-o e tente de novo.',
    ],
    [
      'diskFull',
      'O disco está cheio.',
      'Libere espaço e tente de novo. Seus chats não foram alterados.',
    ],
  ] as const)('says %s in Portuguese', (cause, message, detail) => {
    const text = serverFailureText(cause, context)
    expect(say('pt-BR', text.message.key, text.message.vars)).toBe(message)
    expect(say('pt-BR', text.detail.key, text.detail.vars)).toBe(detail)
  })

  it('points the unknown case, and only it, at reinstalling and at the diagnostics file', () => {
    for (const cause of causes) {
      const text = serverFailureText(cause, context)
      const detail = say('pt-BR', text.detail.key, text.detail.vars)
      expect(text.named).toBe(cause !== undefined)
      expect(detail.includes('reinstale')).toBe(cause === undefined)
      if (cause === undefined) expect(detail).toContain(context.file)
    }
  })

  it('has no key without a Portuguese string and no leftover placeholder', () => {
    for (const cause of causes) {
      const text = serverFailureText(cause, context)
      for (const part of [text.message, text.detail]) {
        const pt = say('pt-BR', part.key, part.vars)
        expect(pt).not.toBe(part.key)
        expect(pt).not.toMatch(/\{\w+\}/)
        expect(say('en', part.key, part.vars)).not.toMatch(/\{\w+\}/)
      }
    }
  })
})

describe('the record of a server exit', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })
  const folder = () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'harness-server-exit-'))
    dirs.push(dir)
    return dir
  }
  const exit = (tail: string[]): ServerExit => ({
    code: 71,
    signal: null,
    cause: 'portInUse',
    tail,
    willRetry: false,
  })

  it('holds the code, the cause and the last lines, scrubbed and bounded', () => {
    const dir = folder()
    recordServerExit(
      dir,
      exit([
        '[server] port 4317 is already in use',
        'token=abc123secret user C:\\Users\\Someone\\Documents mail me@example.com',
        'x'.repeat(5_000),
      ]),
    )
    const text = readFileSync(serverExitLogFile(dir), 'utf8')
    expect(text).toContain('code=71')
    expect(text).toContain('cause=portInUse')
    expect(text).toContain('port 4317 is already in use')
    expect(text).not.toContain('abc123secret')
    expect(text).not.toContain('Someone')
    expect(text).not.toContain('me@example.com')
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(8 * 1024 + 2)
  })

  it('stays under its cap by keeping the previous file and the current one only', () => {
    const dir = folder()
    const big = exit(Array(40).fill('y'.repeat(200)))
    for (let i = 0; i < 60; i++) recordServerExit(dir, big)
    const files = readdirSync(dir).sort()
    expect(files).toEqual(['server-exit.log', 'server-exit.log.previous'])
    for (const file of files)
      expect(readFileSync(path.join(dir, file)).length).toBeLessThanOrEqual(128 * 1024 + 8 * 1024)
  })

  it('never throws when the folder cannot be written', () => {
    const dir = folder()
    const blocker = path.join(dir, 'blocker')
    writeFileSync(blocker, 'a file where the folder should be')
    expect(() => recordServerExit(path.join(blocker, 'inside'), exit([]))).not.toThrow()
  })
})
