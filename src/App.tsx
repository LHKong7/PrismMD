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
import { ZenMode } from './components/zenmode/ZenMode'
import { PluginNotificationHost } from './components/plugins/PluginNotificationHost'
import { ToastHost } from './components/ui/Toast'
import { useFileWatcher } from './hooks/useFileWatcher'
import { useAutoHide } from './hooks/useAutoHide'
import { useAnnotations } from './hooks/useAnnotations'
import { useUpdaterBridge } from './hooks/useUpdaterBridge'
import { useSettingsStore } from './store/settingsStore'
import { useUIStore } from './store/uiStore'
import { useEditorStore } from './store/editorStore'
import { useFileStore } from './store/fileStore'
import { useToastStore } from './store/toastStore'
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
  const toasts = useToastStore((s) => s.toasts)
  const dismissToast = useToastStore((s) => s.dismiss)
  const zenMode = useUIStore((s) => s.zenMode)
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const loadLayout = useUIStore((s) => s.loadLayout)

  useEffect(() => { loadSettings() }, [loadSettings])
  useEffect(() => { loadLayout() }, [loadLayout])

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
      // Ctrl+Tab / Ctrl+Shift+Tab — cycle tabs (no meta required)
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        const { tabs, activeTabId, switchTab } = useFileStore.getState()
        if (tabs.length < 2) return
        const idx = tabs.findIndex((t) => t.id === activeTabId)
        const next = e.shiftKey
          ? (idx - 1 + tabs.length) % tabs.length
          : (idx + 1) % tabs.length
        switchTab(tabs[next].id)
        return
      }

      // ? — open keyboard shortcuts help (only when not typing in an input)
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
        e.preventDefault()
        useUIStore.getState().openSettings('shortcuts')
        return
      }

      if (!(e.metaKey || e.ctrlKey)) return

      // Cmd+Shift+Z — toggle zen mode (must check before undo which is Cmd+Z)
      if (e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        useUIStore.getState().toggleZenMode()
        return
      }

      // Cmd+\ — toggle horizontal split
      if (e.key === '\\' && !e.shiftKey) {
        e.preventDefault()
        const { splitLayout, splitPane, unsplit, toggleSplitDirection } = useUIStore.getState()
        if (!splitLayout.split) splitPane('horizontal')
        else if (splitLayout.direction === 'horizontal') unsplit()
        else toggleSplitDirection()
        return
      }

      // Cmd+Shift+\ — toggle vertical split
      if (e.key === '\\' && e.shiftKey) {
        e.preventDefault()
        const { splitLayout, splitPane, unsplit, toggleSplitDirection } = useUIStore.getState()
        if (!splitLayout.split) splitPane('vertical')
        else if (splitLayout.direction === 'vertical') unsplit()
        else toggleSplitDirection()
        return
      }

      // Cmd+Shift+] — focus next pane
      if (e.key === ']' && e.shiftKey) {
        e.preventDefault()
        const { splitLayout, setActivePaneId } = useUIStore.getState()
        if (!splitLayout.split) return
        const next = splitLayout.activePaneId === 'pane-1' ? 'pane-2' : 'pane-1'
        setActivePaneId(next)
        return
      }

      // Cmd+Shift+[ — focus previous pane
      if (e.key === '[' && e.shiftKey) {
        e.preventDefault()
        const { splitLayout, setActivePaneId } = useUIStore.getState()
        if (!splitLayout.split) return
        const prev = splitLayout.activePaneId === 'pane-1' ? 'pane-2' : 'pane-1'
        setActivePaneId(prev)
        return
      }

      if (e.key === ',') {
        e.preventDefault()
        if (useUIStore.getState().settingsOpen) closeSettings()
        else openSettings()
        return
      }

      if (e.key === 'n') {
        e.preventDefault()
        void useFileStore.getState().createNewFile()
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
        return
      }

      // Cmd+W — close active tab
      if (e.key === 'w') {
        e.preventDefault()
        const { activeTabId, closeTab } = useFileStore.getState()
        if (activeTabId) closeTab(activeTabId)
        return
      }

      // Cmd+Shift+T — reopen last closed tab
      if (e.key === 't' && e.shiftKey) {
        e.preventDefault()
        void useFileStore.getState().reopenClosedTab()
        return
      }

      // Cmd+1..9 — switch to tab by index
      if (e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const { tabs, switchTab } = useFileStore.getState()
        const idx = parseInt(e.key, 10) - 1
        if (idx < tabs.length) switchTab(tabs[idx].id)
        return
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [openSettings, closeSettings])

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {!zenMode && <TitleBar onOpenSettings={() => openSettings()} />}
      <FocusOverlay />
      {!zenMode && <AppShell />}
      {!zenMode && <StatusBar />}
      <ZenMode />
      <CommandPalette onOpenSettings={() => openSettings()} />
      <HighlightPopover onHighlight={addAnnotation} />
      <SelectionAIBubble
        onSaveAsNote={(text, note) => addAnnotation(text, 'yellow', note)}
      />
      <GhostText />
      <SettingsPanel open={settingsOpen} onClose={closeSettings} />
      <PluginNotificationHost />
      <ToastHost items={toasts} onDismiss={dismissToast} />
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
