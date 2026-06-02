import { useState, useRef, useEffect } from 'react'
import { ChevronRight, FileText, Plus, MoreHorizontal } from 'lucide-react'
import { clsx } from 'clsx'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { useKnowledgeBaseStore } from '../../store/knowledgeBaseStore'
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu'
import type { PageTreeNode } from '../../types/electron'

/**
 * PageTree — the Notion-like workspace sidebar.
 *
 * Renders the nested page hierarchy from workspaceStore. Each node can be
 * expanded, opened, renamed inline, and acted on via a context menu
 * (new subpage / rename / delete / export).
 */
export function PageTree() {
  const pageTree = useWorkspaceStore((s) => s.pageTree)

  return (
    <div className="py-1">
      {pageTree.map((node) => (
        <PageNode key={node.id} node={node} depth={0} />
      ))}
    </div>
  )
}

function PageNode({ node, depth }: { node: PageTreeNode; depth: number }) {
  const { t } = useTranslation()
  const expandedIds = useWorkspaceStore((s) => s.expandedIds)
  const toggleExpand = useWorkspaceStore((s) => s.toggleExpand)
  const currentPageId = useWorkspaceStore((s) => s.currentPageId)
  const renamingId = useWorkspaceStore((s) => s.renamingId)
  const openPage = useWorkspaceStore((s) => s.openPage)
  const createPage = useWorkspaceStore((s) => s.createPage)
  const renamePage = useWorkspaceStore((s) => s.renamePage)
  const deletePage = useWorkspaceStore((s) => s.deletePage)
  const exportPage = useWorkspaceStore((s) => s.exportPage)
  const setRenamingId = useWorkspaceStore((s) => s.setRenamingId)
  const addPageToKB = useKnowledgeBaseStore((s) => s.addPage)

  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 })
  const [draftName, setDraftName] = useState(node.title)
  const inputRef = useRef<HTMLInputElement>(null)

  const expanded = expandedIds.has(node.id)
  const hasChildren = node.children.length > 0
  const isActive = currentPageId === node.id
  const isRenaming = renamingId === node.id

  useEffect(() => {
    if (isRenaming) {
      setDraftName(node.title)
      // Focus + select on next tick after input mounts.
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [isRenaming, node.title])

  const commitRename = () => {
    void renamePage(node.id, draftName)
  }

  const menuItems: ContextMenuItem[] = [
    { id: 'new-sub', label: t('pagetree.newSubpage', 'New subpage'), onSelect: () => void createPage('Untitled', node.id) },
    { id: 'rename', label: t('pagetree.rename', 'Rename'), onSelect: () => setRenamingId(node.id) },
    { id: 'export', label: t('pagetree.export', 'Export as Markdown'), onSelect: () => void exportPage(node.id) },
    { id: 'add-kb', label: t('pagetree.addToKb', 'Add to Knowledge Base'), onSelect: () => void addPageToKB(node.id) },
    { id: 'delete', label: t('pagetree.delete', 'Delete'), onSelect: () => void deletePage(node.id), destructive: true },
  ]

  return (
    <div>
      <div
        className={clsx(
          'group flex items-center gap-1 pr-1 py-1 cursor-pointer rounded-sm transition-colors',
          isActive ? 'bg-black/10 dark:bg-white/10' : 'hover:bg-black/5 dark:hover:bg-white/5',
        )}
        style={{ paddingLeft: 4 + depth * 12 }}
        onClick={() => { if (!isRenaming) void openPage(node.id) }}
        onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ open: true, x: e.clientX, y: e.clientY }) }}
      >
        {/* Expand chevron — only when there are children */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleExpand(node.id) }}
          className={clsx('flex-shrink-0 p-0.5 rounded', !hasChildren && 'invisible')}
          tabIndex={-1}
        >
          <ChevronRight
            size={12}
            className={clsx('transition-transform', expanded && 'rotate-90')}
            style={{ color: 'var(--text-muted)' }}
          />
        </button>

        {/* Icon */}
        <span className="flex-shrink-0 w-4 text-center text-xs">
          {node.icon ?? <FileText size={13} className="inline" style={{ color: 'var(--text-muted)' }} />}
        </span>

        {/* Title or inline rename */}
        {isRenaming ? (
          <input
            ref={inputRef}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitRename() }
              else if (e.key === 'Escape') { e.preventDefault(); setRenamingId(null) }
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 text-sm px-1 py-0 rounded border outline-none"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--accent-color)', color: 'var(--text-primary)' }}
          />
        ) : (
          <span
            className="flex-1 min-w-0 truncate text-sm"
            style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}
            title={node.title}
          >
            {node.title || t('pagetree.untitled', 'Untitled')}
          </span>
        )}

        {/* Hover actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); useWorkspaceStore.getState().setExpanded(node.id, true); void createPage('Untitled', node.id) }}
            className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10"
            title={t('pagetree.newSubpage', 'New subpage')}
          >
            <Plus size={12} style={{ color: 'var(--text-muted)' }} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setCtxMenu({ open: true, x: r.left, y: r.bottom }) }}
            className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10"
            title={t('pagetree.more', 'More')}
          >
            <MoreHorizontal size={12} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <PageNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}

      <ContextMenu
        open={ctxMenu.open}
        x={ctxMenu.x}
        y={ctxMenu.y}
        onClose={() => setCtxMenu((s) => ({ ...s, open: false }))}
        items={menuItems}
        ariaLabel={t('pagetree.contextMenu', 'Page actions')}
      />
    </div>
  )
}
