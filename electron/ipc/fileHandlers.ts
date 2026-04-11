import { BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { buildFileTree } from '../services/fileTree'
import { FileWatcherService } from '../services/fileWatcher'

export function registerFileHandlers(mainWindow: BrowserWindow) {
  const fileWatcher = new FileWatcherService(mainWindow)

  ipcMain.handle('dialog:open-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdx'] }],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const filePath = result.filePaths[0]
    const content = await fs.readFile(filePath, 'utf-8')
    return { path: filePath, content }
  })

  ipcMain.handle('dialog:open-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  ipcMain.handle('fs:read-file', async (_event, filePath: string) => {
    return fs.readFile(filePath, 'utf-8')
  })

  ipcMain.handle('fs:read-directory', async (_event, dirPath: string) => {
    return buildFileTree(dirPath)
  })

  // File watching
  ipcMain.on('fs:watch-file', (_event, filePath: string) => {
    fileWatcher.watchFile(filePath)
  })

  ipcMain.on('fs:unwatch-file', (_event, filePath: string) => {
    fileWatcher.unwatchFile(filePath)
  })

  ipcMain.on('fs:watch-directory', (_event, dirPath: string) => {
    fileWatcher.watchDirectory(dirPath)
  })

  ipcMain.on('fs:unwatch-directory', (_event, dirPath: string) => {
    fileWatcher.unwatchDirectory(dirPath)
  })
}
