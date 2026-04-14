import { useEffect, useState } from 'react'
import {
  ChevronRight,
  FileText,
  FileSpreadsheet,
  FileJson,
  File as FileIcon,
  Folder,
  Network,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { clsx } from 'clsx'
import type { FileTreeNode } from '../../types/electron'
import { useFileStore } from '../../store/fileStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useInsightGraphStore } from '../../store/insightGraphStore'
import { useBatchIngestStore } from '../../store/batchIngestStore'
import { FileTree } from './FileTree'
import { detectFormat, isSupported, type FileFormat } from '../../lib/fileFormat'

interface FileTreeNodeItemProps {
  node: FileTreeNode
  depth: number
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

export function FileTreeNodeItem({ node, depth }: FileTreeNodeItemProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(depth === 0)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const currentFilePath = useFileStore((s) => s.currentFilePath)
  const openFile = useFileStore((s) => s.openFile)
  const insightGraphEnabled = useSettingsStore((s) => s.insightGraph.enabled)
  const ingestFile = useInsightGraphStore((s) => s.ingestFile)
  const startBatchIngest = useBatchIngestStore((s) => s.startBatchIngest)

  const isActive = node.type === 'file' && node.path === currentFilePath
  const paddingLeft = 8 + depth * 16
  const fileFormat = node.type === 'file' ? detectFormat(node.path) : null
  // Files: any supported format the SDK can ingest.
  // Directories: any descendant file that qualifies.
  const ingestableFolderFiles =
    node.type === 'directory' && insightGraphEnabled
      ? collectIngestableDescendants(node)
      : []
  const canIngest =
    insightGraphEnabled &&
    (fileFormat !== null || ingestableFolderFiles.length > 0)

  const FormatIcon = iconForFormat(fileFormat)

  const handleClick = () => {
    if (node.type === 'directory') {
      setExpanded(!expanded)
    } else {
      openFile(node.path)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!canIngest) return
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY })
  }

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', close)
    }
  }, [menu])

  return (
    <div>
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={clsx(
          'w-full flex items-center gap-1.5 py-1 px-1 text-left text-sm transition-colors',
          'hover:bg-black/5 dark:hover:bg-white/5',
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
        <span className="truncate">{node.name}</span>
      </button>

      {node.type === 'directory' && expanded && node.children && (
        <FileTree nodes={node.children} depth={depth + 1} />
      )}

      {menu && canIngest && (
        <div
          className="fixed z-50 min-w-[220px] rounded-md border shadow-lg py-1 text-xs"
          style={{
            left: menu.x,
            top: menu.y,
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border-color)',
            color: 'var(--text-secondary)',
          }}
        >
          {node.type === 'file' ? (
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5"
              onClick={(e) => {
                e.stopPropagation()
                setMenu(null)
                void ingestFile(node.path)
              }}
            >
              <Network size={12} />
              <span>{t('filetree.saveToGraph')}</span>
            </button>
          ) : (
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5"
              onClick={(e) => {
                e.stopPropagation()
                setMenu(null)
                void startBatchIngest(ingestableFolderFiles)
              }}
            >
              <Network size={12} />
              <span>{t('filetree.ingestFolder', { count: ingestableFolderFiles.length })}</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
