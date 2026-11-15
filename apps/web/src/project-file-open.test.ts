// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canOpenProjectFileInPanel,
  openProjectFileInPanel,
  registerProjectFileOpener,
  useCanOpenProjectFileInPanel,
} from './project-file-open.js'

const request = { path: 'C:\\site\\src\\app.ts', projectPath: 'C:\\site' }
let unregister: (() => void) | undefined

afterEach(() => unregister?.())

describe('project file opener', () => {
  it('has nothing to open with until the app registers', () => {
    expect(canOpenProjectFileInPanel()).toBe(false)
    expect(openProjectFileInPanel(request)).toBe(false)
  })

  it('hands the request to the registered opener', () => {
    const open = vi.fn()
    unregister = registerProjectFileOpener(open)
    expect(canOpenProjectFileInPanel()).toBe(true)
    expect(openProjectFileInPanel(request)).toBe(true)
    expect(open).toHaveBeenCalledWith(request)
  })

  it('does not let a stale cleanup remove a newer opener', () => {
    const first = registerProjectFileOpener(vi.fn())
    const second = vi.fn()
    unregister = registerProjectFileOpener(second)
    first()
    openProjectFileInPanel(request)
    expect(second).toHaveBeenCalledOnce()
  })
})

describe('useCanOpenProjectFileInPanel', () => {
  it('turns true when the app registers after the link rendered, and false when it leaves', () => {
    const { result } = renderHook(() => useCanOpenProjectFileInPanel())
    expect(result.current).toBe(false)

    act(() => {
      unregister = registerProjectFileOpener(vi.fn())
    })
    expect(result.current).toBe(true)

    act(() => unregister?.())
    expect(result.current).toBe(false)
  })
})
