/**
 * Workspace Database — SQLite storage for the Notion-like workspace.
 *
 * All pages, annotations, and doc summaries are stored in a single
 * SQLite database at {userData}/workspace.db. Uses better-sqlite3
 * for synchronous, fast, single-file access.
 */
import Database from 'better-sqlite3'
import * as path from 'path'
import { app } from 'electron'

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

    CREATE TABLE IF NOT EXISTS doc_summaries (
      page_id TEXT PRIMARY KEY,
      tldr TEXT,
      questions TEXT,
      generated_at INTEGER,
      signature TEXT,
      FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS page_versions (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL,
      content TEXT NOT NULL,
      title TEXT,
      source TEXT,
      label TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS page_meta (
      page_id TEXT PRIMARY KEY,
      status TEXT,
      genre TEXT,
      quality INTEGER,
      updated_at INTEGER,
      FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS muse_cards (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      text TEXT NOT NULL,
      page_id TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pages_parent ON pages(parent_id);
    CREATE INDEX IF NOT EXISTS idx_pages_deleted ON pages(is_deleted);
    CREATE INDEX IF NOT EXISTS idx_annotations_page ON annotations(page_id);
    CREATE INDEX IF NOT EXISTS idx_versions_page ON page_versions(page_id);
    CREATE INDEX IF NOT EXISTS idx_muse_created ON muse_cards(created_at);
  `)

  // ── Migrations for pre-existing databases ──
  // `CREATE TABLE IF NOT EXISTS` never adds columns to an already-existing
  // pages table, so newly introduced columns must be backfilled idempotently.
  const pageCols = db.prepare('PRAGMA table_info(pages)').all() as Array<{ name: string }>
  if (!pageCols.some((c) => c.name === 'is_folder')) {
    db.exec('ALTER TABLE pages ADD COLUMN is_folder INTEGER NOT NULL DEFAULT 0')
  }

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
