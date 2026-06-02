import { useMemo } from 'react'
import { PaneContext } from '../../contexts/PaneContext'
import { useUIStore } from '../../store/uiStore'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { Breadcrumb } from './Breadcrumb'
import { DocumentReader } from '../reader/DocumentReader'
import { ErrorBoundary } from '../ErrorBoundary'
import type { PaneData } from '../../contexts/PaneContext'

interface PaneViewProps {
  paneId: string
}

/**
 * Wraps a DocumentReader instance with pane-specific file data via
 * PaneContext. In split mode each pane gets its own PaneView; in
 * single-pane mode PaneView is still used for consistency (the
 * context simply mirrors the global activeTabId).
 */
export function PaneView({ paneId }: PaneViewProps) {
  const splitLayout = useUIStore((s) => s.splitLayout)
  const setActivePaneId = useUIStore((s) => s.setActivePaneId)
  const tabs = useWorkspaceStore((s) => s.tabs)
  const activeTabId = useWorkspaceStore((s) => s.activeTabId)

  const paneState = splitLayout.panes.find((p) => p.id === paneId)
  const isActive = splitLayout.activePaneId === paneId

  // In single-pane mode, pane-1 always mirrors the global activeTabId.
  const effectiveTabId = splitLayout.split
    ? (paneState?.tabId ?? null)
    : activeTabId

  const tab = tabs.find((t) => t.id === effectiveTabId) ?? null

  const paneData: PaneData = useMemo(() => ({
    paneId,
    filePath: tab?.pageId ?? null,
    title: tab?.title ?? null,
    content: tab?.content ?? null,
    format: tab?.format ?? null,
    bytes: null,
    isActivePane: isActive,
  }), [paneId, tab?.pageId, tab?.title, tab?.content, tab?.format, isActive])

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{
        borderTop: splitLayout.split && isActive
          ? '2px solid var(--accent-primary)'
          : splitLayout.split
            ? '2px solid transparent'
            : undefined,
      }}
      onClick={() => {
        if (splitLayout.split && !isActive) setActivePaneId(paneId)
      }}
    >
      <PaneContext.Provider value={paneData}>
        <Breadcrumb />
        <ErrorBoundary>
          <DocumentReader />
        </ErrorBoundary>
      </PaneContext.Provider>
    </div>
  )
}
