import type { PickedAttachment } from './bridge.js'

/**
 * Lets a file shown in the chat ("Attach as context" in its menu) go into the prompt box through
 * the same intake a dropped file takes, without the transcript knowing about the composer: the
 * composer registers the one handler, the menu only asks.
 */
type Attacher = (files: PickedAttachment[]) => void

let attacher: Attacher | undefined

export function registerComposerAttacher(next: Attacher): () => void {
  attacher = next
  return () => {
    if (attacher === next) attacher = undefined
  }
}

export function canAttachToComposer(): boolean {
  return attacher !== undefined
}

export function attachToComposer(files: PickedAttachment[]): boolean {
  if (!attacher) return false
  attacher(files)
  return true
}
