/**
 * Knowledge-index schema.
 *
 * Lives alongside the workspace tables in `workspace.db` rather than in a
 * database of its own: every query here joins `pages`, and a cross-database
 * join is a join you have to write by hand in application code.
 *
 * ★ The index is *derived* state — everything in these tables can be rebuilt
 * from `pages` alone. That is deliberate: it means a schema change, a bad
 * migration or a corrupt FTS table is recoverable by dropping and re-syncing,
 * and it means the index can never be the reason a note is lost.
 */
import type { Database } from 'better-sqlite3'

/** Bumped whenever the derived shape changes; a mismatch forces a full re-index. */
export const KNOWLEDGE_INDEX_VERSION = 2

export interface SchemaCapabilities {
  /**
   * Whether FTS5 is compiled into this SQLite build. It always is in
   * better-sqlite3, but a hard failure here would take the whole app down,
   * so search degrades to a LIKE scan instead (see `engine.ts`).
   */
  fts: boolean
}

export function ensureKnowledgeSchema(db: Database): SchemaCapabilities {
  // ★ Indexes built before vault mode declared foreign keys into `pages`.
  // Those constraints reject every insert once notes live in files, and
  // SQLite cannot drop a constraint — so the tables are rebuilt. Safe by the
  // same property as everything else here: the index is derived, so throwing
  // it away costs a re-scan and nothing else.
  if (hasLegacyPageConstraints(db)) dropKnowledgeSchema(db)

  db.exec(`
    -- One row per indexed passage. The offsets point into pages.content so a
    -- hit can scroll the reader to the passage, not just open the note.
    CREATE TABLE IF NOT EXISTS note_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      heading_path TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL,
      start_offset INTEGER NOT NULL DEFAULT 0,
      end_offset INTEGER NOT NULL DEFAULT 0
    );

    -- Normalized title of every indexed note. Link resolution joins against
    -- this instead of storing a target page id, so a link written before its
    -- target exists resolves the moment the target is created — and a rename
    -- re-resolves on the next index pass rather than dangling.
    CREATE TABLE IF NOT EXISTS note_titles (
      page_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      norm_title TEXT NOT NULL
    );

    -- One row per (source note, distinct link target).
    CREATE TABLE IF NOT EXISTS note_links (
      source_page_id TEXT NOT NULL,
      target_norm TEXT NOT NULL,
      target_raw TEXT NOT NULL,
      heading TEXT,
      alias TEXT,
      occurrences INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (source_page_id, target_norm)
    );

    CREATE TABLE IF NOT EXISTS note_tags (
      page_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      occurrences INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (page_id, tag)
    );

    -- What the index believes about each page. content_hash is what makes
    -- re-indexing incremental: a save that did not change the text is free.
    CREATE TABLE IF NOT EXISTS note_index_state (
      page_id TEXT PRIMARY KEY,
      content_hash TEXT NOT NULL,
      title TEXT NOT NULL,
      chunk_count INTEGER NOT NULL DEFAULT 0,
      -- The note's own mtime. Held here rather than read from the pages
      -- table, which in vault mode holds nothing (a vault created from
      -- scratch) or a frozen pre-migration archive (a migrated one).
      updated_at INTEGER NOT NULL DEFAULT 0,
      indexed_at INTEGER NOT NULL,
      index_version INTEGER NOT NULL DEFAULT ${KNOWLEDGE_INDEX_VERSION}
    );

    CREATE INDEX IF NOT EXISTS idx_note_chunks_page ON note_chunks(page_id);
    CREATE INDEX IF NOT EXISTS idx_note_titles_norm ON note_titles(norm_title);
    CREATE INDEX IF NOT EXISTS idx_note_links_target ON note_links(target_norm);
    CREATE INDEX IF NOT EXISTS idx_note_links_source ON note_links(source_page_id);
    CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag);
  `)

  // `CREATE TABLE IF NOT EXISTS` never adds a column to a table that already
  // exists, so an index built by an older build needs the column backfilled.
  const stateColumns = db.prepare('PRAGMA table_info(note_index_state)').all() as { name: string }[]
  if (stateColumns.length > 0 && !stateColumns.some((c) => c.name === 'updated_at')) {
    db.exec('ALTER TABLE note_index_state ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0')
  }

  let fts = true
  try {
    // `body` holds the pre-tokenized document from tokenize.ts, so unicode61
    // only has to split on the spaces we inserted. `title` is a separate
    // column so a title match can be ranked above a body match.
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS note_chunks_fts
      USING fts5(title, body, tokenize='unicode61 remove_diacritics 2');
    `)
  } catch {
    // No FTS5 in this SQLite build — engine.ts falls back to a LIKE scan.
    fts = false
  }

  return { fts }
}

/**
 * Whether the tables on disk still reference `pages`.
 *
 * Read from `sqlite_master` rather than tracked by a version number: a
 * version bump re-populates rows, it does not reshape a table, and this needs
 * the reshape.
 */
function hasLegacyPageConstraints(db: Database): boolean {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'note_index_state'",
  ).get() as { sql?: string } | undefined
  return typeof row?.sql === 'string' && /REFERENCES\s+pages/i.test(row.sql)
}

/**
 * Drop every derived table. Safe by construction: nothing here is a source
 * of truth, so a rebuild loses nothing but time.
 */
export function dropKnowledgeSchema(db: Database): void {
  db.exec(`
    DROP TABLE IF EXISTS note_chunks_fts;
    DROP TABLE IF EXISTS note_chunks;
    DROP TABLE IF EXISTS note_links;
    DROP TABLE IF EXISTS note_tags;
    DROP TABLE IF EXISTS note_titles;
    DROP TABLE IF EXISTS note_index_state;
  `)
}
