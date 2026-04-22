import { useState, useEffect, type CSSProperties } from 'react'
import { Minus, Square, X, Palette, PanelLeft, PanelRight, Settings, Bot, Network, BookOpen, Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/uiStore'
import { useFileStore } from '../../store/fileStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useAgentStore } from '../../store/agentStore'
import { useEditorStore } from '../../store/editorStore'
import { detectFormat, kindOfFormat } from '../../lib/fileFormat'
import { themes, applyTheme, getThemeById } from '../../lib/theme/themes'
import { Button } from '../ui/Button'

const dragStyle = { WebkitAppRegion: 'drag' } as unknown as CSSProperties
const noDragStyle = { WebkitAppRegion: 'no-drag' } as unknown as CSSProperties

interface TitleBarProps {
  onOpenSettings: () => void
}

export function TitleBar({ onOpenSettings }: TitleBarProps) {
  const { t } = useTranslation()
  const [isMaximized, setIsMaximized] = useState(false)
  const toggleLeftSidebar = useUIStore((s) => s.toggleLeftSidebar)
  const toggleRightSidebar = useUIStore((s) => s.toggleRightSidebar)
  const mainViewMode = useUIStore((s) => s.mainViewMode)
  const toggleMainViewMode = useUIStore((s) => s.toggleMainViewMode)
  const currentFilePath = useFileStore((s) => s.currentFilePath)
  const themeId = useSettingsStore((s) => s.themeId)
  const setThemeId = useSettingsStore((s) => s.setThemeId)
  const setThemeMode = useSettingsStore((s) => s.setThemeMode)
  const graphEnabled = useSettingsStore((s) => s.insightGraph.enabled)
  const toggleAgentSidebar = useAgentStore((s) => s.toggleAgentSidebar)
  const editing = useEditorStore((s) => s.editing)
  const isDirty = useEditorStore((s) => s.isDirty)
  const toggleEditing = useEditorStore((s) => s.toggleEditing)

  const canEdit = (() => {
    if (!currentFilePath) return false
    const fmt = detectFormat(currentFilePath)
    return fmt ? kindOfFormat(fmt) === 'text' : false
  })()

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

  const rawFileName = currentFilePath
    ? currentFilePath.split(/[/\\]/).pop()
    : 'PrismMD'
  const fileName = isDirty ? `● ${rawFileName}` : rawFileName

  return (
    <div
      className="flex items-center h-10 select-none border-b"
      style={{
        ...dragStyle,
        backgroundColor: 'var(--bg-sidebar)',
        borderColor: 'var(--border-color)',
        paddingLeft: isMac ? 80 : 0,
      }}
    >
      {/* Left controls */}
      <div className="flex items-center gap-1 px-2" style={noDragStyle}>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleLeftSidebar}
          className="p-1.5"
          title={`${t('titlebar.toggleFileTree')} (Ctrl+B)`}
          aria-label={t('titlebar.toggleFileTree')}
        >
          <PanelLeft size={16} style={{ color: 'var(--text-secondary)' }} />
        </Button>
      </div>

      {/* Title */}
      <div className="flex-1 text-center text-sm truncate px-4" style={{ color: 'var(--text-secondary)' }}>
        {fileName}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1 px-2" style={noDragStyle}>
        {canEdit && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (editing && isDirty) {
                const discard = window.confirm(t('editor.unsavedConfirm', 'You have unsaved changes. Discard them?'))
                if (!discard) return
                useEditorStore.getState().discardChanges()
              }
              toggleEditing()
            }}
            className="p-1.5"
            title={editing ? `${t('titlebar.showReader', 'Reader')} (Ctrl+E)` : `${t('titlebar.showEditor', 'Edit')} (Ctrl+E)`}
            aria-label={editing ? t('titlebar.showReader', 'Reader') : t('titlebar.showEditor', 'Edit')}
          >
            {editing ? (
              <BookOpen size={16} style={{ color: 'var(--accent-color)' }} />
            ) : (
              <Pencil size={16} style={{ color: 'var(--text-secondary)' }} />
            )}
          </Button>
        )}
        {graphEnabled && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMainViewMode}
            className="p-1.5"
            title={mainViewMode === 'graph' ? t('titlebar.showReader') : t('titlebar.showGraph')}
            aria-label={mainViewMode === 'graph' ? t('titlebar.showReader') : t('titlebar.showGraph')}
          >
            {mainViewMode === 'graph' ? (
              <BookOpen size={16} style={{ color: 'var(--accent-color)' }} />
            ) : (
              <Network size={16} style={{ color: 'var(--text-secondary)' }} />
            )}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleAgentSidebar}
          className="p-1.5"
          title={t('titlebar.toggleAgent')}
          aria-label={t('titlebar.toggleAgent')}
        >
          <Bot size={16} style={{ color: 'var(--text-secondary)' }} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleRightSidebar}
          className="p-1.5"
          title={`${t('titlebar.toggleOutline')} (Ctrl+Shift+B)`}
          aria-label={t('titlebar.toggleOutline')}
        >
          <PanelRight size={16} style={{ color: 'var(--text-secondary)' }} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={cycleTheme}
          className="p-1.5"
          title={`${t('titlebar.theme')}: ${getThemeById(themeId)?.name ?? themeId} (Ctrl+T)`}
          aria-label={t('titlebar.theme')}
        >
          <Palette size={16} style={{ color: 'var(--text-secondary)' }} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSettings}
          className="p-1.5"
          title={`${t('titlebar.settings')} (Ctrl+,)`}
          aria-label={t('titlebar.settings')}
        >
          <Settings size={16} style={{ color: 'var(--text-secondary)' }} />
        </Button>

        {/* Window controls (non-macOS). Close button keeps its red-tinted
            hover since it's the "destructive" window action — overrides
            the ghost variant's default hover. */}
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
