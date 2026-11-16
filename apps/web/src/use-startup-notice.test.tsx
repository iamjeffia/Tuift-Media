// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { DataOf } from '@harness/contracts'
import { setLanguage } from './i18n/index.js'
import { TestTransport } from './test-transport.js'
import { useStartupNotice } from './use-startup-notice.js'

const BACKUP_AT = Date.UTC(2026, 10, 1, 12, 30)
const restored = {
  kind: 'database.restored' as const,
  at: Date.UTC(2026, 10, 2, 8),
  backupAt: BACKUP_AT,
  asidePath: 'D:/data/tastecode.db.damaged-20261102-080000',
}

function fixture() {
  const transport = new TestTransport(() => ({}))
  const view = renderHook(() => useStartupNotice(transport))
  const push = (data: DataOf<'server.startupNotice'>) =>
    act(() => transport.emit('server.startupNotice', data))
  return { transport, view, push }
}

it('shows nothing until the server sends a notice', () => {
  expect(fixture().view.result.current).toBeUndefined()
})

it('says the database was restored, from which copy, and where the damaged file is', () => {
  const { view, push } = fixture()
  push({ notice: restored })
  expect(view.result.current).toMatchObject({ role: 'alert', tone: 'info' })
  expect(view.result.current?.message).toMatch(/restored from the backup of .*2026/)
  expect(view.result.current?.detail).toContain(restored.asidePath)
})

it('says it started empty when no copy could be used', () => {
  const { view, push } = fixture()
  push({ notice: { ...restored, backupAt: null } })
  expect(view.result.current?.message).toBe(
    'Your chat database was damaged and no backup could be used, so TUIFT Code started empty.',
  )
})

it('is worded in Portuguese', () => {
  setLanguage('pt-BR', { persist: false })
  const { view, push } = fixture()
  push({ notice: restored })
  expect(view.result.current?.message).toMatch(
    /^O banco de dados dos chats estava danificado e foi restaurado da cópia de /,
  )
  expect(view.result.current?.detail).toBe(
    `O arquivo danificado foi guardado em ${restored.asidePath}. Chats posteriores a essa cópia não estão nela.`,
  )
})

it('tells the server when dismissed, and clears when another window dismissed it', () => {
  const { transport, view, push } = fixture()
  push({ notice: restored })
  act(() => view.result.current!.dismiss!())
  expect(view.result.current).toBeUndefined()
  expect(transport.requests.map((request) => request.method)).toEqual(['startup.dismissNotice'])

  push({ notice: restored })
  expect(view.result.current).toBeDefined()
  push({ notice: null })
  expect(view.result.current).toBeUndefined()
})
