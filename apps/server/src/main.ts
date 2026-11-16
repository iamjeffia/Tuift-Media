import { takeFeedbackConfig } from './feedback-config.js'
import { SERVER_EXIT, startupCause } from './exit-codes.js'
import { installProcessGuards } from './process-guards.js'
import { takeEdition } from './provider-edition.js'
import { DEFAULT_PORT, startServer } from './server.js'

// The desktop's legacy launch runs this server as Electron in Node mode.
// Electron reads the switch only while it starts; left here, every terminal
// and provider CLI would inherit it, and an Electron app started from one of
// them would come up as plain Node.
delete process.env['ELECTRON_RUN_AS_NODE']
// Last resort for a rejection or exception nothing handled: logged, never silent.
installProcessGuards()
// Same reason: the feedback inbox key must live only in this process, never in
// the environment every agent CLI and terminal inherits.
const feedback = takeFeedbackConfig(process.env)
takeEdition(process.env)
// Which window this server belongs to; no agent CLI or terminal needs to know.
const instanceToken = process.env['HARNESS_INSTANCE_TOKEN']
delete process.env['HARNESS_INSTANCE_TOKEN']

// Electron utility processes expose their private parent channel separately
// from Node's child_process IPC channel.
const parentPort = (
  process as typeof process & {
    parentPort?: {
      on(event: 'message', listener: (event: { data: unknown }) => void): void
      postMessage(message: unknown): void
    }
  }
).parentPort

/** The way up to the process that owns this server; none for the CLI or a dev server. */
function toParent(): ((message: unknown) => void) | undefined {
  if (parentPort) return (message) => parentPort.postMessage(message)
  if (process.send) {
    return (message) => {
      if (process.connected) process.send?.(message, undefined, undefined, () => {})
    }
  }
  return undefined
}

const port = Number(process.env['HARNESS_PORT'] ?? DEFAULT_PORT)
// A start that fails says why, in the log line and in the exit code, so the desktop can tell a
// busy port or a locked database from a broken install instead of retrying them all alike.
function start(): ReturnType<typeof startServer> {
  try {
    return startServer({
      port,
      host: process.env['HARNESS_HOST'] ?? '127.0.0.1',
      accessToken: process.env['HARNESS_ACCESS_TOKEN'],
      instanceToken,
      feedback,
      onChatActivity: toParent(),
    })
  } catch (error) {
    const cause = startupCause(error)
    console.error(
      `[server] cannot start${cause ? ` (${cause})` : ''}: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(cause ? SERVER_EXIT[cause] : 1)
  }
}
const server = start()

let shuttingDown = false
function shutdown(): void {
  if (shuttingDown) return
  shuttingDown = true
  void Promise.resolve()
    .then(() => server.close())
    .then(
      () => process.exit(0),
      (error: unknown) => {
        console.error('[server] shutdown failed', error)
        process.exit(1)
      },
    )
}

function shutdownMessage(value: unknown): void {
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Reflect.ownKeys(value).length === 1 &&
    Object.hasOwn(value, 'type') &&
    'type' in value &&
    value.type === 'harness:shutdown'
  )
    shutdown()
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, shutdown)
process.on('message', shutdownMessage)
// A legacy desktop child keeps running when the main process dies without
// asking it to stop (crash, kill), and it would hold the port and the data
// lease against the next launch. Losing the parent's IPC channel means no one
// owns this server any more. Without an IPC channel this never fires.
process.on('disconnect', shutdown)

parentPort?.on('message', (event) => shutdownMessage(event.data))
