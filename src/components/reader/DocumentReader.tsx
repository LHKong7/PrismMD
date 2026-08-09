import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { useEditorStore } from '../../store/editorStore'
import { usePaneFileData } from '../../hooks/usePaneFileData'
import { MarkdownReader } from './MarkdownReader'
import { PageHeader } from './PageHeader'
import { DocSummary } from './DocSummary'
import { ContradictionBanner } from '../graph/ContradictionBanner'
import { Dashboard } from '../workspace/Dashboard'
import { JsonViewer } from './JsonViewer'
import { CsvViewer } from './CsvViewer'
import { XlsxViewer } from './XlsxViewer'
import { PdfViewer } from './PdfViewer'
import { PlainTextViewer } from './PlainTextViewer'
import { MarkdownEditor } from '../editor/MarkdownEditor'
import { CodeMirrorEditor } from '../editor/CodeMirrorEditor'
import { json as jsonLang } from '@codemirror/lang-json'
import { ErrorBanner } from './components/ErrorBanner'
import { ViewModeToggle } from './components/ViewModeToggle'

/**
 * DocumentReader — the main content pane's format-aware router.
 *
 * Dispatches to a per-format viewer based on `currentFormat` in fileStore.
 * Renders a unified welcome screen when no file is open, and handles
 * drag-drop for any of the Library's supported formats.
 *
 * All viewers inherit the outer scroll container so TOC / reading-progress
 * integrations keep working uniformly.
 */
export function DocumentReader() {
  const { t } = useTranslation()
  const { filePath: currentFilePath, format: currentFormat, isActivePane } = usePaneFileData()
  const openError = useWorkspaceStore((s) => s.openError)

  const editing = useEditorStore((s) => s.editing)
  const editorContent = useEditorStore((s) => s.editorContent)
  const setEditorContent = useEditorStore((s) => s.setEditorContent)

  // CSV/JSON open in their rendered view; `raw` flips to the source editor.
  // Pane-local on purpose — the two panes of a split can show the same
  // document as table and as source side by side.
  const [raw, setRaw] = useState(false)
  useEffect(() => {
    setRaw(false)
  }, [currentFilePath, currentFormat])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  // Dropping files imports them as workspace pages — every supported format,
  // binary included (the store reads the bytes and hands them to main).
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return
    void useWorkspaceStore.getState().importDroppedFiles(files, null)
  }, [])

  // Welcome screen — unified entry point shared by every format.
  // If the only thing that happened this session is a failed open, the
  // welcome screen still renders but with the error strip on top so the
  // user understands why the click did nothing.
  if (!currentFilePath) {
    return (
      <div
        className="h-full flex flex-col"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        {openError && (
          <ErrorBanner
            severity="error"
            title={t('reader.openError.title')}
            message={openError}
            fullPage={false}
          />
        )}
        <Dashboard />
      </div>
    )
  }

  // Only the active pane can host an editor — the editor buffer is global
  // state keyed to the active tab, so an inactive pane always previews.
  const canEdit = editing && isActivePane

  const sourceEditor = (
    <CodeMirrorEditor
      content={editorContent ?? ''}
      onChange={setEditorContent}
      language={currentFormat === 'json' ? jsonLang() : undefined}
    />
  )

  // Format-specific viewer. Markdown keeps the feature-rich always-editable
  // reader (TOC, annotations, entity-linking); structured text formats open
  // rendered with a Raw escape hatch; binary formats get their own viewers.
  const body = (() => {
    switch (currentFormat) {
      case 'markdown':
        return canEdit ? <MarkdownEditor /> : <MarkdownReader />
      case 'plaintext':
        return canEdit ? sourceEditor : <PlainTextViewer />
      case 'json':
        return raw && canEdit ? sourceEditor : <JsonViewer />
      case 'csv':
        return raw && canEdit ? sourceEditor : <CsvViewer />
      case 'xlsx':
        return <XlsxViewer />
      case 'pdf':
        return <PdfViewer />
      default:
        return (
          <div
            className="h-full flex items-center justify-center p-8 text-center"
            style={{ backgroundColor: 'var(--bg-primary)' }}
          >
            <div className="max-w-sm">
              <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                {t('reader.unsupported.title')}
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {t('reader.unsupported.body')}
              </p>
            </div>
          </div>
        )
    }
  })()

  const showViewToggle =
    canEdit && (currentFormat === 'csv' || currentFormat === 'json')

  return (
    <div
      className="h-full flex flex-col"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {openError && (
        <ErrorBanner
          severity="error"
          title={t('reader.openError.title')}
          message={openError}
          fullPage={false}
        />
      )}
      {currentFormat === 'markdown' && isActivePane && (
        <>
          {/* These used to live inside the read-only reader; in the single
              always-editable mode they sit above the editor body. */}
          <PageHeader />
          <ContradictionBanner />
          <DocSummary />
        </>
      )}
      {showViewToggle && (
        <ViewModeToggle
          raw={raw}
          onChange={setRaw}
          previewLabel={
            currentFormat === 'json'
              ? t('reader.viewMode.tree', 'Tree')
              : t('reader.viewMode.table', 'Table')
          }
        />
      )}
      <div className="flex-1 min-h-0">{body}</div>
    </div>
  )
}
