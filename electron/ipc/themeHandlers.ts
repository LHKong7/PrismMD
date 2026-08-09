import { ipcMain, nativeTheme, shell, BrowserWindow } from 'electron'

export function registerThemeHandlers() {
  ipcMain.handle('theme:get-system', () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  })

  nativeTheme.on('updated', () => {
    // Broadcast: reader windows follow the system theme too, and there is
    // more than one window now.
    const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('theme:changed', theme)
    }
  })

  // Window controls act on the window that asked — resolving via
  // `getMainWindow()` would make a reader window's titlebar close the
  // workspace window instead of itself.
  const senderWindow = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) =>
    BrowserWindow.fromWebContents(event.sender)

  ipcMain.on('window:minimize', (event) => {
    senderWindow(event)?.minimize()
  })

  ipcMain.on('window:maximize', (event) => {
    const win = senderWindow(event)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.on('window:close', (event) => {
    senderWindow(event)?.close()
  })

  ipcMain.handle('window:is-maximized', (event) => {
    return senderWindow(event)?.isMaximized() ?? false
  })

  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    // Only allow http/https URLs
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      await shell.openExternal(url)
    }
  })
}
