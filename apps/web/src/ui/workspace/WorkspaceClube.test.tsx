// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ClubeFacets,
  ClubeItem,
  ClubeJob,
  ClubeLibraryFailure,
  ClubeLimitsResult,
  ClubeRecord,
  ClubeStatus,
} from '@harness/contracts'
import { CLUBE_PLANS_URL } from '@harness/contracts'
import { setLanguage } from '../../i18n/index.js'
import { TestTransport } from '../../test-transport.js'
import { WorkspaceClube } from './WorkspaceClube.js'

const attach = vi.hoisted(() => vi.fn(() => true))
vi.mock('../../composer-attach.js', () => ({ attachToComposer: attach }))
vi.mock('../../bridge.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../bridge.js')>()),
  isDesktop: false,
}))
// The chat's renderer is heavy and has its own tests: here the text it is given is what matters.
vi.mock('../CompletedMarkdown.js', () => ({
  CompletedMarkdown: (props: { text: string }) => <div data-testid="markdown">{props.text}</div>,
}))

const play = vi.fn(() => Promise.resolve())
const pause = vi.fn()
const writeText = vi.fn(() => Promise.resolve())

beforeEach(() => {
  attach.mockClear()
  attach.mockReturnValue(true)
  play.mockClear()
  pause.mockClear()
  writeText.mockClear()
  Object.assign(HTMLMediaElement.prototype, { play, pause })
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  URL.createObjectURL = vi.fn((blob: Blob) => `blob:${blob.type}`)
  URL.revokeObjectURL = vi.fn()
  setLanguage('en', { persist: false })
})
afterEach(() => {
  cleanup()
  setLanguage('en', { persist: false })
})

const connected: ClubeStatus = {
  state: 'connected',
  account: { name: 'Pessoa', email: 'pessoa@example.test', plan: 'mensal' },
  subscriber: true,
}

const item = (id: string, kind: ClubeItem['kind'], extra: Partial<ClubeItem> = {}): ClubeItem => ({
  id,
  kind,
  title: `Item ${id}`,
  summary: `Resumo de ${id}`,
  style: ['minimal'],
  tool: ['after-effects'],
  scene: [],
  format: '16:9',
  durationS: 12,
  cover: `http://clube.test/media/capa/${id.split('/')[1]}.png`,
  access: 'subscriber',
  ...extra,
})

const ITEMS = [
  item('animacao/a1', 'animation', {
    title: 'Marca pulsante',
    preview: 'http://clube.test/media/previa/a1.mp4',
    page: 'http://clube.test/animacoes/a1',
  }),
  item('projeto/p1', 'project', { title: 'Anúncio de teste', format: '9:16', durationS: 30 }),
  item('referencia/r1', 'reference', {
    title: 'Referência de teste',
    page: 'http://clube.test/referencias/r1',
  }),
  item('skill/s1', 'skill', {
    title: 'Ritmo de corte',
    format: undefined,
    durationS: undefined,
    cover: undefined,
  }),
  item('musica/m1', 'music', { title: 'Maré lenta', access: 'free', durationS: 120 }),
]

const FACETS: ClubeFacets = {
  kind: [
    { value: 'animation', count: 1 },
    { value: 'project', count: 1 },
    { value: 'reference', count: 1 },
    { value: 'skill', count: 1 },
    { value: 'music', count: 1 },
  ],
  style: [
    { value: 'minimal', count: 4 },
    { value: 'saas', count: 1 },
  ],
  tool: [{ value: 'after-effects', count: 5 }],
  scene: [],
  format: [{ value: '16:9', count: 3 }],
}

const record = (it: ClubeItem, extra: Partial<ClubeRecord> = {}): ClubeRecord => ({
  item: it,
  analysis: `Análise de ${it.title}`,
  aspects: {
    animation: undefined,
    colors: undefined,
    typography: undefined,
    transition: undefined,
    sound: undefined,
  },
  parts: [],
  ...extra,
})

const PARTS: ClubeRecord['parts'] = [
  { key: 'guia', label: 'guia', sizeMb: 0.1, files: 1, onDisk: false },
  { key: 'projeto', label: 'projeto', sizeMb: 40, files: 1, onDisk: false },
  { key: 'render', label: 'render', sizeMb: 120, files: 2, onDisk: true },
]

type Answers = {
  clube?: ClubeStatus | 'fail'
  search?: (params: Record<string, unknown>) => unknown
  item?: (params: { id: string }) => unknown
  limits?: ClubeLimitsResult
  media?: () => unknown
  download?: () => unknown
  jobs?: ClubeJob[]
  install?: () => unknown
  export?: () => unknown
  signal?: () => unknown
  soundsUse?: () => unknown
}

