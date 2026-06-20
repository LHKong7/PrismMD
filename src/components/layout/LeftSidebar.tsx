import { useState } from 'react'
import { FilePlus, FolderPlus, Upload, FolderUp, Pin, PinOff, Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { useUIStore } from '../../store/uiStore'
import { PageTree } from '../filetree/PageTree'
import { useWindowBreakpoint } from '../../lib/hooks/useWindowBreakpoint'

/**
 * LeftSidebar — the workspace page browser.
 *
 * Replaces the former filesystem folder browser. Shows the nested page
 * tree from the workspace database, with actions to create pages and
 * import/export Markdown.
 */
export function LeftSidebar() {
  const { t } = useTranslation()
  const createPage = useWorkspaceStore((s) => s.createPage)
  const createFolder = useWorkspaceStore((s) => s.createFolder)
  const setRenamingId = useWorkspaceStore((s) => s.setRenamingId)
  const importFile = useWorkspaceStore((s) => s.importFile)
  const importFolder = useWorkspaceStore((s) => s.importFolder)
  const pageTree = useWorkspaceStore((s) => s.pageTree)
  const openPage = useWorkspaceStore((s) => s.openPage)

  const handleNewFolder = async () => {
    const id = await createFolder('New Folder', null)
    if (id) setRenamingId(id)
  }
  const leftSidebarPinned = useUIStore((s) => s.leftSidebarPinned)
  const pinLeftSidebar = useUIStore((s) => s.pinLeftSidebar)
  const breakpoint = useWindowBreakpoint()
  const canPin = breakpoint === 'wide'

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<{ id: string; title: string }>>([])

  const handleSearch = async (q: string) => {
    setQuery(q)
    if (!q.trim()) { setResults([]); return }
    try {
      const found = await window.electronAPI.workspaceSearch(q.trim())
      setResults(found.map((r) => ({ id: r.id, title: r.title })))
    } catch {
      setResults([])
    }
  }

  return (
    <div
      className="h-full flex flex-col border-r"
      style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border-color)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <span className="text-xs font-semibold uppercase tracking-wider truncate min-w-0" style={{ color: 'var(--text-muted)' }}>
          {t('sidebar.workspace', 'Workspace')}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => void createPage('Untitled', null)}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            title={t('sidebar.newPage', 'New page')}
          >
            <FilePlus size={14} style={{ color: 'var(--text-muted)' }} />
          </button>
          <button
            onClick={() => void handleNewFolder()}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            title={t('sidebar.newFolder', 'New folder')}
          >
            <FolderPlus size={14} style={{ color: 'var(--text-muted)' }} />
          </button>
          <button
            onClick={() => void importFile(null)}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            title={t('sidebar.importFile', 'Import Markdown')}
          >
            <Upload size={14} style={{ color: 'var(--text-muted)' }} />
          </button>
          <button
            onClick={() => void importFolder(null)}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            title={t('sidebar.importFolder', 'Import folder')}
          >
            <FolderUp size={14} style={{ color: 'var(--text-muted)' }} />
          </button>
          {canPin && (
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
          )}
        </div>
      </div>

      {/* Search */}
      <div className="px-2 py-1.5 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded border"
          style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)' }}
        >
          <Search size={12} style={{ color: 'var(--text-muted)' }} />
          <input
            value={query}
            onChange={(e) => void handleSearch(e.target.value)}
            placeholder={t('sidebar.searchPages', 'Search pages...')}
            className="flex-1 min-w-0 text-xs bg-transparent outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
          {query && (
            <button onClick={() => handleSearch('')} className="p-0.5">
              <X size={11} style={{ color: 'var(--text-muted)' }} />
            </button>
          )}
        </div>
      </div>

      {/* Body: search results or full tree */}
      <div className="flex-1 overflow-y-auto">
        {query.trim() ? (
          results.length > 0 ? (
            <div className="py-1">
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => void openPage(r.id)}
                  className="w-full text-left px-3 py-1.5 text-sm truncate hover:bg-black/5 dark:hover:bg-white/5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {r.title || t('pagetree.untitled', 'Untitled')}
                </button>
              ))}
            </div>
          ) : (
            <div className="px-3 py-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('sidebar.noResults', 'No pages found')}
            </div>
          )
        ) : pageTree.length > 0 ? (
          <PageTree />
        ) : (
          <div className="px-3 py-4 text-center" style={{ color: 'var(--text-muted)' }}>
            <p className="text-sm mb-2">{t('sidebar.noPages', 'No pages yet')}</p>
            <button
              onClick={() => void createPage('Untitled', null)}
              className="text-xs px-3 py-1.5 rounded border transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
            >
              {t('sidebar.newPage', 'New page')}
            </button>
          </div>
        )}
      </div>

      {/* Persistent footer — Notion-style "New page" affordance */}
      {!query.trim() && pageTree.length > 0 && (
        <button
          onClick={() => void createPage('Untitled', null)}
          className="flex items-center gap-2 px-3 py-2 border-t text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
        >
          <FilePlus size={14} />
          {t('sidebar.newPage', 'New page')}
        </button>
      )}
    </div>
  )
}
