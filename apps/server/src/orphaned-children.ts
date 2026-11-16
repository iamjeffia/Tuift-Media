import path from 'node:path'
import { openChildRegistry } from '@harness/proc'

/** The registry's file name, in the data folder, so two data folders never share one. */
export const CHILD_REGISTRY_FILE = 'child-processes.json'

/**
 * Starts writing down the processes this server spawns, and ends the ones an earlier run of the
 * app left behind (a provider CLI that outlived a crash, with the MCP servers it started). Call it
 * once, as soon as the server owns its data folder and before it answers a request that can start
 * a provider; do not wait for it before opening the port.
 *
 * Each left entry is ended only if its pid still names the process that was written down (same
 * start time, same executable) and the app that started it is gone; the registry's log lines
 * say what happened to each. Resolves when every entry is settled, and never rejects.
 */
export function reapOrphanedChildren(
  databasePath: string,
  log: (line: string) => void = (line) => console.log(`[orphans] ${line}`),
): Promise<void> {
  // No data folder to keep a file in: a throwaway in-memory database.
  if (databasePath === ':memory:') return Promise.resolve()
  try {
    const registry = openChildRegistry(path.join(path.dirname(databasePath), CHILD_REGISTRY_FILE), {
      log,
    })
    if (registry.leftBehind.length > 0)
      log(`${registry.leftBehind.length} process(es) written down by an earlier run: checking them`)
    return registry.reapLeftBehind().then(
      () => undefined,
      (error: unknown) => log(`the check failed: ${String(error)}`),
    )
  } catch (error) {
    log(`the check could not start: ${String(error)}`)
    return Promise.resolve()
  }
}