function open(answers: Answers = {}, props: Partial<Parameters<typeof WorkspaceClube>[0]> = {}) {
  const jobs = [...(answers.jobs ?? [])]
  const transport = new TestTransport(async (method, params) => {
    switch (method) {
      case 'clube.status':
        if (answers.clube === 'fail') throw new Error('down')
        return answers.clube ?? connected
      case 'clube.library.search':
        return (
          answers.search?.(params as Record<string, unknown>) ?? {
            ok: true,
            total: ITEMS.length,
            items: ITEMS,
            next: null,
            facets: FACETS,
          }
        )
      case 'clube.library.limits':
        return answers.limits ?? { ok: false, reason: 'unavailable' }
      case 'clube.library.media':
        return answers.media?.() ?? { ok: true, mime: 'image/png', data: btoa('png') }
      case 'clube.library.item': {
        const id = (params as { id: string }).id
        if (answers.item) return answers.item({ id })
        const found = ITEMS.find((entry) => entry.id === id)!
        return { ok: true, record: record(found) }
      }
      case 'clube.library.download':
        return answers.download?.() ?? { ok: true, jobId: 'job-1' }
      case 'clube.library.job': {
        const next = jobs.length > 1 ? jobs.shift()! : jobs[0]!
        return { ok: true, job: next }
      }
      case 'clube.library.cancel':
        return {}
      case 'clube.library.installSkill':
        return answers.install?.() ?? { ok: true, name: 'Ritmo de corte', category: 'motion' }
      case 'clube.library.exportText':
        return answers.export?.() ?? { ok: true, path: 'C:\\p\\clube\\referencias\\r1.md' }
      case 'clube.library.signal':
        return answers.signal?.() ?? { ok: true }
      case 'sounds.use':
        return (
          answers.soundsUse?.() ?? {
            ok: true,
            sound: {
              path: 'C:\\p\\audio\\clube\\Mare lenta',
              name: 'Mare lenta',
              format: 'wav',
              reused: false,
              files: [
                {
                  version: 'completa',
                  path: 'C:\\p\\audio\\clube\\Mare lenta\\completa.wav',
                  format: 'wav',
                },
              ],
            },
            daily: { used: 1, limit: 60 },
          }
        )
      default:
        throw new Error(`unexpected ${method}`)
    }
  })
  const onOpenClubeSettings = vi.fn()
  render(
    <WorkspaceClube
      active
      transport={transport}
      threadId="chat-1"
      projectPath="C:\\p"
      onOpenClubeSettings={onOpenClubeSettings}
      {...props}
    />,
  )
  return { transport, onOpenClubeSettings }
}

const asked = (transport: TestTransport, method: string) =>
  transport.requests.filter((entry) => entry.method === method)

const failure = (
  reason: ClubeLibraryFailure['reason'],
  extra: Partial<ClubeLibraryFailure> = {},
): ClubeLibraryFailure => ({ ok: false, reason, ...extra })

const job = (extra: Partial<ClubeJob>): ClubeJob => ({
  state: 'running',
  filesDone: 0,
  filesTotal: 2,
  receivedBytes: 0,
  totalBytes: 0,
  ...extra,
})

async function openItem(title: string) {
  fireEvent.click(
    await screen.findByRole('button', { name: new RegExp(`^(Open|Abrir) ${title}$`) }),
  )
}

describe('the Clube tab: the state of the account', () => {
  it('waits for the link, with a status line', () => {
    open()
    expect(screen.getByText('Loading the library…')).toBeTruthy()
  })

  it('invites to connect when no account is linked, and opens the Clube settings', async () => {
    const { onOpenClubeSettings } = open({ clube: { state: 'disconnected' } })
    expect(await screen.findByText('Connect your Clube do Motion account')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open the Clube settings' }))
    expect(onOpenClubeSettings).toHaveBeenCalledTimes(1)
  })

  it('points a free account to the plans', async () => {
    open({
      clube: {
        state: 'connected',
        account: { name: 'Pessoa', email: 'p@example.test', plan: 'grátis' },
        subscriber: false,
      },
    })
    expect(await screen.findByText('The library is for subscribers')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'See the plans' }).getAttribute('href')).toBe(
      CLUBE_PLANS_URL,
    )
  })

  it('says the library did not answer when the server cannot be read', async () => {
    open({ clube: 'fail' })
    expect(await screen.findByText('The library did not answer')).toBeTruthy()
  })

  it('follows a search the server refused for a link that changed', async () => {
    open({ search: () => failure('no-subscription') })
    expect(await screen.findByText('The library is for subscribers')).toBeTruthy()
  })

  it('says the per-minute limit with the seconds to wait', async () => {
    open({ search: () => failure('rate-limit', { retryAfterS: 12 }) })
    expect(
      await screen.findByText('Too many requests in a row. Try again in 12 seconds.'),
    ).toBeTruthy()
  })

  it('says when nothing matches, and when the search fails, with a way to try again', async () => {
    let fails = true
    open({
      search: () =>
        fails
          ? failure('unreachable')
          : { ok: true, total: 0, items: [], next: null, facets: FACETS },
    })
    expect(await screen.findByText('The library did not answer')).toBeTruthy()
    fails = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Nothing found')).toBeTruthy()
    expect(screen.getByText('Try another word or clear the filters.')).toBeTruthy()
  })

  it('asks to open a chat when there is none, and still lets the library be read', async () => {
    open({}, { threadId: undefined })
    expect(await screen.findByRole('list', { name: 'Library items' })).toBeTruthy()
    expect(screen.getByText('Open a chat to download into its project.')).toBeTruthy()
  })
})

