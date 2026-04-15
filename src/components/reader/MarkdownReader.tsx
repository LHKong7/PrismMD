import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useFileStore } from '../../store/fileStore'
import { useMarkdown } from '../../hooks/useMarkdown'
import { useReadingProgress } from '../../hooks/useReadingProgress'
import { useEntityLinking } from '../../hooks/useEntityLinking'
import { useReaderDomStore } from '../../store/readerDomStore'
import { DocSummary } from './DocSummary'
import { ContradictionBanner } from '../graph/ContradictionBanner'
import { ErrorBanner } from './components/ErrorBanner'
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
  const currentContent = useFileStore((s) => s.currentContent)
  const { content, isProcessing, error } = useMarkdown(currentContent)
  const scrollRef = useRef<HTMLDivElement>(null)
  const markdownBodyRef = useRef<HTMLDivElement>(null)

  useReadingProgress(scrollRef)
  useEntityLinking(markdownBodyRef)

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
      className="h-full overflow-y-auto"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <ContradictionBanner />
      <DocSummary />
      <div className="markdown-body" ref={markdownBodyRef}>
        {content}
      </div>
    </div>
  )
}
