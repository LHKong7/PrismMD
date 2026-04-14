import { app, autoUpdater, BrowserWindow } from 'electron'
import { updateElectronApp, UpdateSourceType } from 'update-electron-app'
import { getMainWindow } from '../main'

/**
 * Auto-update wiring. Uses `update-electron-app` which wraps Electron's
 * built-in `autoUpdater` + the Electron community `update.electronjs.org`
 * feed — the feed synthesises per-platform update manifests straight from
 * our GitHub Releases, so we don't have to maintain `latest.yml` or any
 * other electron-builder artifacts.
 *
 * Supported platforms out of the box: macOS (Squirrel.Mac on signed .app
 * bundles / `.zip` artifacts) and Windows (Squirrel.Windows `.exe`). Linux
 * has no Electron-native auto-update path; this service no-ops there.
 */

let wired = false
let lastError: string | null = null

interface UpdateEvent {
  kind: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  releaseNotes?: string
  releaseName?: string
  releaseDate?: string
  error?: string
}

/** Broadcast update state to the current renderer window. */
function broadcast(ev: UpdateEvent): void {
  const win = getMainWindow() ?? BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    win.webContents.send('updater:event', ev)
  }
}

export function initAutoUpdater(): void {
  if (wired) return
  wired = true

  // Never auto-update dev builds — they're not signed and the feed
  // doesn't serve them anyway. `app.isPackaged` is the canonical check.
  if (!app.isPackaged) {
    return
  }

  // Linux isn't supported by Electron's built-in autoUpdater; silently
  // skip instead of erroring out.
  if (process.platform === 'linux') {
    return
  }

  try {
    // `updateElectronApp` takes care of initial + interval checks and
    // wires its own dialog on `update-downloaded`. We disable its dialog
    // via `notifyUser: false` because we ship a nicer in-app UI; the raw
    // `autoUpdater` events below drive that UI.
    updateElectronApp({
      updateSource: {
        type: UpdateSourceType.ElectronPublicUpdateService,
        repo: 'lhkong7/prismmd',
      },
      updateInterval: '1 hour',
      notifyUser: false,
    })
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err)
    broadcast({ kind: 'error', error: lastError })
    return
  }

  autoUpdater.on('checking-for-update', () => {
    broadcast({ kind: 'checking' })
  })
  autoUpdater.on('update-available', () => {
    broadcast({ kind: 'available' })
  })
  autoUpdater.on('update-not-available', () => {
    broadcast({ kind: 'not-available' })
  })
  autoUpdater.on('update-downloaded', (_event, releaseNotes, releaseName, releaseDate) => {
    broadcast({
      kind: 'downloaded',
      version: releaseName,
      releaseName,
      releaseNotes,
      releaseDate: releaseDate?.toISOString(),
    })
  })
  autoUpdater.on('error', (err: Error) => {
    lastError = err.message
    broadcast({ kind: 'error', error: err.message })
  })
}

/** Force a feed check outside the 1h interval. No-op before init or in dev. */
export function checkForUpdatesNow(): void {
  if (!wired || !app.isPackaged || process.platform === 'linux') return
  try {
    autoUpdater.checkForUpdates()
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err)
    broadcast({ kind: 'error', error: lastError })
  }
}

/** Apply a downloaded update. Electron relaunches the app after this call. */
export function quitAndInstall(): void {
  if (!wired || !app.isPackaged) return
  autoUpdater.quitAndInstall()
}

export function getCurrentVersion(): string {
  return app.getVersion()
}

export function getLastError(): string | null {
  return lastError
}
