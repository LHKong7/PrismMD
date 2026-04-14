import { create } from 'zustand'
import type { PluginCommand } from '../lib/plugins/types'

export interface RegisteredCommand extends PluginCommand {
  /** Which plugin owns this command — used on deactivate to unregister. */
  pluginId: string
}

interface CommandRegistryStore {
  commands: RegisteredCommand[]
  register: (pluginId: string, cmd: PluginCommand) => void
  unregisterByPlugin: (pluginId: string) => void
  /** Look up + run a command by id. Returns false if not found. */
  execute: (id: string) => Promise<boolean>
}

export const useCommandRegistry = create<CommandRegistryStore>((set, get) => ({
  commands: [],

  register: (pluginId, cmd) => {
    set((state) => {
      // Dedupe by id — re-registering the same command (e.g. HMR) wins.
      const without = state.commands.filter((c) => c.id !== cmd.id)
      return { commands: [...without, { ...cmd, pluginId }] }
    })
  },

  unregisterByPlugin: (pluginId) => {
    set((state) => ({
      commands: state.commands.filter((c) => c.pluginId !== pluginId),
    }))
  },

  execute: async (id) => {
    const cmd = get().commands.find((c) => c.id === id)
    if (!cmd) return false
    try {
      await cmd.handler()
      return true
    } catch (err) {
      // Bubble via console — the command palette will close before we
      // could show a toast, and plugins are responsible for their own
      // error UX.
      console.error(`[plugin:${cmd.pluginId}] command "${cmd.id}" failed:`, err)
      return false
    }
  },
}))
