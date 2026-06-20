import { ipcMain, dialog } from 'electron'
import {
  getDataLocationInfo,
  changeDataLocation,
  revealDataDir,
  relaunchApp,
} from '../services/dataLocation'
import { getMainWindow } from '../main'

export function registerDataLocationHandlers() {
  ipcMain.handle('data-location:get', () => getDataLocationInfo())

  ipcMain.handle('data-location:choose', async () => {
    const win = getMainWindow()
    const opts = {
      title: 'Choose data folder',
      properties: ['openDirectory', 'createDirectory'] as const,
    }
    const res = win
      ? await dialog.showOpenDialog(win, { ...opts, properties: [...opts.properties] })
      : await dialog.showOpenDialog({ ...opts, properties: [...opts.properties] })
    if (res.canceled || res.filePaths.length === 0) return null
    return res.filePaths[0]
  })

  ipcMain.handle('data-location:apply', (_e, dir: string | null, migrate: boolean) =>
    changeDataLocation(dir, migrate),
  )

  ipcMain.handle('data-location:reveal', () => {
    revealDataDir()
  })

  ipcMain.handle('data-location:relaunch', () => {
    relaunchApp()
  })
}
