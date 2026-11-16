import { readdirSync } from 'node:fs'
import path from 'node:path'
import { CLUBE_PLANS_URL } from '@harness/contracts'

/**
 * What a Motion chat's session start says about sounds: where the project's own
 * sounds are, whether the app's sound library can be used (and how), and the
 * person's own sounds folder. The library's folder inside a project is the one
 * the library writes to, so what it fetched earlier is never mistaken for the
 * person's own.
 */

/** Where the library puts what it fetches, under the chat's project. */
export const LIBRARY_FOLDER = 'audio/clube'

/** The tools the library offers an agent on the app's agent tools channel. */
export const SOUND_TOOL_NAMES = ['sound_search', 'sound_use', 'music_search', 'music_use'] as const

export type SoundsSession = {
  /** The project's own sounds: a folder (relative to the project) and how many audio files it holds. */
  own?: { dir: string; files: number }
  /**
   * What the app's library gives this session. `tools`: the agent has its tools. `panel`: the
   * provider cannot reach them, so the person picks sounds in the Sounds tab. The rest say why
   * the library is closed.
   */
  library: 'tools' | 'panel' | 'off' | 'unlinked' | 'no-subscription'
  /** The person's own sounds folder, when they set one in Settings. */
  folder?: string
}

const AUDIO_EXTENSIONS: ReadonlySet<string> = new Set([
  '.wav',
  '.mp3',
  '.flac',
  '.ogg',
  '.m4a',
  '.aif',
  '.aiff',
  '.opus',
  '.aac',
])
/** Folders a video project usually keeps its sounds in, checked at its root. */
const OWN_FOLDERS = [
  'audio',
  'sounds',
  'sound',
  'sfx',
  'music',
  'sons',
  'musica',
  'assets/audio',
  'assets/sounds',
]
const MAX_ENTRIES_LOOKED_AT = 400
const DEPTH = 2

/**
 * The project's own sounds, found cheaply: a few well-known folders at the root,
 * and the folders in them, at most a few hundred entries, nothing read. Absent when none
 * has an audio file.
 */
export function detectProjectSounds(projectDir: string): SoundsSession['own'] {
  let best: SoundsSession['own']
  for (const candidate of OWN_FOLDERS) {
    const root = path.join(projectDir, ...candidate.split('/'))
    let budget = MAX_ENTRIES_LOOKED_AT
    const count = (directory: string, depth: number): number => {
      let entries
      try {
        entries = readdirSync(directory, { withFileTypes: true })
      } catch {
        return 0
      }
      let files = 0
      for (const entry of entries) {
        if (budget-- <= 0) break
        const full = path.join(directory, entry.name)
        if (entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
          files += 1
        } else if (entry.isDirectory() && depth < DEPTH) {
          // What the library fetched earlier is not the person's own.
          if (path.relative(projectDir, full).split(path.sep).join('/') === LIBRARY_FOLDER) {
            continue
          }
          files += count(full, depth + 1)
        }
      }
      return files
    }
    const files = count(root, 1)
    if (files > 0 && (!best || files > best.files)) best = { dir: candidate, files }
  }
  return best
}

const OWN = (own: NonNullable<SoundsSession['own']>) =>
  `This project has its own sounds in ${own.dir}/ (${own.files} audio files): use them first, and go further only for what they lack.`

const LIBRARY = {
  tools: `The app's sound library (the Clube's tonal sounds in every key, sound effects and music) is available through the tools ${SOUND_TOOL_NAMES.join(', ')}: at the soundtrack stage search it after the project's own sounds. Using a sound fetches one file into ${LIBRARY_FOLDER}/ in the project (about 200 a day), so choose before you use; what is already there is reused for free. A track's key and BPM are estimates.`,
  panel:
    "The app's sound library has no tools for this provider. When the person needs a sound or a track from it, ask them to pick it in the Sounds tab of the side panel: the tab attaches it to the chat.",
  off: `The person turned the app's sound library off in Settings: do not call ${SOUND_TOOL_NAMES.join(', ')}.`,
  unlinked: `The app's sound library needs a Clube do Motion account linked in Settings, and none is: do not call ${SOUND_TOOL_NAMES.join(', ')}. If the person wants the library, tell them to link the account in Settings.`,
  'no-subscription': `The linked Clube do Motion account has no subscription, so the app's sound library is closed: do not call ${SOUND_TOOL_NAMES.join(', ')}. The plans are at ${CLUBE_PLANS_URL}.`,
} as const satisfies Record<SoundsSession['library'], string>

/** The paragraph a Motion chat's role carries about where its sounds come from. */
export function soundsSentence(session: SoundsSession): string {
  return [
    session.own ? OWN(session.own) : '',
    LIBRARY[session.library],
    session.folder
      ? `The person's own sounds folder is ${session.folder}: look there after the library; nothing in it is indexed or copied.`
      : '',
  ]
    .filter(Boolean)
    .join(' ')
}
