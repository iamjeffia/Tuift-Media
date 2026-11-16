// @vitest-environment happy-dom
import type { Item } from '@harness/contracts'
import { act, cleanup, render } from '@testing-library/react'
import { Profiler, memo } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ThreadFrameStore } from '../thread-frame-store.js'
import { emptyThread, reduce } from '../thread-store.js'
import type { Session } from '../ui/Sidebar.js'
import { CAST } from './cast.js'
import { CAST_NAMES, castIdOfName } from './cast-names.js'
import { useWorkingCast, waitingForPerson, workingCast } from './cast-activity.js'

afterEach(cleanup)

const helper = (
  id: string,
  name: string | undefined,
  state: 'running' | 'completed' | 'failed' | 'interrupted' = 'running',
): Item => ({
  id: `item-${id}`,
  turnId: 'turn-1',
  type: 'tool_call',
  status: state === 'running' ? 'started' : 'completed',
  text: 'spawn_agent',
  createdAt: 1,
  subagent: { id, ...(name ? { name } : {}), state },
})

const session = (status: Session['status'], extra: Partial<Session> = {}): Session => ({
  id: 'chat-1',
  title: 'Chat',
  provider: 'claude-code',
  createdAt: 1,
  status,
  lifecycle: { state: 'active', keepActive: false },
  unread: false,
  ...extra,
})

describe('castIdOfName', () => {
  it('matches the whole name in any case, and the name followed by a separator', () => {
    expect(castIdOfName('Moss')).toBe('moss')
    expect(castIdOfName('moss')).toBe('moss')
    expect(castIdOfName('  PENNY ')).toBe('penny')
    expect(castIdOfName('Moss: references')).toBe('moss')
    expect(castIdOfName('zig - audio')).toBe('zig')
    expect(castIdOfName('Cloud/render')).toBe('cloud')
    expect(castIdOfName('Bun (script)')).toBe('bun')
    expect(castIdOfName('Pip · folders')).toBe('pip')
  })

  it('leaves every other name alone', () => {
    for (const name of [
      'Explorer',
      'Mossy',
      'Pipeline',
      'Bunny',
      'Cloud deploy',
      'Penny2',
      'The Moss',
      'Zigzag',
      '',
      undefined,
    ]) {
      expect(castIdOfName(name), String(name)).toBeUndefined()
    }
  })

  it('lists the same characters, in the same order, as the scene', () => {
    expect(CAST_NAMES.map(([id, name]) => [id, name])).toEqual(
      CAST.map((member) => [member.id, member.name]),
    )
  })
})

describe('workingCast', () => {
  it('lights the characters whose helper runs, in the order of the scene', () => {
    expect(workingCast([helper('a', 'Pip'), helper('b', 'Moss: references')])).toEqual([
      'moss',
      'pip',
    ])
  })

  it('counts a character once, however many helpers carry its name', () => {
    expect(workingCast([helper('a', 'Moss'), helper('b', 'moss: more')])).toEqual(['moss'])
  })

  it('lights nobody for another name, a missing name, or a helper that is not running', () => {
    expect(
      workingCast([
        helper('a', 'Explorer'),
        helper('b', undefined),
        helper('c', 'Zig', 'completed'),
        helper('d', 'Bun', 'failed'),
        helper('e', 'Cloud', 'interrupted'),
        { ...helper('f', 'Penny'), subagent: undefined },
      ]),
    ).toEqual([])
  })
})

describe('waitingForPerson', () => {
  it('is the sidebar definition: an open approval or question, nothing else', () => {
    expect(waitingForPerson(session('approval'))).toBe(true)
    expect(waitingForPerson(session('input'))).toBe(true)
    for (const status of ['idle', 'working', 'starting', 'queued', 'ready'] as const) {
      expect(waitingForPerson(session(status)), status).toBe(false)
    }
  })

  it('does not count a failure nobody has read, and says no for a chat that does not exist', () => {
    expect(waitingForPerson(session('failed', { unread: true }))).toBe(false)
    expect(waitingForPerson(undefined)).toBe(false)
  })
})

