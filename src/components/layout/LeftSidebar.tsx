import { useMemo, useState } from 'react'
import { ChevronRight, Database, FolderOpen, Loader2, Pin, PinOff, Plus, X } from 'lucide-react'
import { clsx } from 'clsx'
import { useTranslation } from 'react-i18next'
import { useFileStore } from '../../store/fileStore'
import { useUIStore } from '../../store/uiStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useBatchIngestStore } from '../../store/batchIngestStore'
import { FileTree } from '../filetree/FileTree'
import type { FileTreeNode } from '../../types/electron'
import { isSupported } from '../../lib/fileFormat'

/**
 * Walk the tree and collect paths of every file the knowledge-graph SDK
 * can ingest (markdown, PDF, CSV, JSON, XLSX). The tree itself is already
 * filtered to supported extensions on the main-process side, but we guard
 * here defensively in case of stray nodes.
 */
function collectIngestableFiles(nodes: FileTreeNode[]): string[] {
  const out: string[] = []
  const visit = (n: FileTreeNode) => {
    if (n.type === 'file' && isSupported(n.path)) out.push(n.path)
    else if (n.children) n.children.forEach(visit)
  }
  nodes.forEach(visit)
  return out
}

function FolderSection({ folderPath, folderName, tree, onClose }: {
  folderPath: string
  folderName: string
  tree: FileTreeNode[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(true)
  const insightGraphEnabled = useSettingsStore((s) => s.insightGraph.enabled)
  const startBatchIngest = useBatchIngestStore((s) => s.startBatchIngest)
  const batchStatus = useBatchIngestStore((s) => s.status)
  const batchDone = useBatchIngestStore((s) => s.done.length)
  const batchFailed = useBatchIngestStore((s) => s.failed.length)
  const batchTotal = useBatchIngestStore((s) => s.total)

  const ingestableFiles = useMemo(() => collectIngestableFiles(tree), [tree])

  const handleBuildGraph = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!ingestableFiles.length || batchStatus === 'running') return
    void startBatchIngest(ingestableFiles)
  }

  const running = batchStatus === 'running'
  const buildTitle = running
    ? t('sidebar.ingestingGraph', { done: batchDone + batchFailed, total: batchTotal })
    : ingestableFiles.length > 0
      ? t('sidebar.buildGraph', { count: ingestableFiles.length })
      : t('sidebar.buildGraphEmpty')

  return (
    <div className="border-b" style={{ borderColor: 'var(--border-color)' }}>
      <div
        className="flex items-center justify-between px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer group"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-1 min-w-0">
          <ChevronRight
            size={14}
            className={clsx('transition-transform flex-shrink-0', expanded && 'rotate-90')}
            style={{ color: 'var(--text-muted)' }}
          />
          <FolderOpen size={14} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
          <span
            className="text-xs font-semibold uppercase tracking-wider truncate"
            style={{ color: 'var(--text-secondary)' }}
            title={folderPath}
          >
            {folderName}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          {insightGraphEnabled && (
            <button
              onClick={handleBuildGraph}
              disabled={running || ingestableFiles.length === 0}
              className={clsx(
                'p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-all',
                running ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                'disabled:cursor-not-allowed',
              )}
              title={buildTitle}
            >
              {running ? (
                <Loader2 size={12} className="animate-spin" style={{ color: 'var(--accent-color)' }} />
              ) : batchStatus === 'done' && batchTotal > 0 ? (
                <Database
                  size={12}
                  style={{ color: batchFailed > 0 ? '#ef4444' : 'var(--accent-color)' }}
                />
              ) : (
                <Database size={12} style={{ color: 'var(--text-muted)' }} />
              )}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onClose() }}
            className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-all"
            title={t('sidebar.closeFolder')}
          >
            <X size={12} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="pb-1">
          <FileTree nodes={tree} />
        </div>
      )}
    </div>
  )
}

export function LeftSidebar() {
  const { t } = useTranslation()
  const openFolders = useFileStore((s) => s.openFolders)
  const closeFolder = useFileStore((s) => s.closeFolder)
  const openFolderDialog = useFileStore((s) => s.openFolderDialog)
  const leftSidebarPinned = useUIStore((s) => s.leftSidebarPinned)
  const pinLeftSidebar = useUIStore((s) => s.pinLeftSidebar)

  return (
    <div
      className="h-full flex flex-col border-r"
      style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border-color)' }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          {t('sidebar.explorer')}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={openFolderDialog}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            title={openFolders.length > 0 ? t('sidebar.addFolder') : t('sidebar.openFolder')}
          >
            {openFolders.length > 0 ? (
              <Plus size={14} style={{ color: 'var(--text-muted)' }} />
            ) : (
              <FolderOpen size={14} style={{ color: 'var(--text-muted)' }} />
            )}
          </button>
          <button
            onClick={pinLeftSidebar}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            title={leftSidebarPinned ? t('sidebar.unpinSidebar') : t('sidebar.pinSidebar')}
          >
            {leftSidebarPinned ? (
              <PinOff size={14} style={{ color: 'var(--accent-color)' }} />
            ) : (
              <Pin size={14} style={{ color: 'var(--text-muted)' }} />
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {openFolders.length > 0 ? (
          openFolders.map((folder) => (
            <FolderSection
              key={folder.path}
              folderPath={folder.path}
              folderName={folder.name}
              tree={folder.tree}
              onClose={() => closeFolder(folder.path)}
            />
          ))
        ) : (
          <div className="px-3 py-4 text-center" style={{ color: 'var(--text-muted)' }}>
            <p className="text-sm mb-2">{t('sidebar.noFolder')}</p>
            <button
              onClick={openFolderDialog}
              className="text-xs px-3 py-1.5 rounded border transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
            >
              {t('sidebar.openFolder')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
