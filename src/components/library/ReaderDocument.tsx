/**
 * The document area of a reader window.
 *
 * Every viewer in `components/reader/` reads its data through
 * `usePaneFileData()`, which prefers a `PaneContext` when one is present.
 * So reader mode doesn't need modified viewers — it needs a provider fed
 * from `libraryStore` instead of `workspaceStore`. Nothing below this
 * component knows which mode it is running in.
 *
 * The format switch mirrors `DocumentReader`'s, minus every editable
 * branch: there is no `canEdit` here because there is nothing to edit.
 */
import { useTranslation } from 'react-i18next'
import { PaneContext, type PaneData } from '../../contexts/PaneContext'
import { useLibraryStore } from '../../store/libraryStore'
import { MarkdownReader } from '../reader/MarkdownReader'
import { PlainTextViewer } from '../reader/PlainTextViewer'
import { CsvViewer } from '../reader/CsvViewer'
import { JsonViewer } from '../reader/JsonViewer'
import { XlsxViewer } from '../reader/XlsxViewer'
import { PdfViewer } from '../reader/PdfViewer'
import { ErrorBanner } from '../reader/components/ErrorBanner'

export function ReaderDocument() {
  const { t } = useTranslation()
  const activePath = useLibraryStore((s) => s.activePath)
  const tab = useLibraryStore((s) => s.tabs.find((x) => x.path === s.activePath) ?? null)

  if (!activePath || !tab) {
    return (
      <div
        className="h-full flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {t('library.pickAFile', 'Pick a file from the folder to start reading.')}
        </p>
      </div>
    )
  }

  if (tab.loading) {
    return (
      <div
        className="h-full flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {t('library.loading', 'Opening…')}
        </p>
      </div>
    )
  }

  if (tab.error) {
    return (
      <ErrorBanner
        severity="error"
        title={t('library.openError', 'Could not open this file')}
        message={tab.error}
      />
    )
  }

  const pane: PaneData = {
    paneId: 'reader',
    // `filePath` finally holds what its name says: a real path on disk.
    filePath: tab.path,
    title: tab.name,
    content: tab.content,
    format: tab.format,
    bytes: tab.bytes,
    isActivePane: true,
  }

  const body = (() => {
    switch (tab.format) {
      case 'markdown':
        return <MarkdownReader standalone />
      case 'plaintext':
        return <PlainTextViewer />
      case 'csv':
        return <CsvViewer />
      case 'json':
        return <JsonViewer />
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
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('reader.unsupported.body')}
            </p>
          </div>
        )
    }
  })()

  return (
    <PaneContext.Provider value={pane}>
      <div className="h-full" style={{ backgroundColor: 'var(--bg-primary)' }}>
        {body}
      </div>
    </PaneContext.Provider>
  )
}
