/**
 * Titlebar for a reader window — deliberately thinner than the workbench's.
 *
 * A reader window has no workspace, no split panes, no agent sidebar and no
 * front stage, so it carries only what reading needs: open, sidebar toggle,
 * and a door back to note mode.
 */
import { useEffect, useState, type CSSProperties } from 'react'
import { Minus, Square, X, PanelLeft, FolderOpen, FileText, NotebookPen, BookmarkPlus, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLibraryStore } from '../../store/libraryStore'

const dragStyle = { WebkitAppRegion: 'drag' } as unknown as CSSProperties
const noDragStyle = { WebkitAppRegion: 'no-drag' } as unknown as CSSProperties

interface ReaderTitleBarProps {
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

export function ReaderTitleBar({ sidebarOpen, onToggleSidebar }: ReaderTitleBarProps) {
  const { t } = useTranslation()
  const [isMaximized, setIsMaximized] = useState(false)
  const root = useLibraryStore((s) => s.root)
  const activeTab = useLibraryStore((s) => s.tabs.find((x) => x.path === s.activePath) ?? null)
  const pickFolder = useLibraryStore((s) => s.pickFolder)
  const pickFile = useLibraryStore((s) => s.pickFile)

  const isMac = window.electronAPI.platform === 'darwin'

  /** null = idle, 'saving' | 'saved' | 'failed' after the user collects a doc. */
  const [collect, setCollect] = useState<null | 'saving' | 'saved' | 'failed'>(null)

  useEffect(() => {
    window.electronAPI.isMaximized().then(setIsMaximized)
    return window.electronAPI.onMaximizeChange(setIsMaximized)
  }, [])

  // Reset the confirmation when the user moves to another document.
  useEffect(() => {
    setCollect(null)
  }, [activeTab?.path])

  const collectToNotes = async () => {
    if (!activeTab || collect === 'saving') return
    setCollect('saving')
    const res = await window.electronAPI.libraryImportToWorkspace(activeTab.path)
    setCollect(res.ok ? 'saved' : 'failed')
  }

  const iconButton = (
    onClick: () => void,
    label: string,
    Icon: typeof PanelLeft,
    active = false,
  ) => (
    <button
      type="button"
      onClick={onClick}
      style={{ ...noDragStyle, color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}
      className="p-1.5 rounded hover:bg-[var(--bg-hover)]"
      title={label}
      aria-label={label}
    >
      <Icon size={14} />
    </button>
  )

  return (
    <div
      className="flex items-center h-10 px-2 shrink-0 border-b"
      style={{
        ...dragStyle,
        backgroundColor: 'var(--bg-secondary)',
        borderColor: 'var(--border-color)',
        paddingLeft: isMac ? 78 : undefined, // clear the traffic lights
      }}
    >
      <div className="flex items-center gap-0.5">
        {root && iconButton(onToggleSidebar, t('library.toggleSidebar', 'Toggle folder'), PanelLeft, sidebarOpen)}
        {iconButton(() => void pickFolder(), t('library.openFolder', 'Open folder…'), FolderOpen)}
        {iconButton(() => void pickFile(), t('library.openFile', 'Open file…'), FileText)}
      </div>

      <div className="flex-1 flex items-center justify-center min-w-0 px-3">
        <span className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
          {activeTab?.name ?? t('library.readerMode', 'Reader')}
        </span>
      </div>

      <div className="flex items-center gap-0.5">
        {activeTab && (
          <button
            type="button"
            onClick={() => void collectToNotes()}
            disabled={collect === 'saving'}
            style={{
              ...noDragStyle,
              color: collect === 'saved' ? 'var(--color-success, #16a34a)' : 'var(--text-muted)',
            }}
            className="p-1.5 rounded hover:bg-[var(--bg-hover)] disabled:opacity-40"
            title={
              collect === 'saved'
                ? t('library.collected', 'Saved to notes')
                : collect === 'failed'
                  ? t('library.collectFailed', 'Could not save to notes')
                  : t('library.collect', 'Save a copy to notes')
            }
            aria-label={t('library.collect', 'Save a copy to notes')}
          >
            {collect === 'saved' ? <Check size={14} /> : <BookmarkPlus size={14} />}
          </button>
        )}
        {iconButton(
          () => void window.electronAPI.libraryOpenWorkspace(),
          t('library.openWorkspace', 'Open note mode'),
          NotebookPen,
        )}
        {!isMac && (
          <>
            <button
              type="button"
              onClick={() => window.electronAPI.minimizeWindow()}
              style={noDragStyle}
              className="p-1.5 rounded hover:bg-[var(--bg-hover)]"
              aria-label="Minimize"
            >
              <Minus size={14} />
            </button>
            <button
              type="button"
              onClick={() => window.electronAPI.maximizeWindow()}
              style={noDragStyle}
              className="p-1.5 rounded hover:bg-[var(--bg-hover)]"
              aria-label={isMaximized ? 'Restore' : 'Maximize'}
            >
              <Square size={12} />
            </button>
            <button
              type="button"
              onClick={() => window.electronAPI.closeWindow()}
              style={noDragStyle}
              className="p-1.5 rounded hover:bg-red-500 hover:text-white"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
