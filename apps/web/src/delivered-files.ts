/**
 * Which paths a finished assistant message names, as candidates for a media card. The text comes
 * from a model, so this only finds strings: the desktop decides which of them are files the chat
 * may show (see apps/desktop/src/delivered-media.ts), and a candidate that does not resolve is
 * left as plain text. Runs once on a completed message, never while a reply streams.
 */
const EXTENSIONS = 'mp4|webm|mov|m4v|png|jpe?g|webp|gif|mp3|wav|m4a|ogg|pdf'
const AFTER = String.raw`(?![\p{L}\p{N}_])`
const SEGMENT = String.raw`[\p{L}\p{N}_@.+~()\-]`

const HAS_MEDIA = new RegExp(String.raw`\.(?:${EXTENSIONS})`, 'i')
const ENDS_WITH_MEDIA = new RegExp(String.raw`\.(?:${EXTENSIONS})$`, 'i')
const DRIVE_PATH = new RegExp(
  String.raw`(?<![\p{L}\p{N}_])[A-Za-z]:[\\/][^\r\n"<>|?*]*?\.(?:${EXTENSIONS})${AFTER}`,
  'giu',
)
const POSIX_PATH = new RegExp(
  String.raw`(?<![\p{L}\p{N}_:/.\\~\-])/(?:[^\s"<>|?*/]+/)*[^\s"<>|?*/]+\.(?:${EXTENSIONS})${AFTER}`,
  'giu',
)
const RELATIVE_PATH = new RegExp(
  String.raw`(?<![\p{L}\p{N}_@+~/\\:.\-])(?:\.{1,2}[\\/])?(?:${SEGMENT}+[\\/])*${SEGMENT}+\.(?:${EXTENSIONS})${AFTER}`,
  'giu',
)

/**
 * Only the desktop shell can resolve a path inside the project; a browser tab (the web sandbox, the
 * paired phone) leaves every path as plain text. Read at call time, so the transcript depends on
 * nothing but the page's own `window.harness`.
 */
export function canShowDeliveredFiles(): boolean {
  return typeof window !== 'undefined' && window.harness?.resolveDeliveredFiles !== undefined
}

/** More than this many paths in one message are ignored: a card per path would bury the reply. */
export const MAX_DETECTED_PATHS = 40
/** The most cards one message shows. */
export const MAX_DELIVERED_CARDS = 6
const MAX_TEXT = 200_000
const MAX_LINE = 2_000
const MAX_PATH = 1_024

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const INLINE_CODE = /(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g
const IMAGE = /!\[[^\]]*\]\([^)]*\)/g
const LINK = /\[[^\]]*\]\(\s*(<[^>]*>|[^)]*)\)/g
const URL_PATTERN =
  /<[a-z][a-z\d+.-]*:[^>\s]*>|\b[a-z][a-z\d+.-]*:\/\/[^\s)>\]]*|\bwww\.[^\s)>\]]*/gi
const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+/
const LABEL = /^[^\\/:]{1,40}:\s+/

function isUrl(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value) && !/^file:\/\//i.test(value)
}

/** The path a `file://` URL names, or the text itself; undefined for anything that is not local. */
function localTarget(value: string): string | undefined {
  let target = value.trim()
  if (/^file:\/\//i.test(target)) {
    // `file:///C:/x` is local; `file://host/x` is a network share.
    if (!/^file:\/\/\//i.test(target)) return undefined
    target = target.replace(/^file:\/\/\//i, '')
    if (!/^[a-z]:[\\/]/i.test(target)) target = `/${target}`
  }
  if (isUrl(target) || /^(?:mailto|data|javascript|blob):/i.test(target)) return undefined
  try {
    target = decodeURIComponent(target)
  } catch {
    // A malformed escape stays as written; the desktop will not find it.
  }
  return target.replace(/[?#].*$/, '')
}

/** A whole inline-code span or link target that is one path to a media file. */
function pathLike(value: string): boolean {
  const text = value.trim()
  if (!text || text.length > MAX_PATH || !ENDS_WITH_MEDIA.test(text)) return false
  if (/[\r\n]/.test(text) || isUrl(text)) return false
  if (!/\s/.test(text)) return true
  // With spaces it is a path only when it starts like one; `ffmpeg -i a.mp4 b.mp4` is a command.
  const first = text.split(/\s/)[0] ?? ''
  return /^(?:[a-z]:[\\/]|[\\/]|\.{1,2}[\\/])/i.test(text) || /[\\/]/.test(first)
}

/** Fenced blocks are code or command output, never a delivery. */
function outsideFences(text: string): string[] {
  const kept: string[] = []
  let fence: { char: string; length: number } | undefined
  for (const line of text.split('\n')) {
    const marker = FENCE.exec(line)?.[1]
    if (fence) {
      if (marker && marker[0] === fence.char && marker.length >= fence.length) fence = undefined
      continue
    }
    if (marker) {
      fence = { char: marker[0]!, length: marker.length }
      continue
    }
    kept.push(line)
  }
  return kept
}

export function detectDeliveredPaths(markdown: string): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  const add = (value: string | undefined) => {
    if (found.length >= MAX_DETECTED_PATHS || value === undefined) return
    const text = value.trim()
    if (!text || text.length > MAX_PATH || !ENDS_WITH_MEDIA.test(text) || text.startsWith('\\\\')) {
      return
    }
    const key = text.replace(/\\/g, '/').toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    found.push(text)
  }

  for (const original of outsideFences(markdown.slice(0, MAX_TEXT))) {
    if (found.length >= MAX_DETECTED_PATHS) break
    if (original.length > MAX_LINE || !HAS_MEDIA.test(original)) continue
    let line = original

    line = line.replace(INLINE_CODE, (_all, _ticks: string, code: string) => {
      if (pathLike(code)) add(code.trim())
      return ' '
    })
    line = line.replace(IMAGE, ' ')
    line = line.replace(LINK, (_all, destination: string) => {
      const inner = destination.trim()
      const target = inner.startsWith('<') ? inner.slice(1, inner.indexOf('>')) : inner
      const local = localTarget(target)
      if (local !== undefined && pathLike(local)) add(local)
      return ' '
    })
    line = line.replace(URL_PATTERN, ' ')

    // A line that is only a path (after a bullet, bold marks or a label such as "Arquivo:").
    const whole = line
      .replace(BULLET, '')
      .replace(/^[*_\s]+/, '')
      .replace(LABEL, '')
      .replace(/[*_\s]+$/, '')
    if (/\s/.test(whole) && pathLike(whole)) {
      add(whole)
      continue
    }

    for (const pattern of [DRIVE_PATH, POSIX_PATH, RELATIVE_PATH]) {
      line = line.replace(pattern, (match) => {
        add(match)
        return ' '.repeat(match.length)
      })
    }
  }
  return found
}
