import { useEffect, useRef, useState } from 'react'
import {
  ChevronRight,
  FileText,
  FileSpreadsheet,
  FileJson,
  File as FileIcon,
  Folder,
  Network,
  FilePlus,
  FolderPlus,
  Pencil,
  Trash2,
  Copy,
  ExternalLink,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { clsx } from 'clsx'
import type { FileTreeNode } from '../../types/electron'
import { useFileStore } from '../../store/fileStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useInsightGraphStore } from '../../store/insightGraphStore'
import { useBatchIngestStore } from '../../store/batchIngestStore'
import { detectFormat, isSupported, type FileFormat } from '../../lib/fileFormat'
import { ContextMenu } from '../ui/ContextMenu'

interface FileTreeNodeItemProps {
  node: FileTreeNode
  depth: number
  hasChildren: boolean
  expanded: boolean
  onToggle: (path: string) => void
}

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

/**
 * Collect every ingestable descendant file under a directory node so the
 * folder right-click can kick off a batch without walking the tree a
 * second time up in the renderer store.
 */
function collectIngestableDescendants(node: FileTreeNode): string[] {
  const out: string[] = []
  const visit = (n: FileTreeNode) => {
    if (n.type === 'file' && isSupported(n.path)) out.push(n.path)
    else if (n.children) n.children.forEach(visit)
  }
  visit(node)
  return out
}

function revealLabel(): string {
  const p = window.electronAPI?.platform ?? ''
  if (p === 'darwin') return 'filetree.revealInFinder'
  if (p === 'win32') return 'filetree.revealInExplorer'
  return 'filetree.revealInFileManager'
}

/**
 * Single tree row. Expand/collapse state is lifted to the parent
 * `FileTree` so virtualization can unmount rows without losing it —
 * this component is stateless w.r.t. expansion.
 */
export function FileTreeNodeItem({ node, depth, hasChildren: _hasChildren, expanded, onToggle }: FileTreeNodeItemProps) {
  const { t } = useTranslation()
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const currentFilePath = useFileStore((s) => s.currentFilePath)
  const openFile = useFileStore((s) => s.openFile)
  const createNewFile = useFileStore((s) => s.createNewFile)
  const createFolder = useFileStore((s) => s.createFolder)
  const renamingPath = useFileStore((s) => s.renamingPath)
  const setRenamingPath = useFileStore((s) => s.setRenamingPath)
  const renameItem = useFileStore((s) => s.renameItem)
  const setPendingDelete = useFileStore((s) => s.setPendingDelete)
  const duplicateFileFn = useFileStore((s) => s.duplicateFile)
  const showInFolder = useFileStore((s) => s.showInFolder)
  const insightGraphEnabled = useSettingsStore((s) => s.insightGraph.enabled)
  const ingestFile = useInsightGraphStore((s) => s.ingestFile)
  const startBatchIngest = useBatchIngestStore((s) => s.startBatchIngest)

  const isRenaming = renamingPath === node.path
  const inputRef = useRef<HTMLInputElement>(null)
  const [renameValue, setRenameValue] = useState(node.name)

  const isActive = node.type === 'file' && node.path === currentFilePath
  const paddingLeft = 8 + depth * 16
  const fileFormat = node.type === 'file' ? detectFormat(node.path) : null
  const ingestableFolderFiles =
    node.type === 'directory' && insightGraphEnabled
      ? collectIngestableDescendants(node)
      : []
  const canIngest =
    insightGraphEnabled &&
    (fileFormat !== null || ingestableFolderFiles.length > 0)

  const FormatIcon = iconForFormat(fileFormat)

  // Reset rename value when renaming starts
  useEffect(() => {
    if (isRenaming) {
      setRenameValue(node.name)
      // Focus + select on next tick so the input is mounted
      requestAnimationFrame(() => {
        const input = inputRef.current
        if (!input) return
        input.focus()
        // Select filename portion (exclude extension for files)
        if (node.type === 'file') {
          const dotIdx = node.name.lastIndexOf('.')
          input.setSelectionRange(0, dotIdx > 0 ? dotIdx : node.name.length)
        } else {
          input.select()
        }
      })
    }
  }, [isRenaming, node.name, node.type])

  const commitRename = () => {
    const trimmed = renameValue.trim()
    if (!trimmed || trimmed === node.name) {
      setRenamingPath(null)
      return
    }
    void renameItem(node.path, trimmed)
  }

  const handleClick = () => {
    if (isRenaming) return
    if (node.type === 'directory') {
      onToggle(node.path)
    } else {
      openFile(node.path)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setMenuPos({ x: e.clientX, y: e.clientY })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (isRenaming) return
    // Keyboard-equivalent of the right-click context menu.
    if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') {
      e.preventDefault()
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      setMenuPos({ x: rect.left + 8, y: rect.bottom })
      return
    }
    // F2 to rename
    if (e.key === 'F2') {
      e.preventDefault()
      setRenamingPath(node.path)
      return
    }
    // Delete / Backspace to delete
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      setPendingDelete({ path: node.path, name: node.name, isDirectory: node.type === 'directory' })
      return
    }
    if (node.type === 'directory' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      if ((e.key === 'ArrowRight' && !expanded) || (e.key === 'ArrowLeft' && expanded)) {
        e.preventDefault()
        onToggle(node.path)
      }
    }
  }

  const closeMenu = () => setMenuPos(null)

  return (
    <div>
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
        aria-expanded={node.type === 'directory' ? expanded : undefined}
        className={clsx(
          'w-full flex items-center gap-1.5 py-1 px-1 text-left text-sm transition-colors overflow-hidden',
          'hover:bg-black/5 dark:hover:bg-white/5',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]',
          isActive && 'bg-black/10 dark:bg-white/10'
        )}
        style={{
          paddingLeft,
          color: isActive ? 'var(--accent-color)' : 'var(--text-secondary)',
        }}
      >
        {node.type === 'directory' ? (
          <>
            <ChevronRight
              size={14}
              className={clsx('transition-transform flex-shrink-0', expanded && 'rotate-90')}
              style={{ color: 'var(--text-muted)' }}
            />
            <Folder size={14} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
          </>
        ) : (
          <>
            <span style={{ width: 14 }} />
            <FormatIcon size={14} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
          </>
        )}
        {isRenaming ? (
          <input
            ref={inputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') {
                e.preventDefault()
                commitRename()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setRenamingPath(null)
              }
            }}
            onBlur={commitRename}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 text-sm px-1 py-0 rounded border outline-none"
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderColor: 'var(--accent-color)',
              color: 'var(--text-primary)',
            }}
          />
        ) : (
          <span className="truncate">{node.name}</span>
        )}
      </button>

      <ContextMenu
        open={!!menuPos}
        x={menuPos?.x ?? 0}
        y={menuPos?.y ?? 0}
        onClose={closeMenu}
        ariaLabel={t('filetree.contextMenu', { defaultValue: 'File actions' })}
      >
        {node.type === 'directory' ? (
          <>
            <button
              role="menuitem"
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5 focus-visible:bg-black/5 dark:focus-visible:bg-white/5 focus-visible:outline-none"
              onClick={() => { closeMenu(); void createNewFile(node.path) }}
            >
              <FilePlus size={12} />
              <span>{t('filetree.newFile')}</span>
            </button>
            <button
              role="menuitem"
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5 focus-visible:bg-black/5 dark:focus-visible:bg-white/5 focus-visible:outline-none"
              onClick={() => { closeMenu(); void createFolder(node.path) }}
            >
              <FolderPlus size={12} />
              <span>{t('filetree.newFolder')}</span>
            </button>
            <div className="my-1 border-t" style={{ borderColor: 'var(--border-color)' }} />
            <button
              role="menuitem"
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5 focus-visible:bg-black/5 dark:focus-visible:bg-white/5 focus-visible:outline-none"
              onClick={() => { closeMenu(); setRenamingPath(node.path) }}
            >
              <Pencil size={12} />
              <span>{t('filetree.rename')}</span>
            </button>
            <button
              role="menuitem"
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5 focus-visible:bg-black/5 dark:focus-visible:bg-white/5 focus-visible:outline-none text-error"
              onClick={() => { closeMenu(); setPendingDelete({ path: node.path, name: node.name, isDirectory: true }) }}
            >
              <Trash2 size={12} />
              <span>{t('filetree.delete')}</span>
            </button>
            <div className="my-1 border-t" style={{ borderColor: 'var(--border-color)' }} />
            <button
              role="menuitem"
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5 focus-visible:bg-black/5 dark:focus-visible:bg-white/5 focus-visible:outline-none"
              onClick={() => { closeMenu(); showInFolder(node.path) }}
            >
              <ExternalLink size={12} />
              <span>{t(revealLabel())}</span>
            </button>
            {canIngest && (
              <button
                role="menuitem"
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5 focus-visible:bg-black/5 dark:focus-visible:bg-white/5 focus-visible:outline-none"
                onClick={() => { closeMenu(); void startBatchIngest(ingestableFolderFiles) }}
              >
                <Network size={12} />
                <span>{t('filetree.ingestFolder', { count: ingestableFolderFiles.length })}</span>
              </button>
            )}
          </>
        ) : (
          <>
            <button
              role="menuitem"
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5 focus-visible:bg-black/5 dark:focus-visible:bg-white/5 focus-visible:outline-none"
              onClick={() => { closeMenu(); setRenamingPath(node.path) }}
            >
              <Pencil size={12} />
              <span>{t('filetree.rename')}</span>
            </button>
            <button
              role="menuitem"
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5 focus-visible:bg-black/5 dark:focus-visible:bg-white/5 focus-visible:outline-none"
              onClick={() => { closeMenu(); void duplicateFileFn(node.path) }}
            >
              <Copy size={12} />
              <span>{t('filetree.duplicate')}</span>
            </button>
            <button
              role="menuitem"
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5 focus-visible:bg-black/5 dark:focus-visible:bg-white/5 focus-visible:outline-none text-error"
              onClick={() => { closeMenu(); setPendingDelete({ path: node.path, name: node.name, isDirectory: false }) }}
            >
              <Trash2 size={12} />
              <span>{t('filetree.delete')}</span>
            </button>
            <div className="my-1 border-t" style={{ borderColor: 'var(--border-color)' }} />
            <button
              role="menuitem"
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5 focus-visible:bg-black/5 dark:focus-visible:bg-white/5 focus-visible:outline-none"
              onClick={() => { closeMenu(); showInFolder(node.path) }}
            >
              <ExternalLink size={12} />
              <span>{t(revealLabel())}</span>
            </button>
            {canIngest && (
              <button
                role="menuitem"
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5 focus-visible:bg-black/5 dark:focus-visible:bg-white/5 focus-visible:outline-none"
                onClick={() => { closeMenu(); void ingestFile(node.path) }}
              >
                <Network size={12} />
                <span>{t('filetree.saveToGraph')}</span>
              </button>
            )}
          </>
        )}
      </ContextMenu>
    </div>
  )
}
