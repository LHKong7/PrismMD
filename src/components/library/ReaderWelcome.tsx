/**
 * What a reader window shows before it points at anything.
 *
 * The recents list is the one thing reader mode remembers — without it
 * every launch would start at a file dialog.
 */
import { FolderOpen, FileText, Folder } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLibraryStore } from '../../store/libraryStore'
import { iconForStoredFormat } from '../../lib/formatIcons'

function baseName(p: string): string {
  return p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? p
}

function extOf(p: string): string {
  const i = p.lastIndexOf('.')
  return i > 0 ? p.slice(i + 1).toLowerCase() : 'md'
}

export function ReaderWelcome() {
  const { t } = useTranslation()
  const recents = useLibraryStore((s) => s.recents)
  const error = useLibraryStore((s) => s.error)
  const pickFolder = useLibraryStore((s) => s.pickFolder)
  const pickFile = useLibraryStore((s) => s.pickFile)
  const mount = useLibraryStore((s) => s.mount)

  const hasRecents = recents.roots.length > 0 || recents.files.length > 0

  return (
    <div
      className="h-full overflow-y-auto flex flex-col items-center justify-center gap-8 p-10"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="text-center">
        <h1 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          {t('library.welcomeTitle', 'Read a folder')}
        </h1>
        <p className="text-xs max-w-sm" style={{ color: 'var(--text-muted)' }}>
          {t(
            'library.welcomeBody',
            'Reader mode opens documents where they already live. Nothing is copied, nothing is written back.',
          )}
        </p>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => void pickFolder()}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm border hover:bg-[var(--bg-hover)]"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
        >
          <FolderOpen size={15} />
          {t('library.openFolder', 'Open folder…')}
        </button>
        <button
          type="button"
          onClick={() => void pickFile()}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm border hover:bg-[var(--bg-hover)]"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
        >
          <FileText size={15} />
          {t('library.openFile', 'Open file…')}
        </button>
      </div>

      {error && (
        <p className="text-xs" style={{ color: 'var(--danger, #dc2626)' }}>
          {error}
        </p>
      )}

      {hasRecents && (
        <div className="w-full max-w-md">
          <h2
            className="text-[11px] font-medium uppercase tracking-wide mb-2"
            style={{ color: 'var(--text-muted)' }}
          >
            {t('library.recent', 'Recent')}
          </h2>
          <div className="flex flex-col">
            {recents.roots.slice(0, 5).map((dir) => (
              <button
                key={dir}
                type="button"
                onClick={() => void mount(dir, 'folder')}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs hover:bg-[var(--bg-hover)]"
                style={{ color: 'var(--text-secondary)' }}
                title={dir}
              >
                <Folder size={13} className="shrink-0 opacity-70" />
                <span className="truncate font-medium">{baseName(dir)}</span>
                <span className="truncate opacity-50">{dir}</span>
              </button>
            ))}
            {recents.files.slice(0, 5).map((file) => {
              const Icon = iconForStoredFormat(extOf(file))
              return (
                <button
                  key={file}
                  type="button"
                  onClick={() => void mount(file, 'file')}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs hover:bg-[var(--bg-hover)]"
                  style={{ color: 'var(--text-secondary)' }}
                  title={file}
                >
                  <Icon size={13} className="shrink-0 opacity-70" />
                  <span className="truncate font-medium">{baseName(file)}</span>
                  <span className="truncate opacity-50">{file}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
