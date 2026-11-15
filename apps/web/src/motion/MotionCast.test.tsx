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
