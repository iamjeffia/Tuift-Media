// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Profiler } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Item } from '@harness/contracts'
import { setLanguage } from '../i18n/index.js'
import { ThreadFrameStore } from '../thread-frame-store.js'
import { emptyThread, reduceDeltas, type ThreadState } from '../thread-store.js'
import { ComposerWorkStatus, type ComposerMotion } from '../ui/ComposerWorkStatus.js'

// The heads load lazily; a cold transform in a busy run must not eat the first test's wait.
beforeAll(async () => {
  await Promise.all([import('./MotionStrip.js'), import('./cast.js')])
}, 30_000)

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const NOW = 1_800_000_000_000
const ORDER = ['Zig', 'Moss', 'Bun', 'Pip', 'Cloud', 'Penny']

function item(id: string, fields: Partial<Item>): Item {
  return { id, turnId: 'turn-1', type: 'tool_call', status: 'started', createdAt: NOW, ...fields }
}

/** A running subagent row, named as the helper agents of the video team are. */
function helper(name: string, description = 'Frame by frame review'): Item {
  return item(`helper-${name}`, {
    subagent: { id: `helper-${name}`, name, description, state: 'running' },
  })
}

function store(running: boolean, items: Item[] = []) {
  return new ThreadFrameStore({
    ...emptyThread,
    items,
    running,
    ...(running ? { activeTurn: { id: 'turn-1', startedAt: NOW - 138_000 } } : {}),
  })
}

const team = (fields: Partial<ComposerMotion> = {}): ComposerMotion => ({
  mode: true,
  stage: 'review',
  ...fields,
})

/** The strip with its lazily loaded heads. */
async function strip(frameStore: ThreadFrameStore, motion?: ComposerMotion) {
  const view = render(<ComposerWorkStatus frameStore={frameStore} motion={motion} />)
  if (motion?.mode) await view.findByRole('status', { hidden: true }, { timeout: 5_000 })
  return view
}

const row = (container: HTMLElement) => container.querySelector<HTMLElement>('.motion-strip')
const heads = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('.motion-cast__member'))
const nameOf = (head: HTMLElement) => head.querySelector('[aria-label]')?.getAttribute('aria-label')

