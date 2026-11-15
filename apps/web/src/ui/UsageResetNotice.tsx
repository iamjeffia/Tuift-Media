import { useState } from 'react'
import { IconClockPause, IconPlayerPlay } from '@tabler/icons-react'
import { useI18n } from '../i18n/index.js'
import { NoticeBody } from './Notice.js'
import '../styles/usage-reset.css'

export type UsageResetNoticeProps = {
  resetsAt?: number | undefined
  source: string
  scheduled: boolean
  schedule: () => Promise<void>
  cancel: () => void
}

/** A shelf row in the one notice look (ui/Notice.tsx): resume this chat when usage resets. */
export function UsageResetNotice(props: UsageResetNoticeProps) {
  const { t, language } = useI18n()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const date = props.resetsAt === undefined ? undefined : new Date(props.resetsAt)
  const reset = date?.toLocaleString(language, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
  return (
    <div
      className="composer__error-row composer__usage-reset"
      data-notice-tone="info"
      aria-label={t('chat.usageReset.label')}
    >
      <NoticeBody
        tone="info"
        icon={<IconClockPause className="notice-icon" size={16} stroke={1.7} aria-hidden />}
        actions={
          <button
            className={`notice-action composer__usage-reset-action${props.scheduled ? ' is-scheduled' : ''}`}
            type="button"
            disabled={saving || !date}
            onClick={() => {
              if (props.scheduled) {
                props.cancel()
                return
              }
              setSaving(true)
              setError(undefined)
              void props
                .schedule()
                .catch(() => setError(t('chat.usageReset.scheduleFailed')))
                .finally(() => setSaving(false))
            }}
          >
            {!props.scheduled && <IconPlayerPlay size={13} aria-hidden />}
            {saving
              ? t('chat.usageReset.snoozing')
              : props.scheduled
                ? t('chat.usageReset.cancel')
                : t('chat.usageReset.resume')}
          </button>
        }
      >
        <span className="composer__usage-reset-copy" role={props.scheduled ? 'status' : undefined}>
          <strong>
            {props.scheduled
              ? t('chat.usageReset.snoozedUntil')
              : t('chat.usageReset.continueWhen')}
          </strong>
          <span>
            {date ? (
              <>
                {props.source} ·{' '}
                {props.scheduled ? t('chat.usageReset.resumes') : t('chat.usageReset.resets')}{' '}
                <time dateTime={date.toISOString()} title={date.toLocaleString(language)}>
                  {reset}
                </time>
              </>
            ) : (
              t('chat.usageReset.noTime')
            )}
          </span>
          {date && <span>{t('chat.usageReset.keepOpen')}</span>}
          {error && <span role="alert">{error}</span>}
        </span>
      </NoticeBody>
    </div>
  )
}
