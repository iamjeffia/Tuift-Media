import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MemoryWatch,
  parseWindowsDetail,
  type MemoryDetail,
  type MemoryNotice,
} from './memory-watch.js'

const GIB = 1024 ** 3

function watch(state: {
  free: number
  total?: number
  detail?: MemoryDetail | undefined
  now: number
}) {
  const notices: MemoryNotice[] = []
  const readDetail = vi.fn(async () => state.detail)
  const memory = new MemoryWatch({
    onChange: (notice) => notices.push(notice),
    readPhysical: () => ({ freeBytes: state.free, totalBytes: state.total ?? 32 * GIB }),
    readDetail,
    now: () => state.now,
  })
  return { memory, notices, readDetail }
}

afterEach(() => vi.useRealTimers())

describe('the low memory warning', () => {
  it('reads nothing but the free physical memory while it is plentiful', async () => {
    const state = { free: 20 * GIB, now: 0 }
    const { memory, notices, readDetail } = watch(state)
    await memory.tick()
    expect(notices).toEqual([])
    expect(readDetail).not.toHaveBeenCalled()
    expect(memory.lowRecently()).toBe(false)
  })

  it('warns once per episode when the commit charge is near its limit, naming the biggest programs', async () => {
    const consumers = [
      { name: 'After Effects', bytes: 9 * GIB },
      { name: 'TUIFT Code', bytes: 3 * GIB },
    ]
    const state = {
      free: 1.5 * GIB,
      now: 0,
      detail: { committedPercent: 94, consumers } as MemoryDetail | undefined,
    }
    const { memory, notices } = watch(state)

    await memory.tick()
    state.now += 25_000
    await memory.tick()

    expect(notices).toEqual([{ state: 'low', committedPercent: 94, consumers }])
    expect(memory.lowRecently()).toBe(true)

    // Recovered: free memory is back.
    state.free = 20 * GIB
    state.now += 25_000
    await memory.tick()
    expect(notices.at(-1)).toEqual({ state: 'ok' })
    expect(notices).toHaveLength(2)
    // A minute later it still counts as just before; then it does not.
    state.now += 30_000
    expect(memory.lowRecently()).toBe(true)
    state.now += 40_000
    expect(memory.lowRecently()).toBe(false)
  })

  it('is quiet when physical memory is low but the commit limit is far away', async () => {
    const state = {
      free: 1 * GIB,
      now: 0,
      detail: { committedPercent: 60, consumers: [] } as MemoryDetail | undefined,
    }
    const { memory, notices } = watch(state)
    await memory.tick()
    expect(notices).toEqual([])
    expect(memory.lowRecently()).toBe(false)
  })

  it('reads the commit charge at most once per interval', async () => {
    const state = { free: 1 * GIB, now: 0, detail: { committedPercent: 60, consumers: [] } }
    const { memory, readDetail } = watch(state)
    await memory.tick()
    state.now += 5_000
    await memory.tick()
    state.now += 5_000
    await memory.tick()
    expect(readDetail).toHaveBeenCalledTimes(1)
  })

  it('judges by physical memory alone where the commit charge cannot be read', async () => {
    const state = { free: 0.3 * GIB, now: 0, detail: undefined }
    const { memory, notices } = watch(state)
    await memory.tick()
    expect(notices).toEqual([{ state: 'low' }])
  })

  it('ticks only while a turn runs, and clears the warning when the last one ends', async () => {
    vi.useFakeTimers()
    const state = {
      free: 1 * GIB,
      now: 0,
      detail: { committedPercent: 95, consumers: [] } as MemoryDetail | undefined,
    }
    const { memory, notices, readDetail } = watch(state)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(readDetail).not.toHaveBeenCalled()

    memory.setActiveTurns(1)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(notices).toEqual([{ state: 'low', committedPercent: 95 }])

    memory.setActiveTurns(0)
    expect(notices.at(-1)).toEqual({ state: 'ok' })
    readDetail.mockClear()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(readDetail).not.toHaveBeenCalled()
  })
})

describe('reading what Windows says', () => {
  it('turns the PowerShell answer into a share and the biggest programs, by name', () => {
    const detail = parseWindowsDetail(
      JSON.stringify({
        used: 70 * GIB,
        limit: 75 * GIB,
        top: [
          { n: 'AfterFX', b: 9 * GIB },
          { n: 'TUIFT Code', b: 3 * GIB },
          { n: 'chrome', b: 2 * GIB },
          { n: 'node', b: 1 * GIB },
        ],
      }),
    )
    expect(detail).toEqual({
      committedPercent: 93,
      consumers: [
        { name: 'After Effects', bytes: 9 * GIB },
        { name: 'TUIFT Code', bytes: 3 * GIB },
        { name: 'chrome', bytes: 2 * GIB },
      ],
    })
  })

  it('refuses an answer it cannot read', () => {
    expect(parseWindowsDetail('')).toBeUndefined()
    expect(parseWindowsDetail('{"used":1,"limit":0}')).toBeUndefined()
  })
})
