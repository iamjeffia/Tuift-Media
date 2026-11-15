import type { ReactNode } from 'react'
import { useI18n, type MessageKey } from '../i18n/index.js'

const STATE_LABELS = {
  checking: 'settings.stateLabel.checking',
  ready: 'settings.stateLabel.ready',
  'setup-needed': 'settings.stateLabel.setupNeeded',
  unavailable: 'settings.stateLabel.unavailable',
  failed: 'settings.stateLabel.failed',
} as const satisfies Record<string, MessageKey>

export type SettingsState = keyof typeof STATE_LABELS

export function StateLabel(props: {
  state: SettingsState
  detail?: string | undefined
  live?: boolean | undefined
}) {
  const { t } = useI18n()
  const label = t(STATE_LABELS[props.state])
  const title = props.detail ? `${label} · ${props.detail}` : label
  return (
    <span
      className={`state-label is-${props.state}`}
      role={props.live ? 'status' : undefined}
      aria-atomic={props.live || undefined}
      aria-label={title}
      title={title}
    >
      <span className="state-label__state">{label}</span>
      {props.detail ? (
        <span className="state-label__detail">
          <span aria-hidden> · </span>
          {props.detail}
        </span>
      ) : null}
    </span>
  )
}

export function SettingsMeta(props: { children: ReactNode }) {
  return <span className="settings-meta">{props.children}</span>
}
