// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ClubeStatus,
  SoundFacetsResult,
  SoundFailure,
  SoundItem,
  SoundSearchResult,
  SoundUseResult,
} from '@harness/contracts'
import { CLUBE_PLANS_URL } from '@harness/contracts'
import { setLanguage } from '../../i18n/index.js'
import { TestTransport } from '../../test-transport.js'
import { registerComposerAttacher, reportComposerAttachments } from '../../composer-attach.js'
import { WorkspaceSounds } from './WorkspaceSounds.js'

const attach = vi.hoisted(() => vi.fn((_files: Array<{ path: string }>) => true))
vi.mock('../../composer-attach.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composer-attach.js')>()),
  attachToComposer: attach,
}))
// The prompt box: what it was handed it reports holding, as the composer does, until a test lets go.
const promptBox = () => undefined
let leaveBox = () => {}
vi.mock('../../bridge.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../bridge.js')>()),
  isDesktop: false,
}))

const play = vi.fn(() => Promise.resolve())
const pause = vi.fn()

beforeEach(() => {
  leaveBox = registerComposerAttacher(promptBox)
  attach.mockClear()
  attach.mockImplementation((files) => {
    reportComposerAttachments(
      promptBox,
      files.map((file) => file.path),
    )
    return true
  })
  play.mockClear()
  pause.mockClear()
  Object.assign(HTMLMediaElement.prototype, { play, pause })
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  cleanup()
  leaveBox()
})

const connected: ClubeStatus = {
  state: 'connected',
  account: { name: 'Pessoa', email: 'pessoa@example.test', plan: 'mensal' },
  subscriber: true,
}

const tonal = (id: string, name: string, extra: Partial<SoundItem> = {}): SoundItem => ({
  id,
  name,
  shelf: 'sound',
  type: 'tonal',
  durationS: 42,
  ...extra,
})
const SOUNDS: SoundItem[] = [
  tonal('101', 'Cello drone', { key: 'A', mode: 'menor', category: 'Drones' }),
  tonal('102', 'Piano loop', { key: 'C', mode: 'maior', category: 'Loops', durationS: 16 }),
]
const TRACKS: SoundItem[] = [
  {
    id: 'm1',
    name: 'Slow burn',
    shelf: 'music',
    key: 'Am',
    bpm: 84,
    durationS: 128,
    artist: 'Artista Um',
    category: 'Cinematic',
  },
]

const TRILHAS: SoundItem[] = [
  {
    id: '201',
    name: 'Quiet morning',
    shelf: 'sound',
    type: 'trilha',
    key: 'D',
    mode: 'maior',
    bpm: 72,
    durationS: 150,
    category: 'Ambient',
    estimated: true,
  },
]

const FACETS: SoundFacetsResult = {
  ok: true,
  total: 3,
  categories: [
    { type: 'tonal', category: 'Drones', total: 1 },
    { type: 'tonal', category: 'Loops', total: 1 },
    { type: 'efeito', category: 'Whoosh', total: 1 },
    { type: 'trilha', category: 'Ambient', total: 1 },
  ],
  keys: ['A', 'C', 'D'],
  daily: { used: 12, limit: 200 },
}

type Answers = {
  clube?: ClubeStatus | 'fail'
  search?: (params: Record<string, unknown>) => SoundSearchResult | Promise<SoundSearchResult>
  use?: () => SoundUseResult
  preview?: () => unknown
}

