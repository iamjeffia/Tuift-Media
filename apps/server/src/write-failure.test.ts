import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { installProcessGuards, UNCAUGHT_EXCEPTION_EXIT_CODE } from './process-guards.js'
import {
  classifyWriteFailure,
  describeFailure,
  LOCK_RETRY_DELAYS_MS,
  retryLockedWrite,
  writeFailureMessage,
  writeFailureReason,
} from './write-failure.js'
import { realSqliteError } from './write-failure.test-support.js'

describe('what a failed write means', () => {
  it('names a full disk and a locked file from what SQLite really raised', () => {
    expect(classifyWriteFailure(realSqliteError('full'))).toBe('disk_full')
    expect(classifyWriteFailure(realSqliteError('locked'))).toBe('locked')
  })

  it('reads the operating system codes and an extended SQLite code', () => {
    expect(classifyWriteFailure(Object.assign(new Error('x'), { code: 'ENOSPC' }))).toBe(
      'disk_full',
    )
    expect(classifyWriteFailure(Object.assign(new Error('x'), { code: 'EBUSY' }))).toBe('locked')
    // SQLITE_IOERR is 10; extended codes keep it in the low byte. It is neither full nor locked.
    expect(classifyWriteFailure(Object.assign(new Error('disk I/O error'), { errcode: 10 }))).toBe(
      'other',
    )
    expect(classifyWriteFailure(Object.assign(new Error('x'), { errcode: 13 | (1 << 8) }))).toBe(
      'disk_full',
    )
  })

  it('does not take every error for a lock', () => {
    expect(classifyWriteFailure(new TypeError('x is undefined'))).toBe('other')
    expect(classifyWriteFailure('database is locked')).toBe('locked')
    expect(classifyWriteFailure(undefined)).toBe('other')
  })

  it('gives each kind its reason and an English line', () => {
    expect(writeFailureReason('disk_full')).toEqual({ code: 'save_disk_full' })
    expect(writeFailureReason('locked')).toEqual({ code: 'save_locked' })
    expect(writeFailureReason('other')).toEqual({ code: 'save_failed' })
    expect(writeFailureMessage('disk_full')).toContain('disk is full')
    expect(writeFailureMessage('locked')).toContain('another program')
  })

  it('describes a failure in one cut line, never from a value that is not an error', () => {
    expect(describeFailure(realSqliteError('full'))).toBe(
      'database or disk is full (ERR_SQLITE_ERROR, sqlite 13)',
    )
    expect(describeFailure(`secret ${'x'.repeat(500)}`)).toBe('')
    expect(describeFailure(new Error(`first\nsecond ${'y'.repeat(300)}`))).toBe('first')
  })
})

describe('retrying a locked write', () => {
  const locked = realSqliteError('locked')

  it('waits 20, 60 and 120 ms and gives up only after the third retry', () => {
    const slept: number[] = []
    const write = vi.fn(() => {
      throw locked
    })
    expect(() => retryLockedWrite(write, (ms) => slept.push(ms))).toThrow(locked)
    expect(write).toHaveBeenCalledTimes(1 + LOCK_RETRY_DELAYS_MS.length)
    expect(slept).toEqual([20, 60, 120])
  })

  it('returns what the write returns once the lock lets go', () => {
    let failures = 2
    const result = retryLockedWrite(
      () => {
        if (failures-- > 0) throw locked
        return 'saved'
      },
      () => {},
    )
    expect(result).toBe('saved')
  })

  it('does not retry a full disk or anything else', () => {
    const sleep = vi.fn()
    const write = vi.fn(() => {
      throw realSqliteError('full')
    })
    expect(() => retryLockedWrite(write, sleep)).toThrow()
    expect(write).toHaveBeenCalledOnce()
    expect(sleep).not.toHaveBeenCalled()
  })
})

describe('the process guards', () => {
  function guarded() {
    const target = new EventEmitter()
    const log = vi.fn()
    const exit = vi.fn()
    const uninstall = installProcessGuards({
      log,
      exit,
      target: target as unknown as NodeJS.Process,
    })
    return { target, log, exit, uninstall }
  }

  it('records a rejection nobody handled and keeps serving', async () => {
    vi.useFakeTimers()
    try {
      const { target, log, exit } = guarded()
      target.emit('unhandledRejection', realSqliteError('full'), Promise.resolve())
      await vi.advanceTimersByTimeAsync(1_000)
      expect(log).toHaveBeenCalledWith(
        '[server] unhandled rejection: Error: database or disk is full (ERR_SQLITE_ERROR, sqlite 13)',
      )
      expect(exit).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('records an uncaught exception, then exits with a code, once', async () => {
    vi.useFakeTimers()
    try {
      const { target, log, exit } = guarded()
      target.emit('uncaughtException', new TypeError('broken invariant'), 'uncaughtException')
      target.emit('uncaughtException', new TypeError('again'), 'uncaughtException')
      expect(log).toHaveBeenCalledTimes(2)
      expect(log.mock.calls[0]![0]).toBe(
        '[server] uncaught exception (uncaughtException): TypeError: broken invariant',
      )
      expect(exit).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1_000)
      expect(exit).toHaveBeenCalledExactlyOnceWith(UNCAUGHT_EXCEPTION_EXIT_CODE)
      expect(UNCAUGHT_EXCEPTION_EXIT_CODE).not.toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves no text from the conversation in the log: only the name and a cut first line', () => {
    const { target, log } = guarded()
    target.emit('unhandledRejection', 'the whole prompt text', Promise.resolve())
    expect(log.mock.calls[0]![0]).toBe('[server] unhandled rejection: string: ')
  })

  it('can be taken off again', () => {
    const { target, uninstall } = guarded()
    uninstall()
    expect(target.listenerCount('unhandledRejection')).toBe(0)
    expect(target.listenerCount('uncaughtException')).toBe(0)
  })
})
