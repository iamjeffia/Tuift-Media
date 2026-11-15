// @vitest-environment happy-dom
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { setLanguage } from '../i18n/index.js'
import { CAST, MOTION_STAGES, STAGE_OWNER } from './cast.js'
import { MotionCast } from './MotionCast.js'

afterEach(cleanup)

const ORDER = ['Zig', 'Moss', 'Bun', 'Pip', 'Cloud', 'Penny']

describe('MotionCast', () => {
  it('renders nothing while Motion is off', () => {
    const { container } = render(<MotionCast mode={false} />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByRole('group')).toBeNull()
  })

  it('shows the six characters in order, Zig first and highlighted', () => {
    render(<MotionCast mode />)
    const group = screen.getByRole('group', { name: 'Motion team' })
    const buttons = within(group).getAllByRole('button')
    expect(buttons).toHaveLength(6)
    expect(buttons.map((button) => button.getAttribute('aria-label')?.split(',')[0])).toEqual(ORDER)
    expect(buttons[0]?.getAttribute('aria-current')).toBe('step')
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Zig, Leads. Current stage: Idea')
    expect(buttons[0]?.getAttribute('title')).toBe('Zig · Leads')
    for (const other of buttons.slice(1)) expect(other.hasAttribute('aria-current')).toBe(false)
    expect(buttons[2]?.getAttribute('aria-label')).toBe('Bun, Writes the script')
    // Colour is never the only signal: the stage name is written next to the lead.
    expect(buttons[0]?.textContent).toBe('Idea')
    expect(buttons[1]?.textContent).toBe('')
  })

  it('announces the scene once it has appeared', () => {
    render(<MotionCast mode />)
    expect(screen.getByRole('status').textContent).toBe(
      'Motion mode on. Current stage: Idea, with Zig.',
    )
  })

  it('speaks Portuguese and keeps the names as written', () => {
    setLanguage('pt-BR', { persist: false })
    render(<MotionCast mode />)
    expect(screen.getByRole('group', { name: 'Time do Motion' })).toBeTruthy()
    const buttons = screen.getAllByRole('button')
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Zig, Lidera. Etapa atual: Ideia')
    expect(buttons[1]?.getAttribute('aria-label')).toBe('Moss, Pesquisa as referências')
    expect(buttons[0]?.textContent).toBe('Ideia')
  })

  it('highlights the owner of the current stage and marks a running turn', () => {
    const { rerender } = render(<MotionCast mode stage="references" running />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((button) => button.hasAttribute('aria-current'))).toEqual([
      false,
      true,
      false,
      false,
      false,
      false,
    ])
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
