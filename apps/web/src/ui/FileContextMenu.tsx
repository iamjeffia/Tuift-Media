import type { RefObject } from 'react'
import {
  IconCopy as Copy,
  IconFolderOpen as FolderOpen,
  IconLayoutSidebarRight as PanelRight,
} from '@tabler/icons-react'
import { writeClipboardText } from '../bridge.js'
import { useI18n } from '../i18n/index.js'
import { Menu, MenuItem } from './Menu.js'

/**
 * The right-click menu of a file or folder wherever the app names one: a link in the chat
 * and a row in the Files tab. An action the place cannot do is left out, not disabled.
 */
export function FileContextMenu(props: {
  targetRef: RefObject<HTMLElement | null>
  label: string
  /** The absolute path "Copy path" puts on the clipboard. */
  path: string
  onOpenInPanel?: (() => void) | undefined
  onOpenInExplorer?: (() => void) | undefined
}) {
  const { t } = useI18n()
  return (
    <Menu contextMenuOnly contextMenuTargetRef={props.targetRef} drop="down" label={props.label}>
      {(close) => (
        <>
          {props.onOpenInPanel ? (
            <MenuItem
              title={t('workspace.fileMenu.openInPanel')}
              icon={<PanelRight size={14} aria-hidden />}
              onClick={() => {
                props.onOpenInPanel?.()
                close()
              }}
            />
          ) : null}
          {props.onOpenInExplorer ? (
            <MenuItem
              title={t('workspace.common.openInExplorer')}
              icon={<FolderOpen size={14} aria-hidden />}
              onClick={() => {
                props.onOpenInExplorer?.()
                close()
              }}
            />
          ) : null}
          <MenuItem
            title={t('workspace.fileMenu.copyPath')}
            icon={<Copy size={14} aria-hidden />}
            onClick={() => {
              // A copy the desktop refuses has nothing to say here; the path stays selectable.
              void writeClipboardText(props.path).catch(() => undefined)
              close()
            }}
          />
        </>
      )}
    </Menu>
  )
}
