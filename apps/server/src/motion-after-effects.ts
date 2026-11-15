import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AfterEffectsState, McpServerConfig } from '@harness/contracts'

/**
 * After Effects for Motion chats. Where the house After Effects MCP server comes
 * from, whether After Effects is installed, and what a Motion chat's session gets
 * from the two. Everything here reads a few paths and starts nothing.
 */

/** The id the server is attached under: the one the Motion skills and the person's own setup use. */
export const AFTER_EFFECTS_SERVER_ID = 'after-effects'

/** A folder that contains `dist/index.js`, for development and for a machine that keeps the server elsewhere. */
export const AFTER_EFFECTS_DIR_ENV = 'TUIFT_AE_MCP_DIR'
const PACKAGED_FOLDER = 'after-effects-mcp'
/**
 * The folder `pnpm --filter @harness/after-effects-mcp sync` fills, for a run from source.
 * Both `src` and `dist` sit one level under `apps/server`, as for the default skills.
 */
const DEVELOPMENT_FOLDER = fileURLToPath(
  new URL('../../../packages/after-effects-mcp/bundle/after-effects-mcp', import.meta.url),
)

/** The variables the server reads for the After Effects executable, in its own order. */
const SERVER_EXECUTABLE_ENV = ['AE_MCP_EXE', 'AE_EXE'] as const

/** Only what the lookups need from the file system, so tests bring their own. */
export type FileSystemView = {
  exists(file: string): boolean
  /** The names in a folder; empty when it is missing. */
  list(folder: string): string[]
}

export const realFileSystem: FileSystemView = {
  exists: (file) => existsSync(file),
  list: (folder) => {
    try {
      return readdirSync(folder)
    } catch {
      return []
    }
  },
}

/**
 * The server's folder: the variable, else the packaged folder next to the other
 * resources, else the workspace's synced bundle, else none. A packaged build tells
 * the server where its resources are only through the default skills folder
 * (`resources/default-skills`), so the packaged folder is that one's sibling.
 * Nothing else is searched.
 */
export function afterEffectsServerEntry(
  env: NodeJS.ProcessEnv,
  fs: FileSystemView = realFileSystem,
  developmentFolder: string = DEVELOPMENT_FOLDER,
): string | undefined {
  const skills = env['HARNESS_DEFAULT_SKILLS_DIR']?.trim()
  const folders = [
    env[AFTER_EFFECTS_DIR_ENV]?.trim(),
    skills ? path.join(path.dirname(path.resolve(skills)), PACKAGED_FOLDER) : undefined,
    developmentFolder,
  ]
  for (const folder of folders) {
    if (!folder) continue
    const entry = path.join(folder, 'dist', 'index.js')
    if (fs.exists(entry)) return entry
  }
  return undefined
}

const YEARLY = /^Adobe After Effects (\d{4})$/

/**
 * The After Effects to run, or undefined when there is none: the executable the
 * server's own variable names, else the newest year in the standard folder
 * (`AfterFX.exe` on Windows, the `.app` bundle on macOS, as the server finds it).
 */
export function findAfterEffects(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  fs: FileSystemView = realFileSystem,
): string | undefined {
  for (const name of SERVER_EXECUTABLE_ENV) {
    const configured = env[name]?.trim()
    if (configured && fs.exists(configured)) return configured
  }
  const windows = platform === 'win32'
  if (!windows && platform !== 'darwin') return undefined
  const join = windows ? path.win32.join : path.posix.join
  const roots = windows
    ? [...new Set([env['ProgramFiles'], env['ProgramW6432'], 'C:\\Program Files'])]
        .filter((root): root is string => !!root)
        .map((root) => join(root, 'Adobe'))
    : ['/Applications']
  for (const root of roots) {
    const years = fs
      .list(root)
      .flatMap((name) => {
        const year = YEARLY.exec(name)?.[1]
        return year ? [{ name, year: Number(year) }] : []
      })
      .sort((a, b) => b.year - a.year)
    for (const { name } of years) {
      const found = windows
        ? join(root, name, 'Support Files', 'AfterFX.exe')
        : join(root, name, `${name}.app`)
      if (fs.exists(found)) return found
    }
  }
  return undefined
}

