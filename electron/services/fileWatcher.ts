import { BrowserWindow } from 'electron'
import { watch, type FSWatcher } from 'chokidar'
import fs from 'fs/promises'

export class FileWatcherService {
  private fileWatchers = new Map<string, FSWatcher>()
  private dirWatchers = new Map<string, FSWatcher>()
  private getWindow: () => BrowserWindow | null

  constructor(getWindow: () => BrowserWindow | null) {
    this.getWindow = getWindow
  }

  private send(channel: string, ...args: unknown[]) {
    const win = this.getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  }

  watchFile(filePath: string) {
    if (this.fileWatchers.has(filePath)) return

    const watcher = watch(filePath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    })

    watcher.on('change', async () => {
      try {
        const content = await fs.readFile(filePath, 'utf-8')
        this.send('fs:file-changed', filePath, content)
      } catch {
        // File might have been deleted
      }
    })

    this.fileWatchers.set(filePath, watcher)
  }

  unwatchFile(filePath: string) {
    const watcher = this.fileWatchers.get(filePath)
    if (watcher) {
      watcher.close()
      this.fileWatchers.delete(filePath)
    }
  }

  watchDirectory(dirPath: string) {
    // Already watching this directory
    if (this.dirWatchers.has(dirPath)) return

    const watcher = watch(dirPath, {
      persistent: true,
      ignoreInitial: true,
      depth: 10,
      ignored: /(node_modules|\.git|dist|build)/,
    })

    watcher.on('all', () => {
      this.send('fs:directory-changed', dirPath)
    })

    this.dirWatchers.set(dirPath, watcher)
  }

  unwatchDirectory(dirPath: string) {
    const watcher = this.dirWatchers.get(dirPath)
    if (watcher) {
      watcher.close()
      this.dirWatchers.delete(dirPath)
    }
  }
}
