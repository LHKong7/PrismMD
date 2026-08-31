import { useState, useEffect, useRef, type CSSProperties } from 'react'
import { Minus, Square, X, PanelLeft, PanelRight, Settings, Network, BookOpen, BookOpenText, Columns2, Rows2, XCircle, Download, FileText, FileType, Printer, Zap } from 'lucide-react'
import { Tooltip } from '../ui/Tooltip'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/uiStore'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useAgentStore } from '../../store/agentStore'
import { useEditorStore } from '../../store/editorStore'
import { themes, applyTheme, getThemeById } from '../../lib/theme/themes'
import { Button } from '../ui/Button'
import { PrismMark } from './PrismMark'

const dragStyle = { WebkitAppRegion: 'drag' } as unknown as CSSProperties
const noDragStyle = { WebkitAppRegion: 'no-drag' } as unknown as CSSProperties

interface TitleBarProps {
  onOpenSettings: () => void
  onOpenHorseMode?: () => void
}

export function TitleBar({ onOpenSettings, onOpenHorseMode }: TitleBarProps) {
  const { t } = useTranslation()
  const [isMaximized, setIsMaximized] = useState(false)
  const toggleLeftSidebar = useUIStore((s) => s.toggleLeftSidebar)
  const toggleRightSidebar = useUIStore((s) => s.toggleRightSidebar)
  const mainViewMode = useUIStore((s) => s.mainViewMode)
  const toggleMainViewMode = useUIStore((s) => s.toggleMainViewMode)
  const currentPageId = useWorkspaceStore((s) => s.currentPageId)
  const currentTitle = useWorkspaceStore((s) => s.currentTitle)
  const themeId = useSettingsStore((s) => s.themeId)
  const setThemeId = useSettingsStore((s) => s.setThemeId)
  const setThemeMode = useSettingsStore((s) => s.setThemeMode)
  const graphEnabled = useSettingsStore((s) => s.insightGraph.enabled)
  const splitLayout = useUIStore((s) => s.splitLayout)
  const splitPane = useUIStore((s) => s.splitPane)
  const unsplit = useUIStore((s) => s.unsplit)
  const toggleSplitDirection = useUIStore((s) => s.toggleSplitDirection)
  const toggleAgentSidebar = useAgentStore((s) => s.toggleAgentSidebar)
  const agentSidebarOpen = useAgentStore((s) => s.agentSidebarOpen)
  const isDirty = useEditorStore((s) => s.isDirty)

  const isMac = window.electronAPI.platform === 'darwin'

  useEffect(() => {
    window.electronAPI.isMaximized().then(setIsMaximized)
    const cleanup = window.electronAPI.onMaximizeChange(setIsMaximized)
    return cleanup
  }, [])

  const cycleTheme = () => {
    const currentIdx = themes.findIndex((t) => t.id === themeId)
    const nextIdx = (currentIdx + 1) % themes.length
    const next = themes[nextIdx]
    setThemeId(next.id)
    setThemeMode('manual')
    applyTheme(next)
  }

  const rawFileName = currentTitle || 'PrismMD'
  const fileName = isDirty ? `● ${rawFileName}` : rawFileName

  return (
    <div
      className="flex items-center h-11 select-none border-b gap-1"
      style={{
        ...dragStyle,
        backgroundColor: 'var(--titlebar, var(--bg-sidebar))',
        borderColor: 'var(--border-color)',
        paddingLeft: isMac ? 80 : 10,
        paddingRight: 8,
      }}
    >
      {/* Wordmark — the reading-instrument identity */}
      <div className="flex items-center gap-2 pr-1 shrink-0">
        <PrismMark size={20} />
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 14, color: 'var(--text-primary)', letterSpacing: '.01em' }}>
            Prism
          </span>
          <span className="hidden sm:inline truncate" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            · {fileName}
          </span>
        </div>
      </div>

      {/* Left controls */}
      <div className="flex items-center gap-1" style={noDragStyle}>
        <Tooltip label={`${t('titlebar.toggleFileTree')} (${isMac ? '⌘' : 'Ctrl'}+B)`} side="bottom">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleLeftSidebar}
            className="p-1.5"
            aria-label={t('titlebar.toggleFileTree')}
          >
            <PanelLeft size={16} style={{ color: 'var(--text-secondary)' }} />
          </Button>
        </Tooltip>
      </div>

      {/* Drag spacer */}
      <div className="flex-1" />

      {/* Right controls */}
      <div className="flex items-center gap-1 px-2" style={noDragStyle}>
        {graphEnabled && (
          <Tooltip label={mainViewMode === 'graph' ? t('titlebar.showReader') : t('titlebar.showGraph')} side="bottom">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMainViewMode}
              className="p-1.5"
              aria-label={mainViewMode === 'graph' ? t('titlebar.showReader') : t('titlebar.showGraph')}
            >
              {mainViewMode === 'graph' ? (
                <BookOpen size={16} style={{ color: 'var(--accent-color)' }} />
              ) : (
                <Network size={16} style={{ color: 'var(--text-secondary)' }} />
              )}
            </Button>
          </Tooltip>
        )}
        {currentPageId && <ExportDropdown />}
        {onOpenHorseMode && (
          <Tooltip label={t('horseMode.title', 'Horse Mode')} side="bottom">
            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenHorseMode}
              className="p-1.5"
              aria-label={t('horseMode.title', 'Horse Mode')}
            >
              <Zap size={16} style={{ color: 'var(--color-warning)' }} />
            </Button>
          </Tooltip>
        )}
        <div className="w-px h-4 mx-0.5 flex-shrink-0" style={{ backgroundColor: 'var(--border-color)' }} />
        <Tooltip label={`${t('split.horizontal')} (${isMac ? '⌘' : 'Ctrl'}+\\)`} side="bottom">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (!splitLayout.split) splitPane('horizontal')
              else if (splitLayout.direction !== 'horizontal') toggleSplitDirection()
            }}
            className="p-1.5"
            aria-label={t('split.horizontal')}
          >
            <Columns2 size={16} style={{ color: splitLayout.split && splitLayout.direction === 'horizontal' ? 'var(--accent-color)' : 'var(--text-secondary)' }} />
          </Button>
        </Tooltip>
        <Tooltip label={`${t('split.vertical')} (${isMac ? '⌘⇧' : 'Ctrl+Shift'}+\\)`} side="bottom">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (!splitLayout.split) splitPane('vertical')
              else if (splitLayout.direction !== 'vertical') toggleSplitDirection()
            }}
            className="p-1.5"
            aria-label={t('split.vertical')}
          >
            <Rows2 size={16} style={{ color: splitLayout.split && splitLayout.direction === 'vertical' ? 'var(--accent-color)' : 'var(--text-secondary)' }} />
          </Button>
        </Tooltip>
        {splitLayout.split && (
          <Tooltip label={t('split.unsplit')} side="bottom">
            <Button
              variant="ghost"
              size="icon"
              onClick={unsplit}
              className="p-1.5"
              aria-label={t('split.unsplit')}
            >
              <XCircle size={16} style={{ color: 'var(--text-secondary)' }} />
            </Button>
          </Tooltip>
        )}
        <div className="w-px h-4 mx-0.5 flex-shrink-0" style={{ backgroundColor: 'var(--border-color)' }} />
        <Tooltip label={`${t('titlebar.toggleOutline')} (${isMac ? '⌘⇧' : 'Ctrl+Shift'}+B)`} side="bottom">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleRightSidebar}
            className="p-1.5"
            aria-label={t('titlebar.toggleOutline')}
          >
            <PanelRight size={16} style={{ color: 'var(--text-secondary)' }} />
          </Button>
        </Tooltip>
        <div className="w-px h-4 mx-0.5 flex-shrink-0" style={{ backgroundColor: 'var(--border-color)' }} />
        {/* Theme cycle — a refracted-spectrum swatch of the active identity */}
        <Tooltip label={`${t('titlebar.theme')}: ${getThemeById(themeId)?.name ?? themeId} (${isMac ? '⌘' : 'Ctrl'}+T)`} side="bottom">
          <button
            onClick={cycleTheme}
            className="flex items-center gap-[3px] px-2 h-7 rounded-lg border transition-colors"
            style={{ ...noDragStyle, borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
            aria-label={t('titlebar.theme')}
          >
            {['var(--bg-primary)', 'var(--accent-color)', 'var(--text-primary)'].map((c, i) => (
              <span key={i} className="w-[9px] h-[9px] rounded-full" style={{ backgroundColor: c, border: '1px solid var(--border-color)' }} />
            ))}
          </button>
        </Tooltip>
        {/* Ask — the accent affordance for the AI assistant */}
        <Tooltip label={`${t('titlebar.toggleAgent')} (${isMac ? '⌘' : 'Ctrl'}+J)`} side="bottom">
          <button
            onClick={toggleAgentSidebar}
            className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg font-semibold transition-colors"
            style={{
              ...noDragStyle,
              fontSize: 12,
              color: agentSidebarOpen ? 'var(--accent-ink, #fff)' : 'var(--accent-color)',
              backgroundColor: agentSidebarOpen ? 'var(--accent-color)' : 'var(--accent-soft, color-mix(in srgb, var(--accent-color) 13%, transparent))',
            }}
            aria-label={t('titlebar.toggleAgent')}
            aria-pressed={agentSidebarOpen}
          >
            <span style={{ color: agentSidebarOpen ? 'var(--accent-ink, #fff)' : 'var(--accent-color)' }}>✦</span>
            {t('titlebar.ask', 'Ask')}
          </button>
        </Tooltip>
        <Tooltip label={t('library.openReader', '打开只读阅读器')} side="bottom">
          <Button
            variant="ghost"
            size="icon"
            /* No argument: the reader window opens on its recents screen and
               the user picks a folder there. */
            onClick={() => void window.electronAPI.libraryOpenWindow()}
            className="p-1.5"
            aria-label={t('library.openReader', '打开只读阅读器')}
          >
            <BookOpenText size={16} style={{ color: 'var(--text-secondary)' }} />
          </Button>
        </Tooltip>
        <Tooltip label={`${t('titlebar.settings')} (${isMac ? '⌘' : 'Ctrl'}+,)`} side="bottom">
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSettings}
            className="p-1.5"
            aria-label={t('titlebar.settings')}
          >
            <Settings size={16} style={{ color: 'var(--text-secondary)' }} />
          </Button>
        </Tooltip>

        {/* Window controls (non-macOS) — no tooltips, native title is fine */}
        {!isMac && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.electronAPI.minimizeWindow()}
              className="p-1.5"
              aria-label={t('titlebar.minimize')}
              title={t('titlebar.minimize')}
            >
              <Minus size={16} style={{ color: 'var(--text-secondary)' }} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.electronAPI.maximizeWindow()}
              className="p-1.5"
              aria-label={isMaximized ? t('titlebar.restore') : t('titlebar.maximize')}
              title={isMaximized ? t('titlebar.restore') : t('titlebar.maximize')}
            >
              <Square size={14} style={{ color: 'var(--text-secondary)' }} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.electronAPI.closeWindow()}
              className="p-1.5 hover:!bg-error-bg"
              aria-label={t('titlebar.close')}
              title={t('titlebar.close')}
            >
              <X size={16} style={{ color: 'var(--text-secondary)' }} />
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function ExportDropdown() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', handleClick)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleClick)
      window.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const handleAction = async (action: () => Promise<void>) => {
    setOpen(false)
    await action()
  }

  return (
    <div ref={ref} className="relative">
      <Tooltip label={t('export.title', 'Export')} side="bottom">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(!open)}
          className="p-1.5"
          aria-label={t('export.title', 'Export')}
        >
          <Download size={16} style={{ color: 'var(--text-secondary)' }} />
        </Button>
      </Tooltip>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 rounded-lg shadow-lg border overflow-hidden"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)', minWidth: 180 }}
        >
          <ExportMenuItem
            icon={<FileText size={13} />}
            label={t('export.html')}
            onClick={() => handleAction(async () => {
              const { exportToHtml } = await import('../../lib/export/exportActions')
              await exportToHtml()
            })}
          />
          <ExportMenuItem
            icon={<FileType size={13} />}
            label={t('export.pdf')}
            onClick={() => handleAction(async () => {
              const { exportToPdf } = await import('../../lib/export/exportActions')
              await exportToPdf()
            })}
          />
          <ExportMenuItem
            icon={<FileText size={13} />}
            label={t('export.docx')}
            onClick={() => handleAction(async () => {
              const { exportToDocx } = await import('../../lib/export/exportActions')
              await exportToDocx()
            })}
          />
          <div className="border-t" style={{ borderColor: 'var(--border-color)' }} />
          <ExportMenuItem
            icon={<Printer size={13} />}
            label={t('export.print')}
            onClick={() => handleAction(async () => {
              const { printDocument } = await import('../../lib/export/exportActions')
              await printDocument()
            })}
          />
        </div>
      )}
    </div>
  )
}

function ExportMenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
      style={{ color: 'var(--text-secondary)' }}
    >
      {icon}
      {label}
    </button>
  )
}
