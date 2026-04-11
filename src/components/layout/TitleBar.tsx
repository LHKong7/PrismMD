import { useState, useEffect, type CSSProperties } from 'react'
import { Minus, Square, X, Palette, PanelLeft, PanelRight, Settings, Bot } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../store/uiStore'
import { useFileStore } from '../../store/fileStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useAgentStore } from '../../store/agentStore'
import { themes, applyTheme, getThemeById } from '../../lib/theme/themes'

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
  const currentFilePath = useFileStore((s) => s.currentFilePath)
  const themeId = useSettingsStore((s) => s.themeId)
  const setThemeId = useSettingsStore((s) => s.setThemeId)
  const setThemeMode = useSettingsStore((s) => s.setThemeMode)
  const toggleAgentSidebar = useAgentStore((s) => s.toggleAgentSidebar)

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

  const fileName = currentFilePath
    ? currentFilePath.split(/[/\\]/).pop()
    : 'PrismMD'

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
        <button
          onClick={toggleLeftSidebar}
          className="p-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          title={`${t('titlebar.toggleFileTree')} (Ctrl+B)`}
        >
          <PanelLeft size={16} style={{ color: 'var(--text-secondary)' }} />
        </button>
      </div>

      {/* Title */}
      <div className="flex-1 text-center text-sm truncate px-4" style={{ color: 'var(--text-secondary)' }}>
        {fileName}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1 px-2" style={noDragStyle}>
        <button
          onClick={toggleAgentSidebar}
          className="p-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          title="AI Assistant (Ctrl+J)"
        >
          <Bot size={16} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <button
          onClick={toggleRightSidebar}
          className="p-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          title={`${t('titlebar.toggleOutline')} (Ctrl+Shift+B)`}
        >
          <PanelRight size={16} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <button
          onClick={cycleTheme}
          className="p-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          title={`${t('titlebar.theme')}: ${getThemeById(themeId)?.name ?? themeId} (Ctrl+T)`}
        >
          <Palette size={16} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          title={`${t('titlebar.settings')} (Ctrl+,)`}
        >
          <Settings size={16} style={{ color: 'var(--text-secondary)' }} />
        </button>

        {/* Window controls (non-macOS) */}
        {!isMac && (
          <>
            <button
              onClick={() => window.electronAPI.minimizeWindow()}
              className="p-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            >
              <Minus size={16} style={{ color: 'var(--text-secondary)' }} />
            </button>
            <button
              onClick={() => window.electronAPI.maximizeWindow()}
              className="p-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            >
              <Square size={14} style={{ color: 'var(--text-secondary)' }} />
            </button>
            <button
              onClick={() => window.electronAPI.closeWindow()}
              className="p-1.5 rounded hover:bg-red-500/20 transition-colors"
            >
              <X size={16} style={{ color: 'var(--text-secondary)' }} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
