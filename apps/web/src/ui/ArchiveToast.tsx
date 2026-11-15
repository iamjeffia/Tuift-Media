import { IconTrash } from '@tabler/icons-react'
import { useI18n } from '../i18n/index.js'
import { NoticeBody } from './Notice.js'
import { NoticePresence } from './NoticePresence.js'
import './archive-toast.css'

export function ArchiveToast(props: {
  count: number
  visible: boolean
  onUndo: () => void
  onDismiss: () => void
}) {
  const { t } = useI18n()
  return (
    <NoticePresence
      className="notice notice--archive"
      tone="info"
      role="status"
      visible={props.visible}
      onDismiss={props.onDismiss}
      dismissKey={props.count}
      followComposer={false}
    >
      <NoticeBody
        tone="info"
        icon={<IconTrash className="notice-icon" size={16} stroke={1.7} aria-hidden />}
        actions={
          <button
            className="notice-action notice-action--primary"
            type="button"
            onClick={props.onUndo}
          >
            {t('sidebar.archiveToast.undo')}
          </button>
        }
        onDismiss={props.onDismiss}
        dismissLabel={t('sidebar.archiveToast.dismiss')}
      >
        {props.count > 1
          ? t('sidebar.archiveToast.deletedMany', { count: props.count })
          : t('sidebar.archiveToast.deletedOne')}
      </NoticeBody>
    </NoticePresence>
  )
}
