import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { StartupNoticeSchema, type StartupNotice } from '@harness/contracts'

/**
 * A notice the server leaves for the person when it did something at start-up they must know
 * about. It lives in a small file beside the database, so it survives a restart and stays until
 * `dismiss`: every window and paired phone that connects gets it again.
 */
export class StartupNotices {
  readonly #file: string

  constructor(databasePath: string) {
    this.#file = path.join(path.dirname(databasePath), 'startup-notice.json')
  }

  current(): StartupNotice | undefined {
    try {
      const parsed = StartupNoticeSchema.safeParse(JSON.parse(readFileSync(this.#file, 'utf8')))
      return parsed.success ? parsed.data : undefined
    } catch {
      return undefined
    }
  }

  /** Written under a temporary name and renamed, so a crash never leaves half a notice. */
  write(notice: StartupNotice): void {
    mkdirSync(path.dirname(this.#file), { recursive: true })
    const partial = `${this.#file}.part`
    writeFileSync(partial, `${JSON.stringify(notice)}\n`, { encoding: 'utf8', mode: 0o600 })
    renameSync(partial, this.#file)
  }

  dismiss(): void {
    rmSync(this.#file, { force: true })
  }
}
