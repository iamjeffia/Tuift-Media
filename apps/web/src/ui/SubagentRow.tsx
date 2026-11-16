import { memo } from 'react'
import type { Item, Subagent } from '@harness/contracts'
import { IconChevronRight as ChevronRight, IconSubtask as SubagentIcon } from '@tabler/icons-react'
import { useDisclosure } from './disclosure.js'
import { parseToolCall } from './tool-call-text.js'
import { LiveElapsed } from './LiveElapsed.js'
import { elapsedLabel, liveClockRunning } from './live-clock.js'
import '../styles/subagent.css'

/**
 * A helper agent the main agent started, drawn on the call that started it.
 * Adapters fold the subagent's own steps into `item.subagent` and send the
 * whole snapshot again when it changes, so a row re-renders only when its own
 * item does. Its live clock writes one text node a second and never renders.
 */

export function SubagentGlyph() {
  return <SubagentIcon size={14} />
}

/** "Running Explore · Find the token refresh": one subagent in a summary line. */
export function subagentActivityLabel(subagent: Subagent): string {
  const task = subagent.description ? ` · ${oneLine(subagent.description)}` : ''
  switch (subagent.state) {
    case 'running':
      return `Running ${subagent.name ?? 'a subagent'}${task}`
    case 'completed':
      return `Ran ${subagent.name ?? 'a subagent'}${task}`
    case 'failed':
      return `${subagent.name ?? 'Subagent'} failed${task}`
    case 'interrupted':
      return `${subagent.name ?? 'Subagent'} interrupted${task}`
  }
}

export function runningSubagentCount(items: readonly Item[]): number {
  let running = 0
  for (const item of items) if (item.subagent?.state === 'running') running += 1
  return running
}

export function runningSubagentsText(count: number): string {
  return count === 1 ? '1 subagent running' : `${count} subagents running`
}

/**
 * The subagents a live work summary waits on: those the main agent did not send to the
 * background and that still run. Undefined while only background subagents run, because
 * the main agent's own step is then the news.
 */
export function waitingSubagents(
  items: readonly Item[],
): { count: number; only: Item; since: number } | undefined {
  let only: Item | undefined
  let count = 0
  let since = Number.POSITIVE_INFINITY
  let foreground = false
  for (const item of items) {
    const subagent = item.subagent
    if (subagent?.state !== 'running') continue
    count += 1
    only = item
    since = Math.min(since, item.createdAt)
    foreground ||= subagent.background !== true
  }
  return foreground && only ? { count, only, since } : undefined
}

/**
 * What a live work summary says while subagents the main agent did not send to the
 * background are running: that one by name, or how many run.
 */
export function waitingSubagentsLabel(items: readonly Item[]): string | undefined {
  const waiting = waitingSubagents(items)
  if (!waiting?.only.subagent) return undefined
  return waiting.count === 1
    ? subagentActivityLabel(waiting.only.subagent)
    : `Running ${waiting.count} subagents`
}

/**
 * What a running subagent is doing right now, in the provider's own words, and how many
 * tools it has used. Only what the provider reported: Claude Code sends a progress line
 * ("Reading notes.txt") and the tool's name, Codex, Grok and TUIFT Code's own subagents the
 * tool's name, and a provider that sends nothing about a subagent's steps gets nothing here.
 */
export function subagentNow(
  subagent: Subagent,
): { doing: string | undefined; tools: number } | undefined {
  if (subagent.state !== 'running') return undefined
  const doing = oneLine(subagent.summary ?? subagent.lastTool ?? '') || undefined
  const tools = subagent.toolUses ?? 0
  return doing || tools > 0 ? { doing, tools } : undefined
}

/** The dim line under a running subagent: its latest step and how many tools it has used. */
export function SubagentNow({ subagent }: { subagent: Subagent }) {
  const now = subagentNow(subagent)
  if (!now) return null
  const tools = now.tools > 0 ? `${now.tools} ${now.tools === 1 ? 'tool' : 'tools'}` : undefined
  return (
    <p className="live-now" title={now.doing}>
      {now.doing ? (
        <span key={now.doing} className="live-now__text">
          {now.doing}
        </span>
      ) : null}
      {tools ? <span className="live-now__count">{tools}</span> : null}
    </p>
  )
}

