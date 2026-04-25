import { create } from 'zustand'

// Default sidebar widths (px).
const DEFAULT_LEFT_WIDTH = 260
const DEFAULT_RIGHT_WIDTH = 220
const DEFAULT_AGENT_WIDTH = 340

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
      leftSidebarOpen: true,
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
      }
      await window.electronAPI.saveSettings({ ...settings, layout })
    } catch {
      // Layout save failed silently.
    }
  },
  }
})
