import { useEffect, useState } from 'react'
import type { StartupNotice } from '@harness/contracts'
import { getLanguage, t } from './i18n/index.js'
import type { Transport } from './transport.js'
import type { ComposerError } from './ui/ComposerErrors.js'

/**
 * What the server did while starting that the person must hear about: today, a damaged
 * database it put right. The server sends it again on every connection until it is
 * dismissed, so a window opened later, or after a restart, still shows it. It is a note in the
 * notice tray, never red; dismissing it tells the server, so no other window or phone keeps it.
 */
export function useStartupNotice(
  transport: Pick<Transport, 'on' | 'request'>,
): ComposerError | undefined {
  const [notice, setNotice] = useState<StartupNotice>()
  useEffect(
    () => transport.on('server.startupNotice', (data) => setNotice(data.notice ?? undefined)),
    [transport],
  )
  if (!notice) return undefined
  const restored = notice.backupAt !== null
  return {
    id: `startup:${notice.kind}:${notice.at}`,
    role: 'alert',
    tone: 'info',
    message: restored
      ? t('startup.database.restored', {
          date: new Date(notice.backupAt!).toLocaleString(getLanguage(), {
            dateStyle: 'long',
            timeStyle: 'short',
          }),
        })
      : t('startup.database.empty'),
    detail: t(restored ? 'startup.database.restoredDetail' : 'startup.database.emptyDetail', {
      path: notice.asidePath,
    }),
    dismiss: () => {
      setNotice(undefined)
      void transport.request('startup.dismissNotice', {}).catch(() => undefined)
    },
  }
}
