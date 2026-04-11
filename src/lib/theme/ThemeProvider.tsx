import { useEffect } from 'react'
import { useUIStore } from '../../store/uiStore'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useUIStore((s) => s.theme)
  const resolvedTheme = useUIStore((s) => s.resolvedTheme)
  const setResolvedTheme = useUIStore((s) => s.setResolvedTheme)

  useEffect(() => {
    if (theme === 'system') {
      // Get initial system theme
      window.electronAPI.getSystemTheme().then(setResolvedTheme)

      // Listen for system theme changes
      const cleanup = window.electronAPI.onThemeChanged(setResolvedTheme)
      return cleanup
    } else {
      setResolvedTheme(theme)
    }
  }, [theme, setResolvedTheme])

  useEffect(() => {
    const html = document.documentElement
    if (resolvedTheme === 'dark') {
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
    }
  }, [resolvedTheme])

  return <>{children}</>
}
