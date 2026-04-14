import { create } from 'zustand'

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

interface UIStore {
  leftSidebarOpen: boolean
  rightSidebarOpen: boolean
  leftSidebarPinned: boolean
  rightSidebarPinned: boolean
  commandPaletteOpen: boolean
  theme: 'light' | 'dark' | 'system'
  resolvedTheme: 'light' | 'dark'

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

  setMainViewMode: (mode: MainViewMode) => void
  toggleMainViewMode: () => void
  setGraphScope: (scope: GraphScope) => void
  focusEntity: (name: string | null) => void
  setRightSidebarTab: (tab: RightSidebarTab) => void
}

export const useUIStore = create<UIStore>((set) => ({
  leftSidebarOpen: false,
  rightSidebarOpen: false,
  leftSidebarPinned: false,
  rightSidebarPinned: false,
  commandPaletteOpen: false,
  theme: 'system',
  resolvedTheme: 'light',

  mainViewMode: 'reader',
  graphScope: 'document',
  focusedEntityName: null,
  rightSidebarTab: 'toc',

  setMainViewMode: (mode) => set({ mainViewMode: mode }),
  toggleMainViewMode: () =>
    set((state) => ({ mainViewMode: state.mainViewMode === 'reader' ? 'graph' : 'reader' })),
  setGraphScope: (scope) => set({ graphScope: scope }),
  focusEntity: (name) =>
    set((state) => ({
      focusedEntityName: name,
      // Flip to the Entity tab when an entity is pinned so the user
      // actually sees the content. Leave the tab alone on clear.
      rightSidebarTab: name ? 'entity' : state.rightSidebarTab,
      rightSidebarOpen: name ? true : state.rightSidebarOpen,
    })),
  setRightSidebarTab: (tab) => set({ rightSidebarTab: tab }),

  toggleLeftSidebar: () =>
    set((state) => ({ leftSidebarOpen: !state.leftSidebarOpen })),

  toggleRightSidebar: () =>
    set((state) => ({ rightSidebarOpen: !state.rightSidebarOpen })),

  setLeftSidebarOpen: (open: boolean) =>
    set({ leftSidebarOpen: open }),

  setRightSidebarOpen: (open: boolean) =>
    set({ rightSidebarOpen: open }),

  pinLeftSidebar: () =>
    set((state) => ({
      leftSidebarPinned: !state.leftSidebarPinned,
      leftSidebarOpen: true,
    })),

  pinRightSidebar: () =>
    set((state) => ({
      rightSidebarPinned: !state.rightSidebarPinned,
      rightSidebarOpen: true,
    })),

  toggleCommandPalette: () =>
    set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),

  setCommandPaletteOpen: (open: boolean) =>
    set({ commandPaletteOpen: open }),

  setTheme: (theme: 'light' | 'dark' | 'system') =>
    set({ theme }),

  setResolvedTheme: (resolvedTheme: 'light' | 'dark') =>
    set({ resolvedTheme }),
}))
