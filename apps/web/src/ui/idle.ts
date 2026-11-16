/**
 * Telling "still working" from "nothing is happening". A running turn that has
 * heard nothing at all from its agent for a while says how long ago the last
 * activity was; after longer, it says calmly that a long step can take minutes.
 *
 * The thresholds come from what real long steps look like. A render, an install
 * or a test run goes quiet for tens of seconds routinely, so a note before 30
 * seconds would cry wolf on ordinary work. Past two minutes the quiet is long
 * enough that a person starts to wonder, and an explanation is worth the line.
 * The app cannot tell whether the provider's process is alive (no cheap signal
 * reaches it), so neither wording claims it: they say what is known, that the
 * turn is still open and no error was reported.
 */

/** Quiet for this long: show how long ago the last activity was. */
export const IDLE_NOTE_AFTER_MS = 30_000
/** Quiet for this long: say that long steps take time and nothing failed. */
export const IDLE_CALM_AFTER_MS = 120_000

export type IdleLevel = 'active' | 'quiet' | 'calm'

export function idleLevel(idleMs: number): IdleLevel {
  if (idleMs >= IDLE_CALM_AFTER_MS) return 'calm'
  return idleMs >= IDLE_NOTE_AFTER_MS ? 'quiet' : 'active'
}

/** The level a note needs before it shows. */
export function idleReaches(level: IdleLevel, wanted: Exclude<IdleLevel, 'active'>): boolean {
  return wanted === 'quiet' ? level !== 'active' : level === 'calm'
}
