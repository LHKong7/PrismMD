/**
 * IPC handlers for page version history (档案柜 / Archive).
 */
import { ipcMain } from 'electron'
import {
  saveVersion,
  listVersions,
  getVersion,
  deleteVersion,
  type VersionSaveOpts,
} from '../services/versionService'

export function registerVersionHandlers() {
  ipcMain.handle('version:save', (_event, pageId: string, content: string, opts?: VersionSaveOpts) =>
    saveVersion(pageId, content, opts ?? {}),
  )
  ipcMain.handle('version:list', (_event, pageId: string) => listVersions(pageId))
  ipcMain.handle('version:get', (_event, versionId: string, pageId?: string) =>
    getVersion(versionId, pageId),
  )
  ipcMain.handle('version:delete', async (_event, versionId: string, pageId?: string) => {
    await deleteVersion(versionId, pageId)
    return { ok: true }
  })
}
