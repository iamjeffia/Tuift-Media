import type { StartupNotice } from '@harness/contracts'
import { say, type Language } from './strings'
import type { NoticeView } from './types'

/**
 * What the computer did at start-up that the person must read, worded as the desktop's notice
 * tray words it: that the database was damaged and put right, the date of the copy restored (or
 * that none opened), and where the damaged file was kept. The path is on the computer, so the
 * text says so and the phone offers nothing to open it.
 */
export function noticeView(notice: StartupNotice, language: Language): NoticeView {
  const restored = notice.backupAt !== null
  const date = restored
    ? new Date(notice.backupAt!).toLocaleString(language, { dateStyle: 'long', timeStyle: 'short' })
    : ''
  return {
    title: say(language, 'notice.title'),
    message: say(language, restored ? 'notice.restored' : 'notice.empty', { date }),
    detail: say(language, restored ? 'notice.restoredDetail' : 'notice.emptyDetail', {
      path: notice.asidePath,
    }),
    dismiss: say(language, 'notice.dismiss'),
  }
}