describe('useWorkingCast', () => {
  const stateWith = (...items: Item[]) =>
    items.reduce((state, item) => reduce(state, { type: 'item.started', item }), {
      ...emptyThread,
      running: true,
    })

  /** Renders the hook in a memoised child, as the scene is, and counts what reaches it. */
  function mount(store: ThreadFrameStore, enabled = true) {
    const seen: Array<readonly string[]> = []
    let rendersOfHook = 0
    const Scene = memo(function Scene(props: { working: readonly string[] }) {
      seen.push(props.working)
      return null
    })
    function Probe() {
      return <Scene working={useWorkingCast(store, enabled)} />
    }
    render(
      <Profiler
        id="probe"
        onRender={() => {
          rendersOfHook += 1
        }}
      >
        <Probe />
      </Profiler>,
    )
    return { seen, renders: () => rendersOfHook }
  }

  it('follows the helpers of the transcript: one lights, a second joins, one finishes', () => {
    const store = new ThreadFrameStore(stateWith(helper('a', 'Moss')))
    const probe = mount(store)
    expect(probe.seen.at(-1)).toEqual(['moss'])

    act(() => store.publish(stateWith(helper('a', 'Moss'), helper('b', 'Pip'))))
    expect(probe.seen.at(-1)).toEqual(['moss', 'pip'])

    act(() =>
      store.publish(
        reduce(store.getSnapshot(), {
          type: 'item.completed',
          item: helper('a', 'Moss', 'completed'),
        }),
      ),
    )
    expect(probe.seen.at(-1)).toEqual(['pip'])

    act(() => store.publish({ ...emptyThread }))
    expect(probe.seen.at(-1)).toEqual([])
  })

  it('does not re-render while the reply streams: text frames and unrelated rows leave it alone', () => {
    const answer: Item = {
      id: 'answer-1',
      turnId: 'turn-1',
      type: 'message',
      role: 'assistant',
      status: 'started',
      text: '',
      createdAt: 2,
    }
    const store = new ThreadFrameStore(stateWith(helper('a', 'Moss'), answer))
    const probe = mount(store)
    const before = probe.renders()
    const listIdentity = probe.seen.at(-1)

    // A streamed reply: the live overlay changes on every frame, the structure never.
    let state = store.getSnapshot()
    for (let frame = 1; frame <= 50; frame += 1) {
      state = {
        ...state,
        itemVersion: frame,
        liveItems: new Map([
          [
            1,
            {
              item: { ...answer, text: 'word '.repeat(frame) },
              version: frame,
              textUpdate: { kind: 'append' as const, text: 'word ' },
            },
          ],
        ]),
      }
      act(() => store.publish(state))
    }
    expect(probe.renders()).toBe(before)

    // A structural change that says the same thing about the cast (the answer
    // completes, a tool row arrives) hands the scene the very same list.
    act(() =>
      store.publish({
        ...store.getSnapshot(),
        items: [
          store.getSnapshot().items[0]!,
          { ...answer, status: 'completed', text: 'done' },
          { ...answer, id: 'tool-1', type: 'tool_call', text: 'rg' },
        ],
        liveItems: new Map(),
      }),
    )
    expect(probe.seen.at(-1)).toBe(listIdentity)
    expect(probe.seen).toHaveLength(1)
  })

  it('says nothing and subscribes to nothing for a chat without Motion', () => {
    const store = new ThreadFrameStore(stateWith(helper('a', 'Moss')))
    const probe = mount(store, false)
    expect(probe.seen.at(-1)).toEqual([])
    act(() => store.publish(stateWith(helper('a', 'Moss'), helper('b', 'Pip'))))
    expect(probe.seen).toHaveLength(1)
  })
})
