import { ipcMain } from 'electron'
import {
  addDocument,
  removeDocument,
  listDocuments,
  searchDocuments,
  getContext,
  updateEntry,
} from '../services/knowledgeBaseService'

export function registerKnowledgeBaseHandlers() {
  ipcMain.handle(
    'kb:add',
    async (_event, filePath: string, title?: string, tags?: string[]) => {
      try {
        const entry = await addDocument(filePath, title, tags)
        return { ok: true, entry }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
  )

  ipcMain.handle('kb:remove', async (_event, id: string) => {
    try {
      await removeDocument(id)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('kb:list', async () => {
    try {
      const entries = await listDocuments()
      return { ok: true, entries }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('kb:search', async (_event, query: string) => {
    try {
      const entries = await searchDocuments(query)
      return { ok: true, entries }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(
    'kb:get-context',
    async (_event, query: string, maxDocs?: number) => {
      try {
        const context = await getContext(query, maxDocs)
        return { ok: true, context }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
  )

  ipcMain.handle(
    'kb:update',
    async (_event, id: string, updates: { title?: string; tags?: string[]; summary?: string }) => {
      try {
        await updateEntry(id, updates)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
  )
}
