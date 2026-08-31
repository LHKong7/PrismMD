// MUST be first: sets the app name + redirects userData to a custom data
// folder (if configured) BEFORE electron-store / better-sqlite3 resolve paths.
import './bootstrap'
import { app, BrowserWindow, ipcMain, screen } from 'electron'
import path from 'path'
import fs from 'fs'
import { registerIpcHandlers } from './ipc'
import { appConfig } from '../app.config'
import { shutdown as shutdownInsightGraph } from './services/insightGraphService'
import { startAll as startMcpServers, shutdownAll as shutdownMcpServers } from './services/mcpService'
import { initAutoUpdater } from './services/updaterService'
import { loadSettings, saveSettings } from './services/settingsStore'
import { isSupported } from './services/fileFormats'
import { mountRoot, mountFileParent } from './services/libraryService'
import { rememberFile, rememberRoot } from './services/libraryRecents'
import { stopWatching } from './services/libraryWatcher'
import { handleSquirrelEvent } from './services/windowsIntegration'
import { flushPendingIndexing, initKnowledgeIndex } from './services/knowledgeService'
import { getNoteRepository } from './repositories/repositoryFactory'
import { initStorage, stopWatching as stopWatchingVault } from './services/storageService'

/**
 * What a reader window was asked to show when it was created. The renderer
 * pulls this over `library:launch-target` once it mounts; a null target
 * means "plain launch", which lands on the recents screen.
 */
export type LaunchTarget = { kind: 'folder' | 'file'; path: string }

/** The workspace ("note mode") window. There is at most one. */
let mainWindow: BrowserWindow | null = null

/** Reader windows, in creation order. There may be any number. */
const readerWindows = new Set<BrowserWindow>()

/** webContents.id → the target that window was created for. */
const launchTargets = new Map<number, LaunchTarget>()

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function getLaunchTarget(webContentsId: number): LaunchTarget | null {
  return launchTargets.get(webContentsId) ?? null
}

type Bounds = { x: number; y: number; width: number; height: number }

/**
 * Restore a window's last position. `key` separates the workspace window
 * from reader windows, which are a different shape and shouldn't drag the
 * workbench's geometry around with them.
 */
function getSavedWindowBounds(
  key: 'windowBounds' | 'readerWindowBounds',
  fallback: { width: number; height: number },
): { x?: number; y?: number; width: number; height: number } {
  try {
    const b = loadSettings().session?.[key]
    if (b) {
      // Validate bounds are on a visible display
      const display = screen.getDisplayMatching(b)
      if (display) {
        const { x, y, width, height } = display.workArea
        // Check if at least part of the window is on-screen
        if (b.x + b.width > x && b.x < x + width && b.y + b.height > y && b.y < y + height) {
          return b
        }
      }
    }
  } catch { /* use defaults */ }
  return fallback
}

function saveWindowBounds(win: BrowserWindow | null, key: 'windowBounds' | 'readerWindowBounds') {
  if (!win || win.isDestroyed()) return
  try {
    const bounds = win.getBounds()
    const settings = loadSettings()
    saveSettings({ ...settings, session: { ...settings.session, [key]: bounds } })
  } catch { /* ignore */ }
}

/** Resolve the packaged app icon, if this build ships one. */
function resolveIconPath(): string | undefined {
  if (!appConfig.icon) return undefined
  return path.join(
    app.isPackaged ? process.resourcesPath : app.getAppPath(),
    `${appConfig.icon}.${process.platform === 'win32' ? 'ico' : 'png'}`,
  )
}

/** The renderer's TitleBar mirrors the native maximize state. */
function wireMaximizeEvents(win: BrowserWindow) {
  win.on('maximize', () => {
    if (!win.isDestroyed()) win.webContents.send('window:maximize-change', true)
  })
  win.on('unmaximize', () => {
    if (!win.isDestroyed()) win.webContents.send('window:maximize-change', false)
  })
}

/** Load the single renderer bundle, selecting the app root via `?mode=`. */
function loadRenderer(win: BrowserWindow, mode: 'notes' | 'reader') {
  const search = mode === 'reader' ? 'mode=reader' : ''
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(search ? `${MAIN_WINDOW_VITE_DEV_SERVER_URL}?${search}` : MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    const file = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    win.loadFile(file, search ? { search } : undefined)
  }
}

