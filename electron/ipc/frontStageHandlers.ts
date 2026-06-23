/**
 * IPC handlers for the 烛笺阁 front stage data: per-page book-skin metadata
 * (page_meta) and the Muse Wall cards (muse_cards).
 */
import { ipcMain } from 'electron'
import { getPageMeta, setPageMeta, listPageMeta, type PageMeta } from '../services/pageMetaService'
import { listMuseCards, addMuseCard, deleteMuseCard } from '../services/museService'

export function registerFrontStageHandlers() {
  // Book-skin metadata
  ipcMain.handle('page-meta:get', (_event, pageId: string) => getPageMeta(pageId))
  ipcMain.handle('page-meta:set', (_event, pageId: string, partial: Partial<PageMeta>) =>
    setPageMeta(pageId, partial ?? {}),
  )
  ipcMain.handle('page-meta:list', () => listPageMeta())

  // Muse Wall
  ipcMain.handle('muse:list', () => listMuseCards())
  ipcMain.handle('muse:add', (_event, kind: string, text: string, pageId?: string | null) =>
    addMuseCard(kind, text, pageId),
  )
  ipcMain.handle('muse:delete', (_event, id: string) => {
    deleteMuseCard(id)
    return { ok: true }
  })
}
