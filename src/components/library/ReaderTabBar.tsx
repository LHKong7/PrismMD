/**
 * Reader-window tabs, keyed by path rather than page id.
 *
 * Closing a tab drops it — there is no session to restore, by design.
 */
import { X } from 'lucide-react'
import { useLibraryStore } from '../../store/libraryStore'
import { iconForFormat } from '../../lib/formatIcons'

export function ReaderTabBar() {
  const tabs = useLibraryStore((s) => s.tabs)
  const activePath = useLibraryStore((s) => s.activePath)
  const activate = useLibraryStore((s) => s.activate)
  const closeTab = useLibraryStore((s) => s.closeTab)

  if (tabs.length === 0) return null

  return (
    <div
      className="flex items-stretch overflow-x-auto shrink-0 border-b"
      style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
    >
      {tabs.map((tab) => {
        const isActive = tab.path === activePath
        const Icon = iconForFormat(tab.format)
        return (
          <div
            key={tab.path}
            role="tab"
            aria-selected={isActive}
            tabIndex={0}
            onClick={() => activate(tab.path)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') activate(tab.path)
            }}
            className="group flex items-center gap-1.5 pl-3 pr-2 py-1.5 text-xs cursor-default select-none border-r max-w-[200px]"
            style={{
              borderColor: 'var(--border-color)',
              backgroundColor: isActive ? 'var(--bg-primary)' : 'transparent',
              color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
            title={tab.path}
          >
            <Icon size={12} className="shrink-0 opacity-70" />
            <span className="truncate">{tab.name}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.path)
              }}
              className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-hover)]"
              aria-label={`Close ${tab.name}`}
            >
              <X size={11} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
