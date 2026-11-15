import { formatNumber } from '../../i18n/index.js'

/** A listed path under its root, in the root's own separators. */
export function rootedPath(root: string, relative: string): string {
  if (!relative) return root
  const separator = root.includes('\\') ? '\\' : '/'
  return `${root.replace(/[\\/]+$/, '')}${separator}${relative.split('/').join(separator)}`
}

export function lastPathPart(value: string): string {
  return value.split(/[\\/]/).filter(Boolean).at(-1) ?? value
}

const formatSize = (value: number) =>
  formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${formatSize(bytes / 1024)} KB`
  return `${formatSize(bytes / (1024 * 1024))} MB`
}
