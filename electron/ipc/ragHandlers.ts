import { ipcMain } from 'electron'
import { getRagSettings, saveRagSettings, type RagSettings } from '../services/settingsStore'
import { getRagStatus, reindex, clearIndex, semanticSearch, type RagStatus } from '../services/ragService'
import { getMainWindow } from '../main'

/**
 * IPC for semantic search (RAG) over notes. Config lives in settings.rag;
 * reindex streams progress to the renderer via the `rag:progress` event.
 */

interface RagView {
  enabled: boolean
  providerId: RagSettings['providerId']
  model: string
  status: RagStatus
}

function view(): RagView {
  const cfg = getRagSettings()
  return { enabled: cfg.enabled, providerId: cfg.providerId, model: cfg.model, status: getRagStatus() }
}

const VALID_PROVIDERS: Array<RagSettings['providerId']> = ['openai', 'custom', 'ollama']

export function registerRagHandlers() {
  ipcMain.handle('rag:get-config', () => ({ ok: true as const, ...view() }))

  ipcMain.handle(
    'rag:set-config',
    (_e, patch: { enabled?: boolean; providerId?: string; model?: string }) => {
      const clean: Partial<RagSettings> = {}
      if (typeof patch?.enabled === 'boolean') clean.enabled = patch.enabled
      if (typeof patch?.providerId === 'string' && VALID_PROVIDERS.includes(patch.providerId as RagSettings['providerId'])) {
        clean.providerId = patch.providerId as RagSettings['providerId']
      }
      if (typeof patch?.model === 'string') clean.model = patch.model.trim()
      saveRagSettings(clean)
      return { ok: true as const, ...view() }
    },
  )

  ipcMain.handle('rag:status', () => ({ ok: true as const, status: getRagStatus() }))

  ipcMain.handle('rag:reindex', async () => {
    const win = getMainWindow()
    const result = await reindex((done, total, title) => {
      if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send('rag:progress', { done, total, title })
      }
    })
    return { ...result, ...view() }
  })

  ipcMain.handle('rag:clear', () => {
    clearIndex()
    return { ok: true as const, ...view() }
  })

  ipcMain.handle('rag:search', async (_e, query: string, limit?: number) => {
    try {
      const hits = await semanticSearch(String(query ?? ''), typeof limit === 'number' ? limit : 8)
      return { ok: true as const, hits }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
