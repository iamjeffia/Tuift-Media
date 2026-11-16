import type { ThreadErrorReason } from '@harness/contracts'
import { emptyThread, reduce, reduceEventLog } from './thread-store.js'
import { describe, expect, it } from 'vitest'
import { setLanguage } from './i18n/index.js'
import { lowMemoryMessage, threadErrorNotice } from './thread-error-reason.js'

const KEPT_EN = 'The chat and the files already written are kept.'
const KEPT_PT = 'O chat e os arquivos já gravados foram mantidos.'

describe('the notice for an error the server could explain', () => {
  const cases: Array<[string, ThreadErrorReason, string, string]> = [
    [
      'memory, certain',
      { code: 'process_memory', certainty: 'certain', exitCode: 3221225495 },
      `Claude Code was ended because the system ran out of memory. ${KEPT_EN}`,
      `Claude Code foi encerrado porque o sistema ficou sem memória. ${KEPT_PT}`,
    ],
    [
      'memory, likely',
      { code: 'process_memory', certainty: 'likely', exitCode: 3221226505 },
      `Claude Code was ended, most likely because the system ran out of memory. ${KEPT_EN}`,
      `Claude Code foi encerrado, muito provavelmente porque o sistema ficou sem memória. ${KEPT_PT}`,
    ],
    [
      'a signal',
      { code: 'process_signal', signal: 'SIGTERM' },
      `Claude Code was stopped before it finished. ${KEPT_EN}`,
      `Claude Code foi interrompido antes de terminar. ${KEPT_PT}`,
    ],
    [
      'the provider own error',
      { code: 'process_provider_error', message: 'Overloaded' },
      `Claude Code stopped with an error. ${KEPT_EN}`,
      `Claude Code parou com um erro. ${KEPT_PT}`,
    ],
    [
      'unknown',
      { code: 'process_unknown', exitCode: 1 },
      `Claude Code ended unexpectedly and the reason is not known. ${KEPT_EN}`,
      `Claude Code foi encerrado de forma inesperada e não deu para saber o motivo. ${KEPT_PT}`,
    ],
    [
      'the app closing',
      { code: 'app_closed' },
      `TUIFT Code was closed while this chat was working. ${KEPT_EN}`,
      `O app foi fechado enquanto este chat trabalhava. ${KEPT_PT}`,
    ],
  ]

  it.each(cases)('%s, in English and in Portuguese', (_name, reason, english, portuguese) => {
    expect(threadErrorNotice(reason, 'Claude Code').message).toBe(english)
    setLanguage('pt-BR', { persist: false })
    expect(threadErrorNotice(reason, 'Claude Code').message).toBe(portuguese)
  })

  it('keeps the raw code out of the headline and in a details line', () => {
    const notice = threadErrorNotice(
      { code: 'process_memory', certainty: 'likely', exitCode: 3221226505 },
      'Claude Code',
    )
    expect(notice.message).not.toContain('3221226505')
    expect(notice.message).not.toContain('0xC0000409')
    expect(notice.detail).toBe('Technical details: exit code 0xC0000409 (3221226505)')
    setLanguage('pt-BR', { persist: false })
    expect(
      threadErrorNotice({ code: 'process_signal', signal: 'SIGKILL' }, 'Claude Code').detail,
    ).toBe('Detalhes técnicos: sinal SIGKILL')
  })

  it('shows the provider own words and a plain exit code in the details', () => {
    expect(
      threadErrorNotice(
        { code: 'process_provider_error', exitCode: 1, message: 'Overloaded' },
        'Claude Code',
      ).detail,
    ).toBe('Technical details: exit code 1 · Overloaded')
  })

  it('has no details line when nothing is known beyond the reason', () => {
    expect(threadErrorNotice({ code: 'app_closed' }, 'Claude Code').detail).toBeUndefined()
  })
})

describe('the low memory warning text', () => {
  it('names the biggest programs with their size in the language', () => {
    const consumers = [
      { name: 'After Effects', bytes: 9.24 * 1024 ** 3 },
      { name: 'TUIFT Code', bytes: 3 * 1024 ** 3 },
    ]
    expect(lowMemoryMessage(consumers)).toBe(
      'The computer is close to running out of memory. Using the most: After Effects (9.2 GB), TUIFT Code (3 GB). Close something heavy before the system starts ending programs.',
    )
    setLanguage('pt-BR', { persist: false })
    expect(lowMemoryMessage(consumers)).toBe(
      'O computador está quase sem memória. Quem mais usa: After Effects (9,2 GB), TUIFT Code (3 GB). Feche algo pesado antes que o sistema comece a encerrar programas.',
    )
    expect(lowMemoryMessage()).toBe(
      'O computador está quase sem memória. Feche algo pesado antes que o sistema comece a encerrar programas.',
    )
  })
})

describe('the thread keeps the reason', () => {
  const log = (reason: ThreadErrorReason) => [
    {
      type: 'turn.started' as const,
      turn: { id: 't1', threadId: 'c', status: 'running' as const, createdAt: 1 },
    },
    { type: 'thread.error' as const, threadId: 'c', message: 'raw', reason },
    { type: 'turn.completed' as const, turnId: 't1', status: 'failed' as const },
  ]

  const replay = (events: ReturnType<typeof log>) =>
    reduceEventLog(
      emptyThread,
      events.map((event) => ({ event })),
    )

  it('on replay, so a reopened chat or a second window shows the same notice', () => {
    const state = replay(log({ code: 'app_closed' }))
    expect(state.error).toMatchObject({ message: 'raw', reason: { code: 'app_closed' } })
    expect(state.running).toBe(false)
  })

  it('live, as the event arrives', () => {
    const state = log({ code: 'app_closed' }).reduce(reduce, emptyThread)
    expect(state.error).toMatchObject({ message: 'raw', reason: { code: 'app_closed' } })
  })

  it('and drops it with the next turn', () => {
    const state = replay([
      ...log({ code: 'app_closed' }),
      {
        type: 'turn.started',
        turn: { id: 't2', threadId: 'c', status: 'running', createdAt: 2 },
      },
    ])
    expect(state.error).toBeUndefined()
  })
})
