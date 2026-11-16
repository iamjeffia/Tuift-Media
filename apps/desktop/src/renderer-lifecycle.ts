import type { WebContents } from 'electron'

/** A page that stayed up this long is healthy again: its earlier crashes no longer count. */
export const RENDERER_HEALTHY_MS = 5 * 60_000
/** Automatic reloads in a row, without a healthy stretch between them, before the notice. */
export const MAX_RECENT_RELOADS = 3

/** What a reload is about to do, for the shell to record and to land the new page. */
export type RendererReload = {
  /** Electron's reason: oom, crashed, killed, launch-failed, ... */
  reason: string
  /** Reloads in this streak, this one included. */
  attempt: number
  /**
   * Whether the new page may reopen the chat that was open. Not after running out
   * of memory, and not on a second crash in a row: a chat too heavy to draw must
   * not crash the page again on every reload.
   */
  resumeChat: boolean
}

export type RendererLifecycle = {
  /** The person asked for a reload themselves: the automatic ones start over. */
  resetBudget: () => void
}

export function configureRendererLifecycle(
  contents: Pick<WebContents, 'on' | 'reload' | 'isDestroyed'>,
  options: {
    cancelCaptures: () => void
    /** The page was replaced, so state tied to the old page's listeners is stale. */
    onPageReplaced: () => void
    isQuitting: () => boolean
    onRepeatedCrash: () => void
    onReload?: (reload: RendererReload) => void
  },
): RendererLifecycle {
  let recentReloads = 0
  /** When the current page committed; no timer, so nothing is left running. */
  let pageSince: number | undefined
  // Not did-start-navigation: Electron emits it before will-navigate gets to
  // block a same-window link, and a blocked navigation leaves the old page
  // loaded. did-navigate fires only for a committed main-frame document,
  // reloads included.
  contents.on('did-navigate', () => {
    options.cancelCaptures()
    options.onPageReplaced()
    pageSince = Date.now()
  })
  contents.on('destroyed', options.cancelCaptures)
  contents.on('render-process-gone', (_event: unknown, details?: { reason?: string }) => {
    options.cancelCaptures()
    if (pageSince !== undefined && Date.now() - pageSince >= RENDERER_HEALTHY_MS) recentReloads = 0
    pageSince = undefined
    if (options.isQuitting() || contents.isDestroyed()) return
    // A few automatic retries, not endless ones: a broken preload or startup
    // route must not keep restarting the renderer without the user's consent.
    // A page that then stays healthy gets its budget back.
    if (recentReloads >= MAX_RECENT_RELOADS) {
      options.onRepeatedCrash()
      return
    }
    recentReloads += 1
    const reason = details?.reason ?? 'unknown'
    options.onReload?.({
      reason,
      attempt: recentReloads,
      resumeChat: reason !== 'oom' && recentReloads === 1,
    })
    contents.reload()
  })
  return {
    resetBudget: () => {
      recentReloads = 0
    },
  }
}
