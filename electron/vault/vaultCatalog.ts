/**
 * The catalog: an id → path map, and nothing else.
 *
 * ★ It holds **no note text**. That is the whole discipline of the vault
 * model: the files are the truth, and everything in SQLite must be
 * reconstructible by walking them. What the catalog buys is speed — resolving
 * a note id without stat-ing the entire tree, and telling "this file changed"
 * from "this file moved" by comparing a content hash against a remembered
 * one.
 *
 * Because it is pure cache, every operation here is safe to lose: a missing
 * catalog means a slow first scan, never a missing note.
 *
 * It lives in the workspace database rather than a JSON file in `.prism/` so
 * that a crash mid-write cannot corrupt it, and so a reconcile of ten
 * thousand notes is a transaction rather than ten thousand file writes.
 */
import type { Database } from 'better-sqlite3'

export interface CatalogEntry {
  id: string
  /** Vault-relative, forward slashes. */
  relativePath: string
  title: string
  contentHash: string
  modifiedAt: number
  createdAt: number
  format: string
}

export function ensureCatalogSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS note_catalog (
      id TEXT PRIMARY KEY,
      relative_path TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      modified_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      format TEXT NOT NULL DEFAULT 'md'
    );
    CREATE INDEX IF NOT EXISTS idx_note_catalog_path ON note_catalog(relative_path);

    -- Deleted notes, so a restore knows where to put them back. Not a cache:
    -- the path a note came from exists nowhere else once the file has moved
    -- into .trash.
    CREATE TABLE IF NOT EXISTS note_trash (
      id TEXT PRIMARY KEY,
      original_path TEXT NOT NULL,
      title TEXT NOT NULL,
      deleted_at INTEGER NOT NULL
    );
  `)
}

function rowToEntry(row: Record<string, any>): CatalogEntry {
  return {
    id: row.id,
    relativePath: row.relative_path,
    title: row.title,
    contentHash: row.content_hash,
    modifiedAt: row.modified_at,
    createdAt: row.created_at,
    format: row.format,
  }
}

export function getEntry(db: Database, id: string): CatalogEntry | null {
  const row = db.prepare('SELECT * FROM note_catalog WHERE id = ?').get(id) as
    | Record<string, any>
    | undefined
  return row ? rowToEntry(row) : null
}

export function getEntryByPath(db: Database, relativePath: string): CatalogEntry | null {
  const row = db.prepare('SELECT * FROM note_catalog WHERE relative_path = ?').get(relativePath) as
    | Record<string, any>
    | undefined
  return row ? rowToEntry(row) : null
}

export function listEntries(db: Database): CatalogEntry[] {
  return (db.prepare('SELECT * FROM note_catalog ORDER BY relative_path').all() as Record<string, any>[])
    .map(rowToEntry)
}

export function upsertEntry(db: Database, entry: CatalogEntry): void {
  // A note that moved keeps its id but takes a new path, and the old path's
  // row (if any other id claimed it) has to go first or the UNIQUE index
  // rejects the write.
  db.prepare('DELETE FROM note_catalog WHERE relative_path = ? AND id != ?')
    .run(entry.relativePath, entry.id)
  db.prepare(`
    INSERT INTO note_catalog (id, relative_path, title, content_hash, modified_at, created_at, format)
    VALUES (@id, @relativePath, @title, @contentHash, @modifiedAt, @createdAt, @format)
    ON CONFLICT(id) DO UPDATE SET
      relative_path = excluded.relative_path,
      title = excluded.title,
      content_hash = excluded.content_hash,
      modified_at = excluded.modified_at,
      format = excluded.format
  `).run(entry)
}

export function removeEntry(db: Database, id: string): void {
  db.prepare('DELETE FROM note_catalog WHERE id = ?').run(id)
}

export function clearCatalog(db: Database): void {
  db.exec('DELETE FROM note_catalog')
}

// ─── Trash ──────────────────────────────────────────────────────────────────

export interface TrashEntry {
  id: string
  originalPath: string
  title: string
  deletedAt: number
}

export function recordTrash(db: Database, entry: TrashEntry): void {
  db.prepare(`
    INSERT OR REPLACE INTO note_trash (id, original_path, title, deleted_at)
    VALUES (@id, @originalPath, @title, @deletedAt)
  `).run(entry)
}

export function getTrash(db: Database, id: string): TrashEntry | null {
  const row = db.prepare('SELECT * FROM note_trash WHERE id = ?').get(id) as
    | Record<string, any>
    | undefined
  return row
    ? { id: row.id, originalPath: row.original_path, title: row.title, deletedAt: row.deleted_at }
    : null
}

export function listTrash(db: Database): TrashEntry[] {
  return (db.prepare('SELECT * FROM note_trash ORDER BY deleted_at DESC').all() as Record<string, any>[])
    .map((row) => ({
      id: row.id,
      originalPath: row.original_path,
      title: row.title,
      deletedAt: row.deleted_at,
    }))
}

export function removeTrash(db: Database, id: string): void {
  db.prepare('DELETE FROM note_trash WHERE id = ?').run(id)
}
