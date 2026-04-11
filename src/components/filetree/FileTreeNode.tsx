import { useState } from 'react'
import { ChevronRight, FileText, Folder } from 'lucide-react'
import { clsx } from 'clsx'
import type { FileTreeNode } from '../../types/electron'
import { useFileStore } from '../../store/fileStore'
import { FileTree } from './FileTree'

interface FileTreeNodeItemProps {
  node: FileTreeNode
  depth: number
}

export function FileTreeNodeItem({ node, depth }: FileTreeNodeItemProps) {
  const [expanded, setExpanded] = useState(depth === 0)
  const currentFilePath = useFileStore((s) => s.currentFilePath)
  const openFile = useFileStore((s) => s.openFile)

  const isActive = node.type === 'file' && node.path === currentFilePath
  const paddingLeft = 8 + depth * 16

  const handleClick = () => {
    if (node.type === 'directory') {
      setExpanded(!expanded)
    } else {
      openFile(node.path)
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
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
            <FileText size={14} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </button>

      {node.type === 'directory' && expanded && node.children && (
        <FileTree nodes={node.children} depth={depth + 1} />
      )}
    </div>
  )
}
