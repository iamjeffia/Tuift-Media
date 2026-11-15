import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AFTER_EFFECTS_SERVER_ID,
  afterEffectsServerConfig,
  afterEffectsServerEntry,
  afterEffectsSource,
  currentAfterEffectsState,
  decideAfterEffects,
  findAfterEffects,
  isAfterEffectsName,
  type FileSystemView,
} from './motion-after-effects.js'

/** A file system of exactly these files; a folder exists when a file is under it. */
function fakeFileSystem(files: string[]): FileSystemView {
  const normal = (file: string) => file.replaceAll('\\', '/').replace(/\/$/, '')
  // Read at every question, so a test can add a file later.
  const all = () => files.map(normal)
  return {
    exists: (file) =>
      all().some((entry) => entry === normal(file) || entry.startsWith(`${normal(file)}/`)),
    list: (folder) => {
      const prefix = `${normal(folder)}/`
      return [
        ...new Set(
          all()
            .filter((entry) => entry.startsWith(prefix))
            .map((entry) => entry.slice(prefix.length).split('/')[0]!),
        ),
      ]
    },
  }
}

const WINDOWS_ROOT = 'C:\\Program Files\\Adobe'
const aeExe = (year: number) =>
  `${WINDOWS_ROOT}\\Adobe After Effects ${year}\\Support Files\\AfterFX.exe`

describe('where the After Effects server comes from', () => {
  const variableEntry = path.join('D:\\tools\\ae', 'dist', 'index.js')
  const packagedEntry = path.join('R:\\app\\resources', 'after-effects-mcp', 'dist', 'index.js')
  const env = {
    TUIFT_AE_MCP_DIR: 'D:\\tools\\ae',
    HARNESS_DEFAULT_SKILLS_DIR: 'R:\\app\\resources\\default-skills',
  }

  it('takes the variable first, when the folder has dist/index.js', () => {
    const fs = fakeFileSystem([variableEntry, packagedEntry])
    expect(afterEffectsServerEntry(env, fs)).toBe(variableEntry)
  })

  it('falls back to the packaged folder next to the default skills', () => {
    const fs = fakeFileSystem([packagedEntry])
    expect(afterEffectsServerEntry(env, fs)).toBe(packagedEntry)
    // A variable that points at nothing is not a location.
    expect(afterEffectsServerEntry({ ...env, TUIFT_AE_MCP_DIR: 'D:\\missing' }, fs)).toBe(
      packagedEntry,
    )
  })

  it('is none when neither place has it, and looks nowhere else', () => {
    const seen: string[] = []
    const fs: FileSystemView = {
      exists: (file) => {
        seen.push(file)
        return false
      },
      list: () => [],
    }
    expect(afterEffectsServerEntry(env, fs)).toBeUndefined()
    expect(seen).toEqual([variableEntry, packagedEntry])
    // No variable and an unpackaged run: nothing to check at all.
    seen.length = 0
    expect(afterEffectsServerEntry({}, fs)).toBeUndefined()
    expect(seen).toEqual([])
  })
})

describe('whether After Effects is installed', () => {
  const windows = (files: string[], env: NodeJS.ProcessEnv = {}) =>
    findAfterEffects(env, 'win32', fakeFileSystem(files))

  it('finds the newest year of the standard Windows folder', () => {
    expect(windows([aeExe(2024), aeExe(2026), aeExe(2025)])).toBe(aeExe(2026))
    expect(windows([aeExe(2024)])).toBe(aeExe(2024))
  })

  it('skips a year whose executable is missing and non-yearly folders', () => {
    const files = [
      `${WINDOWS_ROOT}\\Adobe After Effects 2026\\Support Files\\Plug-ins\\x.aex`,
      `${WINDOWS_ROOT}\\Adobe After Effects (Beta)\\Support Files\\AfterFX.exe`,
      `${WINDOWS_ROOT}\\Adobe Premiere Pro 2026\\Support Files\\Premiere.exe`,
      aeExe(2025),
    ]
    expect(windows(files)).toBe(aeExe(2025))
  })

  it('is none when After Effects is not there', () => {
    expect(windows([])).toBeUndefined()
    expect(windows([`${WINDOWS_ROOT}\\Adobe Photoshop 2026\\Photoshop.exe`])).toBeUndefined()
  })

  it("reads the Program Files of the machine, and honours the server's own variable first", () => {
    const other = 'D:\\Programs\\Adobe\\Adobe After Effects 2026\\Support Files\\AfterFX.exe'
    expect(windows([other], { ProgramFiles: 'D:\\Programs' })).toBe(other)
    const custom = 'E:\\portable\\AfterFX.exe'
    expect(windows([custom, aeExe(2026)], { AE_MCP_EXE: custom })).toBe(custom)
    // Its older name works too; a variable that points at nothing is ignored.
    expect(windows([custom], { AE_EXE: custom })).toBe(custom)
    expect(windows([aeExe(2026)], { AE_MCP_EXE: 'E:\\gone\\AfterFX.exe' })).toBe(aeExe(2026))
  })

  it('finds the newest application bundle on macOS, and nothing on Linux', () => {
    const app = (year: number) =>
      `/Applications/Adobe After Effects ${year}/Adobe After Effects ${year}.app/Contents/MacOS/x`
    const fs = fakeFileSystem([app(2025), app(2026)])
    expect(findAfterEffects({}, 'darwin', fs)).toBe(
      '/Applications/Adobe After Effects 2026/Adobe After Effects 2026.app',
    )
    expect(findAfterEffects({}, 'linux', fs)).toBeUndefined()
  })

  it('reads the file system again at every question', () => {
    const files: string[] = []
    const fs = fakeFileSystem(files)
    const source = afterEffectsSource({}, 'win32', fs, 'runner.exe')
    expect(source.executable()).toBeUndefined()
    files.push(aeExe(2026))
    // Installed while the app was open.
    expect(source.executable()).toBe(aeExe(2026))
  })
})

