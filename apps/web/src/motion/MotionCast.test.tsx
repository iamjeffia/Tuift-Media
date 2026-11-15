// @vitest-environment happy-dom
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setLanguage } from '../i18n/index.js'
import { CAST, MOTION_STAGES, STAGE_OWNER, stagesOf } from './cast.js'
import { MotionCast } from './MotionCast.js'

afterEach(cleanup)

const ORDER = ['Zig', 'Moss', 'Bun', 'Pip', 'Cloud', 'Penny']
const LOCKED = 'The stage can change when the reply ends'

/** Which characters are the current one, in the order of the scene. */
const currentCells = () =>
  Array.from(document.querySelectorAll('.motion-cast__member')).map((cell) =>
    cell.hasAttribute('data-current'),
  )

describe('MotionCast', () => {
  it('renders nothing while Motion is off', () => {
    const { container } = render(<MotionCast mode={false} />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByRole('group')).toBeNull()
  })

  it('shows the six characters in order, Zig first and highlighted, with nothing to press where no stage can be set', () => {
    render(<MotionCast mode />)
    const group = screen.getByRole('group', { name: 'Motion team' })
    expect(within(group).queryAllByRole('button')).toHaveLength(0)
    const members = within(group).getAllByRole('img')
    expect(members).toHaveLength(6)
    expect(members.map((member) => member.getAttribute('aria-label')?.split(',')[0])).toEqual(ORDER)
    expect(currentCells()).toEqual([true, false, false, false, false, false])
    expect(members[0]?.getAttribute('aria-label')).toBe('Zig, Leads. Current stage: Idea')
    expect(members[0]?.getAttribute('title')).toBe('Zig · Leads')
    expect(members[2]?.getAttribute('aria-label')).toBe('Bun, Writes the script')
    // Colour is never the only signal: the stage name is written next to the lead.
    expect(members[0]?.textContent).toBe('Idea')
    expect(members[1]?.textContent).toBe('')
  })

  it('announces the scene once it has appeared', () => {
    render(<MotionCast mode />)
    expect(screen.getByRole('status').textContent).toBe(
      'Motion mode on. Current stage: Idea, with Zig.',
    )
  })

  it('announces a new stage once, with its character, and nothing when it does not change', () => {
    const { rerender } = render(<MotionCast mode stage="idea" />)
    const status = () => screen.getByRole('status').textContent
    expect(status()).toBe('Motion mode on. Current stage: Idea, with Zig.')
    rerender(<MotionCast mode stage="script" />)
    expect(status()).toBe('Current stage: Script, with Bun.')
    rerender(<MotionCast mode stage="script" running />)
    expect(status()).toBe('Current stage: Script, with Bun.')
    // Narration is Bun's too, but it is another stage: said again.
    rerender(<MotionCast mode stage="narration" />)
    expect(status()).toBe('Current stage: Narration, with Bun.')
  })

  it('speaks Portuguese and keeps the names as written', () => {
    setLanguage('pt-BR', { persist: false })
    render(<MotionCast mode />)
    expect(screen.getByRole('group', { name: 'Time do Motion' })).toBeTruthy()
    const members = screen.getAllByRole('img')
    expect(members[0]?.getAttribute('aria-label')).toBe('Zig, Lidera. Etapa atual: Ideia')
    expect(members[1]?.getAttribute('aria-label')).toBe('Moss, Pesquisa as referências')
    expect(members[0]?.textContent).toBe('Ideia')
  })

  it('highlights the owner of the current stage and marks a running turn', () => {
    const { rerender } = render(<MotionCast mode stage="references" running />)
    expect(currentCells()).toEqual([false, true, false, false, false, false])
    expect(screen.getByRole('group').hasAttribute('data-running')).toBe(true)
    rerender(<MotionCast mode stage="references" />)
    expect(screen.getByRole('group').hasAttribute('data-running')).toBe(false)
  })

  it('lets go of the scene when Motion is turned off', () => {
    const { rerender, container } = render(<MotionCast mode />)
    expect(screen.getByRole('group')).toBeTruthy()
    // No animation runs in happy-dom, so the exit has nothing to wait for.
    act(() => rerender(<MotionCast mode={false} />))
    expect(container.firstChild).toBeNull()
  })

  it('never reads the thread, so a streaming reply cannot re-render it', () => {
    const source = readFileSync(
      [
        resolve(process.cwd(), 'apps/web/src/motion/MotionCast.tsx'),
        resolve(process.cwd(), 'src/motion/MotionCast.tsx'),
      ].find((path) => existsSync(path))!,
      'utf8',
    )
    expect(source).toMatch(/export const MotionCast = memo\(/)
    expect(source).not.toMatch(/thread-frame-store|thread-controller|useSyncExternalStore/)
  })
})

describe('MotionCast stage menu', () => {
  const open = (name: string) => {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name},`) }))
    return screen.getByRole('menu')
  }
  const items = (menu: HTMLElement) =>
    within(menu).getAllByRole('menuitemradio') as HTMLButtonElement[]

  it('opens the app menu with the stages of that character, the current one marked', () => {
    render(<MotionCast mode stage="narration" onStageChange={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: /^Bun,/ })
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    const menu = open('Bun')
    expect(menu.getAttribute('aria-label')).toBe('Stages of Bun')
    expect(menu.classList.contains('menu')).toBe(true)
    expect(items(menu).map((item) => item.textContent)).toEqual(['Script', 'Narration'])
    expect(items(menu).map((item) => item.getAttribute('aria-checked'))).toEqual(['false', 'true'])
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('opens a menu for a character with a single stage too', () => {
    render(<MotionCast mode onStageChange={vi.fn()} />)
    expect(items(open('Penny')).map((item) => item.textContent)).toEqual(['Review'])
  })

  it('gives every stage to exactly one character, one or two each', () => {
    const offered = CAST.flatMap((member) => stagesOf(member.id))
    expect([...offered].sort()).toEqual([...MOTION_STAGES].sort())
    for (const member of CAST) {
      expect(stagesOf(member.id).length).toBeGreaterThan(0)
      expect(stagesOf(member.id).length).toBeLessThanOrEqual(2)
    }
  })

  it('asks for the chosen stage and closes, and asks nothing for the one already current', () => {
    const onStageChange = vi.fn()
    render(<MotionCast mode stage="idea" onStageChange={onStageChange} />)
    fireEvent.click(items(open('Bun'))[1]!)
    expect(onStageChange).toHaveBeenCalledTimes(1)
    expect(onStageChange).toHaveBeenCalledWith('narration')
    expect(screen.getByRole('button', { name: /^Bun,/ }).getAttribute('aria-expanded')).toBe(
      'false',
    )
    fireEvent.click(items(open('Zig'))[0]!)
    expect(onStageChange).toHaveBeenCalledTimes(1)
  })

  it('does not follow a choice by itself: the highlight is what the props say', () => {
    const { rerender } = render(<MotionCast mode stage="idea" onStageChange={vi.fn()} />)
    fireEvent.click(items(open('Moss'))[0]!)
    expect(currentCells()).toEqual([true, false, false, false, false, false])
    rerender(<MotionCast mode stage="references" onStageChange={vi.fn()} />)
    expect(currentCells()).toEqual([false, true, false, false, false, false])
    expect(screen.getByRole('status').textContent).toBe('Current stage: References, with Moss.')
  })

  it('disables every stage while a turn runs, says why, and keeps the highlight breathing', () => {
    const onStageChange = vi.fn()
    render(<MotionCast mode stage="script" running locked onStageChange={onStageChange} />)
    const menu = open('Bun')
    expect(within(menu).getByText(LOCKED)).toBeTruthy()
    for (const item of items(menu)) {
      expect(item.disabled).toBe(true)
      fireEvent.click(item)
    }
    expect(onStageChange).not.toHaveBeenCalled()
    expect(screen.getByRole('group').hasAttribute('data-running')).toBe(true)
    expect(currentCells()).toEqual([false, false, true, false, false, false])
  })

  it('does not say a stage is locked when it is not', () => {
    render(<MotionCast mode onStageChange={vi.fn()} />)
    expect(within(open('Zig')).queryByText(LOCKED)).toBeNull()
  })

  it('closes on Escape and gives the focus back to the character', () => {
    render(<MotionCast mode onStageChange={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: /^Cloud,/ })
    trigger.focus()
    open('Cloud')
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
  })

  it('speaks Portuguese in the menu', () => {
    setLanguage('pt-BR', { persist: false })
    render(<MotionCast mode stage="narration" locked onStageChange={vi.fn()} />)
    const menu = open('Bun')
    expect(menu.getAttribute('aria-label')).toBe('Etapas de Bun')
    expect(items(menu).map((item) => item.textContent)).toEqual(['Roteiro', 'Narração'])
    expect(within(menu).getByText('A etapa muda quando a resposta terminar')).toBeTruthy()
  })
})

describe('MotionCast After Effects notice', () => {
  const NOT_INSTALLED =
    'After Effects was not found on this computer. The video will be built in HyperFrames.'
  const UNAVAILABLE =
    'The After Effects connection is not available in this app. The video will be built in HyperFrames.'
  const cloud = () => screen.getByRole('button', { name: /^Cloud,/ })
  const marks = () => Array.from(document.querySelectorAll('.motion-cast__mark'))
  const status = () => screen.getByRole('status').textContent

  it.each([
    ['not-installed', NOT_INSTALLED, 'After Effects not found'],
    ['unavailable', UNAVAILABLE, 'After Effects connection unavailable'],
  ] as const)(
    'says %s on Cloud only: a mark, the name and the first line of its menu',
    (state, note, short) => {
      render(<MotionCast mode stage="motion" afterEffects={state} onStageChange={vi.fn()} />)
      expect(marks()).toHaveLength(1)
      // The mark is a shape inside Cloud's head, hidden from the accessible tree.
      expect(cloud().querySelector('.motion-cast__head > .motion-cast__mark svg')).not.toBeNull()
      expect(marks()[0]?.getAttribute('aria-hidden')).toBe('true')
      expect(cloud().getAttribute('aria-label')).toBe(
        `Cloud, Builds the video in After Effects. Current stage: Motion. ${short}`,
      )
      expect(cloud().getAttribute('title')).toBe(
        `Cloud · Builds the video in After Effects · ${short}`,
      )
      for (const name of ['Zig', 'Moss', 'Bun', 'Pip', 'Penny']) {
        const label = screen
          .getByRole('button', { name: new RegExp(`^${name},`) })
          .getAttribute('aria-label')
        expect(label).not.toMatch(/After Effects (not|connection)/)
      }
      fireEvent.click(cloud())
      const menu = screen.getByRole('menu')
      expect(menu.firstElementChild?.textContent).toBe(note)
      expect(menu.firstElementChild?.classList.contains('menu__group')).toBe(true)
      // Not something to press: only the stages are items.
      expect(
        within(menu)
          .getAllByRole('menuitemradio')
          .map((item) => item.textContent),
      ).toEqual(['Soundtrack', 'Motion'])
    },
  )

  it('says nothing extra when After Effects is ready or the server does not say', () => {
    const { rerender } = render(
      <MotionCast mode stage="motion" afterEffects="ready" onStageChange={vi.fn()} />,
    )
    const quiet = () => {
      expect(marks()).toHaveLength(0)
      expect(cloud().getAttribute('aria-label')).toBe(
        'Cloud, Builds the video in After Effects. Current stage: Motion',
      )
      expect(cloud().getAttribute('title')).toBe('Cloud · Builds the video in After Effects')
      expect(status()).toBe('Motion mode on. Current stage: Motion, with Cloud.')
    }
    quiet()
    rerender(<MotionCast mode stage="motion" onStageChange={vi.fn()} />)
    quiet()
    fireEvent.click(cloud())
    const menu = screen.getByRole('menu')
    expect(menu.querySelector('.menu__group')).toBeNull()
    expect(menu.getAttribute('class')).not.toContain('menu--cast-note')
  })

  it('puts the notice above the locked line, when both apply', () => {
    render(
      <MotionCast
        mode
        stage="motion"
        running
        locked
        afterEffects="not-installed"
        onStageChange={vi.fn()}
      />,
    )
    fireEvent.click(cloud())
    const lines = Array.from(screen.getByRole('menu').querySelectorAll('.menu__group')).map(
      (line) => line.textContent,
    )
    expect(lines).toEqual([NOT_INSTALLED, LOCKED])
  })

  it('announces it once with the scene, and once more for each change', () => {
    const { rerender } = render(<MotionCast mode stage="motion" afterEffects="not-installed" />)
    expect(status()).toBe(`Motion mode on. Current stage: Motion, with Cloud. ${NOT_INSTALLED}`)
    // Any other prop says nothing new.
    rerender(<MotionCast mode stage="motion" afterEffects="not-installed" running />)
    expect(status()).toBe(`Motion mode on. Current stage: Motion, with Cloud. ${NOT_INSTALLED}`)
    rerender(<MotionCast mode stage="motion" afterEffects="unavailable" running />)
    expect(status()).toBe(UNAVAILABLE)
    // Ready: nothing to say; back to a problem: said again.
    rerender(<MotionCast mode stage="motion" afterEffects="ready" running />)
    expect(status()).toBe('')
    rerender(<MotionCast mode stage="motion" afterEffects="unavailable" running />)
    expect(status()).toBe(UNAVAILABLE)
  })

  it('does not repeat the notice when only the stage changes', () => {
    const { rerender } = render(<MotionCast mode stage="motion" afterEffects="not-installed" />)
    rerender(<MotionCast mode stage="soundtrack" afterEffects="not-installed" />)
    expect(status()).toBe('Current stage: Soundtrack, with Cloud.')
    rerender(<MotionCast mode stage="review" afterEffects="not-installed" />)
    expect(status()).toBe('Current stage: Review, with Penny.')
  })

  it('announces a state that arrives after the scene, without saying the mode is on again', () => {
    const { rerender } = render(<MotionCast mode stage="motion" />)
    expect(status()).toBe('Motion mode on. Current stage: Motion, with Cloud.')
    rerender(<MotionCast mode stage="motion" afterEffects="not-installed" />)
    expect(status()).toBe(NOT_INSTALLED)
  })

  it('shows the state on a pane that has no menu: the name and the tooltip carry it', () => {
    render(<MotionCast mode stage="motion" afterEffects="not-installed" />)
    const cloudImage = screen.getAllByRole('img')[4]
    expect(cloudImage?.getAttribute('aria-label')).toBe(
      'Cloud, Builds the video in After Effects. Current stage: Motion. After Effects not found',
    )
    expect(cloudImage?.getAttribute('title')).toContain('After Effects not found')
    expect(marks()).toHaveLength(1)
  })

  it('keeps each pane to its own chat: one with the notice, one without', () => {
    render(
      <>
        <MotionCast mode stage="motion" afterEffects="not-installed" />
        <MotionCast mode stage="motion" afterEffects="ready" />
      </>,
    )
    const panes = screen.getAllByRole('group', { name: 'Motion team' })
    expect(panes).toHaveLength(2)
    expect(panes[0]?.querySelectorAll('.motion-cast__mark')).toHaveLength(1)
    expect(panes[1]?.querySelectorAll('.motion-cast__mark')).toHaveLength(0)
  })

  it('speaks Portuguese', () => {
    setLanguage('pt-BR', { persist: false })
    const { rerender } = render(
      <MotionCast mode stage="motion" afterEffects="not-installed" onStageChange={vi.fn()} />,
    )
    expect(cloud().getAttribute('aria-label')).toBe(
      'Cloud, Monta o vídeo no After Effects. Etapa atual: Motion. After Effects não encontrado',
    )
    expect(status()).toBe(
      'Modo Motion ativado. Etapa atual: Motion, com Cloud. After Effects não encontrado neste computador. O vídeo será montado em HyperFrames.',
    )
    fireEvent.click(cloud())
    expect(screen.getByRole('menu').firstElementChild?.textContent).toBe(
      'After Effects não encontrado neste computador. O vídeo será montado em HyperFrames.',
    )
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    rerender(<MotionCast mode stage="motion" afterEffects="unavailable" onStageChange={vi.fn()} />)
    expect(status()).toBe(
      'A conexão com o After Effects não está disponível neste app. O vídeo será montado em HyperFrames.',
    )
    expect(cloud().getAttribute('aria-label')).toContain('Conexão com o After Effects indisponível')
  })
})

describe('cast data', () => {
  it('lists the six characters in the order of the scene, each with a distinct image', () => {
    expect(CAST.map((member) => member.name)).toEqual(ORDER)
    expect(new Set(CAST.map((member) => member.image)).size).toBe(6)
  })

  it('gives every stage an owner from the cast', () => {
    const ids = new Set(CAST.map((member) => member.id))
    for (const stage of MOTION_STAGES) expect(ids.has(STAGE_OWNER[stage])).toBe(true)
    expect(STAGE_OWNER.idea).toBe('zig')
    expect(STAGE_OWNER.review).toBe('penny')
  })
})
