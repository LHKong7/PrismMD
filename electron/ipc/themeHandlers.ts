import { ipcMain, nativeTheme } from 'electron'
import { getMainWindow } from '../main'

export function registerThemeHandlers() {
  ipcMain.handle('theme:get-system', () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  })

  nativeTheme.on('updated', () => {
    const win = getMainWindow()
    if (!win || win.isDestroyed()) return
    const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    win.webContents.send('theme:changed', theme)
  })

  // Window controls
  ipcMain.on('window:minimize', () => {
    getMainWindow()?.minimize()
  })

  ipcMain.on('window:maximize', () => {
    const win = getMainWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.on('window:close', () => {
    getMainWindow()?.close()
  })

  ipcMain.handle('window:is-maximized', () => {
    return getMainWindow()?.isMaximized() ?? false
  })
}
