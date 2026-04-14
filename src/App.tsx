import { useState, useEffect } from 'react'
import { ThemeProvider } from './lib/theme/ThemeProvider'
import { TitleBar } from './components/layout/TitleBar'
import { AppShell } from './components/layout/AppShell'
import { StatusBar } from './components/layout/StatusBar'
import { CommandPalette } from './components/commandpalette/CommandPalette'
import { HighlightPopover } from './components/annotations/HighlightPopover'
import { SelectionAIBubble } from './components/annotations/SelectionAIBubble'
import { SettingsPanel } from './components/settings/SettingsPanel'
import { GhostText } from './components/ghosttext/GhostText'
import { FocusOverlay } from './components/focusmode/FocusOverlay'
import { PluginNotificationHost } from './components/plugins/PluginNotificationHost'
import { useFileWatcher } from './hooks/useFileWatcher'
import { useAutoHide } from './hooks/useAutoHide'
import { useAnnotations } from './hooks/useAnnotations'
import { useUpdaterBridge } from './hooks/useUpdaterBridge'
import { useSettingsStore } from './store/settingsStore'
import { bootstrapExternalPlugins } from './lib/plugins/externalLoader'
import { initI18n } from './i18n'

initI18n()

function AppContent() {
  useFileWatcher()
  useAutoHide()
  useUpdaterBridge()
  const { addAnnotation } = useAnnotations()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const loadSettings = useSettingsStore((s) => s.loadSettings)

  useEffect(() => { loadSettings() }, [loadSettings])

  // Load on-disk plugins once the IPC bridge is up. Safe to await inside
  // useEffect — `bootstrapExternalPlugins` is idempotent.
  useEffect(() => {
    void bootstrapExternalPlugins()
  }, [])

  // Ctrl/Cmd + , : settings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        setSettingsOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <TitleBar onOpenSettings={() => setSettingsOpen(true)} />
      <FocusOverlay />
      <AppShell />
      <StatusBar />
      <CommandPalette onOpenSettings={() => setSettingsOpen(true)} />
      <HighlightPopover onHighlight={addAnnotation} />
      <SelectionAIBubble
        onSaveAsNote={(text, note) => addAnnotation(text, 'yellow', note)}
      />
      <GhostText />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <PluginNotificationHost />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  )
}
