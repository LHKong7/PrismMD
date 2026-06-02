import { useRef, useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X, FileText, FileSpreadsheet, FileJson, File as FileIcon } from 'lucide-react'
import { clsx } from 'clsx'
import { useWorkspaceStore, type WorkspaceTab } from '../../store/workspaceStore'
import { useToastStore } from '../../store/toastStore'
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu'
import type { FileFormat } from '../../lib/fileFormat'

function iconForFormat(format: FileFormat | null) {
  switch (format) {
    case 'markdown': return FileText
    case 'pdf':      return FileIcon
    case 'csv':      return FileSpreadsheet
    case 'xlsx':     return FileSpreadsheet
    case 'json':     return FileJson
    default:         return FileText
  }
}

export function TabBar() {
  const { t } = useTranslation()
  const tabs = useWorkspaceStore((s) => s.tabs)
  const activeTabId = useWorkspaceStore((s) => s.activeTabId)
  const switchTab = useWorkspaceStore((s) => s.switchTab)
  const closeTab = useWorkspaceStore((s) => s.closeTab)
  const moveTab = useWorkspaceStore((s) => s.moveTab)
  const closeOtherTabs = useWorkspaceStore((s) => s.closeOtherTabs)
  const closeTabsToRight = useWorkspaceStore((s) => s.closeTabsToRight)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [hasOverflow, setHasOverflow] = useState(false)

  // Detect tab overflow
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const check = () => setHasOverflow(el.scrollWidth > el.clientWidth + 2)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    el.addEventListener('scroll', check, { passive: true })
    return () => { ro.disconnect(); el.removeEventListener('scroll', check) }
  }, [tabs.length])

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; x: number; y: number; tabId: string }>({
    open: false, x: 0, y: 0, tabId: '',
  })

  // Drag-and-drop reordering
  const dragIdx = useRef<number | null>(null)

  const handleDragStart = useCallback((e: React.DragEvent, idx: number) => {
    dragIdx.current = idx
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, toIdx: number) => {
    e.preventDefault()
    const fromIdx = dragIdx.current
    if (fromIdx !== null && fromIdx !== toIdx) {
      moveTab(fromIdx, toIdx)
    }
    dragIdx.current = null
  }, [moveTab])

  // Horizontal scroll with wheel
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft += e.deltaY
    }
  }, [])

  if (tabs.length === 0) return null

  const contextMenuItems: ContextMenuItem[] = [
    {
      id: 'close',
      label: t('tabs.close', 'Close'),
      onSelect: () => closeTab(ctxMenu.tabId),
    },
    {
      id: 'closeOthers',
      label: t('tabs.closeOthers', 'Close Others'),
      onSelect: () => closeOtherTabs(ctxMenu.tabId),
      disabled: tabs.length <= 1,
    },
    {
      id: 'closeRight',
      label: t('tabs.closeToRight', 'Close to the Right'),
      onSelect: () => closeTabsToRight(ctxMenu.tabId),
      disabled: tabs.findIndex((t) => t.id === ctxMenu.tabId) === tabs.length - 1,
    },
    {
      id: 'copyTitle',
      label: t('tabs.copyTitle', 'Copy Title'),
      onSelect: () => {
        const tab = tabs.find((t) => t.id === ctxMenu.tabId)
        if (tab) {
          navigator.clipboard.writeText(tab.title)
          useToastStore.getState().show('success', 'Title copied')
        }
      },
    },
  ]

  return (
    <>
      <div className="relative shrink-0">
        <div
          ref={scrollRef}
          className="flex items-end overflow-x-auto"
          style={{
            height: 32,
            backgroundColor: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border-color)',
            scrollbarWidth: 'none',
          }}
          onWheel={handleWheel}
        >
        {tabs.map((tab, idx) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            index={idx}
            onClick={() => switchTab(tab.id)}
            onClose={() => closeTab(tab.id)}
            onContextMenu={(e) => {
              e.preventDefault()
              setCtxMenu({ open: true, x: e.clientX, y: e.clientY, tabId: tab.id })
            }}
            onDragStart={(e) => handleDragStart(e, idx)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, idx)}
          />
        ))}
        </div>
        {hasOverflow && (
          <div
            className="absolute right-0 top-0 bottom-0 w-5 pointer-events-none"
            style={{ background: 'linear-gradient(to right, transparent, var(--bg-secondary))' }}
          />
        )}
      </div>

      <ContextMenu
        open={ctxMenu.open}
        x={ctxMenu.x}
        y={ctxMenu.y}
        onClose={() => setCtxMenu((s) => ({ ...s, open: false }))}
        items={contextMenuItems}
        ariaLabel={t('tabs.contextMenu', 'Tab actions')}
      />
    </>
  )
}

interface TabItemProps {
  tab: WorkspaceTab
  isActive: boolean
  index: number
  onClick: () => void
  onClose: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}

function TabItem({
  tab,
  isActive,
  onClick,
  onClose,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
}: TabItemProps) {
  const Icon = iconForFormat(tab.format)
  const name = tab.title || 'Untitled'

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onContextMenu={onContextMenu}
      onClick={onClick}
      onMouseDown={(e) => {
        // Middle-click to close
        if (e.button === 1) {
          e.preventDefault()
          onClose()
        }
      }}
      className={clsx(
        'group flex items-center gap-1.5 px-3 cursor-pointer select-none shrink-0',
        'border-r text-xs transition-colors',
        isActive
          ? 'border-b-2'
          : 'hover:bg-black/5 dark:hover:bg-white/5',
      )}
      style={{
        height: 32,
        maxWidth: 180,
        borderRightColor: 'var(--border-color)',
        borderBottomColor: isActive ? 'var(--accent-primary)' : 'transparent',
        backgroundColor: isActive ? 'var(--bg-primary)' : undefined,
        color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
      }}
      title={tab.title}
      role="tab"
      aria-selected={isActive}
    >
      <Icon size={13} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
      <span className="truncate">{name}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="ml-auto shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-70 hover:!opacity-100 focus-visible:opacity-100 transition-opacity"
        style={{ color: 'var(--text-muted)' }}
        aria-label={`Close ${name}`}
      >
        <X size={12} />
      </button>
    </div>
  )
}