/** What is known about the After Effects of this machine, read fresh each time (a person may install it while the app runs). */
export type AfterEffectsSource = {
  /** The After Effects executable, or undefined when it is not installed. */
  executable(): string | undefined
  /** The server's `dist/index.js`, or undefined when there is no server to attach. */
  entry(): string | undefined
  /** What runs the server: the app's own executable, so no system Node is needed. */
  runner: string
}

export function afterEffectsSource(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  fs: FileSystemView = realFileSystem,
  runner: string = process.execPath,
): AfterEffectsSource {
  return {
    executable: () => findAfterEffects(env, platform, fs),
    entry: () => afterEffectsServerEntry(env, fs),
    runner,
  }
}

/**
 * The server as a stdio MCP server. The app runs its own server as its own
 * executable in Node mode; this does the same, so the app never needs a `node`
 * on the machine (a plain Node ignores the switch). Eval is on as in the house
 * setup, which the Motion skills use for larger scripts.
 */
export function afterEffectsServerConfig(
  source: Pick<AfterEffectsSource, 'runner'>,
  entry: string,
  executable: string,
): McpServerConfig {
  const literal = (value: string) => ({ source: 'literal' as const, value })
  return {
    id: AFTER_EFFECTS_SERVER_ID,
    enabled: true,
    displayName: 'After Effects',
    transport: {
      type: 'stdio',
      command: source.runner,
      args: [entry],
      environment: {
        ELECTRON_RUN_AS_NODE: literal('1'),
        AE_MCP_EXE: literal(executable),
        AE_MCP_ENABLE_EVAL: literal('1'),
      },
    },
  }
}

/** The person's own After Effects server: `own` takes its place, `hidden` is their choice to have none. */
export type PersonalServer = 'own' | 'hidden' | 'none'

const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Whether a server id or name is After Effects. */
export const isAfterEffectsName = (name: string | undefined) =>
  name !== undefined && normalize(name) === normalize(AFTER_EFFECTS_SERVER_ID)

/** What a Motion chat's session starts with. */
export type AfterEffectsDecision = {
  /** What the role instruction says, and the screen shows until something changes. */
  state: AfterEffectsState
  /** The server this session attaches; absent when it attaches nothing. */
  server?: McpServerConfig
  person: PersonalServer
}

/**
 * The person's own server wins: nothing is attached and After Effects counts as
 * available, whatever this machine's lookup found (their server knows its own
 * executable). A hidden one means they want none. Otherwise the server is attached
 * when After Effects is installed, a server exists and the provider takes one.
 */
export function decideAfterEffects(input: {
  executable: string | undefined
  entry: string | undefined
  /** The chat's provider can take a per-chat stdio server. */
  attachable: boolean
  person: PersonalServer
  runner: string
}): AfterEffectsDecision {
  const { person } = input
  if (person === 'own') return { state: 'ready', person }
  if (!input.executable) return { state: 'not-installed', person }
  if (person === 'hidden' || !input.entry || !input.attachable) {
    return { state: 'unavailable', person }
  }
  return {
    state: 'ready',
    person,
    server: afterEffectsServerConfig(input, input.entry, input.executable),
  }
}

/**
 * The state to show for a session that started with `decision`, read against the
 * After Effects of now. A person can install After Effects while the app runs,
 * but a session that started without a server still has none: `unavailable`.
 */
export function currentAfterEffectsState(
  decision: AfterEffectsDecision,
  executable: string | undefined,
): AfterEffectsState {
  if (decision.person === 'own') return 'ready'
  if (!executable) return 'not-installed'
  return decision.server ? 'ready' : 'unavailable'
}
