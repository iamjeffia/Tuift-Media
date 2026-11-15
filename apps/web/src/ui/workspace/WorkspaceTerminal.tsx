import { memo } from 'react'
import { useI18n } from '../../i18n/index.js'
import type { Transport } from '../../transport.js'
import { TerminalPane } from '../TerminalPane.js'
import { WorkspaceEmptyState } from './WorkspaceEmptyState.js'

export const WorkspaceTerminal = memo(function WorkspaceTerminal(props: {
  active: boolean
  terminalKey: string
  transport: Transport
  threadId?: string | undefined
  projectPath?: string | undefined
  onClose: () => void
}) {
  const { t } = useI18n()
  // The server does not know a chat's provisional id while its first message
  // creates it; stay in the project checkout until the real id arrives.
  const threadId = props.threadId?.startsWith('pending:') ? undefined : props.threadId
  const target = threadId
    ? { threadId }
    : props.projectPath
      ? { projectPath: props.projectPath }
      : undefined
  if (!target) {
    return (
      <WorkspaceEmptyState
        kind="terminal"
        title={t('workspace.terminal.chooseProject.title')}
        detail={t('workspace.terminal.chooseProject.detail')}
      />
    )
  }
  return (
    <div className="workspace-terminal">
      <TerminalPane
        terminalKey={props.terminalKey}
        transport={props.transport}
        {...target}
        mode="workspace"
        active={props.active}
        onClose={props.onClose}
      />
    </div>
  )
})
