import { useEffect } from 'react'
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
import { useUIStore } from './store/uiStore'
import { useEditorStore } from './store/editorStore'
import { useFileStore } from './store/fileStore'
import { detectFormat, kindOfFormat } from './lib/fileFormat'
import { bootstrapExternalPlugins } from './lib/plugins/externalLoader'
import { initI18n } from './i18n'

initI18n()

function AppContent() {
  useFileWatcher()
  useAutoHide()
  useUpdaterBridge()
  const { addAnnotation } = useAnnotations()
  const settingsOpen = useUIStore((s) => s.settingsOpen)
  const openSettings = useUIStore((s) => s.openSettings)
  const closeSettings = useUIStore((s) => s.closeSettings)
  const loadSettings = useSettingsStore((s) => s.loadSettings)

  useEffect(() => { loadSettings() }, [loadSettings])

  // Prevent accidental close with unsaved editor changes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const editor = useEditorStore.getState()
      if (editor.editing && editor.isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // Load on-disk plugins once the IPC bridge is up. Safe to await inside
  // useEffect — `bootstrapExternalPlugins` is idempotent.
  useEffect(() => {
    void bootstrapExternalPlugins()
  }, [])

  // Ctrl/Cmd + , : settings  |  Ctrl/Cmd + S : save  |  Ctrl/Cmd + E : toggle edit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return

      if (e.key === ',') {
        e.preventDefault()
        if (useUIStore.getState().settingsOpen) closeSettings()
        else openSettings()
        return
      }

      if (e.key === 's') {
        e.preventDefault()
        const editor = useEditorStore.getState()
        if (editor.editing && editor.isDirty) {
          void editor.saveFile()
        }
        return
      }

      if (e.key === 'e') {
        e.preventDefault()
        const filePath = useFileStore.getState().currentFilePath
        if (!filePath) return
        const fmt = detectFormat(filePath)
        if (fmt && kindOfFormat(fmt) === 'text') {
          const editor = useEditorStore.getState()
          if (editor.editing && editor.isDirty) {
            const discard = window.confirm('You have unsaved changes. Discard them?')
            if (!discard) return
            editor.discardChanges()
          }
          editor.toggleEditing()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [openSettings, closeSettings])

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <TitleBar onOpenSettings={() => openSettings()} />
      <FocusOverlay />
      <AppShell />
      <StatusBar />
      <CommandPalette onOpenSettings={() => openSettings()} />
      <HighlightPopover onHighlight={addAnnotation} />
      <SelectionAIBubble
        onSaveAsNote={(text, note) => addAnnotation(text, 'yellow', note)}
      />
      <GhostText />
      <SettingsPanel open={settingsOpen} onClose={closeSettings} />
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
