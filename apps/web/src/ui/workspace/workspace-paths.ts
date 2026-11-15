/** A listed path under its root, in the root's own separators. */
export function rootedPath(root: string, relative: string): string {
  if (!relative) return root
  const separator = root.includes('\\') ? '\\' : '/'
  return `${root.replace(/[\\/]+$/, '')}${separator}${relative.split('/').join(separator)}`
}

export function lastPathPart(value: string): string {
  return value.split(/[\\/]/).filter(Boolean).at(-1) ?? value
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