function createWindow() {
  const iconPath = resolveIconPath()
  const bounds = getSavedWindowBounds('windowBounds', { width: 1200, height: 800 })

  mainWindow = new BrowserWindow({
    title: appConfig.name,
    ...(iconPath ? { icon: iconPath } : {}),
    ...bounds,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  loadRenderer(mainWindow, 'notes')

  const win = mainWindow
  win.on('close', () => {
    saveWindowBounds(win, 'windowBounds')
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  wireMaximizeEvents(mainWindow)
}

/**
 * Create a reader window — the standalone, read-only half of the app.
 *
 * It runs the same renderer bundle behind `?mode=reader`, which mounts a
 * different React root: no workspace store, no editor, no agent. The
 * target's folder is mounted here rather than in the renderer so that the
 * first `library:read-*` call already has permission.
 */
export function createReaderWindow(target?: LaunchTarget): BrowserWindow | null {
  if (target) {
    try {
      if (target.kind === 'folder') {
        rememberRoot(mountRoot(target.path))
      } else {
        rememberRoot(mountFileParent(target.path))
        rememberFile(target.path)
      }
    } catch (err) {
      console.warn('[library] cannot open target:', target.path, err)
      return null
    }
  }

  const iconPath = resolveIconPath()
  const saved = getSavedWindowBounds('readerWindowBounds', { width: 1040, height: 780 })
  // Cascade so a second window doesn't land exactly on top of the first.
  const offset = readerWindows.size * 28
  const bounds =
    saved.x !== undefined && saved.y !== undefined
      ? { ...saved, x: saved.x + offset, y: saved.y + offset }
      : saved

  const win = new BrowserWindow({
    title: appConfig.name,
    ...(iconPath ? { icon: iconPath } : {}),
    ...bounds,
    minWidth: 640,
    minHeight: 480,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (target) launchTargets.set(win.webContents.id, target)
  readerWindows.add(win)

  loadRenderer(win, 'reader')

  win.on('close', () => {
    saveWindowBounds(win, 'readerWindowBounds')
  })
  const webContentsId = win.webContents.id
  win.on('closed', () => {
    readerWindows.delete(win)
    launchTargets.delete(webContentsId)
    stopWatching(webContentsId)
  })
  wireMaximizeEvents(win)

  return win
}

/** Show the workspace window, creating it if this session hasn't yet. */
export function focusWorkspaceWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    return
  }
  createWindow()
}

/** The reader window a newly-opened document should land in, if any. */
function activeReaderWindow(): BrowserWindow | null {
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && readerWindows.has(focused)) return focused
  for (const win of [...readerWindows].reverse()) {
    if (!win.isDestroyed()) return win
  }
  return null
}

/**
 * Open a document the OS handed us (double-click, `open -a`, argv). Reuses
 * the active reader window when there is one — opening a fresh window per
 * file would bury the screen after three PDFs.
 */
export function openInReader(filePath: string): void {
  const target: LaunchTarget = { kind: 'file', path: filePath }
  const existing = activeReaderWindow()
  if (!existing) {
    createReaderWindow(target)
    return
  }

  try {
    rememberRoot(mountFileParent(filePath))
    rememberFile(filePath)
  } catch (err) {
    console.warn('[library] cannot open file:', filePath, err)
    return
  }

  existing.webContents.send('library:open-target', target)
  if (existing.isMinimized()) existing.restore()
  existing.show()
  existing.focus()
}

/**
 * Document paths in a command line. Windows and Linux pass the file this
 * way (macOS uses the `open-file` event instead), and dev runs put the
 * script path in argv, so anything unreadable or unsupported is dropped.
 */
function fileArgsFrom(argv: string[]): string[] {
  return argv
    .slice(app.isPackaged ? 1 : 2)
    .filter((arg) => !arg.startsWith('-'))
    .filter((arg) => {
      try {
        return fs.statSync(arg).isFile() && isSupported(arg)
      } catch {
        return false
      }
    })
}

/**
 * Documents handed to us before `app.ready`. On macOS `open-file` fires
 * ahead of `ready` when the app is launched by double-clicking a file, so
 * there is nowhere to put them yet.
 */
const pendingOpenFiles: string[] = []

/**
 * Windows only: Squirrel re-launches the app with `--squirrel-*` at install,
 * update and uninstall. Answer it and quit — otherwise a window flashes up
 * mid-install and file associations never get registered.
 */
let squirrelHandled = false
void handleSquirrelEvent().then((handled) => {
  if (!handled) return
  squirrelHandled = true
  app.quit()
})

app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (app.isReady()) openInReader(filePath)
  else pendingOpenFiles.push(filePath)
})

/**
 * One instance owns the windows. Without the lock, "open with PrismMD" on a
 * second file would boot a whole second app — including a second SQLite
 * connection to the same workspace.db.
 */
const isPrimaryInstance = app.requestSingleInstanceLock()
if (!isPrimaryInstance) app.quit()

app.on('second-instance', (_event, argv) => {
  const files = fileArgsFrom(argv)
  if (files.length > 0) files.forEach(openInReader)
  else focusWorkspaceWindow()
})

app.whenReady().then(async () => {
  if (!isPrimaryInstance || squirrelHandled) return
  // A throw in here used to reject silently, leaving a running app with no
  // window and no message — the hardest possible thing to diagnose.
  try {
    registerIpcHandlers()
  } catch (err) {
    console.error('[app] IPC handler registration failed:', err)
  }

  // Point the app at whichever store holds the notes — SQLite, or a vault the
  // user migrated to. Before anything reads a page, or the first read would
  // answer from the wrong store.
  try {
    await initStorage()
  } catch (err) {
    console.error('[storage] Failed to resolve the note store:', err)
  }

  // Seed a welcome page on first launch so the workspace isn't empty. Awaited
  // *before* the window exists: the first thing a fresh window does is ask for
  // the page tree, and answering that before the seed lands shows an empty
  // workspace to someone who has never opened the app.
  try {
    await getNoteRepository().ensureWelcomePage()
  } catch (err) {
    console.error('[workspace] Failed to seed welcome page:', err)
  }

  // Launched *with* a document → open the reader and nothing else. Creating
  // the workbench too would put a window the user didn't ask for in front of
  // the one they did.
  const launchFiles = [...new Set([...pendingOpenFiles, ...fileArgsFrom(process.argv)])]
  pendingOpenFiles.length = 0
  if (launchFiles.length > 0) {
    for (const file of launchFiles) openInReader(file)
  } else {
    createWindow()
  }

  // Reconcile the note index with the workspace. Runs after the window is
  // created, not before: a first-run index of a large workspace should not
  // sit between the user and their notes, and every read path initializes
  // the schema on its own if this has not finished yet.
  setImmediate(() => void initKnowledgeIndex())

  // Fire MCP servers in the background — failures don't block window
  // creation, and individual server errors are logged inside the service.
  startMcpServers().catch((err) => console.warn('[mcp] startAll failed:', err))
  // Auto-updater: only active in packaged builds on mac/win; dev runs
  // and linux packages are skipped internally.
  initAutoUpdater()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

let servicesShutdownStarted = false
/** Hard ceiling for shutdown — beyond this we give up and exit so the
 * user isn't staring at a dock icon waiting on a hung MCP subprocess. */
const SHUTDOWN_TIMEOUT_MS = 5000
/** Ceiling for the renderer autosave flush before we close the DB anyway. */
const FLUSH_TIMEOUT_MS = 1500

app.on('before-quit', (event) => {
  if (servicesShutdownStarted) return
  servicesShutdownStarted = true
  event.preventDefault()
  void (async () => {
    // Ask the renderer to flush any pending (debounced) autosave to SQLite before
    // we close the DB, so the last edits aren't lost on quit. Bounded by a timeout
    // in case the renderer is unresponsive.
    const win = getMainWindow()
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      await Promise.race([
        new Promise<void>((resolve) => {
          ipcMain.once('workspace:flush-complete', () => resolve())
          win.webContents.send('app:flush-before-quit')
        }),
        new Promise<void>((resolve) => setTimeout(resolve, FLUSH_TIMEOUT_MS)),
      ])
    }

    // Debounced index jobs hold the *last* edit of the session; running them
    // now is the difference between quitting and losing the final paragraph
    // from search until the next launch repairs it.
    // Stop watching before the flush: a file event arriving mid-shutdown
    // would schedule an index write onto a database about to be closed.
    try {
      stopWatchingVault()
    } catch { /* nothing to stop */ }

    try {
      await flushPendingIndexing()
    } catch (err) {
      console.warn('[knowledge] flush on quit failed:', err)
    }

    // Close workspace database synchronously (SQLite, no async needed)
    try {
      const { closeDb } = require('./services/workspaceDb')
      closeDb()
      const { closeIndexDatabase } = require('./services/indexDatabase')
      closeIndexDatabase()
    } catch { /* DB may not have been opened */ }

    // Tear down both long-running services in parallel so the user
    // isn't stuck waiting on one blocking the other on app close. The
    // timeout race exists because a misbehaving MCP subprocess (not
    // SIGTERM-responsive) would otherwise keep the main process alive
    // forever, leaving orphan children in the user's process tree.
    const shutdown = Promise.all([
      shutdownInsightGraph().catch(() => {}),
      shutdownMcpServers().catch(() => {}),
    ])
    const timeout = new Promise<void>((resolve) =>
      setTimeout(() => {
        console.warn(`[app] shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms — force-exiting`)
        resolve()
      }, SHUTDOWN_TIMEOUT_MS),
    )
    Promise.race([shutdown, timeout]).finally(() => app.exit(0))
  })()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
