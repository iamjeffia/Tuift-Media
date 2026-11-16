import { useEffect, useRef } from 'react'
import { onShellNotice, onUnloadProbe, reportActiveChat } from './bridge.js'

const OPEN_DIALOG = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open]'

/** A dialog on screen holds something the person is in the middle of. */
export function dialogIsOpen(doc: Document): boolean {
  return doc.querySelector(OPEN_DIALOG) !== null
}

/**
 * What the desktop shell needs from this page to rebuild it without loss. The
 * shell destroys a window hidden in the tray for a while, and reloads the page
 * after a crash; a new page then opens on the chat this one showed.
 *
 * Drafts (text, attachments, skill chips), the model and every setting are
 * saved already and come back by themselves. What lives only in this page, and
 * so blocks an unload, is `unloadSafe` false (Settings, setup, a side panel
 * with tabs, a terminal, a split view) and any dialog on screen.
 */
export function useShellLifecycle(options: {
  activeChatId: string | undefined
  unloadSafe: boolean
  showNotice: (text: string) => void
}): void {
  const { activeChatId, unloadSafe, showNotice } = options
  // A chat still starting has no id the server will keep.
  const chatId = activeChatId?.startsWith('pending:') ? undefined : activeChatId
  useEffect(() => {
    reportActiveChat(chatId)
  }, [chatId])

  const safe = useRef(unloadSafe)
  safe.current = unloadSafe
  useEffect(() => onUnloadProbe(() => safe.current && !dialogIsOpen(document)), [])

  const notice = useRef(showNotice)
  notice.current = showNotice
  useEffect(() => onShellNotice((text) => notice.current(text)), [])
}
