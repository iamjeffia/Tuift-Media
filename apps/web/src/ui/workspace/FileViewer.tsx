import { useState } from 'react'
import type { ResultOf } from '@harness/contracts'
import { useI18n, type MessageKey } from '../../i18n/index.js'
import { SettingsSegmented } from '../settings/SettingsSegmented.js'
import { CodeViewer } from './CodeViewer.js'
import { MarkdownFileViewer } from './MarkdownFileViewer.js'
import { MediaFileViewer } from './MediaFileViewer.js'
import { WorkspaceEmptyState } from './WorkspaceEmptyState.js'
import { codeLanguage, fileViewerKind, isMediaKind } from './file-viewer-kind.js'
import { formatBytes, rootedPath } from './workspace-paths.js'

type FileContents = ResultOf<'workspace.readFile'>

const MARKDOWN_MODES = [
  { value: 'preview', label: 'workspace.fileViewer.preview' },
  { value: 'raw', label: 'workspace.fileViewer.raw' },
] as const satisfies ReadonlyArray<{ value: string; label: MessageKey }>

/** The file open in the Files tab, shown in the way its type calls for. */
export function FileViewer(props: {
  file: FileContents
  projectPath: string
  /** The folder the file's path is relative to, which media is streamed from. */
  root: string | undefined
  /** Changes when the open image or video was replaced on disk, so it loads again. */
  revision?: number | undefined
  /** Shows the file in Explorer; absent where the app cannot. */
  onReveal?: (() => void) | undefined
}) {
  const { t } = useI18n()
  const { file } = props
  const kind = fileViewerKind(file.name)
  const [markdownMode, setMarkdownMode] = useState<'preview' | 'raw'>('preview')
  const [detail, setDetail] = useState<string>()
  const media = isMediaKind(kind)

  if (!media && file.binary) {
    return (
      <WorkspaceEmptyState
        kind="files"
        title={t('workspace.fileViewer.binary.title')}
        detail={t('workspace.fileViewer.binary.detail', {
          name: file.name,
          size: formatBytes(file.size),
        })}
      >
        {props.onReveal ? (
          <button type="button" className="btn" onClick={props.onReveal}>
            {t('workspace.common.openInExplorer')}
          </button>
        ) : null}
      </WorkspaceEmptyState>
    )
  }

  return (
    <div className="workspace-files__document">
      <header>
        <strong>{file.path}</strong>
        <span>
          {formatBytes(file.size)}
          {detail ? ` · ${detail}` : ''}
        </span>
        {file.truncated ? (
          <em>
            {t('workspace.fileViewer.truncated')}
            {props.onReveal ? (
              <>
                {' · '}
                <button type="button" className="workspace-files__reveal" onClick={props.onReveal}>
                  {t('workspace.common.openInExplorer')}
                </button>
              </>
            ) : null}
          </em>
        ) : null}
        {kind === 'markdown' ? (
          <SettingsSegmented
            ariaLabel={t('workspace.fileViewer.markdownView')}
            value={markdownMode}
            options={MARKDOWN_MODES.map((mode) => ({ value: mode.value, label: t(mode.label) }))}
            onChange={(value) => setMarkdownMode(value === 'raw' ? 'raw' : 'preview')}
          />
        ) : null}
      </header>
      {media ? (
        <MediaFileViewer
          key={file.path}
          name={file.name}
          kind={kind}
          absolutePath={props.root ? rootedPath(props.root, file.path) : undefined}
          projectRoot={props.root}
          revision={props.revision ?? 0}
          onDetail={setDetail}
          onReveal={props.onReveal}
        />
      ) : kind === 'markdown' && markdownMode === 'preview' ? (
        <MarkdownFileViewer
          key={file.path}
          content={file.content ?? ''}
          projectPath={props.projectPath}
        />
      ) : (
        <CodeViewer
          key={file.path}
          content={file.content ?? ''}
          language={kind === 'markdown' ? 'markdown' : codeLanguage(file.name)}
        />
      )}
    </div>
  )
}
