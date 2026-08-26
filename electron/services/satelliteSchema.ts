/**
 * Tables keyed by a note id that do not hold the note.
 *
 * Version snapshots, editorial metadata, AI summaries, muse cards: each row
 * says something *about* a note without being its content. Every one of them
 * was declared with `REFERENCES pages(id)`, from a time when "a note" and "a
 * row in `pages`" were the same statement.
 *
 * ★ In vault mode they are not. A note's id lives in front matter and the
 * `pages` table is a pre-migration archive, so `foreign_keys = ON` **rejects
 * every insert** — silently, from the user's point of view. Taking a snapshot
 * before an AI rewrite fails; marking a note "done" fails; a generated
 * summary is discarded. This is the same fault the knowledge index had in
 * stage 4, in the four places nobody thought to look at because they are not
 * search.
 *
 * So the constraint goes. What it was buying was a cascade on hard-deleting a
 * page — and there is no hard delete: `deletePage` sets `is_deleted = 1`. It
 * has never fired in this application's life.
 *
 * SQLite cannot drop a constraint, so a database that already has these
 * tables gets each one **rebuilt in place, rows and all**. That distinguishes
 * this from the knowledge index, which is derived and is simply dropped: the
 * rows here are things the user made.
 */
import type { Database } from 'better-sqlite3'

interface TableSpec {
  name: string
  /** Column definitions, no foreign keys. */
  columns: string
  indexes?: string[]
}

const TABLES: TableSpec[] = [
  {
    name: 'page_versions',
    columns: `
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL,
      content TEXT NOT NULL,
      title TEXT,
      source TEXT,
      label TEXT,
      created_at INTEGER NOT NULL
    `,
    indexes: ['CREATE INDEX IF NOT EXISTS idx_versions_page ON page_versions(page_id)'],
  },
  {
    name: 'page_meta',
    columns: `
      page_id TEXT PRIMARY KEY,
      status TEXT,
      genre TEXT,
      quality INTEGER,
      updated_at INTEGER
    `,
  },
  {
    name: 'doc_summaries',
    columns: `
      page_id TEXT PRIMARY KEY,
      tldr TEXT,
      questions TEXT,
      generated_at INTEGER,
      signature TEXT
    `,
  },
  {
    name: 'muse_cards',
    columns: `
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      text TEXT NOT NULL,
      page_id TEXT,
      created_at INTEGER NOT NULL
    `,
    indexes: ['CREATE INDEX IF NOT EXISTS idx_muse_created ON muse_cards(created_at)'],
  },
]

/**
 * Create the note-scoped tables, rebuilding any that still point at `pages`.
 *
 * Idempotent and cheap on the common path: one `sqlite_master` lookup per
 * table, then `CREATE TABLE IF NOT EXISTS`.
 */
export function ensureSatelliteSchema(db: Database): void {
  for (const spec of TABLES) {
    if (referencesPages(db, spec.name)) rebuildWithoutForeignKey(db, spec)
    db.exec(`CREATE TABLE IF NOT EXISTS ${spec.name} (${spec.columns});`)
    for (const statement of spec.indexes ?? []) db.exec(`${statement};`)
  }
}

function referencesPages(db: Database, table: string): boolean {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as { sql?: string } | undefined
  return typeof row?.sql === 'string' && /REFERENCES\s+pages/i.test(row.sql)
}

/**
 * SQLite's table-rebuild dance, carrying the rows across.
 *
 * ★ `foreign_keys` is turned off around it and restored afterwards. With it
 * on, `DROP TABLE` fires the very cascades this rebuild exists to remove —
 * and the pragma is a no-op inside a transaction, so it has to be set outside
 * the one that does the work.
 */
function rebuildWithoutForeignKey(db: Database, spec: TableSpec): void {
  const wasOn = db.pragma('foreign_keys', { simple: true }) === 1
  db.pragma('foreign_keys = OFF')
  try {
    const temporary = `${spec.name}__rebuild`
    db.exec(`DROP TABLE IF EXISTS ${temporary};`)
    db.exec(`CREATE TABLE ${temporary} (${spec.columns});`)

    // Only the columns both tables have. A column that was dropped from the
    // spec must not abort the rebuild, and one that was added has no source
    // to copy from.
    const carried = columnsOf(db, spec.name).filter((column) =>
      columnsOf(db, temporary).includes(column),
    )
    const list = carried.join(', ')

    db.transaction(() => {
      if (carried.length > 0) {
        db.exec(`INSERT INTO ${temporary} (${list}) SELECT ${list} FROM ${spec.name};`)
      }
      db.exec(`DROP TABLE ${spec.name};`)
      db.exec(`ALTER TABLE ${temporary} RENAME TO ${spec.name};`)
    })()
  } finally {
    if (wasOn) db.pragma('foreign_keys = ON')
  }
}

function columnsOf(db: Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
    .map((column) => column.name)
}
