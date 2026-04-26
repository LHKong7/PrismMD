import { create } from 'zustand'

// Default sidebar widths (px).
const DEFAULT_LEFT_WIDTH = 260
const DEFAULT_RIGHT_WIDTH = 220
const DEFAULT_AGENT_WIDTH = 340

export type SplitDirection = 'horizontal' | 'vertical'

export interface PaneState {
  id: string
  tabId: string | null
}

export interface SplitLayout {
  split: boolean
  direction: SplitDirection
  panes: [PaneState, PaneState]
  activePaneId: string
  splitRatio: number
}

const DEFAULT_SPLIT_LAYOUT: SplitLayout = {
  split: false,
  direction: 'horizontal',
  panes: [
    { id: 'pane-1', tabId: null },
    { id: 'pane-2', tabId: null },
  ],
  activePaneId: 'pane-1',
  splitRatio: 0.5,
}

export type MainViewMode = 'reader' | 'graph'
export type GraphScope = 'global' | 'document' | 'entity'
/**
 * Built-in tab ids. Plugins register their own tabs with arbitrary
 * string ids (namespaced like `<pluginId>.<tabId>` by convention), so
 * `rightSidebarTab` is widened to `string`. The built-in tabs stay a
 * union so switch-case readers still type-narrow when they need to.
 */
export type BuiltinRightSidebarTab = 'toc' | 'entity' | 'related'
export type RightSidebarTab = BuiltinRightSidebarTab | (string & {})

/** Persisted layout state saved to electron-store. */
export interface LayoutState {
  leftSidebarWidth: number
  rightSidebarWidth: number
  agentSidebarWidth: number
  leftSidebarOpen: boolean
  rightSidebarOpen: boolean
  leftSidebarPinned: boolean
  rightSidebarPinned: boolean
  splitActive?: boolean
  splitDirection?: SplitDirection
  splitRatio?: number
}

interface UIStore {
  leftSidebarOpen: boolean
  rightSidebarOpen: boolean
  leftSidebarPinned: boolean
  rightSidebarPinned: boolean
  commandPaletteOpen: boolean
  theme: 'light' | 'dark' | 'system'
  resolvedTheme: 'light' | 'dark'

  /** Sidebar widths in pixels (user-resizable). */
  leftSidebarWidth: number
  rightSidebarWidth: number
  agentSidebarWidth: number

  /** Zen mode — fullscreen immersive document view. */
  zenMode: boolean

  /** Split-pane layout. */
  splitLayout: SplitLayout

  /** Which component fills the center slot of AppShell. */
  mainViewMode: MainViewMode
  /** Which scope the GraphView should draw when it is active. */
  graphScope: GraphScope
  /**
   * Entity name driving `entity` scope and the Entity tab. Null when no
   * entity is pinned; most recently clicked node wins.
   */
  focusedEntityName: string | null
  /** Which tab the right sidebar shows. */
  rightSidebarTab: RightSidebarTab

  /**
   * Settings dialog state lives here so any component (welcome screen,
   * agent sidebar, command palette) can open it directly to a specific
   * tab without prop-drilling `onOpenSettings` everywhere.
   */
  settingsOpen: boolean
  /** When non-null, SettingsPanel mounts with this tab pre-selected. */
  pendingSettingsTab: string | null

  toggleLeftSidebar: () => void
  toggleRightSidebar: () => void
  setLeftSidebarOpen: (open: boolean) => void
  setRightSidebarOpen: (open: boolean) => void
  pinLeftSidebar: () => void
  pinRightSidebar: () => void
  toggleCommandPalette: () => void
  setCommandPaletteOpen: (open: boolean) => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  setResolvedTheme: (theme: 'light' | 'dark') => void
  toggleZenMode: () => void
  setZenMode: (on: boolean) => void

  splitPane: (direction: SplitDirection) => void
  unsplit: () => void
  setActivePaneId: (paneId: string) => void
  setPaneTabId: (paneId: string, tabId: string | null) => void
  setSplitRatio: (ratio: number) => void
  toggleSplitDirection: () => void

  setLeftSidebarWidth: (w: number) => void
  setRightSidebarWidth: (w: number) => void
  setAgentSidebarWidth: (w: number) => void

  setMainViewMode: (mode: MainViewMode) => void
  toggleMainViewMode: () => void
  setGraphScope: (scope: GraphScope) => void
  focusEntity: (name: string | null) => void
  setRightSidebarTab: (tab: RightSidebarTab) => void

  openSettings: (tab?: string) => void
  closeSettings: () => void
  /** Consume the pending tab id, returning it once. */
  consumePendingSettingsTab: () => string | null

  /** Load persisted layout from electron-store. */
  loadLayout: () => Promise<void>
  /** Persist current layout to electron-store (debounce externally). */
  saveLayout: () => Promise<void>
}

