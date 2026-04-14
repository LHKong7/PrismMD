import { ipcMain, shell } from 'electron'
import {
  discoverExternalPlugins,
  getPluginsDir,
} from '../services/pluginLoaderService'

export function registerPluginHandlers() {
  ipcMain.handle('plugins:discover', async () => {
    try {
      return { ok: true as const, ...(await discoverExternalPlugins()) }
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle('plugins:get-dir', () => getPluginsDir())

  ipcMain.handle('plugins:open-dir', async () => {
    const dir = getPluginsDir()
    // `openPath` resolves with empty string on success; any value is an
    // error message from the shell (dir doesn't exist, permission denied).
    const result = await shell.openPath(dir)
    return result === '' ? { ok: true as const } : { ok: false as const, error: result }
  })
}
