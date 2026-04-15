import { useTranslation } from 'react-i18next'
import { ChevronRight, ChevronLeft } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useFileStore } from '../../store/fileStore'
import { useAgentStore } from '../../store/agentStore'
import { LeftSidebar } from './LeftSidebar'
import { RightSidebar } from './RightSidebar'
import { DocumentReader } from '../reader/DocumentReader'
import { ReadingProgress } from '../reader/ReadingProgress'
import { AgentSidebar } from '../agent/AgentSidebar'
import { GraphView } from '../graph/GraphView'

export function AppShell() {
  const { t } = useTranslation()
  const leftSidebarOpen = useUIStore((s) => s.leftSidebarOpen)
  const rightSidebarOpen = useUIStore((s) => s.rightSidebarOpen)
  const leftSidebarPinned = useUIStore((s) => s.leftSidebarPinned)
  const rightSidebarPinned = useUIStore((s) => s.rightSidebarPinned)
  const setLeftSidebarOpen = useUIStore((s) => s.setLeftSidebarOpen)
  const setRightSidebarOpen = useUIStore((s) => s.setRightSidebarOpen)
  const mainViewMode = useUIStore((s) => s.mainViewMode)
  const toc = useFileStore((s) => s.toc)
  const agentSidebarOpen = useAgentStore((s) => s.agentSidebarOpen)

  return (
    <div className="flex flex-1 overflow-hidden relative">
      <ReadingProgress />

      {/* Left sidebar */}
      <div
        className="absolute top-0 bottom-0 left-0 z-30 transition-transform duration-200 ease-in-out"
        style={{
          width: 260,
          transform: leftSidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        }}
        onMouseLeave={() => {
          if (!leftSidebarPinned) setLeftSidebarOpen(false)
        }}
      >
        <LeftSidebar />
      </div>

      {/* Left hover trigger + visible handle. The hover-only zone fails
          on trackpads/touch because the user can't "rest" the cursor at
          the edge — the handle gives them a clickable target plus a
          visual hint that there's a panel hidden there. */}
      {!leftSidebarOpen && (
        <>
          <div
            className="absolute top-0 bottom-0 left-0 z-20"
            style={{ width: 8 }}
            onMouseEnter={() => setLeftSidebarOpen(true)}
          />
          <button
            onClick={() => setLeftSidebarOpen(true)}
            className="absolute top-1/2 -translate-y-1/2 left-0 z-20 flex items-center justify-center rounded-r-md opacity-50 hover:opacity-100 focus-visible:opacity-100 transition-opacity"
            style={{
              width: 14,
              height: 48,
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-color)',
              borderLeft: 'none',
            }}
            aria-label={t('titlebar.toggleFileTree')}
            title={`${t('titlebar.toggleFileTree')} (Ctrl+B)`}
          >
            <ChevronRight size={12} />
          </button>
        </>
      )}

      {/* Main content — swapped wholesale based on uiStore.mainViewMode.
          Sidebars remain mounted regardless, so the file tree / agent /
          TOC context is preserved when the user toggles between the
          reader and the graph. */}
      <div
        className="flex-1 overflow-hidden"
        style={{
          marginLeft: leftSidebarOpen && leftSidebarPinned ? 260 : 0,
          marginRight: rightSidebarOpen && rightSidebarPinned ? 220 : 0,
          transition: 'margin 200ms ease-in-out',
        }}
      >
        {mainViewMode === 'graph' ? <GraphView /> : <DocumentReader />}
      </div>

      {/* Right sidebar (TOC) */}
      <div
        className="absolute top-0 bottom-0 z-30 transition-transform duration-200 ease-in-out"
        style={{
          width: 220,
          right: agentSidebarOpen ? 340 : 0,
          transform: rightSidebarOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 200ms ease-in-out, right 200ms ease-in-out',
        }}
        onMouseLeave={() => {
          if (!rightSidebarPinned) setRightSidebarOpen(false)
        }}
      >
        <RightSidebar toc={toc} />
      </div>

      {/* Right hover trigger + handle. Mirrors the left side. We anchor
          the handle to the agent sidebar's edge when it's open so it
          stays reachable without overlapping the chat. */}
      {!rightSidebarOpen && (
        <>
          <div
            className="absolute top-0 bottom-0 right-0 z-20"
            style={{ width: 8, right: agentSidebarOpen ? 340 : 0 }}
            onMouseEnter={() => setRightSidebarOpen(true)}
          />
          <button
            onClick={() => setRightSidebarOpen(true)}
            className="absolute top-1/2 -translate-y-1/2 z-20 flex items-center justify-center rounded-l-md opacity-50 hover:opacity-100 focus-visible:opacity-100 transition-opacity"
            style={{
              width: 14,
              height: 48,
              right: agentSidebarOpen ? 340 : 0,
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-color)',
              borderRight: 'none',
            }}
            aria-label={t('titlebar.toggleOutline')}
            title={`${t('titlebar.toggleOutline')} (Ctrl+Shift+B)`}
          >
            <ChevronLeft size={12} />
          </button>
        </>
      )}

      {/* Agent sidebar */}
      <div
        className="absolute top-0 bottom-0 right-0 z-30 transition-transform duration-200 ease-in-out"
        style={{
          width: 340,
          transform: agentSidebarOpen ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        <AgentSidebar />
      </div>
    </div>
  )
}
