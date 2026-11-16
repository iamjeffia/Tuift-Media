/**
 * One clock for every live timer on screen: the "Working for" line, a running
 * helper, tool or command, the idle note. Each listener writes one text node, so
 * a tick never renders React and never touches the transcript. The interval
 * exists only while at least one listener is mounted (a row that is not on
 * screen has none) and the window is visible: a hidden window holds no timer, and
 * coming back to it brings every text up to date at once.
 */

const listeners = new Set<() => void>()
let clock: ReturnType<typeof setInterval> | undefined
let watching = false

function visible(): boolean {
  return globalThis.document?.visibilityState !== 'hidden'
}

function tick(): void {
  for (const listener of listeners) listener()
}

function sync(): void {
  if (listeners.size > 0 && visible()) {
    clock ??= setInterval(tick, 1_000)
  } else if (clock !== undefined) {
    clearInterval(clock)
    clock = undefined
  }
}

function onVisibilityChange(): void {
  sync()
  if (visible()) tick()
}

/** Calls `listener` once a second while the window is visible. Returns the stop function. */
export function onClockTick(listener: () => void): () => void {
  listeners.add(listener)
  if (!watching) {
    watching = true
    globalThis.document?.addEventListener('visibilitychange', onVisibilityChange)
  }
  sync()
  return () => {
    listeners.delete(listener)
    if (listeners.size > 0) return
    sync()
    watching = false
    globalThis.document?.removeEventListener('visibilitychange', onVisibilityChange)
  }
}

/** Whether the shared clock is running, for tests. */
export function liveClockRunning(): boolean {
  return clock !== undefined
}

/** How many timers listen to the shared clock, for tests. */
export function liveClockListeners(): number {
  return listeners.size
}

/** "41s", "2m 5s", "1h 3m": the figure a running row shows. */
export function elapsedLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
  if (minutes > 0) return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`
  return `${seconds}s`
}
