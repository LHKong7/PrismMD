import { useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useFileStore } from '../../store/fileStore'
import { useMarkdown } from '../../hooks/useMarkdown'
import { useReadingProgress } from '../../hooks/useReadingProgress'
import { useEntityLinking } from '../../hooks/useEntityLinking'
import { useReaderDomStore } from '../../store/readerDomStore'
import { DocSummary } from './DocSummary'
import { ContradictionBanner } from '../graph/ContradictionBanner'
import { FileText, FolderOpen, Upload } from 'lucide-react'
import '../../styles/markdown.css'
import '../../styles/cjk.css'

export function MarkdownReader() {
  const { t } = useTranslation()
  const currentContent = useFileStore((s) => s.currentContent)
  const openFileDialog = useFileStore((s) => s.openFileDialog)
  const openFolderDialog = useFileStore((s) => s.openFolderDialog)
  const { content, isProcessing } = useMarkdown(currentContent)
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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const files = Array.from(e.dataTransfer.files)
    const mdFile = files.find((f) =>
      f.name.endsWith('.md') || f.name.endsWith('.markdown') || f.name.endsWith('.mdx')
    )

    if (mdFile) {
      const reader = new FileReader()
      reader.onload = () => {
        useFileStore.getState().openFileWithContent(
          (mdFile as File & { path?: string }).path ?? mdFile.name,
          reader.result as string
        )
      }
      reader.readAsText(mdFile)
    }
  }, [])

  if (!currentContent) {
    return (
      <div
        className="h-full flex items-center justify-center"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <div className="text-center max-w-md px-8">
          <div
            className="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
          >
            <Upload size={32} style={{ color: 'var(--text-muted)' }} />
          </div>
          <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
            {t('app.welcome.title')}
          </h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
            {t('app.welcome.subtitle')}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={openFileDialog}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ backgroundColor: 'var(--accent-color)', color: '#ffffff' }}
            >
              <FileText size={16} />
              {t('app.welcome.openFile')}
            </button>
            <button
              onClick={openFolderDialog}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
            >
              <FolderOpen size={16} />
              {t('app.welcome.openFolder')}
            </button>
          </div>
          <p className="text-xs mt-6" style={{ color: 'var(--text-muted)' }}>
            {t('app.welcome.tip', { shortcut: 'Ctrl+P' })}
          </p>
        </div>
      </div>
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
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <ContradictionBanner />
      <DocSummary />
      <div className="markdown-body" ref={markdownBodyRef}>
        {content}
      </div>
    </div>
  )
}