describe('the Clube tab: searching', () => {
  it('lists cards with the kind, the format, the length and the summary, and counts the results', async () => {
    open()
    const list = await screen.findByRole('list', { name: 'Library items' })
    const cards = within(list).getAllByRole('listitem')
    expect(cards).toHaveLength(5)
    expect(cards[0]!.textContent).toContain('Marca pulsante')
    expect(cards[0]!.textContent).toContain('Animation · 16:9 · 0:12')
    expect(cards[0]!.textContent).toContain('Resumo de animacao/a1')
    expect(cards[4]!.textContent).toContain('Music · 16:9 · 2:00 · Free')
    expect(screen.getByText('5 results')).toBeTruthy()
  })

  it('narrows by the words after a pause, by a kind and by the facets the answer brings', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const { transport } = open()
      await screen.findByRole('list', { name: 'Library items' })
      fireEvent.change(screen.getByRole('textbox', { name: 'Search the Clube library' }), {
        target: { value: 'marca' },
      })
      await vi.advanceTimersByTimeAsync(400)
      await waitFor(() =>
        expect(asked(transport, 'clube.library.search').at(-1)?.params).toMatchObject({
          query: 'marca',
          limit: 24,
        }),
      )
      for (const name of ['Kind', 'Style', 'Tool', 'Format']) {
        expect(screen.getByRole('combobox', { name })).toBeTruthy()
      }
      // An empty facet is not offered.
      expect(screen.queryByRole('combobox', { name: 'Scene' })).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('sends the kind and the style that were chosen', async () => {
    const { transport } = open()
    await screen.findByRole('list', { name: 'Library items' })
    fireEvent.click(screen.getByRole('combobox', { name: 'Kind' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Projects (1)' }))
    await waitFor(() =>
      expect(asked(transport, 'clube.library.search').at(-1)?.params).toMatchObject({
        kind: 'project',
      }),
    )
    fireEvent.click(screen.getByRole('combobox', { name: 'Style' }))
    fireEvent.click(await screen.findByRole('option', { name: 'saas (1)' }))
    await waitFor(() =>
      expect(asked(transport, 'clube.library.search').at(-1)?.params).toMatchObject({
        kind: 'project',
        style: ['saas'],
      }),
    )
  })

  it('pages by the cursor the answer gave, and stops when there is none', async () => {
    const many = Array.from({ length: 24 }, (_, index) => item(`animacao/n${index}`, 'animation'))
    const { transport } = open({
      search: (params) =>
        params['cursor'] === '24'
          ? {
              ok: true,
              total: 25,
              items: [item('animacao/ultimo', 'animation', { title: 'Último' })],
              next: null,
              facets: FACETS,
            }
          : { ok: true, total: 25, items: many, next: '24', facets: FACETS },
    })
    await screen.findByRole('list', { name: 'Library items' })
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    expect(await screen.findByRole('button', { name: 'Open Último' })).toBeTruthy()
    expect(asked(transport, 'clube.library.search').at(-1)?.params).toMatchObject({ cursor: '24' })
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull()
  })

  it('shows a cover fetched through the server, none straight from the Clube', async () => {
    const { transport } = open()
    const first = await screen.findByRole('button', { name: 'Open Marca pulsante' })
    await waitFor(() =>
      expect(first.querySelector('img')?.getAttribute('src')).toBe('blob:image/png'),
    )
    expect(asked(transport, 'clube.library.media').length).toBeGreaterThan(0)
    expect(
      asked(transport, 'clube.library.media').every((entry) =>
        (entry.params as { url: string }).url.startsWith('http://clube.test/media/'),
      ),
    ).toBe(true)
  })

  it('leaves a placeholder, never a broken image, when a cover does not load', async () => {
    const { transport } = open({ media: () => failure('unreachable') })
    const card = await screen.findByRole('button', { name: 'Open Marca pulsante' })
    await waitFor(() => expect(asked(transport, 'clube.library.media').length).toBeGreaterThan(0))
    expect(card.querySelector('img')).toBeNull()
    expect(card.querySelector('.clube-thumb svg')).toBeTruthy()
  })
})

describe('the Clube tab: the day limits', () => {
  it('shows files, sounds and reference credits at the foot', async () => {
    open({
      limits: {
        ok: true,
        files: { used: 12, limit: 60 },
        sounds: { used: 3, limit: 200 },
        references: { used: 1, limit: 300 },
        unlimited: false,
      },
    })
    const list = await screen.findByRole('list', { name: 'Limits of your account' })
    expect(list.textContent).toBe('Files 12/60Sounds 3/200Credits 1/300')
  })

  it('says there is no limit when the account has none, instead of a count', async () => {
    open({ limits: { ok: true, unlimited: true } })
    expect(await screen.findByText('No limit on this account')).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Limits of your account' })).toBeNull()
  })

  it('hides them when the Clube does not have the route, and the tab keeps working', async () => {
    const { transport } = open({ limits: { ok: false, reason: 'unavailable' } })
    await screen.findByRole('list', { name: 'Library items' })
    await waitFor(() => expect(asked(transport, 'clube.library.limits')).toHaveLength(1))
    expect(screen.queryByRole('list', { name: 'Limits of your account' })).toBeNull()
    expect(screen.queryByText(/Files \d/)).toBeNull()
  })
})

describe('the Clube tab: an item opened', () => {
  it('fetches no record ahead: a search opens nothing', async () => {
    const { transport } = open()
    await screen.findByRole('list', { name: 'Library items' })
    expect(asked(transport, 'clube.library.item')).toHaveLength(0)
  })

  it('opens an animation on request with its analysis, the aspects that are not null and the prompt', async () => {
    const { transport } = open({
      item: () => ({
        ok: true,
        record: record(ITEMS[0]!, {
          analysis: '## Movimento\n\nA marca pulsa.',
          aspects: {
            animation: 'Mola curta.',
            colors: 'Duas cores.',
            typography: undefined,
            transition: undefined,
            sound: undefined,
          },
          prompt: 'Faça o logotipo pulsar.',
          parts: PARTS,
        }),
      }),
    })
    await openItem('Marca pulsante')
    expect(await screen.findByTestId('markdown')).toBeTruthy()
    expect(screen.getByTestId('markdown').textContent).toContain('A marca pulsa.')
    expect(asked(transport, 'clube.library.item')).toHaveLength(1)
    expect(asked(transport, 'clube.library.item')[0]!.params).toEqual({
      id: 'animacao/a1',
      threadId: 'chat-1',
    })
    expect(screen.getByRole('heading', { name: 'Animation', level: 3 })).toBeTruthy()
    expect(screen.getByText('Mola curta.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Colors' })).toBeTruthy()
    // Aspects that are null are not shown.
    expect(screen.queryByRole('heading', { name: 'Typography' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Sound' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Copy the prompt' }))
    expect(writeText).toHaveBeenCalledWith('Faça o logotipo pulsar.')
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy()
  })

  it('links the item page and goes back to the list where it was', async () => {
    open({ item: () => ({ ok: true, record: record(ITEMS[0]!, { parts: PARTS }) }) })
    await openItem('Marca pulsante')
    const page = await screen.findByRole('link', { name: 'Open on the Clube' })
    expect(page.getAttribute('href')).toBe('http://clube.test/animacoes/a1')
    expect(page.getAttribute('target')).toBe('_blank')
    expect(page.getAttribute('rel')).toContain('noopener')
    fireEvent.click(screen.getByRole('button', { name: 'Back to the library' }))
    expect(screen.getByRole('list', { name: 'Library items' })).toBeTruthy()
  })

  it('plays an animation preview only when asked, through the server', async () => {
    const { transport } = open({
      media: () => ({ ok: true, mime: 'video/mp4', data: btoa('mp4') }),
    })
    await openItem('Marca pulsante')
    await waitFor(() => expect(asked(transport, 'clube.library.item')).toHaveLength(1))
    expect(document.querySelector('video')).toBeNull()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Play the preview of Marca pulsante' }),
    )
    await waitFor(() =>
      expect(document.querySelector('video')?.getAttribute('src')).toBe('blob:video/mp4'),
    )
    expect(
      asked(transport, 'clube.library.media').some((entry) =>
        (entry.params as { url: string }).url.endsWith('.mp4'),
      ),
    ).toBe(true)
  })

  it('says a preview did not load, and leaves the cover', async () => {
    open({ media: () => failure('unreachable') })
    await openItem('Marca pulsante')
    fireEvent.click(
      await screen.findByRole('button', { name: 'Play the preview of Marca pulsante' }),
    )
    expect(await screen.findByText('The preview did not load.')).toBeTruthy()
    expect(document.querySelector('video')).toBeNull()
  })

  it('says why an item could not be opened, with a way to try again', async () => {
    let fails = true
    open({
      item: () => (fails ? failure('not-found') : { ok: true, record: record(ITEMS[3]!) }),
    })
    await openItem('Ritmo de corte')
    expect(await screen.findByText('The Clube no longer has this item.')).toBeTruthy()
    fails = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByTestId('markdown')).toBeTruthy()
  })
})

describe('a reference spends a credit', () => {
  it('says so before opening, opens nothing until the person agrees, and shows the credits after', async () => {
    const { transport } = open({
      item: () => ({
        ok: true,
        record: record(ITEMS[2]!, { credits: { used: 7, of: 300, period: '30 dias' } }),
      }),
    })
    await openItem('Referência de teste')
    expect(screen.getByText('Opening a reference may spend a credit')).toBeTruthy()
    expect(asked(transport, 'clube.library.item')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.getByRole('list', { name: 'Library items' })).toBeTruthy()
    expect(asked(transport, 'clube.library.item')).toHaveLength(0)

    await openItem('Referência de teste')
    fireEvent.click(screen.getByRole('button', { name: 'Open the reference' }))
    expect(await screen.findByText('You have used 7 of 300 reference credits.')).toBeTruthy()
    expect(asked(transport, 'clube.library.item')).toHaveLength(1)
    // The credit moved, so the foot asks the limits again.
    await waitFor(() =>
      expect(asked(transport, 'clube.library.limits').length).toBeGreaterThanOrEqual(2),
    )
  })

  it('sends the reference as one Markdown file, through the server, and attaches that file', async () => {
    const { transport } = open()
    await openItem('Referência de teste')
    fireEvent.click(screen.getByRole('button', { name: 'Open the reference' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Send to the chat' }))
    expect(await screen.findByRole('button', { name: 'In the chat' })).toBeTruthy()
    expect(asked(transport, 'clube.library.exportText')[0]!.params).toEqual({
      threadId: 'chat-1',
      id: 'referencia/r1',
    })
    expect(attach).toHaveBeenCalledWith([
      { path: 'C:\\p\\clube\\referencias\\r1.md', name: 'r1.md' },
    ])
  })

  it('says the Clube sentence when it refuses, and says it was not attached when there is no prompt box', async () => {
    open({ export: () => failure('daily-limit') })
    await openItem('Referência de teste')
    fireEvent.click(screen.getByRole('button', { name: 'Open the reference' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Send to the chat' }))
    expect(
      await screen.findByText(
        'The limit of files for the day is reached. Files free up gradually over the next 24 hours.',
      ),
    ).toBeTruthy()
    cleanup()
    attach.mockReturnValue(false)
    open()
    await openItem('Referência de teste')
    fireEvent.click(screen.getByRole('button', { name: 'Open the reference' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Send to the chat' }))
    expect(await screen.findByText('It could not be attached to the chat.')).toBeTruthy()
  })
})

describe('a project: the parts and the download', () => {
  const projectRecord = () => ({ ok: true, record: record(ITEMS[1]!, { parts: PARTS }) })

  it('lists every part marked with its size, and totals what will be fetched and what will count', async () => {
    open({ item: projectRecord })
    await openItem('Anúncio de teste')
    const boxes = await screen.findAllByRole('checkbox')
    expect(boxes).toHaveLength(3)
    expect(boxes.every((box) => (box as HTMLInputElement).checked)).toBe(true)
    expect(screen.getByText('40 MB')).toBeTruthy()
    expect(screen.getByText('Already in the project')).toBeTruthy()
    // The part already on disk fetches nothing and counts nothing.
    expect(screen.getByText('40 MB in total · 2 files will count in the day’s limit.')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include projeto' }))
    expect(screen.getByText('0.1 MB in total · 1 file will count in the day’s limit.')).toBeTruthy()
    expect(screen.getByText('Goes to clube/projetos/p1/')).toBeTruthy()
  })

  it('says everything is already there when only parts on disk are chosen', async () => {
    open({ item: projectRecord })
    await openItem('Anúncio de teste')
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Include guia' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include projeto' }))
    expect(screen.getByText('Everything chosen is already in the project.')).toBeTruthy()
  })

  it('downloads the parts chosen, shows the progress, then the folder with open and send', async () => {
    const { transport } = open({
      item: projectRecord,
      jobs: [
        job({ state: 'queued' }),
        job({ file: 'projeto.zip', receivedBytes: 10 * 1024 * 1024, totalBytes: 40 * 1024 * 1024 }),
        job({
          state: 'done',
          filesDone: 2,
          filesTotal: 2,
          receivedBytes: 40 * 1024 * 1024,
          totalBytes: 40 * 1024 * 1024,
          result: { folder: 'C:\\p\\clube\\projetos\\p1', files: 5, bytes: 4, reusedParts: 1 },
        }),
      ],
    })
    await openItem('Anúncio de teste')
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Include guia' }))
    fireEvent.click(screen.getByRole('button', { name: 'Download into the project' }))
    await waitFor(() => expect(asked(transport, 'clube.library.download')).toHaveLength(1))
    expect(asked(transport, 'clube.library.download')[0]!.params).toEqual({
      threadId: 'chat-1',
      id: 'projeto/p1',
      parts: ['projeto', 'render'],
    })
    expect(await screen.findByText('Downloading projeto.zip')).toBeTruthy()
    expect(screen.getByText('10 of 40 MB')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Download progress' })).toBeTruthy()
    expect(
      await screen.findByText(/Downloaded to clube\/projetos\/p1\//, undefined, { timeout: 4000 }),
    ).toBeTruthy()
    expect(screen.getByText(/5 files written\./)).toBeTruthy()
    // The parts that finished now read as already in the project.
    expect(screen.getAllByText('Already in the project').length).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: 'Send to the chat' }))
    expect(attach).toHaveBeenCalledWith([{ path: 'C:\\p\\clube\\projetos\\p1', name: 'p1' }])
    expect(await screen.findByRole('button', { name: 'In the chat' })).toBeTruthy()
    await waitFor(() =>
      expect(asked(transport, 'clube.library.signal').at(-1)?.params).toEqual({
        id: 'projeto/p1',
        signal: 'used',
      }),
    )
    // After the download the foot asks the limits again.
    expect(asked(transport, 'clube.library.limits').length).toBeGreaterThanOrEqual(2)
  })

  it('cancels a download in progress', async () => {
    const { transport } = open({
      item: projectRecord,
      jobs: [job({ file: 'projeto.zip', totalBytes: 40 * 1024 * 1024 })],
    })
    await openItem('Anúncio de teste')
    fireEvent.click(await screen.findByRole('button', { name: 'Download into the project' }))
    const cancel = await screen.findByRole('button', { name: 'Cancel' })
    await waitFor(() => expect((cancel as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(cancel)
    await waitFor(() =>
      expect(asked(transport, 'clube.library.cancel')[0]?.params).toEqual({ jobId: 'job-1' }),
    )
  })

  it('says a cancelled download kept the parts that finished', async () => {
    open({ item: projectRecord, jobs: [job({ state: 'cancelled' })] })
    await openItem('Anúncio de teste')
    fireEvent.click(await screen.findByRole('button', { name: 'Download into the project' }))
    expect(
      await screen.findByText('The download was cancelled. Parts that had finished are kept.'),
    ).toBeTruthy()
  })

  it('says the day limit as a sentence, and the Clube own sentence in Portuguese', async () => {
    const limited = failure('daily-limit', { message: 'Você chegou ao limite de 60 arquivos.' })
    open({ item: projectRecord, download: () => limited })
    await openItem('Anúncio de teste')
    fireEvent.click(await screen.findByRole('button', { name: 'Download into the project' }))
    expect(
      await screen.findByText(
        'The limit of files for the day is reached. Files free up gradually over the next 24 hours.',
      ),
    ).toBeTruthy()
    cleanup()
    setLanguage('pt-BR', { persist: false })
    open({ item: projectRecord, download: () => limited })
    await openItem('Anúncio de teste')
    fireEvent.click(await screen.findByRole('button', { name: 'Baixar para o projeto' }))
    expect(await screen.findByText('Você chegou ao limite de 60 arquivos.')).toBeTruthy()
  })

  it('says a failed job did not finish and why', async () => {
    open({
      item: projectRecord,
      jobs: [job({ state: 'failed', failure: failure('unsafe') })],
    })
    await openItem('Anúncio de teste')
    fireEvent.click(await screen.findByRole('button', { name: 'Download into the project' }))
    expect(
      await screen.findByText('A file asked to go somewhere it must not, so nothing was kept.'),
    ).toBeTruthy()
  })

  it('does not offer to download without a chat', async () => {
    open({ item: projectRecord }, { threadId: undefined })
    await openItem('Anúncio de teste')
    const button = await screen.findByRole('button', { name: 'Download into the project' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getAllByText('Open a chat to download into its project.').length).toBeGreaterThan(
      0,
    )
  })

  it('says when the Clube listed no files', async () => {
    open({ item: () => ({ ok: true, record: record(ITEMS[1]!, { parts: [] }) }) })
    await openItem('Anúncio de teste')
    expect(await screen.findByText('The Clube listed no files for this item.')).toBeTruthy()
  })

  it('downloads an animation under its own folder', async () => {
    open({
      item: () => ({ ok: true, record: record(ITEMS[0]!, { parts: PARTS.slice(0, 2) }) }),
    })
    await openItem('Marca pulsante')
    expect(await screen.findByText('Goes to clube/animacoes/a1/')).toBeTruthy()
  })
})

describe('a skill', () => {
  it('shows the SKILL.md without its front matter, and no empty frame where a cover would be', async () => {
    open({
      item: () => ({
        ok: true,
        record: record(ITEMS[3]!, {
          analysis: '---\nname: ritmo\ndescription: x\n---\n\n# Ritmo\n\nCorpo.',
        }),
      }),
    })
    await openItem('Ritmo de corte')
    const markdown = await screen.findByTestId('markdown')
    expect(markdown.textContent).toBe('# Ritmo\n\nCorpo.')
    expect(document.querySelector('.clube-record__media')).toBeNull()
  })

  it('installs once, says where it loads, and keeps the installed state', async () => {
    const { transport } = open()
    await openItem('Ritmo de corte')
    fireEvent.click(await screen.findByRole('button', { name: 'Install the skill' }))
    expect(await screen.findByText('It loads in Motion chats.')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Installed for every project and provider.' }),
    ).toBeTruthy()
    expect(asked(transport, 'clube.library.installSkill')[0]!.params).toEqual({
      threadId: 'chat-1',
      id: 'skill/s1',
    })
    expect(screen.getByText(/It stays when you disconnect the account/)).toBeTruthy()
  })

  it('says a text skill loads in every chat', async () => {
    open({ install: () => ({ ok: true, name: 'Tom de voz', category: 'general' }) })
    await openItem('Ritmo de corte')
    fireEvent.click(await screen.findByRole('button', { name: 'Install the skill' }))
    expect(await screen.findByText('It loads in every chat.')).toBeTruthy()
  })

  it('says why it did not install and lets the person try again', async () => {
    open({ install: () => failure('daily-limit') })
    await openItem('Ritmo de corte')
    fireEvent.click(await screen.findByRole('button', { name: 'Install the skill' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Install the skill' }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })
})

describe('music', () => {
  const musicRecord = () => ({
    ok: true,
    record: record(ITEMS[4]!, {
      music: {
        previews: {
          full: 'http://clube.test/media/previa/m1-completa.mp3',
          instrumental: 'http://clube.test/media/previa/m1-instrumental.mp3',
          vocal: 'http://clube.test/media/previa/m1-vocal.mp3',
        },
        bpm: 84,
        key: 'Am',
        genre: 'cinematic',
        moods: ['tenso'],
      },
    }),
  })

  it('offers the three previews, one at a time, through the server', async () => {
    const { transport } = open({
      item: musicRecord,
      media: () => ({ ok: true, mime: 'audio/mpeg', data: btoa('ID3') }),
    })
    await openItem('Maré lenta')
    expect(await screen.findByText('Am · 84 BPM · cinematic · tenso · 2:00')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Play the Instrumental preview' }))
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1))
    expect(
      asked(transport, 'clube.library.media').some((entry) =>
        (entry.params as { url: string }).url.endsWith('m1-instrumental.mp3'),
      ),
    ).toBe(true)
    expect(
      await screen.findByRole('button', { name: 'Pause the Instrumental preview' }),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Play the Vocal preview' }))
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('button', { name: 'Play the Instrumental preview' })).toBeTruthy()
  })

  it('sends the track by the road of the Sounds tab, with the id after the slash', async () => {
    const { transport } = open({ item: musicRecord })
    await openItem('Maré lenta')
    fireEvent.click(await screen.findByRole('button', { name: 'Send the track to the chat' }))
    expect(await screen.findByRole('button', { name: 'In the chat' })).toBeTruthy()
    expect(asked(transport, 'sounds.use')[0]!.params).toEqual({
      threadId: 'chat-1',
      shelf: 'music',
      id: 'm1',
    })
    expect(attach).toHaveBeenCalledWith([
      { path: 'C:\\p\\audio\\clube\\Mare lenta\\completa.wav', name: 'completa.wav' },
    ])
  })

  it('says the music limit when it is reached', async () => {
    open({
      item: musicRecord,
      soundsUse: () => ({
        ok: false,
        reason: 'daily-limit',
        message: 'Limite de 60 arquivos por dia atingido.',
      }),
    })
    await openItem('Maré lenta')
    fireEvent.click(await screen.findByRole('button', { name: 'Send the track to the chat' }))
    expect(
      await screen.findByText(
        'The limit of files for the day is reached. Files free up gradually over the next 24 hours.',
      ),
    ).toBeTruthy()
  })
})

describe('hiding an item', () => {
  it('asks first, says it is for good, and drops the item from the list', async () => {
    const { transport } = open()
    await openItem('Ritmo de corte')
    fireEvent.click(await screen.findByRole('button', { name: 'Don’t show this again' }))
    expect(
      screen.getByText(/hidden from every search of your Clube account, for good/),
    ).toBeTruthy()
    expect(asked(transport, 'clube.library.signal')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(asked(transport, 'clube.library.signal')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Don’t show this again' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hide for good' }))
    await waitFor(() =>
      expect(asked(transport, 'clube.library.signal')[0]!.params).toEqual({
        id: 'skill/s1',
        signal: 'hide',
      }),
    )
    expect(await screen.findByRole('list', { name: 'Library items' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open Ritmo de corte' })).toBeNull()
  })

  it('says it was not hidden when the Clube refuses', async () => {
    open({ signal: () => failure('refused') })
    await openItem('Ritmo de corte')
    fireEvent.click(await screen.findByRole('button', { name: 'Don’t show this again' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hide for good' }))
    expect(await screen.findByText('The Clube did not hide it. Try again.')).toBeTruthy()
  })
})

describe('the Clube tab in Portuguese', () => {
  beforeEach(() => setLanguage('pt-BR', { persist: false }))

  it('words the states', async () => {
    open({ clube: { state: 'disconnected' } })
    expect(await screen.findByText('Conecte sua conta do Clube do Motion')).toBeTruthy()
    expect(screen.getByText(/A biblioteca do Clube abre aqui/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Abrir os ajustes do Clube' })).toBeTruthy()
    cleanup()
    open({ search: () => failure('unreachable') })
    expect(await screen.findByText('A biblioteca não respondeu')).toBeTruthy()
    expect(screen.getByText('Confira sua conexão e tente de novo.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
    cleanup()
    open({
      clube: {
        state: 'connected',
        account: { name: 'P', email: 'p@example.test', plan: 'grátis' },
        subscriber: false,
      },
    })
    expect(await screen.findByText('A biblioteca é para assinantes')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ver os planos' })).toBeTruthy()
    cleanup()
    open({ search: () => ({ ok: true, total: 0, items: [], next: null, facets: FACETS }) })
    expect(await screen.findByText('Nada encontrado')).toBeTruthy()
    expect(screen.getByText('Tente outra palavra ou limpe os filtros.')).toBeTruthy()
  })

  it('words the list, the filters, the cards and the limits', async () => {
    open(
      {
        limits: {
          ok: true,
          files: { used: 12, limit: 60 },
          sounds: { used: 3, limit: 200 },
          references: { used: 1, limit: 300 },
          unlimited: false,
        },
      },
      { threadId: undefined },
    )
    const list = await screen.findByRole('list', { name: 'Itens da biblioteca' })
    expect(within(list).getAllByRole('listitem')[0]!.textContent).toContain(
      'Animação · 16:9 · 0:12',
    )
    expect(screen.getByRole('textbox', { name: 'Buscar na biblioteca do Clube' })).toBeTruthy()
    for (const name of ['Tipo', 'Estilo', 'Ferramenta', 'Formato']) {
      expect(screen.getByRole('combobox', { name })).toBeTruthy()
    }
    expect(screen.getByText('5 resultados')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Abrir Marca pulsante' })).toBeTruthy()
    expect(await screen.findByRole('list', { name: 'Limites da sua conta' })).toBeTruthy()
    expect(screen.getByText('Arquivos 12/60')).toBeTruthy()
    expect(screen.getByText('Sons 3/200')).toBeTruthy()
    expect(screen.getByText('Créditos 1/300')).toBeTruthy()
    expect(screen.getByText('Abra um chat para baixar na pasta do projeto dele.')).toBeTruthy()
    cleanup()
    open({ limits: { ok: true, unlimited: true } })
    expect(await screen.findByText('Sem limite nesta conta')).toBeTruthy()
  })

  it('words a project record: the parts, the download, the progress and the result', async () => {
    open({
      item: () => ({
        ok: true,
        record: record(ITEMS[1]!, {
          parts: PARTS,
          prompt: 'Monte.',
          aspects: {
            animation: 'a',
            colors: 'c',
            typography: 't',
            transition: 'x',
            sound: 's',
          },
        }),
      }),
      jobs: [
        job({ state: 'queued' }),
        job({ file: 'projeto.zip', receivedBytes: 1024 * 1024, totalBytes: 2 * 1024 * 1024 }),
        job({
          state: 'done',
          result: { folder: 'C:\\p\\clube\\projetos\\p1', files: 1, bytes: 1, reusedParts: 0 },
        }),
      ],
    })
    await openItem('Anúncio de teste')
    expect(await screen.findByRole('button', { name: 'Voltar à biblioteca' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Análise' })).toBeTruthy()
    for (const heading of [
      'Animação',
      'Cores',
      'Tipografia',
      'Transição',
      'Som',
      'Prompt',
      'O que baixar',
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeTruthy()
    }
    expect(screen.getByRole('button', { name: 'Copiar o prompt' })).toBeTruthy()
    expect(screen.getByText('Já está no projeto')).toBeTruthy()
    expect(screen.getByText('40 MB')).toBeTruthy()
    expect(
      screen.getByText('40 MB no total · 2 arquivos vão contar no limite do dia.'),
    ).toBeTruthy()
    expect(screen.getByText('Vai para clube/projetos/p1/')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Incluir guia' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Não mostrar mais' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Baixar para o projeto' }))
    expect(await screen.findByText('Esperando outro download…')).toBeTruthy()
    expect(await screen.findByText('Baixando projeto.zip')).toBeTruthy()
    expect(screen.getByText('1 de 2 MB')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Progresso do download' })).toBeTruthy()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Enviar ao chat' }, { timeout: 4000 }),
    )
    expect(screen.getByText(/Baixado em clube\/projetos\/p1\//)).toBeTruthy()
    expect(screen.getByText(/1 arquivo gravado\./)).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'No chat' })).toBeTruthy()
  })

  it('words a reference, a skill, a music record and the hiding', async () => {
    open()
    await openItem('Referência de teste')
    expect(screen.getByText('Abrir uma referência pode gastar um crédito')).toBeTruthy()
    expect(screen.getByText(/gasta um crédito de referência/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Abrir a referência' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Agora não' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }))
    cleanup()

    open({
      item: ({ id }) => ({
        ok: true,
        record: record(
          ITEMS.find((entry) => entry.id === id)!,
          {
            credits: { used: 2, of: 300 },
            music:
              id === 'musica/m1'
                ? {
                    previews: {
                      full: 'http://clube.test/m.mp3',
                      instrumental: 'http://clube.test/i.mp3',
                    },
                    moods: [],
                  }
                : undefined,
          },
        ),
      }),
    })
    await openItem('Ritmo de corte')
    expect(await screen.findByRole('heading', { name: 'A skill' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Instalar a skill' })).toBeTruthy()
    expect(screen.getByText(/Instalada uma vez para o app todo/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Instalar a skill' }))
    expect(await screen.findByText('Carrega nos chats Motion.')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Instalada para todos os projetos e provedores.' }),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Não mostrar mais' }))
    expect(
      screen.getByText(/O item some de todas as buscas da sua conta do Clube, para sempre/),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ocultar para sempre' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Manter' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar à biblioteca' }))

    await openItem('Maré lenta')
    expect(
      await screen.findByRole('button', { name: 'Tocar a prévia: Versão completa' }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tocar a prévia: Instrumental' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Enviar a música ao chat' })).toBeTruthy()
    expect(screen.getByText(/A música vai para audio\/clube no projeto/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar à biblioteca' }))

    await openItem('Marca pulsante')
    expect(
      await screen.findByRole('button', { name: 'Tocar a prévia de Marca pulsante' }),
    ).toBeTruthy()
  })

  it('words the text export of a reference', async () => {
    open()
    await openItem('Referência de teste')
    fireEvent.click(screen.getByRole('button', { name: 'Abrir a referência' }))
    expect(
      await screen.findByText(/A análise e o prompt ficam salvos em um arquivo Markdown/),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar ao chat' }))
    expect(await screen.findByRole('button', { name: 'No chat' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Abrir no Clube' }).tagName).toBe('A')
  })
})
