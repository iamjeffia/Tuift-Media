import { useCallback, useEffect, useState } from 'react'
import { IconHourglass } from '@tabler/icons-react'
import { chatCount } from '../app-update-install.js'
import { answerQuit, onQuitRequested } from '../bridge.js'
import { useI18n } from '../i18n/index.js'
import { NoticeBody } from './Notice.js'
import { NoticePresence } from './NoticePresence.js'

let stylesLoaded = false

/**
 * Quitting from inside the app while chats work asks first, in the notice the update question
 * uses: the shell holds the quit and sends how many chats run; Keep working leaves everything
 * as it is, and Quit and stop lets the quit go on (the server stops each turn the way Stop does
 * and marks the chat, so it can continue). Closing the notice is Keep working.
 */
export function QuitConfirmNotice() {
  const { t } = useI18n()
  const [chats, setChats] = useState<number>()
  const [styled, setStyled] = useState(stylesLoaded)
  useEffect(() => onQuitRequested((count) => setChats(count)), [])
  const asking = chats !== undefined
  // Updates and quits are rare, so the styles stay out of the startup sheet.
  useEffect(() => {
    if (!asking || styled) return
    let live = true
    const done = () => {
      stylesLoaded = true
      if (live) setStyled(true)
    }
    import('./app-update-toast.css').then(done, done)
    return () => {
      live = false
    }
  }, [asking, styled])
  const focusKeep = useCallback((button: HTMLButtonElement | null) => button?.focus(), [])
  const answer = (quit: boolean) => {
    setChats(undefined)
    answerQuit(quit)
  }
  return (
    <NoticePresence
      className="notice notice--app-update"
      tone="info"
      role="alert"
      visible={styled && asking}
      followComposer={false}
    >
      <NoticeBody
        tone="info"
        icon={<IconHourglass className="notice-icon" size={16} stroke={1.7} aria-hidden />}
        actions={
          <>
            <button
              className="notice-action notice-action--danger"
              type="button"
              onClick={() => answer(true)}
            >
              {t('dialogs.quit.confirm')}
            </button>
            <button
              // The choice that stops nothing takes the keyboard, so a stray Enter quits nothing.
              ref={focusKeep}
              className="notice-action"
              type="button"
              onClick={() => answer(false)}
            >
              {t('dialogs.quit.keep')}
            </button>
          </>
        }
        onDismiss={() => answer(false)}
        dismissLabel={t('dialogs.quit.cancel')}
      >
        {t('dialogs.quit.message', { chats: chatCount(chats ?? 0) })}
      </NoticeBody>
    </NoticePresence>
  )
}
