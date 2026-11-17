// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  attachToComposer,
  canAttachToComposer,
  registerComposerAttacher,
  reportComposerAttachments,
  useAttachedToComposer,
} from './composer-attach.js'

let stop: (() => void) | undefined
afterEach(() => {
  cleanup()
  stop?.()
})

describe('attaching a file shown in the chat to the prompt box', () => {
  it('has nothing to attach to until a composer registers', () => {
    expect(canAttachToComposer()).toBe(false)
    expect(attachToComposer([{ path: 'C:\\a.png', name: 'a.png' }])).toBe(false)
  })

  it('hands the files to the registered composer', () => {
    const attach = vi.fn()
    stop = registerComposerAttacher(attach)
    expect(canAttachToComposer()).toBe(true)
    expect(attachToComposer([{ path: 'C:\\a.png', name: 'a.png' }])).toBe(true)
    expect(attach).toHaveBeenCalledWith([{ path: 'C:\\a.png', name: 'a.png' }])
  })

  it('does not let a stale cleanup remove a newer composer', () => {
    const first = registerComposerAttacher(vi.fn())
    const second = vi.fn()
    stop = registerComposerAttacher(second)
    first()
    expect(canAttachToComposer()).toBe(true)
    attachToComposer([])
    expect(second).toHaveBeenCalled()
    stop()
    expect(canAttachToComposer()).toBe(false)
  })
})

describe('which paths the prompt box holds', () => {
  function Mark(props: { path: string }) {
    return <output>{useAttachedToComposer(props.path) ? 'held' : 'free'}</output>
  }
  const mark = () => screen.getByRole('status').textContent

  it('follows what the registered composer reports', () => {
    const box = vi.fn()
    stop = registerComposerAttacher(box)
    render(<Mark path="/work/x.flac" />)
    expect(mark()).toBe('free')
    act(() => reportComposerAttachments(box, ['/work/x.flac', '/work/x.png']))
    expect(mark()).toBe('held')
    act(() => reportComposerAttachments(box, ['/work/x.png']))
    expect(mark()).toBe('free')
  })

  it('ignores a composer that is not the registered one, and forgets one that leaves', () => {
    const box = vi.fn()
    const other = vi.fn()
    stop = registerComposerAttacher(box)
    render(<Mark path="/work/x.flac" />)
    act(() => reportComposerAttachments(other, ['/work/x.flac']))
    expect(mark()).toBe('free')
    act(() => reportComposerAttachments(box, ['/work/x.flac']))
    expect(mark()).toBe('held')
    act(() => stop?.())
    expect(mark()).toBe('free')
  })
})
