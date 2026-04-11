import { useEffect } from 'react'
import { useUIStore } from '../store/uiStore'
import { useAgentStore } from '../store/agentStore'
import { useSettingsStore } from '../store/settingsStore'
import { themes, applyTheme, getThemeById } from '../lib/theme/themes'

export function useAutoHide() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey

      // Ctrl/Cmd + B: toggle left sidebar
      if (isMod && !e.shiftKey && e.key === 'b') {
        e.preventDefault()
        useUIStore.getState().toggleLeftSidebar()
      }

      // Ctrl/Cmd + Shift + B: toggle right sidebar
      if (isMod && e.shiftKey && (e.key === 'B' || e.key === 'b')) {
        e.preventDefault()
        useUIStore.getState().toggleRightSidebar()
      }

      // Ctrl/Cmd + J: toggle agent sidebar
      if (isMod && !e.shiftKey && e.key === 'j') {
        e.preventDefault()
        useAgentStore.getState().toggleAgentSidebar()
      }

      // Ctrl/Cmd + T: cycle theme
      if (isMod && !e.shiftKey && e.key === 't') {
        e.preventDefault()
        const { themeId, setThemeId, setThemeMode } = useSettingsStore.getState()
        const currentIdx = themes.findIndex((t) => t.id === themeId)
        const nextIdx = (currentIdx + 1) % themes.length
        const next = themes[nextIdx]
        setThemeId(next.id)
        setThemeMode('manual')
        applyTheme(next)
      }

      // Ctrl/Cmd + ,: open settings (handled in App.tsx via settingsOpen state)
      // This shortcut is handled at the App level since it needs to set React state
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
