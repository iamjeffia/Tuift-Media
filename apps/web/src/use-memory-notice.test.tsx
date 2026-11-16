// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import type { DataOf } from '@harness/contracts'
import { expect, it } from 'vitest'
import { setLanguage } from './i18n/index.js'
import { useMemoryNotice } from './use-memory-notice.js'

function fixture() {
  let listener: ((data: DataOf<'system.memory'>) => void) | undefined
  const transport = {
    on: ((channel: string, next: (data: DataOf<'system.memory'>) => void) => {
      expect(channel).toBe('system.memory')
      listener = next
      return () => {
        listener = undefined
      }
    }) as never,
  }
  const view = renderHook(() => useMemoryNotice(transport))
  return { view, push: (data: DataOf<'system.memory'>) => act(() => listener?.(data)) }
}

const GIB = 1024 ** 3

it('warns once the server says memory is low, and clears when it recovers', () => {
  const { view, push } = fixture()
  expect(view.result.current).toBeUndefined()

  push({
    state: 'low',
    committedPercent: 94,
    consumers: [{ name: 'After Effects', bytes: 9 * GIB }],
  })
  expect(view.result.current).toMatchObject({
    role: 'alert',
    tone: 'info',
    message:
      'The computer is close to running out of memory. Using the most: After Effects (9 GB). Close something heavy before the system starts ending programs.',
  })

  push({ state: 'ok' })
  expect(view.result.current).toBeUndefined()
})

it('can be dismissed, and a later episode warns again', () => {
  const { view, push } = fixture()
  push({ state: 'low' })
  const first = view.result.current!
  act(() => first.dismiss!())
  expect(view.result.current).toBeUndefined()

  push({ state: 'low' })
  expect(view.result.current).toBeDefined()
  expect(view.result.current!.id).not.toBe(first.id)
})

it('warns in Portuguese', () => {
  setLanguage('pt-BR', { persist: false })
  const { view, push } = fixture()
  push({ state: 'low' })
  expect(view.result.current?.message).toBe(
    'O computador está quase sem memória. Feche algo pesado antes que o sistema comece a encerrar programas.',
  )
})
