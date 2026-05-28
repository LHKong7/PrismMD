import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, FolderOpen, Upload, Bot, FilePlus } from 'lucide-react'
import { useFileStore } from '../../store/fileStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useUIStore } from '../../store/uiStore'
import { detectFormat, kindOfFormat } from '../../lib/fileFormat'
import { useEditorStore } from '../../store/editorStore'
import { usePaneFileData } from '../../hooks/usePaneFileData'
import { MarkdownReader } from './MarkdownReader'
import { Dashboard } from '../workspace/Dashboard'
import { JsonViewer } from './JsonViewer'
import { CsvViewer } from './CsvViewer'
import { XlsxViewer } from './XlsxViewer'
import { PdfViewer } from './PdfViewer'
import { MarkdownEditor } from '../editor/MarkdownEditor'
import { CodeMirrorEditor } from '../editor/CodeMirrorEditor'
import { json as jsonLang } from '@codemirror/lang-json'
import { ErrorBanner } from './components/ErrorBanner'
import { Button } from '../ui/Button'

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
  const openError = useFileStore((s) => s.openError)
  const openFileDialog = useFileStore((s) => s.openFileDialog)
  const openFolderDialog = useFileStore((s) => s.openFolderDialog)
  const createNewFile = useFileStore((s) => s.createNewFile)
  const activeProvider = useSettingsStore((s) => s.activeProvider)
  const openSettings = useUIStore((s) => s.openSettings)
  // First-run users have no provider configured — surface a fast path
  // to the AI tab so they don't need to discover Settings on their own.
  const aiNotConfigured = !activeProvider

  const editing = useEditorStore((s) => s.editing)
  const editorContent = useEditorStore((s) => s.editorContent)
  const setEditorContent = useEditorStore((s) => s.setEditorContent)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const files = Array.from(e.dataTransfer.files)
    const file = files.find((f) => {
      const fmt = detectFormat((f as File & { path?: string }).path ?? f.name)
      return fmt !== null
    })
    if (!file) return

    const filePath = (file as File & { path?: string }).path ?? file.name
    const format = detectFormat(filePath)
    const kind = format ? kindOfFormat(format) : 'text'
    const reader = new FileReader()
    reader.onload = () => {
      const store = useFileStore.getState()
      if (kind === 'binary') {
        store.openFileWithBytes(filePath, reader.result as ArrayBuffer)
      } else {
        store.openFileWithContent(filePath, reader.result as string)
      }
    }
    if (kind === 'binary') reader.readAsArrayBuffer(file)
    else reader.readAsText(file)
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

  const isTextFormat = currentFormat ? kindOfFormat(currentFormat) === 'text' : false

  // Format-specific viewer. Markdown keeps the existing feature-rich
  // reader (TOC, annotations, entity-linking). New formats get their
  // own lean viewers.
  const body = (() => {
    // When in editing mode for text formats, render the editor instead
    // of the read-only viewer.
    if (editing && isTextFormat && isActivePane) {
      if (currentFormat === 'markdown') {
        return <MarkdownEditor />
      }
      return (
        <CodeMirrorEditor
          content={editorContent ?? ''}
          onChange={setEditorContent}
          language={currentFormat === 'json' ? jsonLang() : undefined}
        />
      )
    }

    switch (currentFormat) {
      case 'markdown': return <MarkdownReader />
      case 'json':     return <JsonViewer />
      case 'csv':      return <CsvViewer />
      case 'xlsx':     return <XlsxViewer />
      case 'pdf':      return <PdfViewer />
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
      <div className="flex-1 min-h-0">{body}</div>
    </div>
  )
}
