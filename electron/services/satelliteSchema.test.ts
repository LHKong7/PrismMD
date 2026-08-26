import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { ensureSatelliteSchema } from './satelliteSchema'

const open: Database.Database[] = []

function db(): Database.Database {
  const connection = new Database(':memory:')
  connection.pragma('foreign_keys = ON')
  open.push(connection)
  return connection
}

/** The shape these tables had before vault mode existed. */
function legacySchema(connection: Database.Database): void {
  connection.exec(`
    CREATE TABLE pages (id TEXT PRIMARY KEY, title TEXT);
    CREATE TABLE page_versions (
      id TEXT PRIMARY KEY, page_id TEXT NOT NULL, content TEXT NOT NULL,
      title TEXT, source TEXT, label TEXT, created_at INTEGER NOT NULL,
      FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
    );
    CREATE TABLE page_meta (
      page_id TEXT PRIMARY KEY, status TEXT, genre TEXT, quality INTEGER, updated_at INTEGER,
      FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
    );
    CREATE TABLE doc_summaries (
      page_id TEXT PRIMARY KEY, tldr TEXT, questions TEXT, generated_at INTEGER, signature TEXT,
      FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
    );
    CREATE TABLE muse_cards (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, text TEXT NOT NULL, page_id TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE SET NULL
    );
  `)
}

afterEach(() => {
  while (open.length) open.pop()!.close()
})

describe('ensureSatelliteSchema', () => {
  it('creates the tables in a database that has no pages table at all', () => {
    // ★ This is the vault case: `prism.db` never holds notes, so a schema
    // that needs `pages` to exist could not be created there in the first
    // place.
    const connection = db()
    ensureSatelliteSchema(connection)

    expect(() =>
      connection.prepare(
        'INSERT INTO page_versions (id, page_id, content, created_at) VALUES (?, ?, ?, ?)',
      ).run('v1', 'a-note-uuid', 'text', 1),
    ).not.toThrow()
  })

  it('accepts a note id that is not a row in pages', () => {
    // ★ The actual stage-5 bug. In vault mode a note's id lives in front
    // matter, and every one of these inserts was being rejected — so taking
    // a snapshot, classifying a note, or saving an AI summary silently did
    // nothing.
    const connection = db()
    legacySchema(connection)
    ensureSatelliteSchema(connection)

    connection.prepare(
      'INSERT INTO page_versions (id, page_id, content, created_at) VALUES (?, ?, ?, ?)',
    ).run('v1', 'vault-uuid', 'text', 1)
    connection.prepare(
      'INSERT INTO page_meta (page_id, status) VALUES (?, ?)',
    ).run('vault-uuid', 'draft')
    connection.prepare(
      'INSERT INTO doc_summaries (page_id, tldr) VALUES (?, ?)',
    ).run('vault-uuid', 'a summary')
    connection.prepare(
      'INSERT INTO muse_cards (id, kind, text, page_id, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('m1', 'quote', 'words', 'vault-uuid', 1)

    expect(
      connection.prepare('SELECT COUNT(*) AS n FROM page_versions').get(),
    ).toEqual({ n: 1 })
  })

  it('carries existing rows through the rebuild', () => {
    // ★ These are not derived tables. Rebuilding them the way the knowledge
    // index is rebuilt — drop and re-derive — would throw away every
    // snapshot the user ever took.
    const connection = db()
    legacySchema(connection)
    connection.prepare('INSERT INTO pages (id, title) VALUES (?, ?)').run('p1', 'Note')
    connection.prepare(
      'INSERT INTO page_versions (id, page_id, content, title, source, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run('v1', 'p1', 'old text', 'Note', 'manual', 'by hand', 42)
    connection.prepare(
      'INSERT INTO page_meta (page_id, status, genre, quality, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run('p1', 'done', 'tech', 5, 7)

    ensureSatelliteSchema(connection)

    expect(connection.prepare('SELECT * FROM page_versions').get()).toMatchObject({
      id: 'v1', page_id: 'p1', content: 'old text', label: 'by hand', created_at: 42,
    })
    expect(connection.prepare('SELECT * FROM page_meta').get()).toMatchObject({
      page_id: 'p1', status: 'done', genre: 'tech', quality: 5,
    })
  })

  it('leaves foreign keys enforced afterwards', () => {
    // The rebuild has to turn the pragma off; leaving it off would disable
    // every other constraint in the database for the rest of the session.
    const connection = db()
    legacySchema(connection)
    ensureSatelliteSchema(connection)
    expect(connection.pragma('foreign_keys', { simple: true })).toBe(1)
  })

  it('is idempotent, and does not rebuild a second time', () => {
    const connection = db()
    legacySchema(connection)
    ensureSatelliteSchema(connection)
    connection.prepare(
      'INSERT INTO page_versions (id, page_id, content, created_at) VALUES (?, ?, ?, ?)',
    ).run('v1', 'vault-uuid', 'text', 1)

    ensureSatelliteSchema(connection)
    ensureSatelliteSchema(connection)

    expect(connection.prepare('SELECT COUNT(*) AS n FROM page_versions').get()).toEqual({ n: 1 })
    expect(
      connection.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%__rebuild'").all(),
    ).toEqual([])
  })

  it('keeps the indexes the queries rely on', () => {
    const connection = db()
    ensureSatelliteSchema(connection)
    const names = (connection.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index'",
    ).all() as Array<{ name: string }>).map((row) => row.name)
    expect(names).toContain('idx_versions_page')
    expect(names).toContain('idx_muse_created')
  })
})
