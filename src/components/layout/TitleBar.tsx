import { useState, useEffect, type CSSProperties } from 'react'
import { Minus, Square, X, Sun, Moon, PanelLeft, PanelRight } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useFileStore } from '../../store/fileStore'

const dragStyle = { WebkitAppRegion: 'drag' } as unknown as CSSProperties
const noDragStyle = { WebkitAppRegion: 'no-drag' } as unknown as CSSProperties

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)
  const resolvedTheme = useUIStore((s) => s.resolvedTheme)
  const theme = useUIStore((s) => s.theme)
  const setTheme = useUIStore((s) => s.setTheme)
  const toggleLeftSidebar = useUIStore((s) => s.toggleLeftSidebar)
  const toggleRightSidebar = useUIStore((s) => s.toggleRightSidebar)
  const currentFilePath = useFileStore((s) => s.currentFilePath)

  const isMac = window.electronAPI.platform === 'darwin'

  useEffect(() => {
    window.electronAPI.isMaximized().then(setIsMaximized)
    const cleanup = window.electronAPI.onMaximizeChange(setIsMaximized)
    return cleanup
  }, [])

  const cycleTheme = () => {
    const order: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system']
    const idx = order.indexOf(theme)
    setTheme(order[(idx + 1) % order.length])
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
          title="Toggle file tree (Ctrl+B)"
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
          onClick={toggleRightSidebar}
          className="p-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          title="Toggle outline (Ctrl+Shift+B)"
        >
          <PanelRight size={16} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <button
          onClick={cycleTheme}
          className="p-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          title={`Theme: ${theme}`}
        >
          {resolvedTheme === 'dark' ? (
            <Moon size={16} style={{ color: 'var(--text-secondary)' }} />
          ) : (
            <Sun size={16} style={{ color: 'var(--text-secondary)' }} />
          )}
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
