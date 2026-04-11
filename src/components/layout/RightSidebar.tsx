import { Pin, PinOff } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { TableOfContents } from '../toc/TableOfContents'
import type { TocEntry } from '../../lib/markdown/remarkToc'

interface RightSidebarProps {
  toc?: TocEntry[]
}

export function RightSidebar({ toc }: RightSidebarProps) {
  const rightSidebarPinned = useUIStore((s) => s.rightSidebarPinned)
  const pinRightSidebar = useUIStore((s) => s.pinRightSidebar)

  return (
    <div
      className="h-full flex flex-col border-l"
      style={{
        backgroundColor: 'var(--bg-sidebar)',
        borderColor: 'var(--border-color)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Contents
        </span>
        <button
          onClick={pinRightSidebar}
          className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          title={rightSidebarPinned ? 'Unpin sidebar' : 'Pin sidebar'}
        >
          {rightSidebarPinned ? (
            <PinOff size={14} style={{ color: 'var(--accent-color)' }} />
          ) : (
            <Pin size={14} style={{ color: 'var(--text-muted)' }} />
          )}
        </button>
      </div>

      {/* TOC */}
      <div className="flex-1 overflow-y-auto py-2">
        {toc && toc.length > 0 ? (
          <TableOfContents entries={toc} />
        ) : (
          <p className="px-3 py-4 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
            No headings found
          </p>
        )}
      </div>
    </div>
  )
}
