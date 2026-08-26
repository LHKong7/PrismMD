/**
 * Which store the app is pointed at, and how it gets moved.
 *
 * ★ One place decides this. `storageMode` in settings, the active repository,
 * and the note index all have to agree at every instant, and the way they
 * stop agreeing is two call sites each resolving it for themselves. Every
 * transition — startup, migration — goes through here.
 */
import { app, BrowserWindow, shell } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { getNoteRepository, setNoteRepository, useVaultRepository } from '../repositories/repositoryFactory'
import { SqliteNoteRepository } from '../repositories/sqliteNoteRepository'
import { getStorageSettings, setStorageSettings, type StorageSettings } from './settingsStore'
import { getDb } from './workspaceDb'
import { backupFilesFor, migrateSqliteToVault } from '../migration/sqliteToVault'
import { readJournal, type MigrationJournalEntry } from '../migration/migrationJournal'
import { PRISM_DIR } from '../vault/vaultLayout'
import { flushPendingIndexing, rebuildIndex } from './knowledgeService'

export interface StorageStatus {
  mode: StorageSettings['mode']
  vaultPath: string | null
  migratedAt: number | null
  /** False when the settings say vault but the folder is not there. */
  vaultReachable: boolean
  /** Set when a previous migration was interrupted. */
  interrupted: MigrationJournalEntry | null
}

/**
 * Writes are suspended while a migration runs.
 *
 * ★ The renderer autosaves on a debounce. Without this, a save landing
 * halfway through the copy writes a note into the *old* store that the new
 * one will never see — and the user watches their last paragraph disappear
 * with no error anywhere.
 */
let writesSuspended = false

export function areWritesSuspended(): boolean {
  return writesSuspended
}

/** Point the app at whichever store the settings name. Called once at startup. */
export async function initStorage(): Promise<StorageStatus> {
  const settings = getStorageSettings()

  if (settings.mode === 'vault' && settings.vaultPath) {
    if (fs.existsSync(settings.vaultPath)) {
      try {
        await useVaultRepository(settings.vaultPath, getDb())
        console.log(`[storage] vault mode — ${settings.vaultPath}`)
        return status()
      } catch (err) {
        console.error('[storage] Failed to open the vault, staying on SQLite:', err)
      }
    } else {
      // ★ Do not fall back silently. A vault on an unmounted drive looks
      // exactly like an empty workspace, and someone who believes their notes
      // are gone will do something drastic. The status carries the truth and
      // the settings panel says it out loud.
      console.error(`[storage] Vault not found at ${settings.vaultPath}`)
    }
  }

  setNoteRepository(new SqliteNoteRepository())
  return status()
}

export function status(): StorageStatus {
  const settings = getStorageSettings()
  return {
    mode: getNoteRepository().kind,
    vaultPath: settings.vaultPath,
    migratedAt: settings.migratedAt,
    vaultReachable: settings.vaultPath ? fs.existsSync(settings.vaultPath) : true,
    interrupted: settings.vaultPath
      ? readJournal(path.join(`${settings.vaultPath}.migrating`, PRISM_DIR, 'migration.json'))
      : null,
  }
}

export interface MigrateOutcome {
  ok: boolean
  vaultPath?: string
  /** Human-readable account of what the validator refused to sign off on. */
  problems?: string[]
  stagingPath?: string
  backupPath?: string
  error?: string
}

/**
 * Move this workspace into a vault at `targetPath`.
 *
 * Only switches the app over once `migrateSqliteToVault` has proved the copy
 * complete. A failure leaves the workspace exactly where it was.
 */
export async function migrateWorkspaceToVault(targetPath: string): Promise<MigrateOutcome> {
  const source = getNoteRepository()
  if (source.kind !== 'sqlite') {
    return { ok: false, error: 'This workspace is already stored as a vault.' }
  }

  writesSuspended = true
  try {
    // Anything the index still owes the database has to land before the copy
    // reads it, or the newest edits migrate as their previous version.
    await flushPendingIndexing()
    notify('storage:migration-progress', { step: 'preparing', done: 0, total: 0 })

    const result = await migrateSqliteToVault({
      targetPath,
      source,
      db: getDb(),
      readBytes: (pageId) => source.readPageBytes(pageId),
      backupDir: path.join(app.getPath('userData'), 'backups'),
      backupFiles: backupFilesFor(app.getPath('userData')),
      onProgress: (update) => notify('storage:migration-progress', update),
    })

    if (!result.ok || !result.vaultPath) {
      return {
        ok: false,
        problems: result.report?.problems.map((p) => p.detail),
        stagingPath: result.stagingPath,
        backupPath: result.backupPath,
        error: result.error,
      }
    }

    await useVaultRepository(result.vaultPath, getDb())
    setStorageSettings({ mode: 'vault', vaultPath: result.vaultPath, migratedAt: Date.now() })

    // The index still describes the old store's rows. Rebuilding from the
    // vault is what makes search, backlinks and AI retrieval true again.
    await rebuildIndex()
    notify('storage:changed', status())

    return { ok: true, vaultPath: result.vaultPath, backupPath: result.backupPath }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    writesSuspended = false
  }
}

export function revealVault(): void {
  const { vaultPath } = getStorageSettings()
  if (vaultPath && fs.existsSync(vaultPath)) shell.openPath(vaultPath)
}

function notify(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}
