import '../styles/live-feedback.css'

/** A tool or command that has run this long shows its own running time. */
export const LIVE_STEP_AFTER_MS = 5_000

/** How much of a command's output is read for its tail, however long the output is. */
const TAIL_WINDOW = 2_000
const TAIL_LIMIT = 160
// eslint-disable-next-line no-control-regex
const CONTROL = /\u001b\[[0-9;?]*[ -/]*[@-~]|[\u0000-\u0008\u000b-\u001f\u007f]/g

/** The last line of a command's output that says something: one short line, never the output. */
export function commandTail(output: string | undefined): string | undefined {
  if (!output) return undefined
  const lines = output
    .slice(-TAIL_WINDOW)
    .replace(/\r(?!\n)/g, '\n')
    .split('\n')
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!.replace(CONTROL, '').replace(/\s+/g, ' ').trim()
    if (line) return line.length > TAIL_LIMIT ? `…${line.slice(-TAIL_LIMIT)}` : line
  }
  return undefined
}

/** The dim line under a running command: the last line it printed. */
export function CommandNow({ output }: { output: string | undefined }) {
  const tail = commandTail(output)
  if (!tail) return null
  return (
    <p className="live-now live-now--tail" title={tail}>
      <span className="live-now__text">{tail}</span>
    </p>
  )
}
