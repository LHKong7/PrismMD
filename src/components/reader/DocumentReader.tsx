import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, FolderOpen, Upload, Bot } from 'lucide-react'
import { useFileStore } from '../../store/fileStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useUIStore } from '../../store/uiStore'
import { detectFormat, kindOfFormat } from '../../lib/fileFormat'
import { MarkdownReader } from './MarkdownReader'
import { JsonViewer } from './JsonViewer'
import { CsvViewer } from './CsvViewer'
import { XlsxViewer } from './XlsxViewer'
import { PdfViewer } from './PdfViewer'

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
  const currentFilePath = useFileStore((s) => s.currentFilePath)
  const currentFormat = useFileStore((s) => s.currentFormat)
  const openFileDialog = useFileStore((s) => s.openFileDialog)
  const openFolderDialog = useFileStore((s) => s.openFolderDialog)
  const activeProvider = useSettingsStore((s) => s.activeProvider)
  const openSettings = useUIStore((s) => s.openSettings)
  // First-run users have no provider configured — surface a fast path
  // to the AI tab so they don't need to discover Settings on their own.
  const aiNotConfigured = !activeProvider

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
  if (!currentFilePath) {
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
          {aiNotConfigured && (
            <button
              onClick={() => openSettings('ai')}
              className="mt-4 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
            >
              <Bot size={12} style={{ color: 'var(--accent-color)' }} />
              {t('app.welcome.configureAI')}
            </button>
          )}
        </div>
      </div>
    )
  }

  // Format-specific viewer. Markdown keeps the existing feature-rich
  // reader (TOC, annotations, entity-linking). New formats get their
  // own lean viewers.
  const body = (() => {
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
      className="h-full"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {body}
    </div>
  )
}
