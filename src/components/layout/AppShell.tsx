import { useTranslation } from 'react-i18next'
import { ChevronRight, ChevronLeft } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useFileStore } from '../../store/fileStore'
import { useAgentStore } from '../../store/agentStore'
import { useWindowBreakpoint } from '../../lib/hooks/useWindowBreakpoint'
import { LeftSidebar } from './LeftSidebar'
import { RightSidebar } from './RightSidebar'
import { ResizeHandle } from './ResizeHandle'
import { TabBar } from './TabBar'
import { Breadcrumb } from './Breadcrumb'
import { SplitContainer } from './SplitContainer'
import { ReadingProgress } from '../reader/ReadingProgress'
import { AgentSidebar } from '../agent/AgentSidebar'
import { GraphView } from '../graph/GraphView'
import { ErrorBoundary } from '../ErrorBoundary'
import { DeleteConfirmDialog } from '../filetree/DeleteConfirmDialog'

export function AppShell() {
  const { t } = useTranslation()
  const leftSidebarOpen = useUIStore((s) => s.leftSidebarOpen)
  const rightSidebarOpen = useUIStore((s) => s.rightSidebarOpen)
  const leftSidebarPinned = useUIStore((s) => s.leftSidebarPinned)
  const rightSidebarPinned = useUIStore((s) => s.rightSidebarPinned)
  const setLeftSidebarOpen = useUIStore((s) => s.setLeftSidebarOpen)
  const setRightSidebarOpen = useUIStore((s) => s.setRightSidebarOpen)
  const mainViewMode = useUIStore((s) => s.mainViewMode)
  const LEFT_WIDTH = useUIStore((s) => s.leftSidebarWidth)
  const RIGHT_WIDTH = useUIStore((s) => s.rightSidebarWidth)
  const AGENT_WIDTH = useUIStore((s) => s.agentSidebarWidth)
  const setLeftSidebarWidth = useUIStore((s) => s.setLeftSidebarWidth)
  const setRightSidebarWidth = useUIStore((s) => s.setRightSidebarWidth)
  const setAgentSidebarWidth = useUIStore((s) => s.setAgentSidebarWidth)
  const toc = useFileStore((s) => s.toc)
  const agentSidebarOpen = useAgentStore((s) => s.agentSidebarOpen)
  const setAgentSidebarOpen = useAgentStore((s) => s.setAgentSidebarOpen)

  // On narrow/compact viewports we ignore the user's pinned preference so
  // the main reader doesn't get squeezed off-screen. The preference itself
  // is preserved in uiStore and re-takes effect when the window grows back.
  const breakpoint = useWindowBreakpoint()
  const isCompact = breakpoint === 'compact'
  const isNarrow = breakpoint === 'narrow'
  const effectiveLeftPinned = leftSidebarPinned && !isNarrow && !isCompact
  const effectiveRightPinned = rightSidebarPinned && !isNarrow && !isCompact

  // Tightened widths in compact mode so a floating overlay doesn't fully
  // cover the reader (users still want to see what's underneath).
  const compactLeftWidth = Math.min(LEFT_WIDTH, Math.round(window.innerWidth * 0.85))
  const compactAgentWidth = Math.min(AGENT_WIDTH, Math.round(window.innerWidth * 0.9))

  const leftWidth = isCompact ? compactLeftWidth : LEFT_WIDTH
  const agentWidth = isCompact ? compactAgentWidth : AGENT_WIDTH
  const rightOffsetFromAgent = agentSidebarOpen && !isCompact ? AGENT_WIDTH : 0

  // Show a backdrop on narrow/compact so tapping outside dismisses the
  // floating sidebar. On wide viewports, unpinned sidebars auto-close
  // on mouse leave instead.
  const showBackdrop =
    (isCompact || isNarrow) && (leftSidebarOpen || rightSidebarOpen || agentSidebarOpen)

  return (
    <div className="flex flex-1 overflow-hidden relative">
      <ReadingProgress />

      {/* Backdrop on compact viewports so tapping outside a floating panel
          closes it — avoids the user being stuck with no visible close UI. */}
      {showBackdrop && (
        <div
          className="absolute inset-0 z-overlay bg-black/30 prism-fade-in"
          onClick={() => {
            if (leftSidebarOpen) setLeftSidebarOpen(false)
            if (rightSidebarOpen) setRightSidebarOpen(false)
            if (agentSidebarOpen) setAgentSidebarOpen(false)
          }}
          aria-hidden="true"
        />
      )}

      {/* Left sidebar */}
      <div
        className="absolute top-0 bottom-0 left-0 z-sidebar transition-transform duration-base ease-in-out"
        style={{
          width: leftWidth,
          transform: leftSidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        }}
        onMouseLeave={() => {
          // On narrow/compact, the backdrop handles dismissal instead.
          if (isNarrow || isCompact) return
          const s = useUIStore.getState()
          if (s.leftSidebarOpen && !s.leftSidebarPinned) setLeftSidebarOpen(false)
        }}
      >
        <LeftSidebar />
        {leftSidebarOpen && !isCompact && (
          <ResizeHandle
            side="left"
            currentWidth={LEFT_WIDTH}
            onResize={setLeftSidebarWidth}
          />
        )}
      </div>

      {/* Left hover trigger + visible handle. The hover-only zone fails
          on trackpads/touch because the user can't "rest" the cursor at
          the edge — the handle gives them a clickable target plus a
          visual hint that there's a panel hidden there. */}
      {!leftSidebarOpen && (
        <>
          <div
            className="absolute top-0 bottom-0 left-0 z-overlay"
            style={{ width: 8 }}
            onMouseEnter={() => setLeftSidebarOpen(true)}
          />
          <button
            onClick={() => setLeftSidebarOpen(true)}
            className="absolute top-1/2 -translate-y-1/2 left-0 z-overlay flex items-center justify-center rounded-r-md opacity-50 hover:opacity-100 focus-visible:opacity-100 transition-opacity"
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
        className="flex-1 flex flex-col overflow-hidden"
        style={{
          marginLeft: leftSidebarOpen && effectiveLeftPinned ? LEFT_WIDTH : 0,
          marginRight: rightSidebarOpen && effectiveRightPinned ? RIGHT_WIDTH : 0,
          transition: 'margin 200ms ease-in-out',
        }}
      >
        <TabBar />
        {mainViewMode === 'graph' ? (
          <>
            <Breadcrumb />
            <ErrorBoundary>
              <GraphView />
            </ErrorBoundary>
          </>
        ) : (
          <div className="flex-1 min-h-0">
            <SplitContainer />
          </div>
        )}
      </div>

      {/* Right sidebar (TOC) */}
      <div
        className="absolute top-0 bottom-0 z-sidebar transition-transform duration-base ease-in-out"
        style={{
          width: RIGHT_WIDTH,
          right: rightOffsetFromAgent,
          transform: rightSidebarOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 200ms ease-in-out, right 200ms ease-in-out',
        }}
        onMouseLeave={() => {
          if (isNarrow || isCompact) return
          const s = useUIStore.getState()
          if (s.rightSidebarOpen && !s.rightSidebarPinned) setRightSidebarOpen(false)
        }}
      >
        <RightSidebar toc={toc} />
        {rightSidebarOpen && !isCompact && (
          <ResizeHandle
            side="right"
            currentWidth={RIGHT_WIDTH}
            onResize={setRightSidebarWidth}
          />
        )}
      </div>

      {/* Right hover trigger + handle. Mirrors the left side. We anchor
          the handle to the agent sidebar's edge when it's open so it
          stays reachable without overlapping the chat. */}
      {!rightSidebarOpen && (
        <>
          <div
            className="absolute top-0 bottom-0 right-0 z-overlay"
            style={{ width: 8, right: rightOffsetFromAgent }}
            onMouseEnter={() => setRightSidebarOpen(true)}
          />
          <button
            onClick={() => setRightSidebarOpen(true)}
            className="absolute top-1/2 -translate-y-1/2 z-overlay flex items-center justify-center rounded-l-md opacity-50 hover:opacity-100 focus-visible:opacity-100 transition-opacity"
            style={{
              width: 14,
              height: 48,
              right: rightOffsetFromAgent,
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

      <DeleteConfirmDialog />

      {/* Agent sidebar */}
      <div
        className="absolute top-0 bottom-0 right-0 z-sidebar transition-transform duration-base ease-in-out"
        style={{
          width: agentWidth,
          transform: agentSidebarOpen ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        <AgentSidebar />
        {agentSidebarOpen && !isCompact && (
          <ResizeHandle
            side="agent"
            currentWidth={AGENT_WIDTH}
            onResize={setAgentSidebarWidth}
          />
        )}
      </div>
    </div>
  )
}