function open(answers: Answers = {}, props: Partial<Parameters<typeof WorkspaceSounds>[0]> = {}) {
  const transport = new TestTransport(async (method, params) => {
    switch (method) {
      case 'clube.status':
        if (answers.clube === 'fail') throw new Error('down')
        return answers.clube ?? connected
      case 'sounds.facets':
        return FACETS
      case 'sounds.search': {
        const request = params as Record<string, unknown>
        if (answers.search) return answers.search(request)
        const items =
          request['shelf'] === 'music' ? TRACKS : request['type'] === 'trilha' ? TRILHAS : SOUNDS
        return {
          ok: true,
          total: items.length,
          offset: 0,
          items,
          daily: { used: 12, limit: 200 },
          ...(request['shelf'] === 'music'
            ? { available: { category: ['Cinematic'], mood: [], key: ['Am'], artist: [] } }
            : {}),
        }
      }
      case 'sounds.preview':
        return answers.preview?.() ?? { ok: true, mime: 'audio/ogg', data: btoa('OggS') }
      case 'sounds.use':
        return (
          answers.use?.() ?? {
            ok: true,
            sound: {
              path: 'C:\\p\\audio\\clube\\Cello drone.flac',
              name: 'Cello drone.flac',
              format: 'flac',
              reused: false,
              files: [
                { version: 'file', path: 'C:\\p\\audio\\clube\\Cello drone.flac', format: 'flac' },
              ],
            },
            daily: { used: 13, limit: 200 },
          }
        )
      default:
        throw new Error(`unexpected ${method}`)
    }
  })
  const onOpenClubeSettings = vi.fn()
  render(
    <WorkspaceSounds
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

const failure = (
  reason: SoundFailure['reason'],
  extra: Partial<SoundFailure> = {},
): SoundFailure => ({
  ok: false,
  reason,
  ...extra,
})

describe('the Sounds tab: the state of the account', () => {
  it('waits for the link, with a status line', () => {
    open({ clube: connected })
    expect(screen.getByText('Loading the sounds…')).toBeTruthy()
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
    const plans = screen.getByRole('link', { name: 'See the plans' })
    expect(plans.getAttribute('href')).toBe(CLUBE_PLANS_URL)
  })

  it('says the library did not answer when the server cannot be read', async () => {
    open({ clube: 'fail' })
    expect(await screen.findByText('The library did not answer')).toBeTruthy()
  })

  it('follows a search the server refused for a link that changed', async () => {
    open({ search: () => failure('no-subscription') })
    expect(await screen.findByText('The library is for subscribers')).toBeTruthy()
  })
})

describe('the Sounds tab: the library', () => {
  it('lists the sounds with key, mode and length, and what is left of the day', async () => {
    open()
    const list = await screen.findByRole('list', { name: 'Sounds' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.textContent).toContain('Cello drone')
    expect(rows[0]!.textContent).toContain('A minor · 0:42 · Drones')
    expect(screen.getByText('2 results')).toBeTruthy()
    expect(screen.getByText('188 of 200 files left in 24 h')).toBeTruthy()
  })

  it('has three tabs, and under Music two sources: soundtracks first, then the Clube music', async () => {
    const { transport } = open()
    await screen.findByRole('list', { name: 'Sounds' })
    const last = () =>
      transport.requests.filter((entry) => entry.method === 'sounds.search').at(-1)?.params
    fireEvent.click(screen.getByRole('radio', { name: 'Music' }))
    // Soundtracks are sounds of the library, and their key and BPM are estimates.
    const trilha = await screen.findByText('Quiet morning')
    expect(trilha.closest('.sounds-row')!.textContent).toContain(
      'D major · 72 BPM · estimated · 2:30',
    )
    expect(last()).toMatchObject({ shelf: 'sound', type: 'trilha' })
    expect(screen.getByRole('combobox', { name: 'Genre' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Key' })).toBeTruthy()
    expect(screen.getByRole('spinbutton', { name: 'BPM min' })).toBeTruthy()
    expect(screen.getByRole('spinbutton', { name: 'BPM max' })).toBeTruthy()

    fireEvent.click(screen.getByRole('radio', { name: 'Clube music' }))
    const row = await screen.findByText('Slow burn')
    // A Clube track's key and BPM are catalogued, so nothing says "estimated".
    const detail = row.closest('.sounds-row')!.textContent!
    expect(detail).toContain('Am · 84 BPM · 2:08')
    expect(detail).not.toContain('estimated')
    expect(last()).toMatchObject({ shelf: 'music' })
    expect(screen.getByText('188 of 200 tracks left in 24 h')).toBeTruthy()

    fireEvent.click(screen.getByRole('radio', { name: 'Effects' }))
    await waitFor(() => expect(last()).toMatchObject({ shelf: 'sound', type: 'efeito' }))
    // Effects have no key and no tempo to filter by.
    expect(screen.queryByRole('combobox', { name: 'Key' })).toBeNull()
    expect(screen.queryByRole('spinbutton', { name: 'BPM min' })).toBeNull()
  })

  it('filters soundtracks by a BPM range, after the short pause', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const { transport } = open()
      await screen.findByRole('list', { name: 'Sounds' })
      fireEvent.click(screen.getByRole('radio', { name: 'Music' }))
      await screen.findByText('Quiet morning')
      fireEvent.change(screen.getByRole('spinbutton', { name: 'BPM min' }), {
        target: { value: '100' },
      })
      fireEvent.change(screen.getByRole('spinbutton', { name: 'BPM max' }), {
        target: { value: '130' },
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400)
      })
      await waitFor(() =>
        expect(
          transport.requests.filter((entry) => entry.method === 'sounds.search').at(-1)?.params,
        ).toMatchObject({ shelf: 'sound', type: 'trilha', bpmMin: 100, bpmMax: 130 }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('narrows by the words, after a short pause, and by a category and a key from the facets', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const { transport } = open()
      await screen.findByRole('list', { name: 'Sounds' })
      fireEvent.change(screen.getByRole('textbox', { name: 'Search the sound library' }), {
        target: { value: 'cello' },
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400)
      })
      await waitFor(() =>
        expect(
          transport.requests.filter((entry) => entry.method === 'sounds.search').at(-1)?.params,
        ).toMatchObject({ query: 'cello', type: 'tonal' }),
      )
      expect(screen.getByRole('combobox', { name: 'Category' })).toBeTruthy()
      expect(screen.getByRole('combobox', { name: 'Key' })).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('says when nothing matches, and when the library fails, with a way to try again', async () => {
    let fails = true
    open({
      search: () =>
        fails
          ? failure('unreachable')
          : { ok: true, total: 0, offset: 0, items: [], daily: { used: 0, limit: 200 } },
    })
    expect(await screen.findByText('The library did not answer')).toBeTruthy()
    fails = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No sounds found')).toBeTruthy()
    expect(screen.getByText('Try another word or clear the filters.')).toBeTruthy()
  })

  it('plays a preview through the server, one at a time, and pauses it', async () => {
    const { transport } = open()
    await screen.findByRole('list', { name: 'Sounds' })
    fireEvent.click(screen.getByRole('button', { name: 'Play the preview of Cello drone' }))
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1))
    expect(transport.requests.find((entry) => entry.method === 'sounds.preview')?.params).toEqual({
      shelf: 'sound',
      id: '101',
    })
    expect(
      await screen.findByRole('button', { name: 'Pause the preview of Cello drone' }),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Pause the preview of Cello drone' }))
    expect(pause).toHaveBeenCalled()
    // The same preview again asks nothing.
    fireEvent.click(screen.getByRole('button', { name: 'Play the preview of Cello drone' }))
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2))
    expect(transport.requests.filter((entry) => entry.method === 'sounds.preview')).toHaveLength(1)
  })

  it('says a preview did not load', async () => {
    open({ preview: () => failure('unreachable') })
    await screen.findByRole('list', { name: 'Sounds' })
    fireEvent.click(screen.getByRole('button', { name: 'Play the preview of Cello drone' }))
    expect(await screen.findByText('The preview did not load.')).toBeTruthy()
  })
})

describe('the Sounds tab: sending a sound to the chat', () => {
  it('reads "in the chat" only while the prompt box holds the sound, and sends it again after', async () => {
    open()
    await screen.findByRole('list', { name: 'Sounds' })
    const send = () => screen.getByRole('button', { name: 'Send Cello drone to the chat' })
    fireEvent.click(send())
    expect(await screen.findByText('In the chat')).toBeTruthy()
    // Held: the row cannot send it a second time.
    expect((send() as HTMLButtonElement).disabled).toBe(true)

    // The message went out (or the chip was removed): the box lets go of the file.
    act(() => reportComposerAttachments(promptBox, []))
    expect(screen.queryByText('In the chat')).toBeNull()
    expect((send() as HTMLButtonElement).disabled).toBe(false)
    expect(send().textContent).toBe('Send')

    fireEvent.click(send())
    await waitFor(() => expect(attach).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('In the chat')).toBeTruthy()
  })

  it('keeps the mark while the box holds the sound among other files', async () => {
    open()
    await screen.findByRole('list', { name: 'Sounds' })
    fireEvent.click(screen.getByRole('button', { name: 'Send Cello drone to the chat' }))
    expect(await screen.findByText('In the chat')).toBeTruthy()
    act(() =>
      reportComposerAttachments(promptBox, [
        'C:\\p\\notes.txt',
        'C:\\p\\audio\\clube\\Cello drone.flac',
      ]),
    )
    expect(screen.getByText('In the chat')).toBeTruthy()
  })

  it("fetches it into the chat's project and puts it in the prompt box", async () => {
    const { transport } = open()
    await screen.findByRole('list', { name: 'Sounds' })
    fireEvent.click(screen.getByRole('button', { name: 'Send Cello drone to the chat' }))
    await waitFor(() => expect(attach).toHaveBeenCalledTimes(1))
    expect(transport.requests.find((entry) => entry.method === 'sounds.use')?.params).toEqual({
      threadId: 'chat-1',
      shelf: 'sound',
      id: '101',
    })
    expect(attach).toHaveBeenCalledWith([
      { path: 'C:\\p\\audio\\clube\\Cello drone.flac', name: 'Cello drone.flac' },
    ])
    expect(await screen.findByText('In the chat')).toBeTruthy()
    // The day's count follows what the server said.
    expect(screen.getByText('187 of 200 files left in 24 h')).toBeTruthy()
  })

  it('shows what is left and stops sending when the day is used up', async () => {
    open({
      search: () => ({
        ok: true,
        total: 2,
        offset: 0,
        items: SOUNDS,
        daily: { used: 200, limit: 200 },
      }),
    })
    expect(await screen.findByText('The file limit is reached')).toBeTruthy()
    expect(screen.getByText(/files free up gradually over the next 24 hours/)).toBeTruthy()
    expect(screen.getByText('0 of 200 files left in 24 h')).toBeTruthy()
    const send = screen.getByRole('button', {
      name: 'Send Cello drone to the chat',
    }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    // Previews still work.
    expect(screen.getByRole('button', { name: 'Play the preview of Cello drone' })).toBeTruthy()
  })

  it('learns the day ran out from the server when a send is refused', async () => {
    open({
      use: () =>
        failure('daily-limit', {
          daily: { used: 200, limit: 200 },
          message: 'Limite de 60 arquivos por dia atingido (60 hoje): o link volta amanha.',
        }),
    })
    await screen.findByRole('list', { name: 'Sounds' })
    fireEvent.click(screen.getByRole('button', { name: 'Send Cello drone to the chat' }))
    expect((await screen.findAllByText('The file limit is reached')).length).toBeGreaterThan(0)
    expect(attach).not.toHaveBeenCalled()
  })

  it('says why a send failed: damaged, per-minute limit, or the prompt box refusing', async () => {
    open({ use: () => failure('damaged') })
    await screen.findByRole('list', { name: 'Sounds' })
    fireEvent.click(screen.getByRole('button', { name: 'Send Cello drone to the chat' }))
    expect(
      await screen.findByText('The file arrived damaged and was not kept. Try again.'),
    ).toBeTruthy()
    cleanup()

    open({ use: () => failure('rate-limit', { retryAfterS: 17 }) })
    await screen.findByRole('list', { name: 'Sounds' })
    fireEvent.click(screen.getByRole('button', { name: 'Send Cello drone to the chat' }))
    expect(
      await screen.findByText('Too many searches in a row. Try again in 17 seconds.'),
    ).toBeTruthy()
    cleanup()

    attach.mockReturnValue(false)
    open()
    await screen.findByRole('list', { name: 'Sounds' })
    fireEvent.click(screen.getByRole('button', { name: 'Send Cello drone to the chat' }))
    expect(
      await screen.findByText(
        'The sound is in the project, but it could not be attached to the chat.',
      ),
    ).toBeTruthy()
  })

  it('needs a chat to send to', async () => {
    open({}, { threadId: undefined })
    await screen.findByRole('list', { name: 'Sounds' })
    expect(screen.getByText('Open a chat to send sounds.')).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Send Cello drone to the chat' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it('says the per-minute limit when a search is refused for it', async () => {
    open({ search: () => failure('rate-limit', { retryAfterS: 24 }) })
    expect(
      await screen.findByText('Too many searches in a row. Try again in 24 seconds.'),
    ).toBeTruthy()
  })
})

describe('the Sounds tab in Portuguese', () => {
  beforeEach(() => setLanguage('pt-BR', { persist: false }))

  it('words the account states', async () => {
    const connect = open({ clube: { state: 'disconnected' } })
    expect(await screen.findByText('Conecte sua conta do Clube do Motion')).toBeTruthy()
    expect(
      screen.getByText(/A biblioteca de sons do Clube abre aqui quando a conta está conectada/),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Abrir os ajustes do Clube' })).toBeTruthy()
    connect.transport.close()
    cleanup()

    open({
      clube: {
        state: 'connected',
        account: { name: 'P', email: 'p@example.test', plan: 'grátis' },
        subscriber: false,
      },
    })
    expect(await screen.findByText('A biblioteca é para assinantes')).toBeTruthy()
    expect(screen.getByText(/mas não tem assinatura/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ver os planos' })).toBeTruthy()
    cleanup()

    open({ clube: 'fail' })
    expect(await screen.findByText('A biblioteca não respondeu')).toBeTruthy()
    expect(screen.getByText('Confira sua conexão e tente de novo.')).toBeTruthy()
  })

  it('words the list, the filters, the rows and the day', async () => {
    open()
    const list = await screen.findByRole('list', { name: 'Sons' })
    expect(within(list).getAllByRole('listitem')[0]!.textContent).toContain(
      'A menor · 0:42 · Drones',
    )
    expect(screen.getByRole('radiogroup', { name: 'Tipo de som' })).toBeTruthy()
    for (const label of ['Tonais', 'Efeitos', 'Músicas']) {
      expect(screen.getByRole('radio', { name: label })).toBeTruthy()
    }
    expect(screen.getByPlaceholderText('Buscar por nome, instrumento ou função')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Buscar na biblioteca de sons' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Categoria' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Tom' })).toBeTruthy()
    expect(screen.getByText('2 resultados')).toBeTruthy()
    expect(screen.getByText('188 de 200 arquivos restantes em 24 h')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ouvir a prévia de Cello drone' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Enviar Cello drone ao chat' })).toBeTruthy()
    expect(screen.getAllByText('Enviar').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('radio', { name: 'Músicas' }))
    const trilha = await screen.findByText('Quiet morning')
    expect(trilha.closest('.sounds-row')!.textContent).toContain(
      'D maior · 72 BPM · estimado · 2:30',
    )
    expect(screen.getByRole('radiogroup', { name: 'Tipo de música' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Trilhas' })).toBeTruthy()
    expect(screen.getByPlaceholderText('Buscar por nome ou gênero')).toBeTruthy()
    expect(screen.getByRole('spinbutton', { name: 'BPM mín.' })).toBeTruthy()
    expect(screen.getByRole('spinbutton', { name: 'BPM máx.' })).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Músicas do Clube' }))
    const track = await screen.findByText('Slow burn')
    expect(track.closest('.sounds-row')!.textContent).toContain('Am · 84 BPM · 2:08')
    expect(screen.getByPlaceholderText('Buscar por título, artista ou clima')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Gênero' })).toBeTruthy()
    expect(screen.getByText('188 de 200 músicas restantes em 24 h')).toBeTruthy()
  })

  it('words the preview, the send and the day running out', async () => {
    open({ preview: () => failure('unreachable') })
    await screen.findByRole('list', { name: 'Sons' })
    fireEvent.click(screen.getByRole('button', { name: 'Ouvir a prévia de Cello drone' }))
    expect(await screen.findByText('A prévia não carregou.')).toBeTruthy()
    cleanup()

    open()
    await screen.findByRole('list', { name: 'Sons' })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar Cello drone ao chat' }))
    expect(await screen.findByText('No chat')).toBeTruthy()
    cleanup()

    open({ use: () => failure('damaged') })
    await screen.findByRole('list', { name: 'Sons' })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar Cello drone ao chat' }))
    expect(
      await screen.findByText('O arquivo chegou danificado e não foi guardado. Tente de novo.'),
    ).toBeTruthy()
    cleanup()

    attach.mockReturnValue(false)
    open()
    await screen.findByRole('list', { name: 'Sons' })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar Cello drone ao chat' }))
    expect(
      await screen.findByText('O som está no projeto, mas não foi possível anexá-lo ao chat.'),
    ).toBeTruthy()
    cleanup()

    open({ use: () => failure('rate-limit', { retryAfterS: 9 }) })
    await screen.findByRole('list', { name: 'Sons' })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar Cello drone ao chat' }))
    expect(
      await screen.findByText('Muitas buscas seguidas. Tente de novo em 9 segundos.'),
    ).toBeTruthy()
    cleanup()

    open({ use: () => failure('unreachable') })
    await screen.findByRole('list', { name: 'Sons' })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar Cello drone ao chat' }))
    expect(await screen.findByText('Não foi possível enviar o som.')).toBeTruthy()
    cleanup()

    open({}, { threadId: undefined })
    expect(await screen.findByText('Abra um chat para enviar sons.')).toBeTruthy()
    cleanup()

    open({
      search: () => ({
        ok: true,
        total: 2,
        offset: 0,
        items: SOUNDS,
        daily: { used: 200, limit: 200 },
      }),
    })
    expect(await screen.findByText('O limite de arquivos foi atingido')).toBeTruthy()
    expect(screen.getByText(/e os arquivos voltam aos poucos nas próximas 24 horas/)).toBeTruthy()
  })

  it('words the empty and failed lists, the minute limit and the loading line', async () => {
    open({
      search: () => ({ ok: true, total: 0, offset: 0, items: [], daily: { used: 0, limit: 200 } }),
    })
    expect(await screen.findByText('Nenhum som encontrado')).toBeTruthy()
    expect(screen.getByText('Tente outra palavra ou limpe os filtros.')).toBeTruthy()
    cleanup()

    open({ search: () => failure('unreachable') })
    expect(await screen.findByText('A biblioteca não respondeu')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
    cleanup()

    open({ search: () => failure('rate-limit') })
    expect(
      await screen.findByText('Muitas buscas seguidas. Tente de novo em um minuto.'),
    ).toBeTruthy()
    cleanup()

    open()
    expect(screen.getByText('Carregando os sons…')).toBeTruthy()
  })
})
