import { languageAliases, shippedLanguageNames } from '../shiki-languages.js'

/** How the Files tab shows a file, chosen from its name alone so no bytes are read first. */
export type FileViewerKind = 'markdown' | 'image' | 'video' | 'audio' | 'pdf' | 'code'

/** The kinds the desktop streams from disk instead of reading as text. */
export type FileMediaKind = Exclude<FileViewerKind, 'markdown' | 'code'>

const MEDIA_EXTENSIONS = new Map<string, FileMediaKind>([
  ['apng', 'image'],
  ['avif', 'image'],
  ['bmp', 'image'],
  ['gif', 'image'],
  ['ico', 'image'],
  ['jpeg', 'image'],
  ['jpg', 'image'],
  ['png', 'image'],
  ['svg', 'image'],
  ['webp', 'image'],
  ['m4v', 'video'],
  ['mkv', 'video'],
  ['mov', 'video'],
  ['mp4', 'video'],
  ['ogv', 'video'],
  ['webm', 'video'],
  ['aac', 'audio'],
  ['flac', 'audio'],
  ['m4a', 'audio'],
  ['mp3', 'audio'],
  ['oga', 'audio'],
  ['ogg', 'audio'],
  ['opus', 'audio'],
  ['wav', 'audio'],
  ['pdf', 'pdf'],
])

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown'])

/** Files whose name, not extension, picks the grammar. */
const LANGUAGE_BY_FILE_NAME = new Map<string, string>([
  ['dockerfile', 'docker'],
  ['makefile', 'make'],
  ['.env', 'dotenv'],
  ['.gitignore', 'ini'],
  ['.npmrc', 'ini'],
])

const LANGUAGE_BY_EXTENSION = new Map<string, string>([
  ['cc', 'cpp'],
  ['cxx', 'cpp'],
  ['ex', 'elixir'],
  ['exs', 'elixir'],
  ['h', 'c'],
  ['hpp', 'cpp'],
  ['htm', 'html'],
  ['svg', 'xml'],
])

export function fileExtension(name: string): string {
  const base = name.split(/[\\/]/).at(-1) ?? name
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

export function fileViewerKind(name: string): FileViewerKind {
  const extension = fileExtension(name)
  if (MARKDOWN_EXTENSIONS.has(extension)) return 'markdown'
  return MEDIA_EXTENSIONS.get(extension) ?? 'code'
}

export function isMediaKind(kind: FileViewerKind): kind is FileMediaKind {
  return kind !== 'markdown' && kind !== 'code'
}

/** A grammar the app ships for this file, or undefined to show it as plain text. */
export function codeLanguage(name: string): string | undefined {
  const base = (name.split(/[\\/]/).at(-1) ?? name).toLowerCase()
  const candidate =
    LANGUAGE_BY_FILE_NAME.get(base) ??
    LANGUAGE_BY_EXTENSION.get(fileExtension(base)) ??
    fileExtension(base)
  const resolved = (languageAliases as Record<string, string>)[candidate] ?? candidate
  return (shippedLanguageNames as string[]).includes(resolved) ? resolved : undefined
}
