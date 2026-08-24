import { create } from 'zustand'
import type { KBEntry } from '../types/electron'

/**
 * The legacy snapshot list: copies of documents taken at the moment they were
 * added, kept only for reference.
 *
 * ★ This used to be "the knowledge base", and it was the wrong shape for one:
 * a snapshot goes stale the instant you edit the note, and nothing was in it
 * unless you remembered to put it there. What the assistant and search now
 * read is the live note index (`knowledgeStore` / `electron/knowledge/`),
 * which covers every note as it currently is.
 */

interface KnowledgeBaseStore {
  entries: KBEntry[]
  loading: boolean

  refresh: () => Promise<void>
  addDocument: (filePath: string, title?: string, tags?: string[]) => Promise<boolean>
  addPage: (pageId: string, tags?: string[]) => Promise<boolean>
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
        useToastStore.getState().show('success', 'Snapshot saved')
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

  addPage: async (pageId, tags) => {
    try {
      const res = await window.electronAPI.kbAddPage(pageId, tags)
      const { useToastStore } = await import('./toastStore')
      if (res.ok) {
        await get().refresh()
        useToastStore.getState().show('success', 'Snapshot saved')
        return true
      }
      useToastStore.getState().show('error', res.error ?? 'Failed to add')
      return false
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
