import { usePaneContext } from '../contexts/PaneContext'
import { useWorkspaceStore } from '../store/workspaceStore'
import type { FileFormat } from '../lib/fileFormat'

interface PaneFileData {
  /** The page ID of the document shown in this pane (legacy field name). */
  filePath: string | null
  title: string | null
  content: string | null
  format: FileFormat | null
  bytes: ArrayBuffer | null
  paneId: string | null
  isActivePane: boolean
}

/**
 * Unified hook for reading the current page's data. When rendered inside
 * a PaneContext.Provider (split-pane mode), returns the pane-specific
 * data. Otherwise falls back to the global workspaceStore fields.
 *
 * `filePath` carries the page ID (the document's stable identity) — the
 * name is retained so downstream viewers/keys migrate without churn.
 */
export function usePaneFileData(): PaneFileData {
  const pane = usePaneContext()

  const globalPageId = useWorkspaceStore((s) => s.currentPageId)
  const globalTitle = useWorkspaceStore((s) => s.currentTitle)
  const globalFormat = useWorkspaceStore((s) => s.currentFormat)
  const globalContent = useWorkspaceStore((s) => s.currentContent)
  const globalBytes = useWorkspaceStore((s) => s.currentBytes)

  if (pane) {
    return {
      filePath: pane.filePath,
      title: pane.title ?? null,
      format: pane.format,
      content: pane.content,
      bytes: pane.bytes,
      paneId: pane.paneId,
      isActivePane: pane.isActivePane,
    }
  }

  return {
    filePath: globalPageId,
    title: globalTitle,
    format: globalFormat,
    content: globalContent,
    bytes: globalBytes,
    paneId: null,
    isActivePane: true,
  }
}
