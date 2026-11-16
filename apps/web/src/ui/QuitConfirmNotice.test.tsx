// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { setLanguage } from '../i18n/index.js'
import { QuitConfirmNotice } from './QuitConfirmNotice.js'

const bridge = vi.hoisted(() => ({
  answer: vi.fn(),
  listener: undefined as ((chats: number) => void) | undefined,
}))
vi.mock('../bridge.js', () => ({
  onQuitRequested: (listener: (chats: number) => void) => {
    bridge.listener = listener
    return () => {}
  },
  answerQuit: bridge.answer,
  installAppUpdate: vi.fn(),
  reportRunningAgents: () => {},
  reportStartupMilestone: () => {},
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const ask = async (chats: number) => {
  act(() => bridge.listener?.(chats))
  return await screen.findByRole('alert')
}

it('says nothing until the shell holds a quit', () => {
  render(<QuitConfirmNotice />)
  expect(screen.queryByRole('alert')).toBeNull()
})

it('asks how many chats still work, and Keep working takes the keyboard', async () => {
  render(<QuitConfirmNotice />)
  const notice = await ask(2)
  expect(notice.textContent).toContain('2 chats still running. Quit anyway?')
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep working' }))
  expect(bridge.answer).not.toHaveBeenCalled()
})

it('answers quit only from Quit and stop', async () => {
  render(<QuitConfirmNotice />)
  await ask(1)
  expect(screen.getByRole('alert').textContent).toContain('1 chat still running')
  fireEvent.click(screen.getByRole('button', { name: 'Quit and stop' }))
  expect(bridge.answer).toHaveBeenCalledExactlyOnceWith(true)
})

it.each(['Keep working', 'Cancel quit'])('answers keep working from %s', async (name) => {
  render(<QuitConfirmNotice />)
  await ask(2)
  fireEvent.click(screen.getByRole('button', { name }))
  expect(bridge.answer).toHaveBeenCalledExactlyOnceWith(false)
})

it('asks in Portuguese', async () => {
  setLanguage('pt-BR', { persist: false })
  render(<QuitConfirmNotice />)
  const notice = await ask(2)
  expect(notice.textContent).toContain('2 chats ainda em execução. Sair mesmo assim?')
  expect(screen.getByRole('button', { name: 'Sair e parar' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Continuar trabalhando' })).toBeTruthy()
})
