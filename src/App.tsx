import { useEffect, useState } from 'react'
import { ThemeProvider } from './lib/theme/ThemeProvider'
import { TitleBar } from './components/layout/TitleBar'
import { AppShell } from './components/layout/AppShell'
import { StatusBar } from './components/layout/StatusBar'
import { CommandPalette } from './components/commandpalette/CommandPalette'
import { SettingsPanel } from './components/settings/SettingsPanel'
import { GhostText } from './components/ghosttext/GhostText'
import { FocusOverlay } from './components/focusmode/FocusOverlay'
import { ZenMode } from './components/zenmode/ZenMode'
import { PluginNotificationHost } from './components/plugins/PluginNotificationHost'
import { ToastHost } from './components/ui/Toast'
import { MemoPanel } from './components/memo/MemoPanel'
import { HorseModeDialog } from './components/horsemode/HorseModeDialog'
import { ThemeCompare } from './components/theme/ThemeCompare'
import { FrontStageView } from './components/frontstage/FrontStageView'
import { useAutoHide } from './hooks/useAutoHide'
import { useUpdaterBridge } from './hooks/useUpdaterBridge'
import { useSettingsStore } from './store/settingsStore'
import { useUIStore } from './store/uiStore'
import { useEditorStore } from './store/editorStore'
import { useWorkspaceStore } from './store/workspaceStore'
import { useToastStore } from './store/toastStore'
import { bootstrapExternalPlugins } from './lib/plugins/externalLoader'
import { subscribeToTraceIPC } from './store/agentTraceStore'
import { initI18n } from './i18n'

initI18n()

function AppContent() {
  useAutoHide()
  useUpdaterBridge()
  const settingsOpen = useUIStore((s) => s.settingsOpen)
  const openSettings = useUIStore((s) => s.openSettings)
  const closeSettings = useUIStore((s) => s.closeSettings)
  const toasts = useToastStore((s) => s.toasts)
  const dismissToast = useToastStore((s) => s.dismiss)
  const zenMode = useUIStore((s) => s.zenMode)
  const frontStageActive = useUIStore((s) => s.frontStageActive)
  const [memoOpen, setMemoOpen] = useState(false)
  const [horseModeOpen, setHorseModeOpen] = useState(false)
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const loadLayout = useUIStore((s) => s.loadLayout)
  const restoreSession = useWorkspaceStore((s) => s.restoreSession)

  useEffect(() => { loadSettings() }, [loadSettings])
  useEffect(() => { loadLayout() }, [loadLayout])
  useEffect(() => { restoreSession() }, [restoreSession])

  // Prevent accidental close with unsaved editor changes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const editor = useEditorStore.getState()
      if (editor.editing && editor.isDirty) {
        // Best-effort flush of the in-flight autosave before the window closes.
        void useWorkspaceStore.getState().flushPendingSaves()
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // On quit, the main process asks us to flush any in-flight autosave to SQLite
  // before it closes the DB — so the last debounce window of edits isn't lost.
  useEffect(() => {
    return window.electronAPI.onFlushBeforeQuit(async () => {
      try {
        await useWorkspaceStore.getState().flushPendingSaves()
      } finally {
        window.electronAPI.notifyFlushComplete()
      }
    })
  }, [])

  // Load on-disk plugins once the IPC bridge is up. Safe to await inside
  // useEffect — `bootstrapExternalPlugins` is idempotent.
  useEffect(() => {
    void bootstrapExternalPlugins()
  }, [])

  // A reader window can add a page to the workspace while this window is
  // open; refresh the tree so the new note shows up without a manual poke.
  useEffect(() => {
    return window.electronAPI.onWorkspaceTreeChanged(() => {
      void useWorkspaceStore.getState().loadTree()
    })
  }, [])

  /**
   * A vault is a folder anyone can edit — Obsidian, a text editor, a sync
   * client. When one of them changes a note this window has open, refresh the
   * tab so the two do not diverge.
   *
   * ★ `syncExternalEdit` keeps its `!isDirty` guard, so someone mid-sentence
   * never has their text replaced. Their own version wins; the disk version
   * is picked up the next time the note is opened clean. Silently choosing
   * either side would be data loss, and the side we can afford to defer is
   * the one that is still on disk.
   */
  useEffect(() => {
    return window.electronAPI.onVaultChanged?.((changes) => {
      const store = useWorkspaceStore.getState()
      for (const change of changes) {
        if (!change.pageId || change.kind === 'deleted') continue
        if (!store.tabs.some((tab) => tab.pageId === change.pageId)) continue
        void store.syncExternalEdit(change.pageId)
      }
    })
  }, [])

  // Subscribe to agent trace IPC events for the developer debug panel (dev-only).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    return subscribeToTraceIPC()
  }, [])

  // Ctrl/Cmd + , : settings  |  Ctrl/Cmd + S : save  |  Ctrl/Cmd + E : toggle edit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // While the 烛笺阁 front stage is up it owns all keyboard input.
      if (useUIStore.getState().frontStageActive) return

      // Ctrl+Tab / Ctrl+Shift+Tab — cycle tabs (no meta required)
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        const { tabs, activeTabId, switchTab } = useWorkspaceStore.getState()
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

      // Cmd+Shift+J — open today's diary
      if (e.key === 'j' && e.shiftKey) {
        e.preventDefault()
        import('./lib/workspace/diaryService').then(({ openTodayDiary }) => void openTodayDiary())
        return
      }

      // Cmd+Shift+D — toggle deep editing mode
      if (e.key === 'd' && e.shiftKey) {
        e.preventDefault()
        useUIStore.getState().toggleDeepEditing()
        return
      }

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

      if (e.key === 'm' && !e.shiftKey) {
        e.preventDefault()
        setMemoOpen((v) => !v)
        return
      }

      if (e.key === 'n') {
        e.preventDefault()
        void useWorkspaceStore.getState().createPage('Untitled', null)
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

      // Cmd+W — close active tab
      if (e.key === 'w') {
        e.preventDefault()
        const { activeTabId, closeTab } = useWorkspaceStore.getState()
        if (activeTabId) closeTab(activeTabId)
        return
      }

      // Cmd+Shift+T — reopen last closed tab
      if (e.key === 't' && e.shiftKey) {
        e.preventDefault()
        void useWorkspaceStore.getState().reopenClosedTab()
        return
      }

      // Cmd+1..9 — switch to tab by index
      if (e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const { tabs, switchTab } = useWorkspaceStore.getState()
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
      {!zenMode && <TitleBar onOpenSettings={() => openSettings()} onOpenHorseMode={() => setHorseModeOpen(true)} />}
      <FocusOverlay />
      {!zenMode && <AppShell />}
      {!zenMode && <StatusBar />}
      <ZenMode />
      <CommandPalette onOpenSettings={() => openSettings()} onOpenHorseMode={() => setHorseModeOpen(true)} />
      <GhostText />
      <SettingsPanel open={settingsOpen} onClose={closeSettings} />
      <MemoPanel open={memoOpen} onClose={() => setMemoOpen(false)} />
      <HorseModeDialog open={horseModeOpen} onClose={() => setHorseModeOpen(false)} />
      <ThemeCompare />
      <PluginNotificationHost />
      <ToastHost items={toasts} onDismiss={dismissToast} />
      {frontStageActive && <FrontStageView />}
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
