import { create } from 'zustand'

interface UIStore {
  leftSidebarOpen: boolean
  rightSidebarOpen: boolean
  leftSidebarPinned: boolean
  rightSidebarPinned: boolean
  commandPaletteOpen: boolean
  theme: 'light' | 'dark' | 'system'
  resolvedTheme: 'light' | 'dark'

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
}

export const useUIStore = create<UIStore>((set) => ({
  leftSidebarOpen: false,
  rightSidebarOpen: false,
  leftSidebarPinned: false,
  rightSidebarPinned: false,
  commandPaletteOpen: false,
  theme: 'system',
  resolvedTheme: 'light',

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
