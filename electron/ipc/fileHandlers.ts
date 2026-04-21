import { dialog, ipcMain } from 'electron'
import fs from 'fs/promises'
import { buildFileTree } from '../services/fileTree'
import { FileWatcherService } from '../services/fileWatcher'
import { getMainWindow } from '../main'

export function registerFileHandlers() {
  const fileWatcher = new FileWatcherService(getMainWindow)

  ipcMain.handle('dialog:open-file', async () => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      // "Library" accepts any format the knowledge-graph SDK can ingest.
      // `All supported` comes first so it's the default filter.
      filters: [
        {
          name: 'All supported',
          extensions: ['md', 'markdown', 'mdx', 'pdf', 'csv', 'json', 'xlsx', 'xls'],
        },
        { name: 'Markdown', extensions: ['md', 'markdown', 'mdx'] },
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'Tabular', extensions: ['csv', 'xlsx', 'xls'] },
        { name: 'JSON', extensions: ['json'] },
      ],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    // Return just the path — the renderer decides whether to read as text
    // or bytes based on the file's extension (see `fileFormat.ts`).
    return { path: result.filePaths[0] }
  })

  ipcMain.handle('dialog:open-folder', async () => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  ipcMain.handle('dialog:new-file', async (_event, defaultDir?: string) => {
    const win = getMainWindow()
    if (!win) return { cancelled: true }
    const result = await dialog.showSaveDialog(win, {
      title: 'New File',
      defaultPath: defaultDir ?? undefined,
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'JSON', extensions: ['json'] },
        { name: 'CSV', extensions: ['csv'] },
      ],
    })
    if (result.canceled || !result.filePath) {
      return { cancelled: true }
    }
    await fs.writeFile(result.filePath, '', 'utf-8')
    return { cancelled: false, filePath: result.filePath }
  })

  ipcMain.handle('fs:read-file', async (_event, filePath: string) => {
    return fs.readFile(filePath, 'utf-8')
  })

  // Binary read for PDF / XLSX (anything the renderer's text decoder would
  // corrupt). We return a fresh ArrayBuffer — Electron's structured-clone
  // over IPC handles it natively and the renderer can feed it straight to
  // pdfjs-dist / SheetJS without a base64 round-trip.
  ipcMain.handle('fs:read-file-bytes', async (_event, filePath: string) => {
    const buf = await fs.readFile(filePath)
    // Slice to a standalone ArrayBuffer (the underlying Buffer may share
    // memory with Node's internal pool).
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  })

  ipcMain.handle('fs:read-directory', async (_event, dirPath: string) => {
    return buildFileTree(dirPath)
  })

  ipcMain.handle('fs:write-file', async (_event, filePath: string, content: string) => {
    fileWatcher.suppressNextChange(filePath)
    await fs.writeFile(filePath, content, 'utf-8')
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