describe('the server as a stdio MCP server', () => {
  it('runs on the app itself in Node mode and hands the server the executable', () => {
    const server = afterEffectsServerConfig(
      { runner: 'C:\\app\\TUIFT Code.exe' },
      'R:\\app\\resources\\after-effects-mcp\\dist\\index.js',
      aeExe(2026),
    )
    expect(server).toEqual({
      id: AFTER_EFFECTS_SERVER_ID,
      enabled: true,
      displayName: 'After Effects',
      transport: {
        type: 'stdio',
        command: 'C:\\app\\TUIFT Code.exe',
        args: ['R:\\app\\resources\\after-effects-mcp\\dist\\index.js'],
        environment: {
          ELECTRON_RUN_AS_NODE: { source: 'literal', value: '1' },
          AE_MCP_EXE: { source: 'literal', value: aeExe(2026) },
          AE_MCP_ENABLE_EVAL: { source: 'literal', value: '1' },
        },
      },
    })
  })
})

describe('what a Motion chat gets', () => {
  const found = {
    executable: aeExe(2026),
    entry: 'D:\\ae\\dist\\index.js',
    attachable: true,
    person: 'none' as const,
    runner: 'app.exe',
  }

  it('attaches the server when everything is there', () => {
    const decision = decideAfterEffects(found)
    expect(decision.state).toBe('ready')
    expect(decision.server?.id).toBe('after-effects')
  })

  it.each([
    ['After Effects is not installed', { executable: undefined }, 'not-installed'],
    ['there is no server', { entry: undefined }, 'unavailable'],
    ['the provider takes no per-chat server', { attachable: false }, 'unavailable'],
    ['the person hid the server', { person: 'hidden' as const }, 'unavailable'],
  ])('attaches nothing when %s', (_when, change, state) => {
    expect(decideAfterEffects({ ...found, ...change })).toEqual({
      state,
      person: change.person ?? 'none',
    })
  })

  it("lets the person's own server win, whatever this machine found", () => {
    for (const change of [{}, { executable: undefined }, { entry: undefined }]) {
      expect(decideAfterEffects({ ...found, ...change, person: 'own' })).toEqual({
        state: 'ready',
        person: 'own',
      })
    }
  })

  it('shows the state of the session against the After Effects of now', () => {
    const attached = decideAfterEffects(found)
    expect(currentAfterEffectsState(attached, aeExe(2026))).toBe('ready')
    expect(currentAfterEffectsState(attached, undefined)).toBe('not-installed')
    // Installed after this session started without it: the session still has no server.
    const without = decideAfterEffects({ ...found, executable: undefined })
    expect(currentAfterEffectsState(without, aeExe(2026))).toBe('unavailable')
    expect(
      currentAfterEffectsState(decideAfterEffects({ ...found, person: 'own' }), undefined),
    ).toBe('ready')
  })

  it('knows the server by id or by name', () => {
    expect(['after-effects', 'After Effects', 'after_effects'].every(isAfterEffectsName)).toBe(true)
    expect(isAfterEffectsName('after-effects-docs')).toBe(false)
    expect(isAfterEffectsName(undefined)).toBe(false)
  })
})
