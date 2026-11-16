import type { Item } from '@harness/contracts'
import { commandLabel, inlineActivityText } from './command-label.js'
import { parseToolCall } from './tool-call-text.js'

/** What a running turn is doing right now, for the status line above the prompt box. */
export type RunningNow =
  | { kind: 'subagent'; count: number; name?: string; title?: string }
  | { kind: 'command'; command: string }
  | { kind: 'edit'; target: string }
  | { kind: 'tool'; name: string }

/** A long turn holds many rows; the newest ones are the news. */
const SCAN_LIMIT = 600

/**
 * The step a turn waits on: a subagent the main agent waits for first, then the
 * newest tool, command or edit still running, then subagents that run in the
 * background. Reads only the rows of that turn, from the end, and only the fields
 * the rows already carry, so a provider that says nothing gets nothing here.
 */
export function runningNow(items: readonly Item[], turnId: string): RunningNow | undefined {
  const foreground: Item[] = []
  const background: Item[] = []
  let step: Item | undefined
  const stop = Math.max(0, items.length - SCAN_LIMIT)
  for (let index = items.length - 1; index >= stop; index -= 1) {
    const item = items[index]!
    if (item.turnId === '') continue
    if (item.turnId !== turnId) break
    if (item.subagent?.state === 'running') {
      ;(item.subagent.background ? background : foreground).push(item)
    } else if (
      !step &&
      item.status === 'started' &&
      !item.subagent &&
      (item.type === 'command' || item.type === 'tool_call' || item.type === 'file_change')
    ) {
      step = item
    }
  }
  const helpers = foreground.length > 0 ? foreground : step ? [] : background
  if (helpers.length > 0) {
    const only = helpers.length === 1 ? helpers[0]!.subagent : undefined
    const title = only?.description ? inlineActivityText(only.description) : undefined
    return {
      kind: 'subagent',
      count: helpers.length,
      ...(only?.name ? { name: only.name } : {}),
      ...(title ? { title } : {}),
    }
  }
  if (!step) return undefined
  if (step.type === 'command') {
    const command = commandLabel(step.command)
    return command ? { kind: 'command', command } : undefined
  }
  if (step.type === 'file_change') {
    const target = inlineActivityText(step.path)
    return target ? { kind: 'edit', target } : undefined
  }
  const name = inlineActivityText(parseToolCall(step.text).name)
  return name ? { kind: 'tool', name } : undefined
}
