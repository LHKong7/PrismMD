import { useEffect } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import { getThemeById, applyTheme, themes } from './themes'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const themeId = useSettingsStore((s) => s.themeId)
  const themeMode = useSettingsStore((s) => s.themeMode)

  useEffect(() => {
    if (themeMode === 'system') {
      // Determine system theme and pick corresponding light/dark base
      const applySystemTheme = (systemTheme: 'light' | 'dark') => {
        // If themeId is a non-light/dark specific theme, use it if it matches darkness
        const currentTheme = getThemeById(themeId)
        if (currentTheme && currentTheme.isDark === (systemTheme === 'dark')) {
          applyTheme(currentTheme)
        } else {
          // Fall back to default light/dark
          const fallback = getThemeById(systemTheme) ?? themes[0]
          applyTheme(fallback)
        }
      }

      window.electronAPI.getSystemTheme().then(applySystemTheme)
      const cleanup = window.electronAPI.onThemeChanged(applySystemTheme)
      return cleanup
    } else {
      const theme = getThemeById(themeId)
      if (theme) {
        applyTheme(theme)
      }
    }
  }, [themeId, themeMode])

  return <>{children}</>
}
