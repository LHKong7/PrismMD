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

      {/* Left hover trigger */}
      {!leftSidebarOpen && (
        <div
          className="absolute top-0 bottom-0 left-0 z-20"
          style={{ width: 8 }}
          onMouseEnter={() => setLeftSidebarOpen(true)}
        />
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

      {/* Right hover trigger */}
      {!rightSidebarOpen && (
        <div
          className="absolute top-0 bottom-0 right-0 z-20"
          style={{ width: 8 }}
          onMouseEnter={() => setRightSidebarOpen(true)}
        />
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
