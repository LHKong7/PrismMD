import { FolderOpen, Pin, PinOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useFileStore } from '../../store/fileStore'
import { useUIStore } from '../../store/uiStore'
import { FileTree } from '../filetree/FileTree'

export function LeftSidebar() {
  const { t } = useTranslation()
  const rootFolderPath = useFileStore((s) => s.rootFolderPath)
  const fileTree = useFileStore((s) => s.fileTree)
  const openFolderDialog = useFileStore((s) => s.openFolderDialog)
  const leftSidebarPinned = useUIStore((s) => s.leftSidebarPinned)
  const pinLeftSidebar = useUIStore((s) => s.pinLeftSidebar)

  const folderName = rootFolderPath?.split(/[/\\]/).pop() ?? t('sidebar.explorer')

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
          {folderName}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={openFolderDialog}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            title={t('sidebar.openFolder')}
          >
            <FolderOpen size={14} style={{ color: 'var(--text-muted)' }} />
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

      <div className="flex-1 overflow-y-auto py-1">
        {fileTree ? (
          <FileTree nodes={fileTree} />
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
