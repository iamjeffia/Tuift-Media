// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setLanguage } from '../i18n/index.js'
import { MessageActionButton } from './MessageActionButton.js'

afterEach(() => {
  cleanup()
  setLanguage('en', { persist: false })
})

describe('MessageActionButton', () => {
  it('names the button from the catalog and follows a language change', () => {
    const onClick = vi.fn()
    render(
      <MessageActionButton labelKey="chat.actions.restoreBeforeTurn" onClick={onClick}>
        <span aria-hidden />
      </MessageActionButton>,
    )
    const button = screen.getByRole('button', { name: 'Restore to before this turn' })
    expect(button.getAttribute('title')).toBe('Restore to before this turn')
    button.click()
    expect(onClick).toHaveBeenCalledTimes(1)

    act(() => setLanguage('pt-BR', { persist: false }))
    expect(screen.getByRole('button', { name: 'Restaurar para antes deste turno' })).toBeTruthy()
  })
})
