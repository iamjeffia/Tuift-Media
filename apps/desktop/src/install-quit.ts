import { randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Asking the running app to quit so a new version can be installed.
 *
 * Closing the window sends the app to the tray, so nothing else ends it. The installer starts the
 * app's own executable with `--quit-for-install=silent|ask` (the "client"). With the app's data
 * folder unchanged, Electron's single-instance lock finds the running app and hands it the
 * client's request (`second-instance`); the client waits, reads what the app answers in a small
 * status file and exits with a code the installer reads (INSTALL_QUIT_EXIT).
 *
 * Who may ask: the lock is per user and per data folder, so only a process of the same user that
 * reaches the same folder is heard at all. On top of that the request must carry the token the
 * running app wrote into that folder when it started (a per-run secret, readable by that user
 * only), so a program that can start the executable but not read the folder is refused. The
 * install folder is not checked: the executable's own path is what the client claims, and a
 * claim is not proof.
 */

export const INSTALL_QUIT_SWITCH = '--quit-for-install'

export type InstallQuitMode = 'silent' | 'ask'

/** What the client exits with; the installer's script reads these (installer/clean-exit.nsh). */
export const INSTALL_QUIT_EXIT = {
  /** Nothing was running, or the app has quit. */
  gone: 0,
  /** Chats were working and nobody could be asked (silent): the app was left running. */
  chatsWorking: 10,
  /** The person chose to keep the chats working: the app was left running. */
  kept: 11,
  /** The question went unanswered for the whole wait: the app was left running. */
  unanswered: 12,
  /** The app did not answer in time (an older version, or hung). It was not asked to quit. */
  noAnswer: 20,
  /** The app accepted but was still running when the wait ended. */
  stillRunning: 21,
} as const

export const INSTALL_QUIT_WAITS = {
  /** From the request to the app's first answer. */
  answerMs: 5_000,
  /** How long a question to the person may stay open before the client gives up on it. */
  questionMs: 120_000,
  /** From the app accepting to the app being gone; longer than the app's own quit deadline. */
  quitMs: 25_000,
  pollMs: 200,
} as const

const INFO_FILE = 'quit-for-install.json'
const STATUS_FILE = 'quit-for-install-status.json'

export function parseInstallQuitMode(argv: readonly string[]): InstallQuitMode | undefined {
  for (const argument of argv) {
    if (argument === `${INSTALL_QUIT_SWITCH}=silent`) return 'silent'
    if (argument === `${INSTALL_QUIT_SWITCH}=ask`) return 'ask'
  }
  return undefined
}

export type InstallQuitRequest = { mode: InstallQuitMode; id: string; token: string }

export type InstallQuitState = 'asking' | 'refused' | 'kept' | 'quitting' | 'done'

export type InstallQuitStatus = {
  id: string
  state: InstallQuitState
  /** The app's main process, for the client to watch. */
  pid: number
  chats?: number
  /** True when the quit ran out of time and the app exited anyway. */
  forced?: boolean
  notClosed?: string[]
}

type Json = Record<string, unknown>

function readJson(file: string): Json | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'))
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Json)
      : undefined
  } catch {
    return undefined
  }
}

function writeJson(file: string, value: Json, mode: number): void {
  const temporary = `${file}.${process.pid}.tmp`
  writeFileSync(temporary, JSON.stringify(value), { mode })
  renameSync(temporary, file)
}

/** The running app's side: a secret for this run, and the main process id, in the data folder. */
export type InstallQuitChannel = { token: string; dispose: () => void }

export function openInstallQuitChannel(directory: string): InstallQuitChannel {
  const token = randomBytes(24).toString('base64url')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  rmSync(path.join(directory, STATUS_FILE), { force: true })
  writeJson(path.join(directory, INFO_FILE), { pid: process.pid, token }, 0o600)
  return { token, dispose: () => rmSync(path.join(directory, INFO_FILE), { force: true }) }
}

/** The client's request, built from what the running app wrote; none when it wrote nothing. */
export function readInstallQuitRequest(
  directory: string,
  mode: InstallQuitMode,
): InstallQuitRequest | undefined {
  const info = readJson(path.join(directory, INFO_FILE))
  if (typeof info?.['token'] !== 'string' || !info['token']) return undefined
  return { mode, id: randomBytes(9).toString('base64url'), token: info['token'] }
}

const STATES: readonly unknown[] = ['asking', 'refused', 'kept', 'quitting', 'done']

export function readInstallQuitStatus(directory: string): InstallQuitStatus | undefined {
  const value = readJson(path.join(directory, STATUS_FILE))
  if (typeof value?.['id'] !== 'string' || typeof value['pid'] !== 'number') return undefined
  const state = STATES.find((known) => known === value['state'])
  if (state === undefined) return undefined
  const { chats, forced, notClosed } = value
  return {
    id: value['id'],
    pid: value['pid'],
    state: state as InstallQuitState,
    ...(typeof chats === 'number' ? { chats } : {}),
    ...(typeof forced === 'boolean' ? { forced } : {}),
    ...(Array.isArray(notClosed) ? { notClosed: notClosed.map(String) } : {}),
  }
}

export function writeInstallQuitStatus(directory: string, status: InstallQuitStatus): void {
  try {
    writeJson(path.join(directory, STATUS_FILE), status, 0o600)
  } catch {
    // The client then sees no answer and the installer falls back; the quit itself goes on.
  }
}

