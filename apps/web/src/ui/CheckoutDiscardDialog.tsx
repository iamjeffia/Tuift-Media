import { IconGitBranch as GitBranch, IconX as X } from '@tabler/icons-react'
import { useI18n } from '../i18n/index.js'
import { useDialogFocus } from './dialog-focus.js'
import '../styles/sheet.css'
import '../styles/checkout-discard.css'

export function CheckoutDiscardDialog(props: {
  title: string
  branch: string
  busy: boolean
  onDiscard: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const dialog = useDialogFocus<HTMLDivElement>(props.onClose)

  return (
    <div
      className="sheet"
      role="dialog"
      aria-modal="true"
      aria-label={t('dialogs.checkoutDiscard.label')}
      onKeyDown={dialog.onKeyDown}
    >
      <button
        className="sheet__scrim"
        onClick={props.onClose}
        aria-label={t('dialogs.checkoutDiscard.keep')}
      />
      <div className="sheet__panel checkout-discard" ref={dialog.panel} tabIndex={-1}>
        <header className="sheet__head">
          <div>
            <h2 className="sheet__title">{t('dialogs.checkoutDiscard.title')}</h2>
            <p className="checkout-discard__branch">
              <GitBranch size={12} aria-hidden />
              {props.branch}
            </p>
          </div>
          <button
            className="icon-btn icon-btn--always"
            onClick={props.onClose}
            title={t('dialogs.common.close')}
          >
            <X size={13} aria-hidden />
          </button>
        </header>
        <section className="sheet__section">
          <p className="checkout-discard__copy">
            {t('dialogs.checkoutDiscard.copy', { title: props.title })}
          </p>
          <div className="checkout-discard__actions">
            <button className="ghost" onClick={props.onClose} disabled={props.busy}>
              {t('dialogs.checkoutDiscard.keep')}
            </button>
            <button
              className="btn btn--danger"
              // A batch delete opens the next confirmation in this same spot, so
              // the second click of a double-click must not discard that chat too.
              onClick={(event) => {
                if (event.detail <= 1) props.onDiscard()
              }}
              disabled={props.busy}
            >
              {props.busy
                ? t('dialogs.checkoutDiscard.discarding')
                : t('dialogs.checkoutDiscard.discard')}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
