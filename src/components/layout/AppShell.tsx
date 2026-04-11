import { useUIStore } from '../../store/uiStore'
import { useFileStore } from '../../store/fileStore'
import { LeftSidebar } from './LeftSidebar'
import { RightSidebar } from './RightSidebar'
import { MarkdownReader } from '../reader/MarkdownReader'
import { ReadingProgress } from '../reader/ReadingProgress'

export function AppShell() {
  const leftSidebarOpen = useUIStore((s) => s.leftSidebarOpen)
  const rightSidebarOpen = useUIStore((s) => s.rightSidebarOpen)
  const leftSidebarPinned = useUIStore((s) => s.leftSidebarPinned)
  const rightSidebarPinned = useUIStore((s) => s.rightSidebarPinned)
  const setLeftSidebarOpen = useUIStore((s) => s.setLeftSidebarOpen)
  const setRightSidebarOpen = useUIStore((s) => s.setRightSidebarOpen)
  const toc = useFileStore((s) => s.toc)

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

      {/* Main content */}
      <div
        className="flex-1 overflow-hidden"
        style={{
          marginLeft: leftSidebarOpen && leftSidebarPinned ? 260 : 0,
          marginRight: rightSidebarOpen && rightSidebarPinned ? 220 : 0,
          transition: 'margin 200ms ease-in-out',
        }}
      >
        <MarkdownReader />
      </div>

      {/* Right sidebar */}
      <div
        className="absolute top-0 bottom-0 right-0 z-30 transition-transform duration-200 ease-in-out"
        style={{
          width: 220,
          transform: rightSidebarOpen ? 'translateX(0)' : 'translateX(100%)',
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
    </div>
  )
}
