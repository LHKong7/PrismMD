import { usePaneContext } from '../contexts/PaneContext'
import { useFileStore } from '../store/fileStore'
import type { FileFormat } from '../lib/fileFormat'

interface PaneFileData {
  filePath: string | null
  content: string | null
  format: FileFormat | null
  bytes: ArrayBuffer | null
  paneId: string | null
  isActivePane: boolean
}

/**
 * Unified hook for reading the current file data. When rendered inside
 * a PaneContext.Provider (split-pane mode), returns the pane-specific
 * file data. Otherwise falls back to the global fileStore fields,
 * keeping all existing single-pane consumers working unchanged.
 */
export function usePaneFileData(): PaneFileData {
  const pane = usePaneContext()

  const globalFilePath = useFileStore((s) => s.currentFilePath)
  const globalFormat = useFileStore((s) => s.currentFormat)
  const globalContent = useFileStore((s) => s.currentContent)
  const globalBytes = useFileStore((s) => s.currentBytes)

  if (pane) {
    return {
      filePath: pane.filePath,
      format: pane.format,
      content: pane.content,
      bytes: pane.bytes,
      paneId: pane.paneId,
      isActivePane: pane.isActivePane,
    }
  }

  return {
    filePath: globalFilePath,
    format: globalFormat,
    content: globalContent,
    bytes: globalBytes,
    paneId: null,
    isActivePane: true,
  }
}
