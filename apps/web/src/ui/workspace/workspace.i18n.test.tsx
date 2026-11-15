// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CheckoutPullRequest } from '@harness/contracts'
import { setLanguage, translate } from '../../i18n/index.js'
import { StagePullRequestChip } from '../StagePullRequestChip.js'
import { FileViewer } from './FileViewer.js'
import { ReviewCommitBox } from './ReviewComposer.js'
import { WorkspaceTabs } from './WorkspaceTabs.js'
import { browserAddress } from './browser-url.js'

afterEach(cleanup)

const pullRequest = {
  repository: 'owner/repo',
  number: 12,
  title: 'Add a thing',
  state: 'OPEN',
  isDraft: false,
  checks: 'passing',
} as unknown as CheckoutPullRequest

describe('workspace panel in Portuguese', () => {
  it('translates the tab strip and follows a language change', () => {
    render(
      <WorkspaceTabs
        tabs={[{ id: 'files', title: 'Arquivos', icon: null }]}
        activeId="files"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      >
        {null}
      </WorkspaceTabs>,
    )
    expect(screen.getByRole('tablist', { name: 'Tool tabs' })).toBeTruthy()

    act(() => setLanguage('pt-BR', { persist: false }))
    expect(screen.getByRole('tablist', { name: 'Abas de ferramentas' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Fechar Arquivos' })).toBeTruthy()
  })

  it('translates a pull request chip, state and checks included', () => {
    setLanguage('pt-BR', { persist: false })
    render(<StagePullRequestChip pullRequest={pullRequest} onOpen={vi.fn()} />)
    const chip = screen.getByRole('button', {
      name: 'Pull request #12: Aberto, Verificações aprovadas. Mostrar em Pull requests',
    })
    expect(chip.textContent).toContain('Aberto')
  })

  it('translates a file viewer message with its values filled in', () => {
    setLanguage('pt-BR', { persist: false })
    render(
      <FileViewer
        file={{
          name: 'logo.bin',
          path: 'assets/logo.bin',
          size: 2048,
          binary: true,
          truncated: false,
        }}
        projectPath="C:\\site"
        root="C:\\site"
        onReveal={vi.fn()}
      />,
    )
    expect(screen.getByText('Arquivo binário')).toBeTruthy()
    expect(screen.getByText('logo.bin tem 2.0 KB e não pode ser exibido como texto.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Abrir no Explorer' })).toBeTruthy()
  })

  it('picks the plural form of the commit button', () => {
    setLanguage('pt-BR', { persist: false })
    const noop = vi.fn()
    const box = (fileCount: number) => (
      <ReviewCommitBox
        message="Ajusta o painel"
        fileCount={fileCount}
        generating={false}
        copied={false}
        committing={false}
        disabled={false}
        onMessageChange={noop}
        onGenerate={noop}
        onCopy={noop}
        onCommit={noop}
        onCancel={noop}
      />
    )
    const { rerender } = render(box(1))
    expect(screen.getByRole('button', { name: /^Commit de 1 arquivo$/ })).toBeTruthy()
    rerender(box(3))
    expect(screen.getByRole('button', { name: /^Commit de 3 arquivos$/ })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Mensagem do commit' })).toBeTruthy()
  })

  it('refuses a bad address in the interface language, and in English for the agent', () => {
    setLanguage('pt-BR', { persist: false })
    expect(browserAddress('')).toEqual({ error: 'Digite uma URL.' })
    expect(browserAddress('', (key) => translate('en', key))).toEqual({ error: 'Enter a URL.' })
  })
})
