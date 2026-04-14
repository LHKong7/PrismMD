import { create } from 'zustand'
import type { PluginSidebarPanel } from '../lib/plugins/types'

export interface RegisteredSidebarPanel extends PluginSidebarPanel {
  pluginId: string
}

interface SidebarPanelRegistryStore {
  panels: RegisteredSidebarPanel[]
  register: (pluginId: string, panel: PluginSidebarPanel) => void
  unregisterByPlugin: (pluginId: string) => void
}

export const useSidebarPanelRegistry = create<SidebarPanelRegistryStore>((set) => ({
  panels: [],

  register: (pluginId, panel) => {
    set((state) => {
      const without = state.panels.filter((p) => p.id !== panel.id)
      return { panels: [...without, { ...panel, pluginId }] }
    })
  },

  unregisterByPlugin: (pluginId) => {
    set((state) => ({
      panels: state.panels.filter((p) => p.pluginId !== pluginId),
    }))
  },
}))
