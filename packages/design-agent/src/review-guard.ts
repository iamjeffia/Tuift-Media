import { createHash } from 'node:crypto'
import path from 'node:path'
import { readWorkspaceFile, workspaceEntries } from './workspace-files.js'

const MAX_FILE_BYTES = 4_000_000

/** Every regular file of the workspace and a fingerprint of its content (dependency trees stay opaque). */
export function workspaceFingerprint(workspacePath: string): Map<string, string> {
  const root = workspacePath
  const fingerprint = new Map<string, string>()
  for (const { relative, file } of workspaceEntries(workspacePath)) {
    if (!file) continue
    try {
      const bytes = readWorkspaceFile(path.join(root, relative), MAX_FILE_BYTES)
      fingerprint.set(relative, createHash('sha256').update(bytes).digest('hex'))
    } catch {
      // Too large or changing while read: its presence is still recorded.
      fingerprint.set(relative, 'unreadable')
    }
  }
  return fingerprint
}

/** The files that were added, removed or changed between two fingerprints, sorted. */
export function changedFiles(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): string[] {
  const changed = new Set<string>()
  for (const [file, hash] of before) if (after.get(file) !== hash) changed.add(file)
  for (const file of after.keys()) if (!before.has(file)) changed.add(file)
  return [...changed].sort()
}
