// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { DesignBeam } from './DesignBeam.js'

afterEach(() => {
  cleanup()
  document.documentElement.removeAttribute('data-page-hidden')
})

function endAnimation(element: Element, animationName: string) {
  const event = new Event('animationend', { bubbles: true })
  Object.defineProperty(event, 'animationName', { configurable: true, value: animationName })
  act(() => {
    element.dispatchEvent(event)
  })
}

function beam(active: boolean) {
  return (
    <DesignBeam className="composer__design-beam" strength={1} active={active}>
      <div data-testid="content" />
    </DesignBeam>
  )
}

describe('DesignBeam layers', () => {
  it('draws nothing while idle', () => {
    const { container } = render(beam(false))
    expect(container.querySelector('[data-beam-glow]')).toBeNull()
    expect(container.querySelector('[data-beam-stroke]')).toBeNull()
    expect(container.querySelector('[data-beam-bloom]')).toBeNull()
    expect(container.querySelector('[data-beam-turn]')).toBeNull()
  })

  it('puts the glow before the content and the stroke and bloom after it', () => {
    const { container } = render(beam(true))
    const host = container.firstElementChild
    const order = Array.from(host?.children ?? [], (child) =>
      child.hasAttribute('data-beam-glow')
        ? 'glow'
        : child.hasAttribute('data-beam-stroke')
          ? 'stroke'
          : child.hasAttribute('data-beam-bloom')
            ? 'bloom'
            : 'content',
    )
    // The glow sits under the new chat's shelf as well as the prompt, so it comes first.
    expect(order).toEqual(['glow', 'content', 'stroke', 'bloom'])
    expect(host?.hasAttribute('data-active')).toBe(true)
  })

  it('turns the stroke colours inside a window that turns the other way', () => {
    const { container } = render(beam(true))
    const stroke = container.querySelector('[data-beam-stroke]')
    expect(stroke?.querySelector('[data-beam-window] > [data-beam-still]')).toBeTruthy()
    expect(stroke?.querySelector('[data-beam-sweep]')).toBeTruthy()
    expect(
      container.querySelector('[data-beam-glow] > [data-beam-turn] > [data-beam-still]'),
    ).toBeTruthy()
    expect(container.querySelector('[data-beam-bloom] > [data-beam-turn]')).toBeTruthy()
  })

  it('keeps the layers through the fade out and removes them when it ends', () => {
    const { container, rerender } = render(beam(true))
    rerender(beam(false))
    const host = container.firstElementChild
    expect(host?.hasAttribute('data-fading')).toBe(true)
    expect(container.querySelector('[data-beam-bloom]')).toBeTruthy()

    // The fade in's end, or another element's animation, does not end the beam.
    const stroke = container.querySelector('[data-beam-stroke]')!
    endAnimation(stroke, 'composer-design-beam-fade-in')
    expect(container.querySelector('[data-beam-stroke]')).toBeTruthy()

    endAnimation(stroke, 'composer-design-beam-fade-out')
    expect(container.querySelector('[data-beam-stroke]')).toBeNull()
    expect(container.querySelector('[data-beam-glow]')).toBeNull()
    expect(host?.hasAttribute('data-fading')).toBe(false)
  })

  it('is not ended by a nested beam finishing its own fade out', () => {
    const { container } = render(
      <DesignBeam className="composer__design-beam" strength={1} active>
        <DesignBeam className="composer__design-button-beam" strength={0.58} active={false}>
          <button type="button">Design</button>
        </DesignBeam>
      </DesignBeam>,
    )
    const outer = container.firstElementChild!
    const innerStroke = container.querySelector('.composer__design-button-beam [data-beam-stroke]')
    expect(innerStroke).toBeNull()
    endAnimation(outer.querySelector('button')!, 'composer-design-beam-fade-out')
    expect(outer.querySelector(':scope > [data-beam-stroke]')).toBeTruthy()
  })
})

describe('DesignBeam while nobody looks', () => {
  it('marks the document hidden so the loops pause, and clears the mark when it is shown', () => {
    render(beam(true))
    const root = document.documentElement
    expect(root.hasAttribute('data-page-hidden')).toBe(false)

    let state: DocumentVisibilityState = 'hidden'
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(root.hasAttribute('data-page-hidden')).toBe(true)

    state = 'visible'
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(root.hasAttribute('data-page-hidden')).toBe(false)
  })
})
