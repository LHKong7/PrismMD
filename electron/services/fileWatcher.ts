import { BrowserWindow } from 'electron'
import { watch, type FSWatcher } from 'chokidar'

export class FileWatcherService {
  private fileWatchers = new Map<string, FSWatcher>()
  private dirWatchers = new Map<string, FSWatcher>()
  private dirDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private suppressedPaths = new Set<string>()
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

    // We only signal that the file changed; the renderer re-reads via
    // `readFile` or `readFileBytes` depending on the file's format. This
    // avoids corrupting binary files (PDF / XLSX) by reading them as UTF-8.
    watcher.on('change', () => {
      if (this.suppressedPaths.has(filePath)) {
        this.suppressedPaths.delete(filePath)
        return
      }
      this.send('fs:file-changed', filePath)
    })

    watcher.on('error', (err) => {
      console.warn(`[FileWatcher] file watcher error for ${filePath}:`, err.message)
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
      depth: 2,
      ignored: /(node_modules|\.git|\.DS_Store|dist|build|__pycache__|\.cache)/,
    })

    // Debounce directory change events — many file operations (git checkout,
    // npm install) trigger dozens of events in rapid succession. Collapsing
    // them into a single IPC message avoids flooding the renderer.
    watcher.on('all', () => {
      const existing = this.dirDebounceTimers.get(dirPath)
      if (existing) clearTimeout(existing)
      this.dirDebounceTimers.set(
        dirPath,
        setTimeout(() => {
          this.dirDebounceTimers.delete(dirPath)
          this.send('fs:directory-changed', dirPath)
        }, 300),
      )
    })

    watcher.on('error', (err) => {
      console.warn(`[FileWatcher] directory watcher error for ${dirPath}:`, err.message)
    })

    this.dirWatchers.set(dirPath, watcher)
  }

  /** Suppress the next file-changed event for this path (used by write-file to avoid reload loops). */
  suppressNextChange(filePath: string) {
    this.suppressedPaths.add(filePath)
    setTimeout(() => this.suppressedPaths.delete(filePath), 1000)
  }

  unwatchDirectory(dirPath: string) {
    const watcher = this.dirWatchers.get(dirPath)
    if (watcher) {
      watcher.close()
      this.dirWatchers.delete(dirPath)
    }
    const timer = this.dirDebounceTimers.get(dirPath)
    if (timer) {
      clearTimeout(timer)
      this.dirDebounceTimers.delete(dirPath)
    }
  }
}
