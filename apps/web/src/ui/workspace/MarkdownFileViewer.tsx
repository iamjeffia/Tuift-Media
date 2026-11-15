import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../../i18n/index.js'
import { Skeleton, SkeletonStatus } from '../Skeleton.js'
import { markdownSliceEnds } from './markdown-slices.js'

// The chat's own renderer, loaded the first time a Markdown file opens.
const CompletedMarkdown = lazy(() =>
  import('../CompletedMarkdown.js').then((module) => ({ default: module.CompletedMarkdown })),
)

/**
 * A Markdown file rendered as the chat renders a reply, in a comfortable column. A long
 * file renders a slice at a time as the reader nears the end of what is shown, so a 2 MB
 * README opens as fast as a short one.
 */
export function MarkdownFileViewer(props: { content: string; projectPath: string }) {
  const { t } = useI18n()
  const ends = useMemo(() => markdownSliceEnds(props.content), [props.content])
  const [shown, setShown] = useState(1)
  // How much of the text the renderer has committed: the next slice waits for it, or the
  // end of a slow render would still look "near" and pull in every slice behind it.
  const [rendered, setRendered] = useState(0)
  const onRendered = useCallback((text: string) => setRendered(text.length), [])
  // A new file mounts this afresh (the caller keys it by path); an edit keeps the reader's place.
  const more = shown < ends.length
  const end = ends[Math.min(shown, ends.length) - 1]!
  const sentinel = useRef<HTMLDivElement>(null)
  const settled = rendered >= end

  useEffect(() => {
    const element = sentinel.current
    if (!more || !settled || !element || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setShown((current) => current + 1)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [more, settled, shown])

  const text = props.content.slice(0, end)
  return (
    <div className="workspace-markdown" tabIndex={0}>
      <div className="workspace-markdown__column">
        <Suspense
          fallback={
            <SkeletonStatus
              label={t('workspace.markdown.rendering')}
              className="workspace-markdown__loading"
            >
              <Skeleton width="62%" height={14} />
              <Skeleton width="100%" height={9} />
              <Skeleton width="94%" height={9} />
              <Skeleton width="78%" height={9} />
            </SkeletonStatus>
          }
        >
          <CompletedMarkdown text={text} projectPath={props.projectPath} onRendered={onRendered} />
        </Suspense>
        {more ? (
          <div ref={sentinel} className="workspace-markdown__more">
            <button type="button" onClick={() => setShown((current) => current + 1)}>
              {t('workspace.markdown.showMore')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