// Debounce helper for layout persistence.
let layoutSaveTimer: ReturnType<typeof setTimeout> | null = null
function debouncedSaveLayout(store: { getState: () => UIStore }) {
  if (layoutSaveTimer) clearTimeout(layoutSaveTimer)
  layoutSaveTimer = setTimeout(() => {
    store.getState().saveLayout()
  }, 300)
}

export const useUIStore = create<UIStore>((set, get) => {
  // Self-reference for debounced save.
  const storeRef = { getState: get }

  return {
  leftSidebarOpen: true,
  rightSidebarOpen: false,
  leftSidebarPinned: true,
  rightSidebarPinned: false,
  commandPaletteOpen: false,
  theme: 'system',
  resolvedTheme: 'light',

  leftSidebarWidth: DEFAULT_LEFT_WIDTH,
  rightSidebarWidth: DEFAULT_RIGHT_WIDTH,
  agentSidebarWidth: DEFAULT_AGENT_WIDTH,

  zenMode: false,

  splitLayout: { ...DEFAULT_SPLIT_LAYOUT },

  mainViewMode: 'reader',
  graphScope: 'document',
  focusedEntityName: null,
  rightSidebarTab: 'toc',

  settingsOpen: false,
  pendingSettingsTab: null,

  openSettings: (tab?: string) =>
    set({ settingsOpen: true, pendingSettingsTab: tab ?? null }),
  closeSettings: () => set({ settingsOpen: false }),
  consumePendingSettingsTab: () => {
    let value: string | null = null
    set((state) => {
      value = state.pendingSettingsTab
      return { pendingSettingsTab: null }
    })
    return value
  },

  setMainViewMode: (mode) => set({ mainViewMode: mode }),
  toggleMainViewMode: () =>
    set((state) => ({ mainViewMode: state.mainViewMode === 'reader' ? 'graph' : 'reader' })),
  setGraphScope: (scope) => set({ graphScope: scope }),
  focusEntity: (name) =>
    set((state) => ({
      focusedEntityName: name,
      rightSidebarTab: name ? 'entity' : state.rightSidebarTab,
      rightSidebarOpen: name ? true : state.rightSidebarOpen,
    })),
  setRightSidebarTab: (tab) => set({ rightSidebarTab: tab }),

  toggleLeftSidebar: () => {
    set((state) => ({ leftSidebarOpen: !state.leftSidebarOpen }))
    debouncedSaveLayout(storeRef)
  },

  toggleRightSidebar: () => {
    set((state) => ({ rightSidebarOpen: !state.rightSidebarOpen }))
    debouncedSaveLayout(storeRef)
  },

  setLeftSidebarOpen: (open: boolean) => {
    set({ leftSidebarOpen: open })
    debouncedSaveLayout(storeRef)
  },

  setRightSidebarOpen: (open: boolean) => {
    set({ rightSidebarOpen: open })
    debouncedSaveLayout(storeRef)
  },

  pinLeftSidebar: () => {
    set((state) => ({
      leftSidebarPinned: !state.leftSidebarPinned,
      // Unpinning should collapse the panel into hover/click-to-open mode.
      leftSidebarOpen: state.leftSidebarPinned ? false : true,
    }))
    debouncedSaveLayout(storeRef)
  },

  pinRightSidebar: () => {
    set((state) => ({
      rightSidebarPinned: !state.rightSidebarPinned,
      rightSidebarOpen: true,
    }))
    debouncedSaveLayout(storeRef)
  },

  toggleCommandPalette: () =>
    set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),

  setCommandPaletteOpen: (open: boolean) =>
    set({ commandPaletteOpen: open }),

  setTheme: (theme: 'light' | 'dark' | 'system') =>
    set({ theme }),

  setResolvedTheme: (resolvedTheme: 'light' | 'dark') =>
    set({ resolvedTheme }),

  toggleZenMode: () => set((state) => ({ zenMode: !state.zenMode })),
  setZenMode: (on: boolean) => set({ zenMode: on }),

  splitPane: (direction) => {
    // Use dynamic import to avoid circular dependency with fileStore.
    void import('./fileStore').then(({ useFileStore }) => {
      const { activeTabId, tabs } = useFileStore.getState()
      const secondTab = tabs.find((t) => t.id !== activeTabId) ?? tabs[0] ?? null
      set((state) => ({
        splitLayout: {
          ...state.splitLayout,
          split: true,
          direction,
          panes: [
            { id: 'pane-1', tabId: activeTabId },
            { id: 'pane-2', tabId: secondTab?.id ?? activeTabId },
          ] as [PaneState, PaneState],
          activePaneId: 'pane-1',
        },
      }))
      debouncedSaveLayout(storeRef)
    })
  },

  unsplit: () => {
    const s = get()
    const activePane = s.splitLayout.panes.find((p) => p.id === s.splitLayout.activePaneId)
    set((state) => ({
      splitLayout: { ...state.splitLayout, split: false },
    }))
    debouncedSaveLayout(storeRef)
    // Sync global activeTabId to the focused pane's tab.
    if (activePane?.tabId) {
      void import('./fileStore').then(({ useFileStore }) => {
        useFileStore.getState().switchTab(activePane.tabId!)
      })
    }
  },

  setActivePaneId: (paneId) => {
    const s = get()
    if (paneId === s.splitLayout.activePaneId) return
    // Reset editor when switching panes to prevent stale editing state.
    void import('./editorStore').then(({ useEditorStore }) => {
      const editor = useEditorStore.getState()
      if (editor.editing) editor.reset()
    })
    // Update active pane immediately.
    set((state) => ({
      splitLayout: { ...state.splitLayout, activePaneId: paneId },
    }))
    // Sync global activeTabId to the new pane's tab.
    const pane = s.splitLayout.panes.find((p) => p.id === paneId)
    if (pane?.tabId) {
      void import('./fileStore').then(({ useFileStore }) => {
        useFileStore.getState().switchTab(pane.tabId!)
      })
    }
  },

  setPaneTabId: (paneId, tabId) => {
    set((state) => ({
      splitLayout: {
        ...state.splitLayout,
        panes: state.splitLayout.panes.map((p) =>
          p.id === paneId ? { ...p, tabId } : p,
        ) as [PaneState, PaneState],
      },
    }))
    debouncedSaveLayout(storeRef)
  },

  setSplitRatio: (ratio) => {
    set((state) => ({
      splitLayout: {
        ...state.splitLayout,
        splitRatio: Math.max(0.2, Math.min(0.8, ratio)),
      },
    }))
  },

  toggleSplitDirection: () => {
    set((state) => ({
      splitLayout: {
        ...state.splitLayout,
        direction: state.splitLayout.direction === 'horizontal' ? 'vertical' : 'horizontal',
      },
    }))
    debouncedSaveLayout(storeRef)
  },

  setLeftSidebarWidth: (w) => {
    set({ leftSidebarWidth: w })
    debouncedSaveLayout(storeRef)
  },
  setRightSidebarWidth: (w) => {
    set({ rightSidebarWidth: w })
    debouncedSaveLayout(storeRef)
  },
  setAgentSidebarWidth: (w) => {
    set({ agentSidebarWidth: w })
    debouncedSaveLayout(storeRef)
  },

  loadLayout: async () => {
    if (typeof window === 'undefined' || !window.electronAPI) return
    try {
      const settings = await window.electronAPI.loadSettings() as Record<string, unknown>
      const layout = settings.layout as Partial<LayoutState> | undefined
      if (layout) {
        set({
          leftSidebarWidth: layout.leftSidebarWidth ?? DEFAULT_LEFT_WIDTH,
          rightSidebarWidth: layout.rightSidebarWidth ?? DEFAULT_RIGHT_WIDTH,
          agentSidebarWidth: layout.agentSidebarWidth ?? DEFAULT_AGENT_WIDTH,
          leftSidebarOpen: layout.leftSidebarOpen ?? true,
          rightSidebarOpen: layout.rightSidebarOpen ?? false,
          leftSidebarPinned: layout.leftSidebarPinned ?? true,
          rightSidebarPinned: layout.rightSidebarPinned ?? false,
          splitLayout: {
            ...DEFAULT_SPLIT_LAYOUT,
            split: layout.splitActive ?? false,
            direction: layout.splitDirection ?? 'horizontal',
            splitRatio: layout.splitRatio ?? 0.5,
          },
        })
      }
    } catch {
      // Layout load failed — keep defaults.
    }
  },

  saveLayout: async () => {
    if (typeof window === 'undefined' || !window.electronAPI) return
    try {
      const s = get()
      const settings = await window.electronAPI.loadSettings() as Record<string, unknown>
      const layout: LayoutState = {
        leftSidebarWidth: s.leftSidebarWidth,
        rightSidebarWidth: s.rightSidebarWidth,
        agentSidebarWidth: s.agentSidebarWidth,
        leftSidebarOpen: s.leftSidebarOpen,
        rightSidebarOpen: s.rightSidebarOpen,
        leftSidebarPinned: s.leftSidebarPinned,
        rightSidebarPinned: s.rightSidebarPinned,
        splitActive: s.splitLayout.split,
        splitDirection: s.splitLayout.direction,
        splitRatio: s.splitLayout.splitRatio,
      }
      await window.electronAPI.saveSettings({ ...settings, layout })
    } catch {
      // Layout save failed silently.
    }
  },
  }
})
