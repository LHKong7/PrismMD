/**
 * The folder a reader window is showing.
 *
 * Loads one directory level at a time — mounting a folder costs a single
 * `readdir`, and a sub-folder is only read when the user opens it. That
 * keeps pointing the reader at a 50k-file archive cheap.
 */
import { ChevronRight, ChevronDown, Folder, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLibraryStore } from '../../store/libraryStore'
import { iconForStoredFormat } from '../../lib/formatIcons'
import type { LibraryEntry } from '../../types/electron'

function baseName(p: string): string {
  return p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? p
}

function DirectoryRow({ entry, depth }: { entry: LibraryEntry; depth: number }) {
  const expanded = useLibraryStore((s) => !!s.expanded[entry.path])
  const loading = useLibraryStore((s) => !!s.loadingDirs[entry.path])
  const toggleDir = useLibraryStore((s) => s.toggleDir)

  return (
    <>
      <button
        type="button"
        onClick={() => void toggleDir(entry.path)}
        className="w-full flex items-center gap-1.5 py-1 pr-2 text-left text-xs rounded hover:bg-[var(--bg-hover)]"
        style={{ paddingLeft: 8 + depth * 12, color: 'var(--text-secondary)' }}
        title={entry.path}
      >
        {expanded ? (
          <ChevronDown size={12} className="shrink-0 opacity-60" />
        ) : (
          <ChevronRight size={12} className="shrink-0 opacity-60" />
        )}
        <Folder size={13} className="shrink-0 opacity-70" />
        <span className="truncate">{entry.name}</span>
        {loading && <RefreshCw size={10} className="shrink-0 animate-spin opacity-50" />}
      </button>
      {expanded && <DirectoryChildren dirPath={entry.path} depth={depth + 1} />}
    </>
  )
}

function FileRow({ entry, depth }: { entry: LibraryEntry; depth: number }) {
  const isActive = useLibraryStore((s) => s.activePath === entry.path)
  const isOpen = useLibraryStore((s) => s.tabs.some((t) => t.path === entry.path))
  const openFile = useLibraryStore((s) => s.openFile)
  const Icon = iconForStoredFormat(entry.format ?? 'md')

  return (
    <button
      type="button"
      onClick={() => void openFile(entry.path)}
      className="w-full flex items-center gap-1.5 py-1 pr-2 text-left text-xs rounded hover:bg-[var(--bg-hover)]"
      style={{
        paddingLeft: 8 + depth * 12 + 14, // align past the chevron column
        backgroundColor: isActive ? 'var(--bg-active)' : undefined,
        color: isActive || isOpen ? 'var(--text-primary)' : 'var(--text-secondary)',
      }}
      title={entry.path}
    >
      <Icon size={13} className="shrink-0 opacity-70" />
      <span className="truncate">{entry.name}</span>
    </button>
  )
}

function DirectoryChildren({ dirPath, depth }: { dirPath: string; depth: number }) {
  const { t } = useTranslation()
  const entries = useLibraryStore((s) => s.dirs[dirPath])
  const truncated = useLibraryStore((s) => !!s.truncatedDirs[dirPath])

  // Not fetched yet — the parent row shows the spinner.
  if (!entries) return null

  if (entries.length === 0) {
    return (
      <p
        className="text-[11px] py-1"
        style={{ paddingLeft: 8 + depth * 12 + 14, color: 'var(--text-muted)' }}
      >
        {t('library.emptyFolder', 'Nothing readable here')}
      </p>
    )
  }

  return (
    <>
      {entries.map((entry) =>
        entry.type === 'directory' ? (
          <DirectoryRow key={entry.path} entry={entry} depth={depth} />
        ) : (
          <FileRow key={entry.path} entry={entry} depth={depth} />
        ),
      )}
      {truncated && (
        <p
          className="text-[11px] py-1 italic"
          style={{ paddingLeft: 8 + depth * 12 + 14, color: 'var(--text-muted)' }}
        >
          {t('library.truncated', 'Too many files to list them all')}
        </p>
      )}
    </>
  )
}

export function FolderTree() {
  const { t } = useTranslation()
  const root = useLibraryStore((s) => s.root)
  const refreshDir = useLibraryStore((s) => s.refreshDir)

  if (!root) return null

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <div
        className="flex items-center gap-1 px-2 py-1.5 border-b shrink-0"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <span
          className="flex-1 truncate text-[11px] font-medium uppercase tracking-wide"
          style={{ color: 'var(--text-muted)' }}
          title={root}
        >
          {baseName(root)}
        </span>
        <button
          type="button"
          onClick={() => void refreshDir(root)}
          className="p-1 rounded hover:bg-[var(--bg-hover)]"
          style={{ color: 'var(--text-muted)' }}
          title={t('library.refresh', 'Refresh')}
          aria-label={t('library.refresh', 'Refresh')}
        >
          <RefreshCw size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        <DirectoryChildren dirPath={root} depth={0} />
      </div>
    </div>
  )
}
