// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { setLanguage } from './i18n.js'
import { useI18n } from './use-i18n.js'

function Probe() {
  const { t, tp, language } = useI18n()
  return (
    <p>
      {language}|{t('settings.back')}|{tp('common.days', 3)}
    </p>
  )
}

afterEach(cleanup)

describe('useI18n', () => {
  it('renders again, in the new language, when the language changes', () => {
    render(<Probe />)
    expect(screen.getByText('en|Back to app|3 days')).toBeTruthy()

    act(() => setLanguage('pt-BR', { persist: false }))
    expect(screen.getByText('pt-BR|Voltar ao app|3 dias')).toBeTruthy()
  })
})
