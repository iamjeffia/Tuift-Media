import { describe, expect, it } from 'vitest'
import { classifyProcessExit, describeProcessExit, parseProcessExit } from './process-exit.js'

const reasonOf = (message: string, lowMemory = false) => {
  const exit = parseProcessExit(message)
  return exit ? classifyProcessExit(exit, { lowMemory }) : undefined
}

describe('reading how a provider process ended', () => {
  // The sentence each adapter writes when its process ends, as the adapters build it.
  it.each([
    ['Claude Code process exited with code 3221226505', 3221226505],
    ['grok exited with code 3221225477 before reporting a result', 3221225477],
    ['agy exited with code 3221226505 before reporting a result', 3221226505],
    ['cursor-agent exited with code 3221226505', 3221226505],
    ['Pi exited with code 3221226505', 3221226505],
    ['Codex exited (code 3221226505)', 3221226505],
    ['Codex exited (code -1073740791)', 3221226505],
  ])('%s', (message, code) => {
    expect(parseProcessExit(message)?.code).toBe(code)
  })

  it('reads the label, the signal and the provider own words', () => {
    expect(parseProcessExit('Claude Code process exited with code 1')?.label).toBe('Claude Code')
    expect(parseProcessExit('Claude Code process terminated by signal SIGKILL')).toMatchObject({
      label: 'Claude Code',
      signal: 'SIGKILL',
    })
    expect(
      parseProcessExit('Claude Code returned an error result: Credit balance is too low')
        ?.providerMessage,
    ).toBe('Credit balance is too low')
  })

  it('does not take an ordinary error for a dead process', () => {
    expect(parseProcessExit('Rate limited. Try again at 5 PM.')).toBeUndefined()
    expect(parseProcessExit('Grok finished with stop reason error')).toBeUndefined()
  })
})

describe('classifying it', () => {
  it('says out of memory outright for a status that means no memory', () => {
    expect(reasonOf('x exited with code 3221225495')).toMatchObject({
      code: 'process_memory',
      certainty: 'certain',
    })
  })

  it('says out of memory outright when the provider says so', () => {
    expect(
      reasonOf('Claude Code returned an error result: JavaScript heap out of memory'),
    ).toMatchObject({ code: 'process_memory', certainty: 'certain' })
  })

  it.each([3221226505, 3221225477])(
    'takes Windows crash code %i for out of memory, likely, only while the system was low',
    (code) => {
      expect(reasonOf(`Claude Code process exited with code ${code}`, true)).toMatchObject({
        code: 'process_memory',
        certainty: 'likely',
        exitCode: code,
      })
      expect(reasonOf(`Claude Code process exited with code ${code}`, false)).toEqual({
        code: 'process_unknown',
        exitCode: code,
      })
    },
  )

  it('takes a kill for out of memory, likely, only while the system was low', () => {
    expect(reasonOf('x terminated by signal SIGKILL', true)).toMatchObject({
      code: 'process_memory',
      certainty: 'likely',
    })
    expect(reasonOf('x terminated by signal SIGKILL', false)).toMatchObject({
      code: 'process_signal',
      signal: 'SIGKILL',
    })
    expect(reasonOf('x exited with code 137', false)).toMatchObject({
      code: 'process_signal',
      signal: 'SIGKILL',
    })
  })

  it('reads a request to end as stopped, low memory or not', () => {
    for (const message of [
      'x terminated by signal SIGTERM',
      'x exited with code 143',
      'x exited with code 3221225786',
    ]) {
      expect(reasonOf(message, true)?.code).toBe('process_signal')
    }
  })

  it('keeps the provider own error, then falls back to unknown', () => {
    expect(reasonOf('Claude Code returned an error result: Overloaded')).toEqual({
      code: 'process_provider_error',
      message: 'Overloaded',
    })
    expect(reasonOf('x exited with code 1')).toEqual({ code: 'process_unknown', exitCode: 1 })
    expect(reasonOf('x exited with code unknown')).toEqual({ code: 'process_unknown' })
  })
})

describe('the English line kept with the event', () => {
  const line = (message: string, lowMemory = true) => {
    const exit = parseProcessExit(message)!
    return describeProcessExit(message, exit, classifyProcessExit(exit, { lowMemory }))
  }

  it('names the cause and what is kept, with the code for support', () => {
    expect(line('Claude Code process exited with code 3221226505')).toBe(
      'Claude Code was ended unexpectedly, most likely because the system ran out of memory (exit code 0xC0000409). Your conversation and the files already written are kept.',
    )
    expect(line('x exited with code 3221225495')).toContain(
      'because the system ran out of memory (exit code 0xC0000017)',
    )
  })

  it('keeps what the adapter wrote when nothing explains it better', () => {
    expect(line('Claude Code process exited with code 1', false)).toBe(
      'Claude Code process exited with code 1',
    )
    expect(line('Claude Code process exited with code 3221226505', false)).toBe(
      'Claude Code process exited with code 3221226505 (0xC0000409)',
    )
  })
})
