import { ipcMain, nativeTheme, shell } from 'electron'
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

  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    // Only allow http/https URLs
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      await shell.openExternal(url)
    }
  })
}
