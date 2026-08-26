/**
 * Workspace Database — SQLite storage for the Notion-like workspace.
 *
 * This is the **store**: in SQLite mode it holds the notes themselves. After
 * a migration to a vault it stays behind as a read-only archive — nothing
 * writes `pages` any more, and it is kept because it is the only copy left if
 * someone wants to go back.
 *
 * Anything *derived* from the notes goes through `indexDatabase.ts` instead,
 * which in vault mode answers with a database inside the vault. See the note
 * there for why the two are split.
 */
import Database from 'better-sqlite3'
import * as path from 'path'
import { app } from 'electron'
import { ensureSatelliteSchema } from './satelliteSchema'

let db: Database.Database | null = null

const DB_PATH = path.join(app.getPath('userData'), 'workspace.db')

/**
 * Get (or create) the database connection. Initializes schema on first call.
 */
export function getDb(): Database.Database {
  if (db) return db

  db = new Database(DB_PATH)

  // Performance settings
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Create tables if they don't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Untitled',
      content TEXT NOT NULL DEFAULT '',
      format TEXT NOT NULL DEFAULT 'md',
      parent_id TEXT,
      position INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      is_deleted INTEGER DEFAULT 0,
      icon TEXT,
      is_folder INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (parent_id) REFERENCES pages(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL,
      start_offset INTEGER,
      end_offset INTEGER,
      selected_text TEXT,
      color TEXT,
      note TEXT,
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
    );

    -- Binary payload for non-text pages (PDF, XLSX). The bytes live on
    -- disk under {userData}/assets/ rather than in a BLOB column so that
    -- a SELECT * over pages stays cheap no matter how big the document is;
    -- this table only carries the metadata needed to find and describe them.
    CREATE TABLE IF NOT EXISTS page_assets (
      page_id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      ext TEXT NOT NULL,
      mime TEXT,
      size INTEGER NOT NULL,
      source_path TEXT,
      storage_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS note_embeddings (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      embedding BLOB NOT NULL,
      dim INTEGER NOT NULL,
      model TEXT NOT NULL,
      page_updated_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_pages_parent ON pages(parent_id);
    CREATE INDEX IF NOT EXISTS idx_pages_deleted ON pages(is_deleted);
    CREATE INDEX IF NOT EXISTS idx_annotations_page ON annotations(page_id);
  `)

  // ── Migrations for pre-existing databases ──
  // `CREATE TABLE IF NOT EXISTS` never adds columns to an already-existing
  // pages table, so newly introduced columns must be backfilled idempotently.
  const pageCols = db.prepare('PRAGMA table_info(pages)').all() as Array<{ name: string }>
  if (!pageCols.some((c) => c.name === 'is_folder')) {
    db.exec('ALTER TABLE pages ADD COLUMN is_folder INTEGER NOT NULL DEFAULT 0')
  }

  // Version history, editorial metadata, AI summaries and muse cards are
  // defined once, in satelliteSchema, because in vault mode they live in the
  // vault's database instead of this one. Two definitions would drift, and
  // the drift would show up as a feature that works in one storage mode.
  ensureSatelliteSchema(db)

  return db
}

/**
 * Close the database connection (call on app quit).
 */
export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
