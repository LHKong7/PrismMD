/**
 * Which database the *derived* data goes in.
 *
 * ★ Two databases, split by what they mean rather than by what they contain:
 *
 * - `workspace.db` under `userData` is a **store**. In SQLite mode it holds
 *   the notes themselves; after a migration it is a read-only archive of what
 *   they were.
 * - `<vault>/.prism/prism.db` is a **cache**. It holds the catalog, the search
 *   index, the AI summaries — answers derived from the files beside it.
 *
 * The reason the cache lives inside the vault is that a vault is supposed to
 * be one thing you can pick up and carry. Copy the folder to another machine
 * with the index left behind in `userData` and it comes back searchable only
 * after a full re-scan; worse, point the app at a *second* vault and both
 * would share one catalog, where an id present in one and absent in the other
 * is read as a note that was deleted.
 *
 * This is the second half of decision D6, deliberately held back until now:
 * moving the storage location and the storage format in one change means a
 * failure has two possible causes.
 *
 * `dataLocation` still moves `workspace.db` when the user relocates their app
 * data, and still should — that is the store. It no longer drags the vault's
 * index along with it, which is the conflict D6 named.
 */
import Database from 'better-sqlite3'
import * as fs from 'fs'
import * as path from 'path'
import { getDb } from './workspaceDb'
import { ensureSatelliteSchema } from './satelliteSchema'
import { vaultPaths } from '../vault/vaultLayout'

let vaultDb: Database.Database | null = null
let vaultDbFile: string | null = null

/**
 * Open (or reopen) the derived database belonging to a vault.
 *
 * Takes the root by argument and touches no Electron API, so a test can point
 * it at a temp directory.
 */
export function openIndexDatabase(vaultRoot: string): Database.Database {
  const file = vaultPaths(path.resolve(vaultRoot)).indexFile
  if (vaultDb && vaultDbFile === file) return vaultDb

  closeIndexDatabase()
  fs.mkdirSync(path.dirname(file), { recursive: true })

  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  ensureSatelliteSchema(db)

  vaultDb = db
  vaultDbFile = file
  return db
}

/**
 * The connection every derived table should be read and written through.
 *
 * ★ Resolved per call, never captured. A migration swaps the answer while the
 * app is running, and a module that held on to the previous one would keep
 * indexing into the abandoned database — reporting success the whole time.
 */
export function indexDb(): Database.Database {
  return vaultDb ?? getDb()
}

/** Where the derived data currently lives, for the settings panel and logs. */
export function indexDatabasePath(): string | null {
  return vaultDbFile
}

export function closeIndexDatabase(): void {
  if (!vaultDb) return
  try {
    vaultDb.close()
  } catch (err) {
    console.warn('[storage] Could not close the vault index database:', err)
  }
  vaultDb = null
  vaultDbFile = null
}
