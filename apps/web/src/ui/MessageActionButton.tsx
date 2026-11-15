import type { ReactNode } from 'react'
import { useI18n, type MessageKey } from '../i18n/index.js'

/**
 * An icon button beside a message (edit, restore). Its name and tooltip come
 * from the catalog, so they follow the interface language like Copy does.
 */
export function MessageActionButton({
  labelKey,
  onClick,
  children,
}: {
  labelKey: MessageKey
  onClick: () => void
  children: ReactNode
}) {
  const { t } = useI18n()
  const label = t(labelKey)
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}>
      {children}
    </button>
  )
}
