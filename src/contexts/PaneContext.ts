import { createContext, useContext } from 'react'
import type { FileFormat } from '../lib/fileFormat'

export interface PaneData {
  paneId: string
  filePath: string | null
  content: string | null
  format: FileFormat | null
  bytes: ArrayBuffer | null
  isActivePane: boolean
}

/**
 * Per-pane file data context. When a component is rendered inside a
 * `<PaneContext.Provider>` (split-pane mode), it reads file data from
 * the context instead of the global fileStore. When rendered outside
 * (single-pane / legacy), the context is `null` and consumers fall
 * back to the global store via `usePaneFileData()`.
 */
export const PaneContext = createContext<PaneData | null>(null)

export function usePaneContext(): PaneData | null {
  return useContext(PaneContext)
}
