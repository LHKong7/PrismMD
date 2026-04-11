import { BrowserWindow } from 'electron'
import { watch, type FSWatcher } from 'chokidar'
import fs from 'fs/promises'

export class FileWatcherService {
  private fileWatchers = new Map<string, FSWatcher>()
  private dirWatcher: FSWatcher | null = null
  private mainWindow: BrowserWindow

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
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
        this.mainWindow.webContents.send('fs:file-changed', filePath, content)
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
    if (this.dirWatcher) {
      this.dirWatcher.close()
    }

    this.dirWatcher = watch(dirPath, {
      persistent: true,
      ignoreInitial: true,
      depth: 10,
      ignored: /(node_modules|\.git|dist|build)/,
    })

    this.dirWatcher.on('all', () => {
      this.mainWindow.webContents.send('fs:directory-changed')
    })
  }

  unwatchDirectory(_dirPath: string) {
    if (this.dirWatcher) {
      this.dirWatcher.close()
      this.dirWatcher = null
    }
  }
}
