/**
 * Configurable data-storage location.
 *
 * All app data lives under Electron's `userData` dir. This service lets the
 * user redirect that to a custom folder. Because the custom-location
 * preference itself cannot live in `userData` (chicken-and-egg — we need it
 * before `userData` is resolved), it is stored in a tiny `data-location.json`
 * bootstrap file kept in the DEFAULT `userData` dir, read at boot.
 *
 * `applyDataLocation()` MUST run before electron-store / better-sqlite3
 * modules resolve their paths (they do so at import time), i.e. from the very
 * first import in `main.ts` (see `electron/bootstrap.ts`).
 */
import { app, shell } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

const BOOTSTRAP_FILE = 'data-location.json'

/** Known entries under `userData` that should travel together on a move. */
const DATA_ENTRIES = [
  'workspace.db',
  'workspace.db-wal',
  'workspace.db-shm',
  'prismmd-settings.json',
  'sessions',
  'assets',
  'memory',
  'knowledge',
  'plugins',
]

// Captured ONCE at bootstrap, before any setPath, so we always know the
// original userData dir (where the bootstrap config lives).
let defaultDataDir: string | null = null

function bootstrapPath(): string {
  return path.join(defaultDataDir ?? app.getPath('userData'), BOOTSTRAP_FILE)
}

function readCustomPath(): string | null {
  try {
    const raw = fs.readFileSync(bootstrapPath(), 'utf-8')
    const cfg = JSON.parse(raw) as { customPath?: unknown }
    return typeof cfg.customPath === 'string' && cfg.customPath.trim() ? cfg.customPath : null
  } catch {
    return null
  }
}

function writeBootstrap(customPath: string | null): void {
  const file = bootstrapPath()
  if (!customPath) {
    try { fs.rmSync(file, { force: true }) } catch { /* ignore */ }
    return
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ customPath }, null, 2), 'utf-8')
}

/**
 * Boot-time hook. Captures the default userData dir, then redirects userData
 * to the custom dir if one is configured. Idempotent.
 */
export function applyDataLocation(): void {
  if (defaultDataDir) return
  defaultDataDir = app.getPath('userData')
  const custom = readCustomPath()
  if (custom && path.resolve(custom) !== path.resolve(defaultDataDir)) {
    try {
      fs.mkdirSync(custom, { recursive: true })
      app.setPath('userData', custom)
    } catch (err) {
      console.warn('[dataLocation] failed to apply custom path, using default:', err)
    }
  }
}

export interface DataLocationInfo {
  currentDir: string
  defaultDir: string
  isCustom: boolean
}

export function getDataLocationInfo(): DataLocationInfo {
  const currentDir = app.getPath('userData')
  const def = defaultDataDir ?? currentDir
  return { currentDir, defaultDir: def, isCustom: path.resolve(currentDir) !== path.resolve(def) }
}

function copyEntries(from: string, to: string): void {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of DATA_ENTRIES) {
    const src = path.join(from, entry)
    if (!fs.existsSync(src)) continue
    fs.cpSync(src, path.join(to, entry), { recursive: true, force: true })
  }
}

export interface ApplyResult { ok: boolean; error?: string }

/**
 * Switch the data location. `targetDir` null = reset to default. When
 * `migrate` is true, copies the current data entries into the target first
 * (closing the DB so WAL files are consistent). The caller relaunches after.
 */
export function changeDataLocation(targetDir: string | null, migrate: boolean): ApplyResult {
  try {
    const currentDir = app.getPath('userData')
    const def = defaultDataDir ?? currentDir
    const resolvedTarget = targetDir ?? def
    const sameAsCurrent = path.resolve(resolvedTarget) === path.resolve(currentDir)
    const isDefault = path.resolve(resolvedTarget) === path.resolve(def)

    if (!sameAsCurrent && migrate) {
      // Close the DB so WAL/SHM are flushed before copying the files.
      try {
        const { closeDb } = require('./workspaceDb') as { closeDb: () => void }
        closeDb()
      } catch { /* DB may not be open */ }
      copyEntries(currentDir, resolvedTarget)
    } else if (!sameAsCurrent) {
      fs.mkdirSync(resolvedTarget, { recursive: true })
    }

    // Record a custom location, or clear the record when resetting to default.
    writeBootstrap(isDefault ? null : resolvedTarget)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function revealDataDir(): void {
  void shell.openPath(app.getPath('userData'))
}

export function relaunchApp(): void {
  app.relaunch()
  app.exit(0)
}