describe('the Motion team in the status strip', () => {
  it('idle: the six heads in order, the owner of the stage ringed, its name beside it', async () => {
    const { container } = await strip(store(false), team())
    const group = screen.getByRole('group', { name: 'Motion team' })
    expect(row(container)?.getAttribute('data-state')).toBe('idle')
    expect(row(container)?.hasAttribute('data-running')).toBe(false)
    const members = within(group).getAllByRole('img')
    expect(members.map((member) => member.getAttribute('aria-label')?.split(',')[0])).toEqual(ORDER)
    expect(heads(container).map((head) => head.hasAttribute('data-current'))).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
    ])
    expect(members[5]?.getAttribute('aria-label')).toBe(
      'Penny, Reviews every frame. Current stage: Review',
    )
    expect(members[5]?.textContent).toBe('Review')
    // Quiet: no dot, no breath.
    expect(container.querySelector('.activity__glyph')).toBeNull()
    await waitFor(() =>
      expect(screen.getByRole('status', { hidden: true }).textContent).toBe(
        'Motion mode on. Current stage: Review, with Penny.',
      ),
    )
  })

  it('idle, in Portuguese: the names stay as written', async () => {
    setLanguage('pt-BR', { persist: false })
    const { container } = await strip(store(false), team({ stage: 'identity' }))
    expect(screen.getByRole('group', { name: 'Time do Motion' })).toBeTruthy()
    const members = within(container).getAllByRole('img')
    expect(members[1]?.getAttribute('aria-label')).toBe(
      'Moss, Pesquisa as referências. Etapa atual: Identidade visual',
    )
    expect(members[1]?.textContent).toBe('Identidade visual')
  })

  it('running with the owner of the stage: its head takes the place of the dot, the others sit at the end', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    const { container } = await strip(
      store(true, [item('cmd', { type: 'command', command: 'ffmpeg -i a.mov' })]),
      team({ stage: 'motion' }),
    )
    const shelf = container.querySelector('.composer__work-status')!
    expect(shelf.getAttribute('aria-label')).toBe('Work in progress')
    expect(row(container)?.getAttribute('data-state')).toBe('running')
    expect(row(container)?.hasAttribute('data-running')).toBe(true)
    // Cloud owns the motion stage: it leads, the dot is gone.
    expect(container.querySelector('.activity__glyph')).toBeNull()
    const lead = container.querySelector('.motion-strip__lead')!
    expect(
      within(lead as HTMLElement)
        .getByRole('img')
        .getAttribute('aria-label'),
    ).toMatch(/^Cloud, /)
    expect(lead.querySelector('[data-current]')).not.toBeNull()
    const tail = container.querySelector('.motion-strip__tail')!
    expect(
      within(tail as HTMLElement)
        .getAllByRole('img')
        .map((head) => head.getAttribute('aria-label')?.split(',')[0]),
    ).toEqual(['Zig', 'Moss', 'Bun', 'Pip', 'Penny'])
    expect(tail.querySelector('[data-working]')).toBeNull()
    expect(shelf.querySelector('.work-status__label')?.textContent).toBe('In progress')
    expect(shelf.querySelector('.work-status__doing')?.textContent).toBe('Running ffmpeg -i a.mov')
  })

  it('running with a helper named after a character: that character leads and the text names it', async () => {
    setLanguage('pt-BR', { persist: false })
    const { container } = await strip(
      store(true, [helper('tuift-media:penny', 'Revisão quadro a quadro com áudio')]),
      team({ stage: 'idea', working: ['penny'] }),
    )
    const lead = container.querySelector<HTMLElement>('.motion-strip__lead')!
    expect(within(lead).getByRole('img').getAttribute('aria-label')).toMatch(/^Penny, /)
    expect(lead.querySelector('[data-working]')).not.toBeNull()
    expect(container.querySelector('.work-status__doing')?.textContent).toBe(
      'Subagente Penny: “Revisão quadro a quadro com áudio”',
    )
    expect(container.querySelector('.work-status__label')?.textContent).toBe('Em andamento')
    // Zig owns the stage but is not working: small and dim at the end.
    const tail = container.querySelector<HTMLElement>('.motion-strip__tail')!
    expect(within(tail).getAllByRole('img')[0]?.getAttribute('aria-label')).toMatch(/^Zig, /)
    expect(tail.querySelector('[data-working]')).toBeNull()
  })

  it('running with two helpers: every character with a running helper is lit', async () => {
    const { container } = await strip(
      store(true, [helper('Moss'), helper('Pip')]),
      team({ stage: 'idea', working: ['moss', 'pip'] }),
    )
    const lit = Array.from(container.querySelectorAll<HTMLElement>('[data-working]')).map(
      (head) => head.querySelector('[aria-label]')?.getAttribute('aria-label')?.split(',')[0],
    )
    expect(lit).toEqual(['Moss', 'Pip'])
    // Two helpers are not one character: the text counts them.
    expect(container.querySelector('.work-status__doing')?.textContent).toBe('2 subagents running')
  })

  it('waiting for the person: the bubble on the active head and the wording, no breath', async () => {
    setLanguage('pt-BR', { persist: false })
    const { container } = await strip(
      store(true, [item('cmd', { type: 'command', command: 'ls' })]),
      team({ stage: 'audioApproval', waiting: true }),
    )
    expect(row(container)?.hasAttribute('data-running')).toBe(false)
    expect(container.querySelectorAll('.motion-cast__wait')).toHaveLength(1)
    expect(container.querySelector('.motion-strip__lead .motion-cast__wait')).not.toBeNull()
    expect(container.querySelector('.motion-strip__waiting')?.textContent).toBe(
      'Aprovação do áudio · esperando você',
    )
    expect(container.querySelector('.work-status__label')).toBeNull()
    await waitFor(() =>
      expect(screen.getByRole('status', { hidden: true }).textContent).toContain(
        'Zig está esperando você.',
      ),
    )
  })

  it('After Effects not available: Cloud keeps its badge and its note', async () => {
    const { container } = await strip(store(false), team({ afterEffects: 'not-installed' }))
    const cloud = heads(container)[4]!
    expect(cloud.querySelector('.motion-cast__mark')).not.toBeNull()
    expect(nameOf(cloud)).toBe('Cloud, Builds the video in After Effects. After Effects not found')
    expect(
      heads(container).filter((head) => head.querySelector('.motion-cast__mark')),
    ).toHaveLength(1)
  })

  it('a click on a head opens the menu with that character’s stages, and choosing one asks for it', async () => {
    const onStageChange = vi.fn()
    const { container } = await strip(store(false), team({ stage: 'idea', onStageChange }))
    expect(within(container).getAllByRole('button')).toHaveLength(6)
    fireEvent.click(within(container).getByRole('button', { name: /^Moss, / }))
    const menu = screen.getByRole('menu')
    expect(menu.getAttribute('aria-label')).toBe('Stages of Moss')
    const stages = within(menu).getAllByRole('menuitemradio')
    expect(stages.map((stage) => stage.textContent)).toEqual(['References', 'Visual identity'])
    fireEvent.click(stages[1]!)
    expect(onStageChange).toHaveBeenCalledWith('identity')
  })

  it('while a turn runs the stages are disabled and say why', async () => {
    const { container } = await strip(
      store(true, [item('cmd', { type: 'command', command: 'ls' })]),
      team({ stage: 'idea', locked: true, onStageChange: vi.fn() }),
    )
    fireEvent.click(within(container).getAllByRole('button')[0]!)
    const menu = screen.getByRole('menu')
    expect(menu.textContent).toContain('The stage can change when the reply ends')
    for (const stage of within(menu).getAllByRole('menuitemradio'))
      expect((stage as HTMLButtonElement).disabled).toBe(true)
  })

  it('is the plain strip in a chat without Motion: nothing idle, the dot while it runs', async () => {
    const idle = render(<ComposerWorkStatus frameStore={store(false)} />)
    expect(idle.container.innerHTML).toBe('')
    cleanup()
    const motionOff = render(
      <ComposerWorkStatus frameStore={store(false)} motion={{ mode: false, stage: 'idea' }} />,
    )
    expect(motionOff.container.innerHTML).toBe('')
    cleanup()
    const running = render(<ComposerWorkStatus frameStore={store(true)} />)
    expect(running.container.querySelector('.activity__glyph')).not.toBeNull()
    expect(running.container.querySelector('.motion-strip')).toBeNull()
    expect(
      running.container.querySelector('.composer__work-status')?.hasAttribute('data-motion'),
    ).toBe(false)
  })

  it('the same row, at the same height class, idle and running: nothing shifts when a turn starts', async () => {
    const frameStore = store(false)
    const { container } = await strip(frameStore, team())
    expect(row(container)?.classList.contains('work-status__row')).toBe(true)
    act(() => {
      frameStore.publish({
        ...emptyThread,
        running: true,
        activeTurn: { id: 'turn-1', startedAt: NOW },
        items: [item('cmd', { type: 'command', command: 'ls' })],
      })
    })
    expect(row(container)?.classList.contains('work-status__row')).toBe(true)
    expect(row(container)?.getAttribute('data-state')).toBe('running')
    act(() => {
      frameStore.publish({ ...emptyThread, running: false })
    })
    expect(row(container)?.getAttribute('data-state')).toBe('idle')
    expect(container.querySelectorAll('.composer__work-status')).toHaveLength(1)
  })

  it('does not render while a reply streams', async () => {
    let state: ThreadState = {
      ...emptyThread,
      running: true,
      activeTurn: { id: 'turn-1', startedAt: NOW },
      items: [
        item('cmd', { type: 'command', command: 'ls' }),
        {
          id: 'answer',
          turnId: 'turn-1',
          type: 'message',
          role: 'assistant',
          status: 'started',
          text: 'It',
          createdAt: NOW,
        },
      ],
    }
    const frameStore = new ThreadFrameStore(state)
    const renders = vi.fn()
    const view = render(
      <Profiler id="strip" onRender={renders}>
        <ComposerWorkStatus frameStore={frameStore} motion={team({ stage: 'idea' })} />
      </Profiler>,
    )
    await view.findByRole('status', { hidden: true }, { timeout: 5_000 })
    const before = renders.mock.calls.length
    for (let word = 0; word < 20; word += 1) {
      state = reduceDeltas(state, [
        { type: 'item.delta', turnId: 'turn-1', itemId: 'answer', textDelta: ' more' },
      ])
      act(() => frameStore.publish(state))
    }
    expect(renders.mock.calls.length).toBe(before)
  })
})
