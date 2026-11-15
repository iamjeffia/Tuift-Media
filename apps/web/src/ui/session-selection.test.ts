// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import {
  applyClick,
  bulkDeleteCopy,
  createSessionSelection,
  EMPTY_SELECTION,
  nearestSurvivor,
  pruneSelection,
  selectRange,
} from './session-selection.js'

const order = ['a', 'b', 'c', 'd', 'e']
const picked = (ids: ReadonlySet<string>) => [...ids].sort()

describe('selectRange', () => {
  it('follows the order shown, in either direction', () => {
    expect(selectRange(order, 'b', 'd')).toEqual(['b', 'c', 'd'])
    expect(selectRange(order, 'd', 'b')).toEqual(['b', 'c', 'd'])
    expect(selectRange(order, 'c', 'c')).toEqual(['c'])
  })

  it('has no range when an end is not on screen', () => {
    expect(selectRange(order, 'a', 'z')).toBeUndefined()
    expect(selectRange(order, 'z', 'a')).toBeUndefined()
  })
})

describe('applyClick', () => {
  it('toggles a chat in and out with Ctrl and makes it the anchor', () => {
    const one = applyClick(EMPTY_SELECTION, 'b', { shift: false, toggle: true }, order)
    expect(picked(one.ids)).toEqual(['b'])
    expect(one.anchor).toBe('b')
    const two = applyClick(one, 'd', { shift: false, toggle: true }, order)
    expect(picked(two.ids)).toEqual(['b', 'd'])
    const off = applyClick(two, 'b', { shift: false, toggle: true }, order)
    expect(picked(off.ids)).toEqual(['d'])
    expect(applyClick(off, 'd', { shift: false, toggle: true }, order)).toBe(EMPTY_SELECTION)
  })

  it('takes the range from the anchor with Shift and keeps the anchor', () => {
    const anchored = applyClick(EMPTY_SELECTION, 'b', { shift: false, toggle: true }, order)
    const range = applyClick(anchored, 'd', { shift: true, toggle: false }, order)
    expect(picked(range.ids)).toEqual(['b', 'c', 'd'])
    expect(range.anchor).toBe('b')
    // A second Shift+click moves the end of the range, not its start.
    const shorter = applyClick(range, 'a', { shift: true, toggle: false }, order)
    expect(picked(shorter.ids)).toEqual(['a', 'b'])
  })

  it('adds the range to the selection with Ctrl+Shift', () => {
    const first = applyClick(EMPTY_SELECTION, 'a', { shift: false, toggle: true }, order)
    const apart = applyClick(first, 'c', { shift: false, toggle: true }, order)
    const more = applyClick(apart, 'e', { shift: true, toggle: true }, order)
    expect(picked(more.ids)).toEqual(['a', 'c', 'd', 'e'])
  })

  it('starts Shift at the open chat, then at the clicked chat', () => {
    const fromOpen = applyClick(EMPTY_SELECTION, 'd', { shift: true, toggle: false }, order, 'b')
    expect(picked(fromOpen.ids)).toEqual(['b', 'c', 'd'])
    const alone = applyClick(EMPTY_SELECTION, 'd', { shift: true, toggle: false }, order)
    expect(picked(alone.ids)).toEqual(['d'])
    const gone = applyClick(EMPTY_SELECTION, 'd', { shift: true, toggle: false }, order, 'z')
    expect(picked(gone.ids)).toEqual(['d'])
  })
})

describe('pruneSelection', () => {
  it('drops chats that left the screen and clears an emptied selection', () => {
    const all = applyClick(EMPTY_SELECTION, 'c', { shift: true, toggle: false }, order, 'a')
    const kept = pruneSelection(all, new Set(['a', 'b', 'x']))
    expect(picked(kept.ids)).toEqual(['a', 'b'])
    expect(kept.anchor).toBe('a')
    expect(pruneSelection(all, new Set(['x']))).toBe(EMPTY_SELECTION)
    expect(pruneSelection(all, new Set(order))).toBe(all)
  })
})

describe('createSessionSelection', () => {
  function list(...ids: string[]) {
    const node = document.createElement('ul')
    document.body.append(node)
    return { node, ids }
  }

  it('orders ranges across lists by their place in the page', () => {
    const store = createSessionSelection()
    const first = list('a1', 'a2')
    const second = list('b1', 'b2')
    // Registered out of order on purpose.
    store.setList(second.node, second.ids)
    store.setList(first.node, first.ids)
    expect(store.visibleIds()).toEqual(['a1', 'a2', 'b1', 'b2'])
    store.click('a2', { shift: false, toggle: true })
    store.click('b2', { shift: true, toggle: false })
    expect(store.selectedIds()).toEqual(['a2', 'b1', 'b2'])
  })

  it('tells only subscribers about real changes and prunes folded lists', () => {
    const store = createSessionSelection()
    const first = list('a1', 'a2')
    const second = list('b1')
    store.setList(first.node, first.ids)
    store.setList(second.node, second.ids)
    const listener = vi.fn()
    store.subscribe(listener)
    store.clear()
    expect(listener).not.toHaveBeenCalled()
    store.click('a1', { shift: false, toggle: true })
    store.click('b1', { shift: false, toggle: true })
    expect(store.count()).toBe(2)
    store.removeList(second.node)
    expect(store.selectedIds()).toEqual(['a1'])
    store.setList(first.node, ['a2'])
    expect(store.count()).toBe(0)
  })
})

describe('bulk delete copy', () => {
  it('names the count and warns about running chats', () => {
    expect(bulkDeleteCopy(3, 0)).toMatchObject({
      title: 'Delete 3 chats?',
      action: 'Delete 3 chats',
      destructive: true,
    })
    expect(bulkDeleteCopy(2, 1).body).toContain('The running chat will stop.')
    expect(bulkDeleteCopy(5, 2).body).toContain('2 running chats will stop.')
    expect(bulkDeleteCopy(1, 0).title).toBe('Delete 1 chat?')
  })
})

describe('nearestSurvivor', () => {
  it('prefers the chat below the deleted ones, then the one above', () => {
    expect(nearestSurvivor(order, new Set(['b', 'c']))).toBe('d')
    expect(nearestSurvivor(order, new Set(['d', 'e']))).toBe('c')
    expect(nearestSurvivor(order, new Set(order))).toBeUndefined()
  })
})
