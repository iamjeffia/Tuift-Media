/**
 * The exit codes the core server ends with when it cannot start, one per cause it can name.
 * A mirror of `SERVER_EXIT` in apps/server/src/exit-codes.ts (the desktop cannot import the
 * server without starting it); server-exit-codes.test.ts keeps both tables equal.
 */
export const SERVER_EXIT = {
  portInUse: 71,
  dataFolderInUse: 72,
  databaseLocked: 73,
  databaseDamaged: 74,
  databaseNoAccess: 75,
  diskFull: 76,
} as const

export type ServerExitCause = keyof typeof SERVER_EXIT

/** The named cause an exit code stands for, or undefined for any other code. */
export function serverExitCause(code: number | null): ServerExitCause | undefined {
  for (const cause of Object.keys(SERVER_EXIT) as ServerExitCause[]) {
    if (SERVER_EXIT[cause] === code) return cause
  }
  return undefined
}

/**
 * How many times the supervisor starts the server again after a failure with this cause.
 * A busy port, a held data folder or a locked database can clear in a moment (a copy still
 * closing, a scan finishing), so two quick retries; the rest cannot be fixed by trying again.
 */
export const RETRIES_BY_CAUSE = {
  portInUse: 2,
  dataFolderInUse: 2,
  databaseLocked: 2,
  databaseDamaged: 0,
  databaseNoAccess: 0,
  diskFull: 0,
} as const satisfies Record<ServerExitCause, number>
