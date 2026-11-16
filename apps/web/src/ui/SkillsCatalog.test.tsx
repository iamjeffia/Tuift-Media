// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { AvailableSkill } from '@harness/contracts'
import { setLanguage } from '../i18n/index.js'
import type { Transport } from '../transport.js'
import { SkillsSettings } from './SkillsSettings.js'

vi.mock('../bridge.js', () => ({ pickSkillFolder: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const COMMIT = 'a'.repeat(40)

function available(id: string, extra: Partial<AvailableSkill> = {}): AvailableSkill {
  return {
    id,
    name: `Skill ${id}`,
    summary: { en: `${id} does a thing`, 'pt-BR': `${id} faz uma coisa` },
    author: 'Some Author',
    category: 'design',
    license: 'MIT',
    sourceUrl: `https://github.com/some/${id}`,
    commit: COMMIT,
    state: 'not-installed',
    ...extra,
  }
}

type Listener = (data: { provider: string; projectPath: string }) => void

/** A transport that answers the inventory and the catalog, and lets a test push `skills.changed`. */
function catalogTransport(options: {
  skills: AvailableSkill[]
  install?: boolean
  installAvailable?: (ids: string[]) => Promise<unknown>
}) {
  let current = options.skills
  const listeners: Listener[] = []
  const transport = {
    state: 'open',
    request: vi.fn(async (method: string, params: { ids?: string[] }) => {
      if (method === 'skills.list') {
        return {
          capabilities: { inventory: true, configure: true, install: options.install ?? true },
          skills: [],
          errors: [],
        }
      }
      if (method === 'skills.available') return { skills: current }
      if (method === 'skills.installAvailable') return options.installAvailable!(params.ids!)
      throw new Error(`unexpected ${method}`)
    }),
    on: vi.fn((channel: string, listener: Listener) => {
      if (channel === 'skills.changed') listeners.push(listener)
      return () => {}
    }),
    onState: vi.fn(() => () => {}),
  } as unknown as Transport
  return {
    transport,
    set: (next: AvailableSkill[]) => {
      current = next
    },
    push: () =>
      listeners.forEach((listener) =>
        listener({ provider: 'codex', projectPath: '/work/project' }),
      ),
  }
}

function page(transport: Transport) {
  return render(
    <SkillsSettings
      transport={transport}
      provider="codex"
      providerName="Codex"
      projectPath="/work/project"
      projectName="Project"
    />,
  )
}

function row(name: string): HTMLElement {
  return screen.getByRole('heading', { name, level: 2 }).closest('article')!
}

const FOUR = [
  available('fresh'),
  available('nolicense', { license: null, author: 'Remotion' }),
  available('done', { state: 'installed', installedCommit: COMMIT }),
  available('old', { state: 'update-available', installedCommit: 'b'.repeat(40) }),
]

describe('skills from their authors', () => {
  it('lists them with author, licence, a link to the source and the action each state allows', async () => {
    const { transport } = catalogTransport({ skills: FOUR })
    page(transport)

    const heading = await screen.findByRole('heading', { name: 'Available to install' })
    const section = heading.closest('section')!
    expect(
      within(section).getByText(/come from their authors and are not part of TUIFT Code/),
    ).toBeTruthy()

    const fresh = row('Skill fresh')
    expect(within(fresh).getByText('fresh does a thing')).toBeTruthy()
    expect(within(fresh).getByText('By Some Author · License: MIT')).toBeTruthy()
    const link = within(fresh).getByRole('link', { name: 'Open the source of Skill fresh' })
    expect(link.getAttribute('href')).toBe('https://github.com/some/fresh')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(within(fresh).getByRole('button', { name: 'Install Skill fresh' })).toBeTruthy()

    // No licence is said in plain words, never left blank.
    expect(
      within(row('Skill nolicense')).getByText('By Remotion · The author declares no license'),
    ).toBeTruthy()

    const done = row('Skill done')
    expect(within(done).getByText('Installed')).toBeTruthy()
    expect(within(done).queryByRole('button')).toBeNull()

    const old = row('Skill old')
    expect(within(old).getByText('Update available')).toBeTruthy()
    expect(within(old).getByRole('button', { name: 'Update Skill old' }).textContent).toBe('Update')
  })

  it('is not offered where the provider cannot install skills', async () => {
    const { transport } = catalogTransport({ skills: FOUR, install: false })
    page(transport)

    await waitFor(() =>
      expect(transport.request).toHaveBeenCalledWith('skills.list', expect.anything()),
    )
    await act(async () => {})
    expect(screen.queryByRole('heading', { name: 'Available to install' })).toBeNull()
    expect(transport.request).not.toHaveBeenCalledWith('skills.available', expect.anything())
  })

  it('shows installing, then installed as the server reports each skill', async () => {
    let finish!: (value: unknown) => void
    const ctl = catalogTransport({
      skills: FOUR,
      installAvailable: () => new Promise((resolve) => (finish = resolve)),
    })
    page(ctl.transport)
    await screen.findByRole('heading', { name: 'Available to install' })

    fireEvent.click(screen.getByRole('button', { name: 'Install Skill fresh' }))

    await waitFor(() => expect(within(row('Skill fresh')).getByText('Installing…')).toBeTruthy())
    expect(ctl.transport.request).toHaveBeenCalledWith('skills.installAvailable', {
      provider: 'codex',
      projectPath: '/work/project',
      ids: ['fresh'],
    })
    expect(
      within(row('Skill fresh')).getByRole('button', { name: 'Install Skill fresh' }),
    ).toHaveProperty('disabled', true)

    // The server's push after the skill lands refreshes the list.
    ctl.set(
      FOUR.map((skill) =>
        skill.id === 'fresh' ? { ...skill, state: 'installed' as const } : skill,
      ),
    )
    await act(async () => ctl.push())
    await waitFor(() => expect(within(row('Skill fresh')).getByText('Installed')).toBeTruthy())
    await act(async () => finish({ results: [{ id: 'fresh', ok: true }] }))
    expect(within(row('Skill fresh')).queryByText('Installing…')).toBeNull()
  })

  it('names the reason when an install fails and tries again on request', async () => {
    const installAvailable = vi
      .fn<(ids: string[]) => Promise<unknown>>()
      .mockResolvedValueOnce({
        results: [
          { id: 'fresh', ok: false, message: 'The download took too long and was stopped' },
        ],
      })
      .mockResolvedValueOnce({ results: [{ id: 'fresh', ok: true }] })
    const ctl = catalogTransport({ skills: FOUR, installAvailable })
    page(ctl.transport)
    await screen.findByRole('heading', { name: 'Available to install' })

    fireEvent.click(screen.getByRole('button', { name: 'Install Skill fresh' }))

    const failed = row('Skill fresh')
    await waitFor(() => expect(within(failed).getByText('Failed')).toBeTruthy())
    expect(within(failed).getByText('The download took too long and was stopped')).toBeTruthy()
    expect(failed.getAttribute('data-tone')).toBe('error')

    fireEvent.click(
      within(failed).getByRole('button', { name: 'Try installing Skill fresh again' }),
    )
    await waitFor(() => expect(installAvailable).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(within(row('Skill fresh')).queryByText('Failed')).toBeNull())
  })

  it('installs everything missing at once, and nothing that is installed or only outdated', async () => {
    const installAvailable = vi
      .fn<(ids: string[]) => Promise<unknown>>()
      .mockResolvedValue({ results: [] })
    const ctl = catalogTransport({ skills: FOUR, installAvailable })
    page(ctl.transport)
    await screen.findByRole('heading', { name: 'Available to install' })

    fireEvent.click(screen.getByRole('button', { name: 'Install all' }))

    await waitFor(() => expect(installAvailable).toHaveBeenCalledWith(['fresh', 'nolicense']))
  })

  it('keeps Install all off when nothing is missing', async () => {
    const { transport } = catalogTransport({ skills: [FOUR[2]!, FOUR[3]!] })
    page(transport)
    await screen.findByRole('heading', { name: 'Available to install' })

    expect(screen.getByRole('button', { name: 'Install all' })).toHaveProperty('disabled', true)
  })

  it('reports a request that failed as a failure of each skill asked for', async () => {
    const ctl = catalogTransport({
      skills: FOUR,
      installAvailable: () => Promise.reject(new Error('Connection lost')),
    })
    page(ctl.transport)
    await screen.findByRole('heading', { name: 'Available to install' })

    fireEvent.click(screen.getByRole('button', { name: 'Install all' }))

    await waitFor(() =>
      expect(within(row('Skill fresh')).getByText('Connection lost')).toBeTruthy(),
    )
    expect(within(row('Skill nolicense')).getByText('Connection lost')).toBeTruthy()
  })
})

describe('skills from their authors, in Portuguese', () => {
  it('says every string in Portuguese', async () => {
    setLanguage('pt-BR', { persist: false })
    const installAvailable = vi
      .fn<(ids: string[]) => Promise<unknown>>()
      .mockResolvedValue({ results: [{ id: 'fresh', ok: false, message: 'Falha de rede' }] })
    const ctl = catalogTransport({ skills: FOUR, installAvailable })
    page(ctl.transport)

    const heading = await screen.findByRole('heading', { name: 'Disponíveis para instalar' })
    const section = heading.closest('section')!
    expect(
      within(section).getByText(
        /Estas skills vêm dos próprios autores e não fazem parte do TUIFT Code/,
      ),
    ).toBeTruthy()
    expect(within(section).getByRole('button', { name: 'Instalar todas' })).toBeTruthy()

    const fresh = row('Skill fresh')
    expect(within(fresh).getByText('fresh faz uma coisa')).toBeTruthy()
    expect(within(fresh).getByText('Por Some Author · Licença: MIT')).toBeTruthy()
    expect(
      within(fresh).getByRole('link', { name: 'Abrir o código-fonte de Skill fresh' }),
    ).toBeTruthy()
    expect(within(fresh).getByRole('button', { name: 'Instalar Skill fresh' }).textContent).toBe(
      'Instalar',
    )
    expect(
      within(row('Skill nolicense')).getByText('Por Remotion · O autor não declarou licença'),
    ).toBeTruthy()
    expect(within(row('Skill done')).getByText('Instalada')).toBeTruthy()
    const old = row('Skill old')
    expect(within(old).getByText('Atualização disponível')).toBeTruthy()
    expect(within(old).getByRole('button', { name: 'Atualizar Skill old' }).textContent).toBe(
      'Atualizar',
    )

    fireEvent.click(within(fresh).getByRole('button', { name: 'Instalar Skill fresh' }))
    await waitFor(() => expect(within(row('Skill fresh')).getByText('Falhou')).toBeTruthy())
    expect(within(row('Skill fresh')).getByText('Falha de rede')).toBeTruthy()
    expect(
      within(row('Skill fresh')).getByRole('button', {
        name: 'Tentar instalar Skill fresh de novo',
      }).textContent,
    ).toBe('Tentar de novo')
  })

  it('says Instalando while a skill downloads', async () => {
    setLanguage('pt-BR', { persist: false })
    const ctl = catalogTransport({ skills: FOUR, installAvailable: () => new Promise(() => {}) })
    page(ctl.transport)
    await screen.findByRole('heading', { name: 'Disponíveis para instalar' })

    fireEvent.click(screen.getByRole('button', { name: 'Instalar Skill fresh' }))

    await waitFor(() => expect(within(row('Skill fresh')).getByText('Instalando…')).toBeTruthy())
  })
})
