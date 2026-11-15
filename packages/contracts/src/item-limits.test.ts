import { describe, expect, it } from 'vitest'
import {
  endsWithStreamCut,
  isCutDiff,
  itemTextLimit,
  MAX_DIFF_CHARS,
  MAX_ITEM_OUTPUT_CHARS,
  MAX_MESSAGE_CHARS,
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

  it('leaves what the user typed, the reasoning and the rest without a limit', () => {
    for (const type of ['reasoning', 'plan', 'unknown', 'notice'] as const) {
      expect(itemTextLimit({ type })).toBeUndefined()
    }
    expect(itemTextLimit({ type: 'message', role: 'user' })).toBeUndefined()
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
    expect(endsWithStreamCut('text … output truncated …')).toBe(false)
  })

  it('knows a diff cut to its limit by its last line', () => {
    expect(isCutDiff('diff --git a/x b/x\n+a\n… 1048577 characters omitted …')).toBe(true)
    expect(isCutDiff('diff --git a/x b/x\n+a\n… 5 characters omitted … and more')).toBe(false)
    expect(isCutDiff('+… 5 characters omitted …')).toBe(false)
    expect(isCutDiff('')).toBe(false)
  })
})
