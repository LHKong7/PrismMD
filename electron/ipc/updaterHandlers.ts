import { ipcMain } from 'electron'
import {
  checkForUpdatesNow,
  getCurrentVersion,
  getLastError,
  quitAndInstall,
} from '../services/updaterService'

export function registerUpdaterHandlers() {
  ipcMain.handle('updater:current-version', () => getCurrentVersion())
  ipcMain.handle('updater:last-error', () => getLastError())
  ipcMain.handle('updater:check-now', () => {
    checkForUpdatesNow()
  })
  // A separate "send" (vs "invoke") because quitAndInstall immediately
  // tears the app down — waiting on a promise that never resolves would
  // strand the renderer.
  ipcMain.on('updater:quit-and-install', () => {
    quitAndInstall()
  })
}
