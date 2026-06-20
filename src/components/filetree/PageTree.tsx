import { useState, useRef, useEffect } from 'react'
import type { DragEvent } from 'react'
import { ChevronRight, FileText, Folder, FolderOpen, Plus, MoreHorizontal } from 'lucide-react'
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
 * expanded, opened, renamed inline, and acted on via a context menu. Folders
 * (isFolder) are pure containers: clicking one expands it instead of opening a
 * document, and other nodes can be dragged onto it to group them inside.
 */

/** Private drag MIME so we only react to our own tree drags. */
const DRAG_MIME = 'application/x-prismmd-page'

/** Collect a node's id plus every descendant id (drag-drop cycle guard). */
function collectSubtreeIds(node: PageTreeNode, acc: Set<string>): Set<string> {
  acc.add(node.id)
  for (const c of node.children) collectSubtreeIds(c, acc)
  return acc
}

/** Find a node anywhere in the tree by id. */
function findNode(nodes: PageTreeNode[], id: string): PageTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const found = findNode(n.children, id)
    if (found) return found
  }
  return null
}

export function PageTree() {
  const pageTree = useWorkspaceStore((s) => s.pageTree)

  // Dropping onto empty tree space moves a node back up to the top level.
  const handleRootDrop = (e: DragEvent<HTMLDivElement>) => {
    const draggedId = e.dataTransfer.getData(DRAG_MIME)
    if (!draggedId) return
    const tree = useWorkspaceStore.getState().pageTree
    const dragged = findNode(tree, draggedId)
    if (!dragged || dragged.parentId === null) return // already at root
    void useWorkspaceStore.getState().movePage(draggedId, null, tree.length)
  }

  return (
    <div
      className="py-1 min-h-full"
      onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_MIME)) e.preventDefault() }}
      onDrop={handleRootDrop}
    >
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
  const setExpanded = useWorkspaceStore((s) => s.setExpanded)
  const currentPageId = useWorkspaceStore((s) => s.currentPageId)
  const renamingId = useWorkspaceStore((s) => s.renamingId)
  const openPage = useWorkspaceStore((s) => s.openPage)
  const createPage = useWorkspaceStore((s) => s.createPage)
  const createFolder = useWorkspaceStore((s) => s.createFolder)
  const renamePage = useWorkspaceStore((s) => s.renamePage)
  const deletePage = useWorkspaceStore((s) => s.deletePage)
  const exportPage = useWorkspaceStore((s) => s.exportPage)
  const movePage = useWorkspaceStore((s) => s.movePage)
  const setRenamingId = useWorkspaceStore((s) => s.setRenamingId)
  const addPageToKB = useKnowledgeBaseStore((s) => s.addPage)

  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 })
  const [draftName, setDraftName] = useState(node.title)
  const [dropActive, setDropActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const expanded = expandedIds.has(node.id)
  const hasChildren = node.children.length > 0
  const isFolder = node.isFolder
  const isActive = currentPageId === node.id
  const isRenaming = renamingId === node.id
  // Folders always show a chevron (so empty containers read as folders); pages
  // only show one when they actually have subpages.
  const showChevron = isFolder || hasChildren

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

  // Create a child page / folder inside this node, then reveal it.
  const newChildPage = async () => {
    setExpanded(node.id, true)
    await createPage('Untitled', node.id)
  }
  const newChildFolder = async () => {
    setExpanded(node.id, true)
    const id = await createFolder('New Folder', node.id)
    if (id) setRenamingId(id)
  }

  const moveToRootItem: ContextMenuItem[] = node.parentId
    ? [{
        id: 'move-root',
        label: t('pagetree.moveToRoot', 'Move to top level'),
        onSelect: () => void movePage(node.id, null, useWorkspaceStore.getState().pageTree.length),
      }]
    : []

  const menuItems: ContextMenuItem[] = isFolder
    ? [
        { id: 'new-page', label: t('pagetree.newPage', 'New page'), onSelect: () => void newChildPage() },
        { id: 'new-folder', label: t('pagetree.newFolder', 'New folder'), onSelect: () => void newChildFolder() },
        { id: 'rename', label: t('pagetree.rename', 'Rename'), onSelect: () => setRenamingId(node.id) },
        ...moveToRootItem,
        { id: 'delete', label: t('pagetree.delete', 'Delete'), onSelect: () => void deletePage(node.id), destructive: true },
      ]
    : [
        { id: 'new-sub', label: t('pagetree.newSubpage', 'New subpage'), onSelect: () => void newChildPage() },
        { id: 'rename', label: t('pagetree.rename', 'Rename'), onSelect: () => setRenamingId(node.id) },
        { id: 'export', label: t('pagetree.export', 'Export as Markdown'), onSelect: () => void exportPage(node.id) },
        { id: 'add-kb', label: t('pagetree.addToKb', 'Add to Knowledge Base'), onSelect: () => void addPageToKB(node.id) },
        ...moveToRootItem,
        { id: 'delete', label: t('pagetree.delete', 'Delete'), onSelect: () => void deletePage(node.id), destructive: true },
      ]

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    if (isRenaming) return
    e.dataTransfer.setData(DRAG_MIME, node.id)
    e.dataTransfer.setData('text/plain', node.title)
    e.dataTransfer.effectAllowed = 'move'
    e.stopPropagation()
  }

  // Only folders accept drops (to group nodes inside them).
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!isFolder || !e.dataTransfer.types.includes(DRAG_MIME)) return
    e.preventDefault()
    e.stopPropagation() // don't let the root treat this as "move to top level"
    e.dataTransfer.dropEffect = 'move'
    setDropActive(true)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!isFolder) return
    e.preventDefault()
    e.stopPropagation()
    setDropActive(false)
    const draggedId = e.dataTransfer.getData(DRAG_MIME)
    if (!draggedId || draggedId === node.id) return
    const tree = useWorkspaceStore.getState().pageTree
    const dragged = findNode(tree, draggedId)
    if (!dragged) return
    if (dragged.parentId === node.id) return // already inside this folder
    // Refuse to drop a folder into its own subtree (would orphan the branch).
    if (collectSubtreeIds(dragged, new Set()).has(node.id)) return
    void movePage(draggedId, node.id, node.children.length)
    setExpanded(node.id, true)
  }

  return (
    <div>
      <div
        draggable={!isRenaming}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={() => { if (isFolder) setDropActive(false) }}
        onDrop={handleDrop}
        className={clsx(
          'group flex items-center gap-1 pr-1 py-1 cursor-pointer rounded-sm transition-colors',
          isActive ? 'bg-black/10 dark:bg-white/10' : 'hover:bg-black/5 dark:hover:bg-white/5',
        )}
        style={{
          paddingLeft: 4 + depth * 12,
          boxShadow: dropActive ? 'inset 0 0 0 2px var(--accent-color)' : undefined,
        }}
        onClick={() => {
          if (isRenaming) return
          if (isFolder) toggleExpand(node.id)
          else void openPage(node.id)
        }}
        onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ open: true, x: e.clientX, y: e.clientY }) }}
      >
        {/* Expand chevron */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleExpand(node.id) }}
          className={clsx('flex-shrink-0 p-0.5 rounded', !showChevron && 'invisible')}
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
          {node.icon ? (
            node.icon
          ) : isFolder ? (
            expanded ? (
              <FolderOpen size={13} className="inline" style={{ color: 'var(--text-muted)' }} />
            ) : (
              <Folder size={13} className="inline" style={{ color: 'var(--text-muted)' }} />
            )
          ) : (
            <FileText size={13} className="inline" style={{ color: 'var(--text-muted)' }} />
          )}
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
            onClick={(e) => { e.stopPropagation(); void newChildPage() }}
            className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10"
            title={isFolder ? t('pagetree.newPage', 'New page') : t('pagetree.newSubpage', 'New subpage')}
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
