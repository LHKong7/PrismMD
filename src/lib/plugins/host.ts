import { create } from 'zustand'
import { useCommandRegistry } from '../../store/commandRegistry'
import { useSidebarPanelRegistry } from '../../store/sidebarPanelRegistry'
import {
  registerMarkdownRenderer,
  unregisterMarkdownRenderersByPlugin,
} from '../markdown/rendererRegistry'
import type { Plugin, PluginHost, PluginNotification } from './types'

/**
 * Tiny toast-ish notifications emitted by `PluginHost#notify`. Any UI can
 * subscribe — we keep it dead simple so the host API can ship without a
 * full toast library.
 */
interface PluginNotifyStore {
  notifications: PluginNotification[]
  push: (n: PluginNotification) => void
  dismiss: (id: string) => void
}

export const usePluginNotifications = create<PluginNotifyStore>((set) => ({
  notifications: [],
  push: (n) =>
    set((s) => ({
      // Keep the list bounded so a noisy plugin can't grow it forever.
      notifications: [...s.notifications, n].slice(-20),
    })),
  dismiss: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
}))

/** Build a `PluginHost` scoped to one plugin id. All registrations are
 *  attributed back to that id so `deactivate` can clean them up. */
export function makeHost(pluginId: string): PluginHost {
  return {
    registerCommand: (cmd) => {
      useCommandRegistry.getState().register(pluginId, cmd)
    },
    registerSidebarPanel: (panel) => {
      useSidebarPanelRegistry.getState().register(pluginId, panel)
    },
    registerMarkdownRenderer: ({ language, component }) => {
      registerMarkdownRenderer(pluginId, language, component)
    },
    notify: (message, kind = 'info') => {
      usePluginNotifications.getState().push({
        id: `${pluginId}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
        message,
        kind,
        at: Date.now(),
      })
    },
  }
}

/**
 * Tracks loaded plugins so we don't double-register and so we can surface
 * a list in the settings page. Deactivation runs `plugin.deactivate` and
 * removes every registration the plugin made.
 */
interface PluginManagerStore {
  loaded: Record<string, { plugin: Plugin; error?: string }>
  setLoaded: (id: string, plugin: Plugin) => void
  setError: (id: string, plugin: Plugin, error: string) => void
  remove: (id: string) => void
}

export const usePluginManager = create<PluginManagerStore>((set) => ({
  loaded: {},
  setLoaded: (id, plugin) =>
    set((s) => ({ loaded: { ...s.loaded, [id]: { plugin } } })),
  setError: (id, plugin, error) =>
    set((s) => ({ loaded: { ...s.loaded, [id]: { plugin, error } } })),
  remove: (id) =>
    set((s) => {
      const next = { ...s.loaded }
      delete next[id]
      return { loaded: next }
    }),
}))

export async function activatePlugin(plugin: Plugin): Promise<void> {
  try {
    const host = makeHost(plugin.id)
    await plugin.activate(host)
    usePluginManager.getState().setLoaded(plugin.id, plugin)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Still record the plugin so the UI can surface the failure.
    usePluginManager.getState().setError(plugin.id, plugin, msg)
    console.error(`[plugin:${plugin.id}] activation failed:`, err)
  }
}

export async function deactivatePlugin(pluginId: string): Promise<void> {
  const entry = usePluginManager.getState().loaded[pluginId]
  if (!entry) return
  try {
    await entry.plugin.deactivate?.()
  } catch (err) {
    console.error(`[plugin:${pluginId}] deactivate failed:`, err)
  }
  useCommandRegistry.getState().unregisterByPlugin(pluginId)
  useSidebarPanelRegistry.getState().unregisterByPlugin(pluginId)
  unregisterMarkdownRenderersByPlugin(pluginId)
  usePluginManager.getState().remove(pluginId)
}
