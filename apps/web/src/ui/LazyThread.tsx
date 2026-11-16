import { lazy, memo, useState } from 'react'
import type { ThreadProps } from './Thread.js'

let threadModulePromise: Promise<typeof import('./Thread.js')> | undefined
let threadModule: typeof import('./Thread.js') | undefined

function loadThread() {
  threadModulePromise ??= import('./Thread.js')
    .then((module) => {
      threadModule = module
      return module
    })
    .catch((error: unknown) => {
      threadModulePromise = undefined
      throw error
    })
  return threadModulePromise
}

const Thread = lazy(() =>
  loadThread().then((module) => ({
    default: module.Thread,
  })),
)

export function preloadThread(): void {
  if (threadModulePromise) return
  void loadThread().catch(() => undefined)
}

export const LazyThread = memo(function LazyThread(props: ThreadProps) {
  // One component type for the life of this instance. Picking it again on every
  // render swapped the lazy wrapper for the loaded module on the first render after
  // the module arrived, which remounted the whole transcript: a message sent in that
  // moment lost its scroll state (the new prompt was never brought to the top).
  const [Chosen] = useState(() => threadModule?.Thread ?? Thread)
  return <Chosen {...props} />
})