export const SubagentRow = memo(function SubagentRow({ item }: { item: Item }) {
  const disclosure = useDisclosure()
  const subagent = item.subagent
  if (!subagent) return null
  const prompt = subagentPrompt(item)
  const lastTool = subagent.state === 'running' ? subagent.lastTool : undefined
  const expandable = Boolean(prompt || lastTool || subagent.summary)
  const name = subagent.name ?? 'Subagent'
  const title = [name, subagent.description && oneLine(subagent.description)]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className="aux aux--subagent"
      data-state={subagent.state}
      data-expanded={disclosure.expanded}
      data-failed={subagent.state === 'failed'}
    >
      <button
        type="button"
        className="aux__row"
        aria-expanded={expandable ? disclosure.expanded : undefined}
        disabled={!expandable}
        title={title}
        onClick={disclosure.toggle}
      >
        <span className="aux__glyph" aria-hidden>
          <SubagentGlyph />
        </span>
        <span className="aux__label">
          <span className="subagent__name">{name}</span>
          {subagent.description ? (
            <span className="subagent__task">{oneLine(subagent.description)}</span>
          ) : null}
        </span>
        {subagent.background ? <span className="subagent__tag">Background</span> : null}
        <SubagentStatus subagent={subagent} startedAt={item.createdAt} />
        {expandable ? (
          <ChevronRight className="aux__chevron" size={14} strokeWidth={1.8} aria-hidden />
        ) : null}
      </button>
      <SubagentNow subagent={subagent} />
      {expandable ? (
        <div
          ref={disclosure.revealRef}
          className="aux__reveal"
          data-open={disclosure.dataOpen}
          aria-hidden={!disclosure.expanded}
          inert={!disclosure.expanded}
          onTransitionEnd={(event) => {
            if (event.target === event.currentTarget && event.propertyName === 'transform')
              disclosure.finishTransition()
          }}
        >
          {disclosure.contentMounted ? (
            <div className="aux__reveal-clip">
              <div className="aux__out tool-detail subagent__detail">
                {prompt || lastTool ? (
                  <dl className="tool-detail__args">
                    {prompt ? (
                      <>
                        <dt>Task</dt>
                        <dd>{prompt}</dd>
                      </>
                    ) : null}
                    {lastTool ? (
                      <>
                        <dt>Last tool</dt>
                        <dd>{lastTool}</dd>
                      </>
                    ) : null}
                  </dl>
                ) : null}
                {subagent.summary ? (
                  <pre className="tool-detail__output">{subagent.summary}</pre>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
})

/** Several subagents started together read as one header that opens to each of them. */
export function SubagentGroup({ items }: { items: Item[] }) {
  const disclosure = useDisclosure()
  const running = runningSubagentCount(items)
  let failed = 0
  for (const item of items) if (item.subagent?.state === 'failed') failed += 1
  const label = `${items.length} subagents`

  return (
    <div
      className="activity activity--batch activity--subagents"
      data-expanded={disclosure.expanded}
    >
      <button
        type="button"
        className="activity__summary"
        aria-expanded={disclosure.expanded}
        onClick={disclosure.toggle}
      >
        <span className="activity__glyph" aria-hidden>
          <SubagentGlyph />
        </span>
        <span className="activity__label">
          {label}
          {running > 0 ? <span className="activity__outcome"> · {running} running</span> : null}
          {failed > 0 ? (
            <span className="activity__outcome is-failed"> · {failed} failed</span>
          ) : null}
        </span>
        <ChevronRight className="activity__chevron" size={15} strokeWidth={1.8} aria-hidden />
      </button>
      <div
        ref={disclosure.revealRef}
        className="activity__reveal"
        data-open={disclosure.dataOpen}
        aria-hidden={!disclosure.expanded}
        inert={!disclosure.expanded}
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && event.propertyName === 'transform')
            disclosure.finishTransition()
        }}
      >
        {disclosure.contentMounted ? (
          <div className="activity__reveal-clip">
            <div className="activity__body">
              {items.map((item) => (
                <SubagentRow key={item.id} item={item} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * "Running · 3 tools · 5.2k tokens · 41s", "Failed · 2 tools". CSS draws the dots between
 * parts, so a narrow chat can drop the token count without leaving one behind. A list that
 * already groups the running ones passes quietRunning to leave the word out.
 */
export function SubagentStatus({
  subagent,
  startedAt,
  quietRunning = false,
}: {
  subagent: Subagent
  startedAt: number
  quietRunning?: boolean
}) {
  const state =
    subagent.state === 'running' ? (
      quietRunning ? null : (
        <span className="subagent__part subagent__state">
          <span className="subagent__pulse" aria-hidden />
          Running
        </span>
      )
    ) : subagent.state === 'failed' ? (
      <span className="subagent__part subagent__state is-failed">Failed</span>
    ) : subagent.state === 'interrupted' ? (
      <span className="subagent__part subagent__state">Interrupted</span>
    ) : null
  const tools = subagent.toolUses ?? 0
  const tokens = subagent.tokens ?? 0
  const time =
    subagent.state === 'running' ? (
      <LiveElapsed since={startedAt} className="subagent__elapsed" />
    ) : subagent.durationMs !== undefined && subagent.durationMs >= 1000 ? (
      elapsedLabel(subagent.durationMs)
    ) : null
  if (!state && tools === 0 && tokens === 0 && !time) return null
  return (
    <span className="subagent__status">
      {state}
      {tools > 0 ? (
        <span className="subagent__part">{`${tools} ${tools === 1 ? 'tool' : 'tools'}`}</span>
      ) : null}
      {tokens > 0 ? (
        <span className="subagent__part subagent__part--tokens">{`${compactCount(tokens)} tokens`}</span>
      ) : null}
      {time ? <span className="subagent__part">{time}</span> : null}
    </span>
  )
}
/** Whether the shared clock is running, for tests. */
export function subagentClockRunning(): boolean {
  return liveClockRunning()
}

/** What the main agent asked the subagent to do, when the call carries it. */
function subagentPrompt(item: Item): string | undefined {
  const { args } = parseToolCall(item.text)
  const prompt = args && !Array.isArray(args) ? args['prompt'] : undefined
  return typeof prompt === 'string' && prompt.trim() ? prompt.trim() : undefined
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function compactCount(count: number): string {
  if (count < 1_000) return String(count)
  if (count < 1_000_000) return `${trimZero((count / 1_000).toFixed(1))}k`
  return `${trimZero((count / 1_000_000).toFixed(1))}M`
}

function trimZero(text: string): string {
  return text.endsWith('.0') ? text.slice(0, -2) : text
}
