import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { usePaneFileData } from '../../hooks/usePaneFileData'
import { useMarkdown } from '../../hooks/useMarkdown'
import { useReadingProgress } from '../../hooks/useReadingProgress'
import { useEntityLinking } from '../../hooks/useEntityLinking'
import { useReaderDomStore } from '../../store/readerDomStore'
import { DocSummary } from './DocSummary'
import { ContradictionBanner } from '../graph/ContradictionBanner'
import { ErrorBanner } from './components/ErrorBanner'
import { InFileSearchBar } from './InFileSearchBar'
import { MiniMap } from './MiniMap'
import { useInFileSearch } from '../../hooks/useInFileSearch'
import '../../styles/markdown.css'
import '../../styles/cjk.css'

/**
 * MarkdownReader — renders the currently-open markdown file with the
 * full-featured reading pipeline (remark/rehype, TOC, entity-linking,
 * doc summary, contradiction banner).
 *
 * The welcome screen and drag-drop live in `DocumentReader` — this
 * component only runs when `currentFormat === 'markdown'`.
 */
export function MarkdownReader() {
  const { t } = useTranslation()
  const { content: currentContent, isActivePane } = usePaneFileData()
  const { content, codeMarkers, toc, isProcessing, error } = useMarkdown(currentContent)
  const scrollRef = useRef<HTMLDivElement>(null)
  const markdownBodyRef = useRef<HTMLDivElement>(null)

  useReadingProgress(scrollRef)
  useEntityLinking(markdownBodyRef)
  const search = useInFileSearch(markdownBodyRef, currentContent)

  // Cmd/Ctrl+F opens the in-file search bar. Scoped to when MarkdownReader
  // is mounted so it doesn't fight other views' shortcuts.
  useEffect(() => {
    // Only the active pane grabs Cmd+F — otherwise an inactive read-only pane
    // would pop its search bar while the active editor handles its own search.
    if (!isActivePane) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        search.setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [search, isActivePane])

  // Intercept link clicks in the rendered markdown and open external
  // URLs in the OS default browser instead of navigating the Electron window.
  useEffect(() => {
    const el = markdownBodyRef.current
    if (!el) return
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (href && /^https?:\/\//i.test(href)) {
        e.preventDefault()
        void window.electronAPI.openExternal(href)
      }
    }
    el.addEventListener('click', handleClick)
    return () => el.removeEventListener('click', handleClick)
  }, [content])

  // Publish the current markdown-body element so features outside this
  // subtree (e.g. chat citations) can resolve evidence back to ranges.
  const setMarkdownBody = useReaderDomStore((s) => s.setMarkdownBody)
  useEffect(() => {
    setMarkdownBody(markdownBodyRef.current)
    return () => setMarkdownBody(null)
  }, [setMarkdownBody, currentContent])

  if (error && !isProcessing) {
    return (
      <ErrorBanner
        severity="error"
        title={t('reader.markdown.errorTitle')}
        message={error}
      />
    )
  }

  if (isProcessing) {
    return (
      <div className="h-full flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Processing...
        </div>
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto relative"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {search.open && (
        // Sticky wrapper keeps the bar pinned to the top of the scroll
        // viewport. `pointer-events-none` on the row lets clicks fall
        // through to the document; the bar itself re-enables them.
        <div className="sticky top-2 z-20 flex justify-end pr-3 pointer-events-none">
          <div className="pointer-events-auto">
            <InFileSearchBar
              query={search.query}
              onQueryChange={search.setQuery}
              matchCount={search.matchCount}
              currentIdx={search.currentIdx}
              onPrev={search.prev}
              onNext={search.next}
              onClose={() => search.setOpen(false)}
            />
          </div>
        </div>
      )}
      <ContradictionBanner />
      <DocSummary />
      <div className="markdown-body" ref={markdownBodyRef}>
        {content}
      </div>
      <MiniMap scrollRef={scrollRef} codeMarkers={codeMarkers} toc={toc} />
    </div>
  )
}
