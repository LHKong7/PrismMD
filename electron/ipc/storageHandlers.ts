/**
 * Storage IPC — where the notes live, and moving them.
 *
 * Migration is the one operation in the app that touches every note at once,
 * so it is deliberately awkward to trigger: the user picks the destination in
 * a native dialog, and the destination must not already exist.
 */
import { dialog, ipcMain } from 'electron'
import * as path from 'path'
import {
  migrateWorkspaceToVault,
  revealVault,
  status,
} from '../services/storageService'
import { getMainWindow } from '../main'

export function registerStorageHandlers() {
  ipcMain.handle('storage:status', async () => {
    try {
      return { ok: true, status: status() }
    } catch (err) {
      return { ok: false, error: message(err) }
    }
  })

  /**
   * Ask for a folder, then create the vault *inside* it under a named
   * subdirectory.
   *
   * ★ Never migrates into the chosen folder itself. People pick their home
   * directory or Documents in these dialogs, and scattering a few thousand
   * Markdown files across it — mixed in with everything already there — is
   * not something an undo button can fix.
   */
  ipcMain.handle('storage:migrate-to-vault', async (_event, folderName?: string) => {
    try {
      const win = getMainWindow()
      const picked = await dialog.showOpenDialog(win!, {
        title: 'Choose where to create your vault',
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: 'Create vault here',
      })
      if (picked.canceled || picked.filePaths.length === 0) return { ok: false, canceled: true }

      const target = path.join(picked.filePaths[0], (folderName || 'PrismMD Vault').trim())
      return { ok: true, result: await migrateWorkspaceToVault(target) }
    } catch (err) {
      return { ok: false, error: message(err) }
    }
  })

  ipcMain.handle('storage:reveal-vault', async () => {
    try {
      revealVault()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: message(err) }
    }
  })
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
