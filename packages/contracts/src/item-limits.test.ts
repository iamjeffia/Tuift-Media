import { describe, expect, it } from 'vitest'
import {
  countDiff,
  diffCutNote,
  endsWithStreamCut,
  isCutDiff,
  readDiffCut,
  itemTextLimit,
  MAX_DIFF_CHARS,
  MAX_ITEM_OUTPUT_CHARS,
  MAX_MESSAGE_CHARS,
  MAX_PLAN_CHARS,
  MAX_REASONING_CHARS,
  MAX_USER_MESSAGE_CHARS,
  streamCutMarker,
} from './item-limits.js'

describe('itemTextLimit', () => {
  it('limits machine output, the agent message and the diff, each to its own size', () => {
    expect(itemTextLimit({ type: 'command' })?.max).toBe(MAX_ITEM_OUTPUT_CHARS)
    expect(itemTextLimit({ type: 'tool_call' })?.max).toBe(MAX_ITEM_OUTPUT_CHARS)
    expect(itemTextLimit({ type: 'error' })?.max).toBe(MAX_ITEM_OUTPUT_CHARS)
    expect(itemTextLimit({ type: 'message', role: 'assistant' })?.max).toBe(MAX_MESSAGE_CHARS)
    expect(itemTextLimit({ type: 'message' })?.max).toBe(MAX_MESSAGE_CHARS)
    expect(itemTextLimit({ type: 'file_change' })?.max).toBe(MAX_DIFF_CHARS)
    expect(MAX_MESSAGE_CHARS).toBe(1024 * 1024)
    expect(MAX_DIFF_CHARS).toBe(1024 * 1024)
  })

  it('limits the plan and the reasoning to 256 KiB each, cut like a message', () => {
    expect(itemTextLimit({ type: 'plan' })).toEqual({
      max: MAX_PLAN_CHARS,
      noun: 'plan',
      keepEnd: true,
    })
    expect(itemTextLimit({ type: 'reasoning' })).toEqual({
      max: MAX_REASONING_CHARS,
      noun: 'reasoning',
      keepEnd: true,
    })
    expect(MAX_PLAN_CHARS).toBe(256 * 1024)
    expect(MAX_REASONING_CHARS).toBe(256 * 1024)
  })

  it('leaves what the user typed and the rest without a limit that cuts', () => {
    for (const type of ['unknown', 'notice'] as const) {
      expect(itemTextLimit({ type })).toBeUndefined()
    }
    // A message of the user is refused above its ceiling, never cut on the way in.
    expect(itemTextLimit({ type: 'message', role: 'user' })).toBeUndefined()
    expect(MAX_USER_MESSAGE_CHARS).toBe(256 * 1024)
  })

  it('keeps the end of a message and of output, and only the start of a diff', () => {
    expect(itemTextLimit({ type: 'message' })?.keepEnd).toBe(true)
    expect(itemTextLimit({ type: 'command' })?.keepEnd).toBe(true)
    expect(itemTextLimit({ type: 'file_change' })?.keepEnd).toBe(false)
  })
})

describe('the cut markers', () => {
  it('names what was cut, in a line of its own', () => {
    expect(streamCutMarker('message')).toBe('\n… message truncated …\n')
    expect(endsWithStreamCut(`text${streamCutMarker('output')}`)).toBe(true)
    expect(endsWithStreamCut(`text${streamCutMarker('diff')}`)).toBe(true)
    expect(endsWithStreamCut(`text${streamCutMarker('plan')}`)).toBe(true)
    expect(endsWithStreamCut(`text${streamCutMarker('reasoning')}`)).toBe(true)
    expect(endsWithStreamCut('text … output truncated …')).toBe(false)
  })

  it('knows a diff cut to its limit by its last line', () => {
    expect(isCutDiff('diff --git a/x b/x\n+a\n… 1048577 characters omitted …')).toBe(true)
    expect(isCutDiff('diff --git a/x b/x\n+a\n… 5 characters omitted … and more')).toBe(false)
    expect(isCutDiff('+… 5 characters omitted …')).toBe(false)
    expect(isCutDiff('')).toBe(false)
  })

  it('says in the note what the whole diff changes', () => {
    const note = diffCutNote(99, { files: 1, added: 3, removed: 0 })
    const cut = ['+a', note].join(String.fromCharCode(10))

    expect(note).toBe('… 99 characters omitted (1 file, +3 -0 in all) …')
    expect(isCutDiff(cut)).toBe(true)
    expect(readDiffCut(cut)).toEqual({
      omitted: 99,
      totals: { files: 1, added: 3, removed: 0 },
    })
  })

  it('counts files and lines of a whole diff', () => {
    const diff = [
      'diff --git a/a b/a',
      '--- a/a',
      '+++ b/a',
      '@@ -1 +1,2 @@',
      '-x',
      '+y',
      '+z',
      'diff --git a/b b/b',
      '@@ -1 +1 @@',
      '-q',
      '+r',
    ].join(String.fromCharCode(10))

    expect(countDiff(diff)).toEqual({ files: 2, added: 3, removed: 2 })
    expect(countDiff('')).toEqual({ files: 1, added: 0, removed: 0 })
  })
})
