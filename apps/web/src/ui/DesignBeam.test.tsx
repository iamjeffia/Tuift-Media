// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
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

function beam(active: boolean, extra: { running?: boolean; travelOnFocus?: boolean } = {}) {
  return (
    <DesignBeam className="composer__design-beam" strength={1} active={active} {...extra}>
      <button type="button" data-testid="content" />
    </DesignBeam>
  )
}

const resting = (container: Element) => container.querySelectorAll('[data-resting]').length

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

describe('DesignBeam travels, then rests', () => {
  it('travels when it appears and rests once the last lap has eased to a stop', () => {
    const { container } = render(beam(true))
    const stroke = container.querySelector('[data-beam-stroke]')!
    expect(resting(container)).toBe(0)

    // A lap or the fade ending is not the end of the travel.
    endAnimation(stroke, 'composer-design-beam-spin')
    endAnimation(stroke, 'composer-design-beam-fade-in')
    expect(resting(container)).toBe(0)

    endAnimation(stroke, 'composer-design-beam-settle')
    expect(container.querySelector('[data-beam-glow]')?.hasAttribute('data-resting')).toBe(true)
    expect(stroke.hasAttribute('data-resting')).toBe(true)
    expect(container.querySelector('[data-beam-bloom]')?.hasAttribute('data-resting')).toBe(true)
    // The layers stay: resting is the lit picture, held.
    expect(container.querySelector('[data-beam-turn]')).toBeTruthy()
  })

  it('travels again when the mode is turned back on', () => {
    const { container, rerender } = render(beam(true))
    endAnimation(container.querySelector('[data-beam-stroke]')!, 'composer-design-beam-settle')
    expect(resting(container)).toBe(3)
    rerender(beam(false))
    expect(resting(container)).toBe(3)
    rerender(beam(true))
    expect(resting(container)).toBe(0)
  })

  it('travels again when a turn starts, and not on every render of a running one', () => {
    const { container, rerender } = render(beam(true, { running: false }))
    endAnimation(container.querySelector('[data-beam-stroke]')!, 'composer-design-beam-settle')
    expect(resting(container)).toBe(3)
    rerender(beam(true, { running: true }))
    expect(resting(container)).toBe(0)
    endAnimation(container.querySelector('[data-beam-stroke]')!, 'composer-design-beam-settle')
    rerender(beam(true, { running: true }))
    expect(resting(container)).toBe(3)
  })

  it('travels again when focus enters the box, not when it moves inside it', () => {
    const { container, getByTestId } = render(beam(true, { travelOnFocus: true }))
    const content = getByTestId('content')
    endAnimation(container.querySelector('[data-beam-stroke]')!, 'composer-design-beam-settle')
    expect(resting(container)).toBe(3)

    fireEvent.focusIn(content, { relatedTarget: container.querySelector('[data-beam-stroke]') })
    expect(resting(container)).toBe(3)

    fireEvent.focusIn(content, { relatedTarget: document.body })
    expect(resting(container)).toBe(0)
  })

  it('ignores focus unless the beam was asked to travel on it', () => {
    const { container, getByTestId } = render(beam(true))
    endAnimation(container.querySelector('[data-beam-stroke]')!, 'composer-design-beam-settle')
    fireEvent.focusIn(getByTestId('content'), { relatedTarget: document.body })
    expect(resting(container)).toBe(3)
  })

  it('starts over from travelling after it has faded out and come back', () => {
    const { container, rerender } = render(beam(true))
    endAnimation(container.querySelector('[data-beam-stroke]')!, 'composer-design-beam-settle')
    rerender(beam(false))
    endAnimation(container.querySelector('[data-beam-stroke]')!, 'composer-design-beam-fade-out')
    expect(container.querySelector('[data-beam-stroke]')).toBeNull()
    rerender(beam(true))
    expect(resting(container)).toBe(0)
  })
})
