import { useSyncExternalStore } from 'react'

/**
 * Lets a file link in the chat open its file in the Files tab without the
 * transcript knowing about the workspace panel: the app registers the one
 * handler that opens the panel, the links only ask.
 */
export type ProjectFileOpenRequest = {
  /** The absolute path the chat cited, already checked to be inside the project. */
  path: string
  projectPath: string
}

type ProjectFileOpener = (request: ProjectFileOpenRequest) => void

let opener: ProjectFileOpener | undefined
const listeners = new Set<() => void>()

export function registerProjectFileOpener(next: ProjectFileOpener): () => void {
  opener = next
  for (const listener of listeners) listener()
  return () => {
    if (opener !== next) return
    opener = undefined
    for (const listener of listeners) listener()
  }
}

/** Whether a click can open the file in the panel, or has to fall back to Explorer. */
export function canOpenProjectFileInPanel(): boolean {
  return opener !== undefined
}

/**
 * The same answer for a link that may render before the app has registered: it
 * renders again once the opener exists, instead of staying a plain label.
 */
export function useCanOpenProjectFileInPanel(): boolean {
  return useSyncExternalStore(subscribe, canOpenProjectFileInPanel, () => false)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function openProjectFileInPanel(request: ProjectFileOpenRequest): boolean {
  if (!opener) return false
  opener(request)
  return true
}
