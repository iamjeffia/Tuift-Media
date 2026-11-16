// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import type { Item, Subagent } from '@harness/contracts'
import { setLanguage } from '../i18n/index.js'
import { ThreadFrameStore } from '../thread-frame-store.js'
import { emptyThread } from '../thread-store.js'
import { ComposerWorkStatus } from './ComposerWorkStatus.js'
import { IdleText } from './IdleText.js'
import { LiveElapsed } from './LiveElapsed.js'
import { commandTail } from './LiveNow.js'
import { IDLE_CALM_AFTER_MS, IDLE_NOTE_AFTER_MS, idleLevel } from './idle.js'
import { elapsedLabel, liveClockListeners, liveClockRunning, onClockTick } from './live-clock.js'
import { runningNow } from './work-status.js'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const NOW = 1_800_000_000_000

function item(id: string, fields: Partial<Item>): Item {
  return { id, turnId: 'turn-1', type: 'tool_call', status: 'started', createdAt: NOW, ...fields }
}

function helper(id: string, fields: Partial<Subagent> = {}, createdAt = NOW): Item {
  return item(id, {
    createdAt,
    subagent: {
      id,
      name: 'Explore',
      description: 'Find the token refresh',
      state: 'running',
      ...fields,
    },
  })
}

describe('the shared clock', () => {
  it('runs one interval for every timer and none when nothing listens', () => {
    vi.useFakeTimers({ now: NOW })
    expect(liveClockRunning()).toBe(false)
    const calls = [vi.fn(), vi.fn()]
    const stops = calls.map((call) => onClockTick(call))
    expect(vi.getTimerCount()).toBe(1)
    act(() => vi.advanceTimersByTime(3_000))
    expect(calls.map((call) => call.mock.calls.length)).toEqual([3, 3])
    stops[0]!()
    expect(liveClockRunning()).toBe(true)
    stops[1]!()
    expect(liveClockRunning()).toBe(false)
    expect(liveClockListeners()).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('holds no timer while the window is hidden and catches up when it shows', () => {
    vi.useFakeTimers({ now: NOW })
    let shown = false
    const visibility = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockImplementation(() => (shown ? 'visible' : 'hidden'))
    try {
      const call = vi.fn()
      const stop = onClockTick(call)
      expect(vi.getTimerCount()).toBe(0)
      shown = true
      act(() => document.dispatchEvent(new Event('visibilitychange')))
      expect(call).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(1)
      stop()
    } finally {
      visibility.mockRestore()
    }
  })

  it('writes a running time into one text node, after it has run long enough', () => {
    vi.useFakeTimers({ now: NOW })
    const { container } = render(<LiveElapsed since={NOW - 2_000} after={5_000} />)
    const node = container.querySelector('.live-elapsed')!
    expect(node.textContent).toBe('')
    act(() => vi.advanceTimersByTime(4_000))
    expect(node.textContent).toBe('6s')
    act(() => vi.advanceTimersByTime(120_000))
    expect(node.textContent).toBe('2m 6s')
    expect(elapsedLabel(3_723_000)).toBe('1h 2m')
  })
})

describe('a command tail', () => {
  it('is the last line that says something, short, without control codes', () => {
    expect(commandTail(undefined)).toBeUndefined()
    expect(commandTail('\n  \n')).toBeUndefined()
    expect(commandTail('one\ntwo\n\n')).toBe('two')
    expect(commandTail('step 1\r\u001b[32mstep 2\u001b[0m')).toBe('step 2')
    const long = commandTail(`${'x'.repeat(5_000)}\n${'y'.repeat(400)}`)!
    expect(long.length).toBeLessThanOrEqual(161)
    expect(long.endsWith('y')).toBe(true)
  })
})

describe('what a running turn is doing now', () => {
  it('names the subagent the turn waits on, ahead of a tool', () => {
    const items = [item('cmd', { type: 'command', command: 'pnpm test' }), helper('one')]
    expect(runningNow(items, 'turn-1')).toEqual({
      kind: 'subagent',
      count: 1,
      name: 'Explore',
      title: 'Find the token refresh',
    })
  })

  it('prefers a running command over background subagents, and counts several subagents', () => {
    const background = helper('bg', { background: true })
    expect(
      runningNow([background, item('cmd', { type: 'command', command: 'pnpm test' })], 'turn-1'),
    ).toEqual({ kind: 'command', command: 'pnpm test' })
    expect(runningNow([background], 'turn-1')).toMatchObject({ kind: 'subagent', count: 1 })
    expect(runningNow([helper('a'), helper('b')], 'turn-1')).toEqual({ kind: 'subagent', count: 2 })
  })

  it('reads a tool by its name, an edit by its path, and nothing when nothing runs', () => {
    expect(runningNow([item('t', { text: 'Grep\n{"pattern":"x"}' })], 'turn-1')).toEqual({
      kind: 'tool',
      name: 'Grep',
    })
    expect(runningNow([item('e', { type: 'file_change', path: 'src/a.ts' })], 'turn-1')).toEqual({
      kind: 'edit',
      target: 'src/a.ts',
    })
    expect(runningNow([item('done', { status: 'completed' })], 'turn-1')).toBeUndefined()
  })

  it('stops at the turn before and ignores local rows', () => {
    const earlier = helper('old')
    const items = [
      { ...earlier, turnId: 'turn-0' },
      { ...item('local', {}), turnId: '' },
    ]
    expect(runningNow(items, 'turn-1')).toBeUndefined()
  })
})

describe('quiet and silent agents', () => {
  it('has levels that start at the thresholds', () => {
    expect(idleLevel(0)).toBe('active')
    expect(idleLevel(IDLE_NOTE_AFTER_MS - 1)).toBe('active')
    expect(idleLevel(IDLE_NOTE_AFTER_MS)).toBe('quiet')
    expect(idleLevel(IDLE_CALM_AFTER_MS - 1)).toBe('quiet')
    expect(idleLevel(IDLE_CALM_AFTER_MS)).toBe('calm')
  })

  function quietStore(lastEventAt: () => number | undefined) {
    const store = new ThreadFrameStore({ ...emptyThread })
    store.lastEventAt = lastEventAt
    return store
  }

  it('shows how long ago the last event was once it has been quiet, and drops it on the next event', () => {
    vi.useFakeTimers({ now: NOW })
    let last: number | undefined = NOW
    const store = quietStore(() => last)
    const { container } = render(
      <>
        <IdleText frameStore={store} format={(ms) => `quiet ${elapsedLabel(ms)}`} />
        <IdleText frameStore={store} format={() => 'calm'} showAt="calm" className="calm" />
      </>,
    )
    const quiet = container.querySelector<HTMLElement>('.idle-text')!
    const calm = container.querySelector<HTMLElement>('.calm')!
    expect(quiet.hidden).toBe(true)

    act(() => vi.advanceTimersByTime(IDLE_NOTE_AFTER_MS))
    expect(quiet.hidden).toBe(false)
    expect(quiet.textContent).toBe('quiet 30s')
    expect(calm.hidden).toBe(true)

    act(() => vi.advanceTimersByTime(IDLE_CALM_AFTER_MS - IDLE_NOTE_AFTER_MS))
    expect(quiet.textContent).toBe('quiet 2m')
    expect(calm.hidden).toBe(false)
    expect(calm.textContent).toBe('calm')

    last = Date.now()
    act(() => vi.advanceTimersByTime(1_000))
    expect(quiet.hidden).toBe(true)
    expect(calm.hidden).toBe(true)
  })

  it('says nothing for a chat with no recorded event: unknown is not quiet', () => {
    vi.useFakeTimers({ now: NOW })
    const { container } = render(
      <IdleText frameStore={quietStore(() => undefined)} format={() => 'quiet'} />,
    )
    act(() => vi.advanceTimersByTime(IDLE_CALM_AFTER_MS * 2))
    expect(container.querySelector<HTMLElement>('.idle-text')!.hidden).toBe(true)
  })
})

describe('the status line above the prompt box', () => {
  function runningStore(items: Item[], lastEventAt?: () => number | undefined) {
    const store = new ThreadFrameStore({
      ...emptyThread,
      items,
      running: true,
      activeTurn: { id: 'turn-1', startedAt: NOW - 90_000 },
    })
    if (lastEventAt) store.lastEventAt = lastEventAt
    return store
  }

  it('shows the turn time and the step it waits on, in English', () => {
    vi.useFakeTimers({ now: NOW })
    const { container } = render(
      <ComposerWorkStatus frameStore={runningStore([helper('one', {}, NOW - 80_000)])} />,
    )
    const shelf = container.querySelector('.composer__work-status')!
    expect(shelf.querySelector('.work-status__label')?.textContent).toBe('In progress')
    expect(shelf.querySelector('.work-status__time')?.textContent).toBe('1m 30s')
    expect(shelf.querySelector('.work-status__doing')?.textContent).toBe(
      'Subagent Explore: “Find the token refresh”',
    )
    act(() => vi.advanceTimersByTime(5_000))
    expect(shelf.querySelector('.work-status__time')?.textContent).toBe('1m 35s')
  })

  it('speaks Portuguese, and says calmly that long steps take minutes after two quiet minutes', () => {
    vi.useFakeTimers({ now: NOW })
    setLanguage('pt-BR', { persist: false })
    let last = NOW
    const { container } = render(
      <ComposerWorkStatus
        frameStore={runningStore(
          [item('cmd', { type: 'command', command: 'ffmpeg -i a.mov' })],
          () => last,
        )}
      />,
    )
    const shelf = container.querySelector('.composer__work-status')!
    expect(shelf.querySelector('.work-status__label')?.textContent).toBe('Em andamento')
    expect(shelf.querySelector('.work-status__doing')?.textContent).toBe(
      'Executando ffmpeg -i a.mov',
    )
    act(() => vi.advanceTimersByTime(IDLE_CALM_AFTER_MS))
    expect(shelf.querySelector('.work-status__idle')?.textContent).toBe('Última atividade há 2m')
    expect(shelf.querySelector('.work-status__calm')?.textContent).toContain('Etapas longas')
    last = Date.now()
    act(() => vi.advanceTimersByTime(1_000))
    expect((shelf.querySelector('.work-status__calm') as HTMLElement).hidden).toBe(true)
  })

  it('is not there while nothing runs', () => {
    const store = new ThreadFrameStore({ ...emptyThread })
    const { container } = render(<ComposerWorkStatus frameStore={store} />)
    expect(container.innerHTML).toBe('')
  })
})
