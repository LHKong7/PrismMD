/**
 * Library IPC — the renderer's only door into reader mode's file access.
 *
 * Every channel here is a read. There is no `library:write-*` because
 * `libraryService` has no write function to bind one to (see the invariants
 * documented there).
 */
import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import {
  listDir,
  readText,
  readBytes,
  statFile,
  mountRoot,
  mountFileParent,
  mountedRoots,
} from '../services/libraryService'
import {
  recentRoots,
  recentFiles,
  rememberRoot,
  rememberFile,
  clearRecents,
} from '../services/libraryRecents'
import { watchForWindow, stopWatching } from '../services/libraryWatcher'
import { openDialogFilters } from '../services/fileFormats'
import { getNoteRepository } from '../repositories/repositoryFactory'
import { createReaderWindow, focusWorkspaceWindow, getLaunchTarget, getMainWindow } from '../main'
type Ok<T> = { ok: true } & T
type Err = { ok: false; error: string }

/**
 * Point this window's watcher at `root` and push change batches to it.
 * Reader mode never writes, so this is purely "the folder moved underneath
 * you" — no sync, no conflicts.
 */
function watchRootFor(event: Electron.IpcMainInvokeEvent, root: string) {
  const sender = event.sender
  watchForWindow(sender.id, root, (paths) => {
    if (!sender.isDestroyed()) sender.send('library:changed', paths)
  })
}

/** Uniform `{ok}` envelope, matching the workspace handlers' shape. */
async function attempt<T extends object>(fn: () => T | Promise<T>): Promise<Ok<T> | Err> {
  try {
    return { ok: true, ...(await fn()) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function registerLibraryHandlers() {
  // ── Mounting ──

  ipcMain.handle('library:pick-folder', async (event) =>
    attempt(async () => {
      const parent = BrowserWindow.fromWebContents(event.sender)
      const result = parent
        ? await dialog.showOpenDialog(parent, { properties: ['openDirectory'] })
        : await dialog.showOpenDialog({ properties: ['openDirectory'] })

      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true as const, root: null, listing: null }
      }

      const root = mountRoot(result.filePaths[0])
      rememberRoot(root)
      watchRootFor(event, root)
      // Hand back the first listing too — the tree needs it immediately and
      // a second round trip would only add a frame of empty sidebar.
      return { canceled: false as const, root, listing: listDir(root) }
    }),
  )

  ipcMain.handle('library:pick-file', async (event) =>
    attempt(async () => {
      const parent = BrowserWindow.fromWebContents(event.sender)
      const options: Electron.OpenDialogOptions = {
        properties: ['openFile'],
        filters: openDialogFilters(),
      }
      const result = parent
        ? await dialog.showOpenDialog(parent, options)
        : await dialog.showOpenDialog(options)

      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true as const, file: null, root: null }
      }

      const filePath = result.filePaths[0]
      const root = mountFileParent(filePath)
      rememberFile(filePath)
      rememberRoot(root)
      watchRootFor(event, root)
      return { canceled: false as const, file: statFile(filePath), root }
    }),
  )

  /** Mount a path the renderer already knows (a recents entry, a drop). */
  ipcMain.handle('library:mount', async (event, target: string, kind: 'folder' | 'file') =>
    attempt(() => {
      if (kind === 'folder') {
        const root = mountRoot(target)
        rememberRoot(root)
        watchRootFor(event, root)
        return { root, listing: listDir(root), file: null }
      }
      const root = mountFileParent(target)
      rememberFile(target)
      rememberRoot(root)
      watchRootFor(event, root)
      return { root, listing: listDir(root), file: statFile(target) }
    }),
  )

  ipcMain.handle('library:mounted-roots', async () => mountedRoots())

  // ── Reads ──

  ipcMain.handle('library:list-dir', async (_event, dirPath: string) =>
    attempt(() => ({ listing: listDir(dirPath) })),
  )

  ipcMain.handle('library:read-text', async (_event, filePath: string) =>
    attempt(() => ({ content: readText(filePath) })),
  )

  ipcMain.handle('library:read-bytes', async (_event, filePath: string) =>
    attempt(() => ({ bytes: readBytes(filePath) })),
  )

  ipcMain.handle('library:stat', async (_event, filePath: string) =>
    attempt(() => ({ file: statFile(filePath) })),
  )

  // ── Recents ──

  ipcMain.handle('library:recents', async () => ({
    roots: recentRoots(),
    files: recentFiles(),
  }))

  ipcMain.handle('library:clear-recents', async () => {
    clearRecents()
    return { ok: true }
  })

  // ── Shell / windows ──

  ipcMain.handle('library:reveal', async (_event, itemPath: string) =>
    attempt(() => {
      shell.showItemInFolder(itemPath)
      return {}
    }),
  )

  /** Open another reader window, optionally aimed at a path. */
  ipcMain.handle(
    'library:open-window',
    async (_event, target?: { kind: 'folder' | 'file'; path: string }) =>
      attempt(() => {
        createReaderWindow(target)
        return {}
      }),
  )

  /** Switch to note mode — focus the workspace window, creating it if needed. */
  ipcMain.handle('library:open-workspace', async () =>
    attempt(() => {
      focusWorkspaceWindow()
      return {}
    }),
  )

  /**
   * The one path from reader mode into the workspace: copy a document the
   * user is reading into their notes. Everything else in this file is a
   * read — this deliberately goes through the same repository import the
   * workbench uses rather than growing a second import path.
   *
   * The file being read is *not* modified; a copy joins the workspace.
   */
  ipcMain.handle('library:import-to-workspace', async (_event, filePath: string) =>
    attempt(async () => {
      // Confine it to a mounted root — the renderer shouldn't be able to
      // pull arbitrary files into the workspace either.
      const file = statFile(filePath)
      const page = await getNoteRepository().importFile(file.path, null)
      // Let an open workbench pick the new page up immediately instead of
      // waiting for its next tree action.
      const win = getMainWindow()
      if (win && !win.isDestroyed()) win.webContents.send('workspace:tree-changed')
      return { page }
    }),
  )

  /**
   * What this window was told to open at creation time (double-click, argv,
   * "open in new window"). Null for a plain launch, which lands on the
   * recents screen.
   */
  ipcMain.handle('library:launch-target', async (event) => getLaunchTarget(event.sender.id))
}
