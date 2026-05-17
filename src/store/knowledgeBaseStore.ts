import { create } from 'zustand'
import type { KBEntry } from '../types/electron'

interface KnowledgeBaseStore {
  entries: KBEntry[]
  loading: boolean

  refresh: () => Promise<void>
  addDocument: (filePath: string, title?: string, tags?: string[]) => Promise<boolean>
  removeDocument: (id: string) => Promise<void>
  search: (query: string) => Promise<KBEntry[]>
}

export const useKnowledgeBaseStore = create<KnowledgeBaseStore>((set, get) => ({
  entries: [],
  loading: false,

  refresh: async () => {
    set({ loading: true })
    try {
      const res = await window.electronAPI.kbList()
      if (res.ok && res.entries) {
        set({ entries: res.entries })
      }
    } catch { /* ignore */ }
    set({ loading: false })
  },

  addDocument: async (filePath, title, tags) => {
    try {
      const res = await window.electronAPI.kbAdd(filePath, title, tags)
      if (res.ok) {
        await get().refresh()
        const { useToastStore } = await import('./toastStore')
        useToastStore.getState().show('success', 'Added to Knowledge Base')
        return true
      } else {
        const { useToastStore } = await import('./toastStore')
        useToastStore.getState().show('error', res.error ?? 'Failed to add')
        return false
      }
    } catch (err) {
      const { useToastStore } = await import('./toastStore')
      useToastStore.getState().show('error', err instanceof Error ? err.message : String(err))
      return false
    }
  },

  removeDocument: async (id) => {
    try {
      await window.electronAPI.kbRemove(id)
      await get().refresh()
    } catch { /* ignore */ }
  },

  search: async (query) => {
    try {
      const res = await window.electronAPI.kbSearch(query)
      return res.ok && res.entries ? res.entries : []
    } catch {
      return []
    }
  },
}))
