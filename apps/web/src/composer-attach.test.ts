import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  attachToComposer,
  canAttachToComposer,
  registerComposerAttacher,
} from './composer-attach.js'

let stop: (() => void) | undefined
afterEach(() => stop?.())

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
