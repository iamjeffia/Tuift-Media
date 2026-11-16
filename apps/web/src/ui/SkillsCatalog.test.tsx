// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { AvailableSkill, ProviderId } from '@harness/contracts'
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
  removeAvailable?: (id: string) => Promise<unknown>
}) {
  let current = options.skills
  const listeners: Listener[] = []
  const transport = {
    state: 'open',
    request: vi.fn(async (method: string, params: { ids?: string[]; id?: string }) => {
      if (method === 'skills.list') {
        return {
          capabilities: { inventory: true, configure: true, install: options.install ?? true },
          skills: [],
          errors: [],
        }
      }
      if (method === 'skills.available') return { skills: current }
      if (method === 'skills.installAvailable') return options.installAvailable!(params.ids!)
      if (method === 'skills.removeAvailable') return options.removeAvailable!(params.id!)
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

function page(transport: Transport, provider: ProviderId = 'codex', providerName = 'Codex') {
  return render(
    <SkillsSettings
      transport={transport}
      provider={provider}
      providerName={providerName}
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

  it('is offered for every provider, including one that cannot install into a project', async () => {
    const { transport } = catalogTransport({ skills: FOUR, install: false })
    page(transport, 'claude-code', 'Claude Code')

    await screen.findByRole('heading', { name: 'Available to install' })
    expect(transport.request).toHaveBeenCalledWith('skills.available', {
      provider: 'claude-code',
      projectPath: '/work/project',
    })
    expect(screen.getByRole('button', { name: 'Install Skill fresh' })).toBeTruthy()
  })

  it('says it is installed for the whole app, and where it loads', async () => {
    const ctl = catalogTransport({
      skills: [
        available('design-one', { state: 'installed', installedFor: 'app' }),
        available('motion-one', { category: 'motion', state: 'installed', installedFor: 'app' }),
        available('every-one', { category: 'general', state: 'installed', installedFor: 'app' }),
      ],
    })
    page(ctl.transport, 'claude-code', 'Claude Code')
    await screen.findByRole('heading', { name: 'Available to install' })

    expect(
      within(row('Skill design-one')).getByText(
        'Installed for the whole app · Loads in Design chats',
      ),
    ).toBeTruthy()
    expect(
      within(row('Skill motion-one')).getByText(
        'Installed for the whole app · Loads in Motion chats',
      ),
    ).toBeTruthy()
    expect(
      within(row('Skill every-one')).getByText('Installed for the whole app · Loads in every chat'),
    ).toBeTruthy()
    expect(within(row('Skill design-one')).getByText('Installed')).toBeTruthy()
  })

  it('shows an install from an earlier version as installed for the project, with no action', async () => {
    const { transport } = catalogTransport({
      skills: [available('early', { state: 'installed', installedFor: 'project' })],
    })
    page(transport)
    await screen.findByRole('heading', { name: 'Available to install' })

    const early = row('Skill early')
    expect(within(early).getByText('Installed')).toBeTruthy()
    expect(
      within(early).getByText(
        'Installed in this project by an earlier version. It stays here and is not shared with other projects.',
      ),
    ).toBeTruthy()
    expect(within(early).queryByRole('button')).toBeNull()
  })

  it('removes a skill after the person confirms, and not before', async () => {
    const confirm = vi.fn(() => false)
    Object.defineProperty(window, 'confirm', { configurable: true, value: confirm })
    const removeAvailable = vi.fn<(id: string) => Promise<unknown>>().mockResolvedValue({})
    const ctl = catalogTransport({
      skills: [available('keep', { state: 'installed', installedFor: 'app' })],
      removeAvailable,
    })
    page(ctl.transport, 'claude-code', 'Claude Code')
    await screen.findByRole('heading', { name: 'Available to install' })

    fireEvent.click(screen.getByRole('button', { name: 'Remove Skill keep' }))
    expect(confirm).toHaveBeenCalledWith(
      'Remove Skill keep from the whole app? It will no longer load in any chat.',
    )
    expect(removeAvailable).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    ctl.set([available('keep')])
    fireEvent.click(screen.getByRole('button', { name: 'Remove Skill keep' }))

    await waitFor(() => expect(removeAvailable).toHaveBeenCalledWith('keep'))
    expect(ctl.transport.request).toHaveBeenCalledWith('skills.removeAvailable', {
      provider: 'claude-code',
      projectPath: '/work/project',
      id: 'keep',
    })
    // The list is read again: the skill can be installed once more.
    await waitFor(() =>
      expect(
        within(row('Skill keep')).getByRole('button', { name: 'Install Skill keep' }),
      ).toBeTruthy(),
    )
    expect(
      within(row('Skill keep')).queryByRole('button', { name: 'Remove Skill keep' }),
    ).toBeNull()
  })

  it('names the reason when a removal fails and keeps the skill', async () => {
    Object.defineProperty(window, 'confirm', { configurable: true, value: () => true })
    const ctl = catalogTransport({
      skills: [available('stuck', { state: 'installed', installedFor: 'app' })],
      removeAvailable: () => Promise.reject(new Error('The folder is in use')),
    })
    page(ctl.transport)
    await screen.findByRole('heading', { name: 'Available to install' })

    fireEvent.click(screen.getByRole('button', { name: 'Remove Skill stuck' }))

    await waitFor(() =>
      expect(within(row('Skill stuck')).getByText('The folder is in use')).toBeTruthy(),
    )
    expect(within(row('Skill stuck')).getByText('Installed')).toBeTruthy()
    expect(
      within(row('Skill stuck')).getByRole('button', { name: 'Remove Skill stuck' }),
    ).toHaveProperty('disabled', false)
  })

  it('offers Update and Remove together for an outdated skill installed for the app', async () => {
    const { transport } = catalogTransport({
      skills: [
        available('older', {
          state: 'update-available',
          installedCommit: 'b'.repeat(40),
          installedFor: 'app',
        }),
      ],
    })
    page(transport)
    await screen.findByRole('heading', { name: 'Available to install' })

    const older = row('Skill older')
    expect(within(older).getByRole('button', { name: 'Update Skill older' })).toBeTruthy()
    expect(within(older).getByRole('button', { name: 'Remove Skill older' })).toBeTruthy()
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

  it('says the scope, the removal and its confirmation in Portuguese', async () => {
    setLanguage('pt-BR', { persist: false })
    const confirm = vi.fn(() => true)
    Object.defineProperty(window, 'confirm', { configurable: true, value: confirm })
    const ctl = catalogTransport({
      skills: [
        available('app-one', { state: 'installed', installedFor: 'app' }),
        available('motion-one', { category: 'motion', state: 'installed', installedFor: 'app' }),
        available('every-one', { category: 'general', state: 'installed', installedFor: 'app' }),
        available('early', { state: 'installed', installedFor: 'project' }),
      ],
      removeAvailable: () => new Promise(() => {}),
    })
    page(ctl.transport, 'claude-code', 'Claude Code')
    const heading = await screen.findByRole('heading', { name: 'Disponíveis para instalar' })
    expect(within(heading.closest('section')!).getByText(/uma vez para o app inteiro/)).toBeTruthy()

    expect(
      within(row('Skill app-one')).getByText(
        'Instalada para o app inteiro · Carrega em chats de Design',
      ),
    ).toBeTruthy()
    expect(
      within(row('Skill motion-one')).getByText(
        'Instalada para o app inteiro · Carrega em chats de Motion',
      ),
    ).toBeTruthy()
    expect(
      within(row('Skill every-one')).getByText(
        'Instalada para o app inteiro · Carrega em todos os chats',
      ),
    ).toBeTruthy()
    expect(
      within(row('Skill early')).getByText(
        'Instalada neste projeto por uma versão anterior. Continua aqui e não vale para outros projetos.',
      ),
    ).toBeTruthy()

    const remove = within(row('Skill app-one')).getByRole('button', {
      name: 'Remover Skill app-one',
    })
    expect(remove.textContent).toBe('Remover')
    fireEvent.click(remove)
    expect(confirm).toHaveBeenCalledWith(
      'Remover Skill app-one do app inteiro? Ela deixa de carregar em qualquer chat.',
    )
    await waitFor(() => expect(within(row('Skill app-one')).getByText('Removendo…')).toBeTruthy())
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

describe('a skill installed from the Clube library', () => {
  const clubeSkill = available('ritmo', {
    name: 'Ritmo de corte',
    author: 'Clube do Motion',
    category: 'motion',
    license: null,
    sourceUrl: 'https://clube.example.test/skills/ritmo',
    state: 'installed',
    installedFor: 'app',
    origin: 'clube',
  })

  it('is listed with its origin instead of an author and a licence, and can be removed like the others', async () => {
    Object.defineProperty(window, 'confirm', { configurable: true, value: () => true })
    const removed: string[] = []
    const ctl = catalogTransport({
      skills: [clubeSkill, available('fresh')],
      removeAvailable: async (id) => {
        removed.push(id)
        return {}
      },
    })
    page(ctl.transport)
    await screen.findByRole('heading', { name: 'Available to install' })
    const mine = row('Ritmo de corte')
    expect(within(mine).getByText('Installed from the Clube do Motion library')).toBeTruthy()
    expect(within(mine).queryByText(/License/)).toBeNull()
    expect(within(mine).queryByText(/declares no license/)).toBeNull()
    expect(
      within(mine).getByText('Installed for the whole app · Loads in Motion chats'),
    ).toBeTruthy()
    expect(
      within(mine)
        .getByRole('link', { name: 'Open the source of Ritmo de corte' })
        .getAttribute('href'),
    ).toBe('https://clube.example.test/skills/ritmo')
    // "Install all" counts only what is not installed: the Clube skill is not offered again.
    fireEvent.click(within(mine).getByRole('button', { name: 'Remove Ritmo de corte' }))
    await waitFor(() => expect(removed).toEqual(['ritmo']))
  })

  it('says where it comes from in Portuguese', async () => {
    setLanguage('pt-BR', { persist: false })
    const ctl = catalogTransport({ skills: [clubeSkill] })
    page(ctl.transport)
    await screen.findByRole('heading', { name: 'Disponíveis para instalar' })
    expect(
      within(row('Ritmo de corte')).getByText('Instalada da biblioteca do Clube do Motion'),
    ).toBeTruthy()
  })
})