/** What a second instance's additional data carries, checked field by field. */
export function parseInstallQuitRequest(value: unknown): InstallQuitRequest | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const request = (value as Json)['quitForInstall']
  if (typeof request !== 'object' || request === null) return undefined
  const { mode, id, token } = request as Json
  if (mode !== 'silent' && mode !== 'ask') return undefined
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) return undefined
  if (typeof token !== 'string' || token.length < 16 || token.length > 128) return undefined
  return { mode, id, token }
}

function sameSecret(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export type InstallQuitDeps = {
  /** This run's secret. */
  token: string
  pid: number
  /** Chats with a running turn, as the server reports them. */
  chats: () => number
  /** A quit is already under way. */
  quitting: () => boolean
  /** Starts the quit in order; no question. */
  quit: () => void
  /** Asks the person; they answer through `answered`. */
  ask: () => void
  status: (status: InstallQuitStatus) => void
  log: (line: string) => void
}

/**
 * The running app's side of a request. A request that does not carry this run's secret changes
 * nothing. Otherwise: a quit already under way is just reported; no chat working quits at once;
 * chats working are never stopped by a silent request (a script must not interrupt work) and
 * are put to the person when someone can answer.
 */
export function createInstallQuit(deps: InstallQuitDeps) {
  /** The latest request that was heard, and whether its question is still open. */
  let current: string | undefined
  let asking = false
  const report = (id: string, state: InstallQuitState, extra: Partial<InstallQuitStatus> = {}) =>
    deps.status({ id, state, pid: deps.pid, ...extra })

  return {
    handle(request: InstallQuitRequest | undefined): void {
      if (!request || !sameSecret(request.token, deps.token)) {
        deps.log('[quit] ignored a request to quit for an install that did not carry the secret')
        return
      }
      const { id, mode } = request
      current = id
      if (deps.quitting()) {
        report(id, 'quitting')
        return
      }
      const chats = deps.chats()
      if (chats === 0) {
        report(id, 'quitting')
        deps.quit()
        return
      }
      if (mode === 'silent') {
        deps.log(
          `[quit] a request to quit for an install was refused: ${chats} chat(s) working and nobody to ask`,
        )
        report(id, 'refused', { chats })
        return
      }
      asking = true
      report(id, 'asking', { chats })
      deps.ask()
    },
    /** The person answered the question a request opened. */
    answered(quit: boolean): void {
      if (!asking || !current) return
      asking = false
      report(current, quit ? 'quitting' : 'kept')
    },
    /** The quit ended: what the client is waiting to hear. */
    done(notClosed: string[], forced: boolean): void {
      if (current) report(current, 'done', { forced, notClosed })
    },
  }
}

export type InstallQuitClientDeps = {
  /** This process got the single-instance lock: no app is running with this data folder. */
  ownsLock: boolean
  request: InstallQuitRequest | undefined
  status: () => InstallQuitStatus | undefined
  alive: (pid: number) => boolean
  now: () => number
  sleep: (ms: number) => Promise<void>
  log: (line: string) => void
}

/** The client's wait: what the running app answers, until the app is gone or the answer is no. */
export async function runInstallQuitClient(deps: InstallQuitClientDeps): Promise<number> {
  const { request } = deps
  if (deps.ownsLock) {
    deps.log('[quit-for-install] no app is running')
    return INSTALL_QUIT_EXIT.gone
  }
  if (!request) {
    deps.log('[quit-for-install] the running app left nothing to ask it with')
    return INSTALL_QUIT_EXIT.noAnswer
  }
  const waits = INSTALL_QUIT_WAITS
  const started = deps.now()
  let asked: number | undefined
  let accepted: number | undefined
  let agreed: InstallQuitStatus | undefined
  for (;;) {
    const status = deps.status()
    // Another request may have overwritten the file after the app agreed to ours; its process is
    // still the one to wait for.
    const heard = status?.id === request.id ? status : undefined
    const mine =
      heard ?? (agreed?.state === 'quitting' || agreed?.state === 'done' ? agreed : undefined)
    if (heard) agreed = heard
    const now = deps.now()
    if (!mine) {
      if (now - started >= waits.answerMs) {
        deps.log(`[quit-for-install] the app did not answer in ${waits.answerMs} ms`)
        return INSTALL_QUIT_EXIT.noAnswer
      }
    } else if (mine.state === 'refused') {
      deps.log(`[quit-for-install] ${mine.chats ?? '?'} chat(s) working: the app was left running`)
      return INSTALL_QUIT_EXIT.chatsWorking
    } else if (mine.state === 'kept') {
      deps.log('[quit-for-install] the person chose to keep the chats working')
      return INSTALL_QUIT_EXIT.kept
    } else if (mine.state === 'asking') {
      asked ??= now
      if (now - asked >= waits.questionMs) {
        deps.log('[quit-for-install] the question went unanswered; the app was left running')
        return INSTALL_QUIT_EXIT.unanswered
      }
    } else {
      asked = undefined
      accepted ??= now
      if (!deps.alive(mine.pid)) {
        const late = mine.notClosed?.length ? ` (late: ${mine.notClosed.join(', ')})` : ''
        deps.log(
          `[quit-for-install] the app ended in ${now - accepted} ms${mine.forced ? ' by its own deadline' : ''}${late}`,
        )
        return INSTALL_QUIT_EXIT.gone
      }
      if (now - accepted >= waits.quitMs) {
        deps.log(`[quit-for-install] the app was still running ${waits.quitMs} ms after it agreed`)
        return INSTALL_QUIT_EXIT.stillRunning
      }
    }
    await deps.sleep(waits.pollMs)
  }
}

/** Whether a process still exists; one this user may not signal still counts. */
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}
