/**
 * The knowledge index: everything that turns a pile of notes into something
 * you can ask questions of.
 *
 * Every function takes the `Database` as its first argument and touches no
 * Electron API, so the whole engine is testable against an in-memory SQLite
 * instance — see `engine.test.ts`. `services/knowledgeService.ts` is the thin
 * layer that binds it to the app's real database and page store.
 */
import crypto from 'crypto'
import type { Database } from 'better-sqlite3'
import { chunkMarkdown } from './chunk'
import { collapseLinks, extractTags, extractWikiLinks, normalizeTitle } from './links'
import { buildSnippet, reciprocalRankFusion } from './rank'
import { salientTerms, toIndexDocument, tokenize, toMatchQuery } from './tokenize'
import {
  dropKnowledgeSchema,
  ensureKnowledgeSchema,
  KNOWLEDGE_INDEX_VERSION,
  type SchemaCapabilities,
} from './schema'

/** Separator for a chunk's heading path, in storage and in display. */
export const HEADING_SEPARATOR = ' > '

// ─── Types ──────────────────────────────────────────────────────────────────

export interface IndexablePage {
  id: string
  title: string
  content: string
  format: string
  updatedAt: number
  isFolder: boolean
}

export interface SearchHit {
  pageId: string
  title: string
  chunkIndex: number
  headingPath: string[]
  snippet: string
  /** Character offset of the passage inside the note's content. */
  startOffset: number
  endOffset: number
  score: number
  /** Which signals matched: `body`, `title`, `tag`, `link`. */
  matchedOn: string[]
  updatedAt: number
}

export interface LinkRef {
  pageId: string
  title: string
  updatedAt: number
  /** How many times the link occurs in the source note. */
  occurrences: number
  /** The heading fragment the link pointed at, if any. */
  heading: string | null
  /** A passage of the linking note around the link, for preview. */
  context?: string
}

export interface OutgoingLinkRef extends LinkRef {
  /** The target as it was typed. */
  target: string
  /** False when no note with that title exists yet. */
  resolved: boolean
}

export interface UnresolvedLink {
  target: string
  normalized: string
  sources: { pageId: string; title: string }[]
}

export interface RelatedNote {
  pageId: string
  title: string
  updatedAt: number
  score: number
  /** Why this note is related: `link`, `backlink`, `tag`, `text`. */
  reasons: string[]
  sharedTags: string[]
}

export interface IndexStats {
  notes: number
  chunks: number
  links: number
  resolvedLinks: number
  unresolvedLinks: number
  tags: number
  orphans: number
  lastIndexedAt: number | null
  fullTextSearch: boolean
}

export interface SyncReport {
  indexed: number
  skipped: number
  removed: number
}

// ─── Capability cache ───────────────────────────────────────────────────────

const capabilities = new WeakMap<Database, SchemaCapabilities>()

/** Idempotent; safe to call from every entry point. */
export function initKnowledge(db: Database): SchemaCapabilities {
  const cached = capabilities.get(db)
  if (cached) return cached
  const caps = ensureKnowledgeSchema(db)
  capabilities.set(db, caps)
  return caps
}

/**
 * Drop every derived table and recreate the schema empty. The caller is
 * expected to follow with a full `syncIndex`.
 *
 * Clearing the capability cache is the part that is easy to forget and fatal
 * to skip: `initKnowledge` short-circuits on a cache hit, so without this the
 * tables would stay dropped and every subsequent query would throw.
 */
export function resetKnowledgeIndex(db: Database): SchemaCapabilities {
  dropKnowledgeSchema(db)
  capabilities.delete(db)
  return initKnowledge(db)
}

// ─── Indexing ───────────────────────────────────────────────────────────────

/**
 * Formats whose `content` column holds prose worth indexing. Binary pages
 * (pdf, xlsx) stay on the list because the renderer backfills their extracted
 * text into `content`; until it does, they simply chunk to nothing.
 */
const INDEXABLE_FORMATS = new Set(['md', 'markdown', 'txt', 'text', 'pdf', 'json', 'csv', 'xlsx'])

/**
 * Fingerprint of everything indexing depends on. Title and content are
 * separated by a byte that cannot occur in either, so moving text across the
 * boundary (title `a b` + body `c` vs title `a` + body `b c`) still changes
 * the hash and still triggers a re-index.
 */
function contentHash(title: string, content: string): string {
  return crypto.createHash('sha1').update(`${title}\u0000${content}`).digest('hex')
}

export function isIndexable(page: IndexablePage): boolean {
  if (page.isFolder) return false
  return INDEXABLE_FORMATS.has((page.format || 'md').toLowerCase())
}

/**
 * Bring one note's index rows in line with its current content. Returns
 * `false` when nothing changed.
 *
 * ★ The content-hash early return is not a micro-optimization: PrismMD
 * autosaves while you type, so without it every keystroke would re-chunk and
 * re-tokenize the entire note.
 */
export function indexPage(db: Database, page: IndexablePage, options?: { force?: boolean }): boolean {
  const caps = initKnowledge(db)

  if (!isIndexable(page)) {
    removePageFromIndex(db, page.id)
    return true
  }

  const hash = contentHash(page.title, page.content)
  const state = db.prepare(
    'SELECT content_hash, index_version FROM note_index_state WHERE page_id = ?',
  ).get(page.id) as { content_hash: string; index_version: number } | undefined

  if (
    !options?.force &&
    state &&
    state.content_hash === hash &&
    state.index_version === KNOWLEDGE_INDEX_VERSION
  ) {
    return false
  }

  const chunks = chunkMarkdown(page.content)
  const links = collapseLinks(extractWikiLinks(page.content))
  const tagCounts = new Map<string, number>()
  for (const { tag } of extractTags(page.content)) {
    tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
  }
  const selfTitle = normalizeTitle(page.title)

  const write = db.transaction(() => {
    clearPageRows(db, page.id, caps)

    const insertChunk = db.prepare(
      `INSERT INTO note_chunks (page_id, chunk_index, heading_path, text, start_offset, end_offset)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    const insertFts = caps.fts
      ? db.prepare('INSERT INTO note_chunks_fts (rowid, title, body) VALUES (?, ?, ?)')
      : null

    for (const chunk of chunks) {
      const info = insertChunk.run(
        page.id,
        chunk.index,
        chunk.headingPath.join(HEADING_SEPARATOR),
        chunk.text,
        chunk.start,
        chunk.end,
      )
      // The heading path is indexed with the body so "deployment rollback"
      // finds a passage that only says "we roll back by ..." under that heading.
      insertFts?.run(
        Number(info.lastInsertRowid),
        toIndexDocument(page.title),
        toIndexDocument(`${chunk.headingPath.join(' ')} ${chunk.text}`),
      )
    }

    db.prepare('INSERT OR REPLACE INTO note_titles (page_id, title, norm_title) VALUES (?, ?, ?)')
      .run(page.id, page.title, selfTitle)

    const insertLink = db.prepare(
      `INSERT OR REPLACE INTO note_links (source_page_id, target_norm, target_raw, heading, alias, occurrences)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    for (const link of links) {
      // A note linking to itself is a typo, not an edge.
      if (link.normalized === selfTitle) continue
      insertLink.run(page.id, link.normalized, link.target, link.heading, link.alias, link.occurrences)
    }

    const insertTag = db.prepare(
      'INSERT OR REPLACE INTO note_tags (page_id, tag, occurrences) VALUES (?, ?, ?)',
    )
    for (const [tag, count] of tagCounts) insertTag.run(page.id, tag, count)

    db.prepare(
      `INSERT OR REPLACE INTO note_index_state
         (page_id, content_hash, title, chunk_count, indexed_at, index_version)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(page.id, hash, page.title, chunks.length, Date.now(), KNOWLEDGE_INDEX_VERSION)
  })

  write()
  return true
}

export function removePageFromIndex(db: Database, pageId: string): void {
  const caps = initKnowledge(db)
  db.transaction(() => {
    clearPageRows(db, pageId, caps)
    db.prepare('DELETE FROM note_index_state WHERE page_id = ?').run(pageId)
  })()
}

function clearPageRows(db: Database, pageId: string, caps: SchemaCapabilities): void {
  if (caps.fts) {
    // FTS5 rows are keyed by the chunk rowid, so they have to go before the
    // chunks themselves — otherwise the ids to delete are already gone and
    // the index keeps matching passages that no longer exist.
    const rowids = db.prepare('SELECT id FROM note_chunks WHERE page_id = ?').all(pageId) as { id: number }[]
    const del = db.prepare('DELETE FROM note_chunks_fts WHERE rowid = ?')
    for (const { id } of rowids) del.run(id)
  }
  db.prepare('DELETE FROM note_chunks WHERE page_id = ?').run(pageId)
  db.prepare('DELETE FROM note_links WHERE source_page_id = ?').run(pageId)
  db.prepare('DELETE FROM note_tags WHERE page_id = ?').run(pageId)
  db.prepare('DELETE FROM note_titles WHERE page_id = ?').run(pageId)
}

/**
 * Reconcile the whole index against the workspace: index what changed, drop
 * what no longer exists. Cheap enough to run at startup because an unchanged
 * note costs one indexed lookup.
 */
export function syncIndex(db: Database, pages: IndexablePage[], options?: { force?: boolean }): SyncReport {
  initKnowledge(db)
  const report: SyncReport = { indexed: 0, skipped: 0, removed: 0 }

  const live = new Set<string>()
  for (const page of pages) {
    live.add(page.id)
    if (indexPage(db, page, options)) report.indexed++
    else report.skipped++
  }

  const known = db.prepare('SELECT page_id FROM note_index_state').all() as { page_id: string }[]
  for (const { page_id: id } of known) {
    if (live.has(id)) continue
    removePageFromIndex(db, id)
    report.removed++
  }

  return report
}

// ─── Search ─────────────────────────────────────────────────────────────────

interface ChunkRow {
  id: number
  page_id: string
  chunk_index: number
  heading_path: string
  text: string
  start_offset: number
  end_offset: number
  title: string
  updated_at: number
}

const CHUNK_SELECT = `
  SELECT c.id, c.page_id, c.chunk_index, c.heading_path, c.text,
         c.start_offset, c.end_offset, p.title, p.updated_at
  FROM note_chunks c
  JOIN pages p ON p.id = c.page_id AND p.is_deleted = 0
`

export interface SearchOptions {
  limit?: number
  /** Drop these notes from the results — usually the one you are reading. */
  excludePageIds?: string[]
  /**
   * Notes linked to or from this one are lifted in the ranking. Retrieval
   * that knows what you are looking at beats retrieval that does not.
   */
  contextPageId?: string
  /**
   * At most this many passages from any one note, so a single long note
   * cannot fill the whole result list. Defaults to 2.
   */
  maxPerNote?: number
}

export function searchNotes(db: Database, query: string, options?: SearchOptions): SearchHit[] {
  const caps = initKnowledge(db)
  const limit = options?.limit ?? 20
  const maxPerNote = options?.maxPerNote ?? 2
  const exclude = new Set(options?.excludePageIds ?? [])

  const meaningful = tokenize(query, { dropStopwords: true })
  const lookupTerms = meaningful.length > 0 ? meaningful : tokenize(query)
  if (lookupTerms.length === 0) return []

  const bodyRows = caps.fts ? ftsSearch(db, query, limit * 6) : likeSearch(db, lookupTerms, limit * 6)
  const titleRows = titleSearch(db, lookupTerms, limit * 2)
  const tagRows = tagSearch(db, lookupTerms, limit * 2)
  const linkRows = options?.contextPageId ? neighbourChunks(db, options.contextPageId, limit * 2) : []

  // Signal weights: a title match is the strongest evidence that a whole note
  // is *about* the query; link proximity only reorders things already
  // relevant, so it is deliberately the weakest.
  const fused = reciprocalRankFusion([
    { items: bodyRows.map(toFusable), weight: 1 },
    { items: titleRows.map(toFusable), weight: 1.6 },
    { items: tagRows.map(toFusable), weight: 1.2 },
    { items: linkRows.map(toFusable), weight: 0.5 },
  ])

  const signalNames = ['body', 'title', 'tag', 'link']
  const perNote = new Map<string, number>()
  const hits: SearchHit[] = []

  for (const { item, score, signals } of fused) {
    const row = item.row as ChunkRow
    if (exclude.has(row.page_id)) continue
    const used = perNote.get(row.page_id) ?? 0
    if (used >= maxPerNote) continue
    perNote.set(row.page_id, used + 1)

    hits.push({
      pageId: row.page_id,
      title: row.title,
      chunkIndex: row.chunk_index,
      headingPath: row.heading_path ? row.heading_path.split(HEADING_SEPARATOR) : [],
      snippet: buildSnippet(row.text, lookupTerms),
      startOffset: row.start_offset,
      endOffset: row.end_offset,
      score,
      matchedOn: [...new Set(signals.map((s) => signalNames[s]))],
      updatedAt: row.updated_at,
    })
    if (hits.length >= limit) break
  }

  return hits
}

function toFusable(row: ChunkRow): { id: string; row: ChunkRow } {
  return { id: String(row.id), row }
}

function ftsSearch(db: Database, query: string, limit: number): ChunkRow[] {
  const match = toMatchQuery(query)
  if (!match) return []
  try {
    // bm25's first weight is the `title` column: a passage from a note whose
    // title matches is worth more than one that merely mentions the words.
    return db.prepare(`
      ${CHUNK_SELECT}
      JOIN note_chunks_fts f ON f.rowid = c.id
      WHERE note_chunks_fts MATCH ?
      ORDER BY bm25(note_chunks_fts, 4.0, 1.0)
      LIMIT ?
    `).all(match, limit) as ChunkRow[]
  } catch {
    // A MATCH expression FTS5 refuses must not take search down with it; the
    // LIKE path returns worse results, not none.
    return likeSearch(db, tokenize(query, { dropStopwords: true }), limit)
  }
}

/**
 * The no-FTS5 path. Ranks by how many distinct query terms a passage
 * contains — crude, but it is the difference between degraded search and no
 * search at all.
 */
function likeSearch(db: Database, terms: string[], limit: number): ChunkRow[] {
  if (terms.length === 0) return []
  const capped = terms.slice(0, 8)
  const score = capped.map(() => 'CASE WHEN lower(c.text) LIKE ? THEN 1 ELSE 0 END').join(' + ')
  const where = capped.map(() => 'lower(c.text) LIKE ?').join(' OR ')
  const patterns = capped.map((t) => `%${t}%`)
  return db.prepare(`
    ${CHUNK_SELECT}
    WHERE ${where}
    ORDER BY (${score}) DESC, p.updated_at DESC
    LIMIT ?
  `).all(...patterns, ...patterns, limit) as ChunkRow[]
}

/** Notes whose *title* contains a query term, represented by their first chunk. */
function titleSearch(db: Database, terms: string[], limit: number): ChunkRow[] {
  const capped = terms.slice(0, 8)
  if (capped.length === 0) return []
  const where = capped.map(() => 'lower(p.title) LIKE ?').join(' OR ')
  return db.prepare(`
    ${CHUNK_SELECT}
    WHERE (${where}) AND c.chunk_index = 0
    ORDER BY p.updated_at DESC
    LIMIT ?
  `).all(...capped.map((t) => `%${t}%`), limit) as ChunkRow[]
}

/** Notes carrying a tag that matches a query term. */
function tagSearch(db: Database, terms: string[], limit: number): ChunkRow[] {
  const capped = terms.slice(0, 8)
  if (capped.length === 0) return []
  const placeholders = capped.map(() => '?').join(', ')
  return db.prepare(`
    ${CHUNK_SELECT}
    JOIN note_tags t ON t.page_id = c.page_id
    WHERE t.tag IN (${placeholders}) AND c.chunk_index = 0
    ORDER BY p.updated_at DESC
    LIMIT ?
  `).all(...capped, limit) as ChunkRow[]
}

/** First chunks of the notes one link-hop away from `pageId`, either direction. */
function neighbourChunks(db: Database, pageId: string, limit: number): ChunkRow[] {
  return db.prepare(`
    ${CHUNK_SELECT}
    WHERE c.chunk_index = 0 AND c.page_id IN (
      SELECT nt.page_id FROM note_links l
        JOIN note_titles nt ON nt.norm_title = l.target_norm
        WHERE l.source_page_id = ?
      UNION
      SELECT l.source_page_id FROM note_links l
        JOIN note_titles nt ON nt.norm_title = l.target_norm
        WHERE nt.page_id = ?
    )
    ORDER BY p.updated_at DESC
    LIMIT ?
  `).all(pageId, pageId, limit) as ChunkRow[]
}

// ─── Link graph ─────────────────────────────────────────────────────────────

/** Notes that link *to* this one — the reason a knowledge base beats a folder. */
export function getBacklinks(db: Database, pageId: string): LinkRef[] {
  initKnowledge(db)
  const rows = db.prepare(`
    SELECT l.source_page_id AS page_id, p.title, p.updated_at, l.occurrences, l.heading
    FROM note_links l
    JOIN note_titles nt ON nt.norm_title = l.target_norm
    JOIN pages p ON p.id = l.source_page_id AND p.is_deleted = 0
    WHERE nt.page_id = ?
    ORDER BY l.occurrences DESC, p.updated_at DESC
  `).all(pageId) as {
    page_id: string; title: string; updated_at: number; occurrences: number; heading: string | null
  }[]

  return rows.map((r) => ({
    pageId: r.page_id,
    title: r.title,
    updatedAt: r.updated_at,
    occurrences: r.occurrences,
    heading: r.heading,
    context: linkContext(db, r.page_id, pageId),
  }))
}

/** Notes this one links to, resolved ones first. */
export function getOutgoingLinks(db: Database, pageId: string): OutgoingLinkRef[] {
  initKnowledge(db)
  const rows = db.prepare(`
    SELECT l.target_norm, l.target_raw, l.heading, l.occurrences,
           tp.id AS target_page_id, tp.title AS target_title, tp.updated_at
    FROM note_links l
    LEFT JOIN note_titles nt ON nt.norm_title = l.target_norm
    LEFT JOIN pages tp ON tp.id = nt.page_id AND tp.is_deleted = 0
    WHERE l.source_page_id = ?
    ORDER BY (tp.id IS NULL), l.occurrences DESC, l.target_raw
  `).all(pageId) as Record<string, any>[]

  return rows.map((r) => ({
    pageId: r.target_page_id ?? '',
    title: r.target_title ?? r.target_raw,
    target: r.target_raw,
    updatedAt: r.updated_at ?? 0,
    occurrences: r.occurrences,
    heading: r.heading,
    resolved: Boolean(r.target_page_id),
  }))
}

/**
 * Links pointing at notes that do not exist yet.
 *
 * ★ These are not errors. They are the knowledge base telling you what you
 * meant to write down and have not — the difference between a broken link
 * and a reading list.
 */
export function getUnresolvedLinks(db: Database, limit = 100): UnresolvedLink[] {
  initKnowledge(db)
  const rows = db.prepare(`
    SELECT l.target_norm, l.target_raw, l.source_page_id, p.title AS source_title
    FROM note_links l
    JOIN pages p ON p.id = l.source_page_id AND p.is_deleted = 0
    LEFT JOIN note_titles nt ON nt.norm_title = l.target_norm
    LEFT JOIN pages tp ON tp.id = nt.page_id AND tp.is_deleted = 0
    WHERE tp.id IS NULL
    ORDER BY l.target_norm
  `).all() as Record<string, any>[]

  const byTarget = new Map<string, UnresolvedLink>()
  for (const row of rows) {
    let entry = byTarget.get(row.target_norm)
    if (!entry) {
      entry = { target: row.target_raw, normalized: row.target_norm, sources: [] }
      byTarget.set(row.target_norm, entry)
    }
    entry.sources.push({ pageId: row.source_page_id, title: row.source_title })
  }
  return [...byTarget.values()]
    .sort((a, b) => b.sources.length - a.sources.length || a.normalized.localeCompare(b.normalized))
    .slice(0, limit)
}

/** Indexed notes nothing links to and which link to nothing. */
export function getOrphanNotes(
  db: Database,
  limit = 50,
): { pageId: string; title: string; updatedAt: number }[] {
  initKnowledge(db)
  return db.prepare(`
    SELECT p.id AS pageId, p.title AS title, p.updated_at AS updatedAt
    FROM note_titles nt
    JOIN pages p ON p.id = nt.page_id AND p.is_deleted = 0
    WHERE NOT EXISTS (SELECT 1 FROM note_links l WHERE l.source_page_id = nt.page_id)
      AND NOT EXISTS (SELECT 1 FROM note_links l WHERE l.target_norm = nt.norm_title)
    ORDER BY p.updated_at DESC
    LIMIT ?
  `).all(limit) as { pageId: string; title: string; updatedAt: number }[]
}

/**
 * A passage of `sourceId` around its link to `targetId`, so a backlink can be
 * read without opening the note it lives in.
 */
function linkContext(db: Database, sourceId: string, targetId: string): string | undefined {
  const target = db.prepare('SELECT norm_title FROM note_titles WHERE page_id = ?').get(targetId) as
    | { norm_title: string }
    | undefined
  if (!target) return undefined

  const chunks = db.prepare(
    'SELECT text FROM note_chunks WHERE page_id = ? ORDER BY chunk_index',
  ).all(sourceId) as { text: string }[]

  for (const chunk of chunks) {
    const link = extractWikiLinks(chunk.text).find((l) => l.normalized === target.norm_title)
    if (!link) continue
    return buildSnippet(chunk.text, [chunk.text.slice(link.start, link.end).toLowerCase()], 200)
  }
  return undefined
}

// ─── Related notes ──────────────────────────────────────────────────────────

/**
 * "What else is about this?" — fused from four independent signals, so a note
 * surfaces whether you linked it, were linked from it, tagged it the same, or
 * merely wrote about the same thing in different words.
 */
export function getRelatedNotes(db: Database, pageId: string, limit = 8): RelatedNote[] {
  initKnowledge(db)

  const linked = db.prepare(`
    SELECT nt.page_id AS id, p.title, p.updated_at
    FROM note_links l
    JOIN note_titles nt ON nt.norm_title = l.target_norm
    JOIN pages p ON p.id = nt.page_id AND p.is_deleted = 0
    WHERE l.source_page_id = ? AND nt.page_id != ?
    ORDER BY l.occurrences DESC
  `).all(pageId, pageId) as Record<string, any>[]

  const backlinked = db.prepare(`
    SELECT l.source_page_id AS id, p.title, p.updated_at
    FROM note_links l
    JOIN note_titles nt ON nt.norm_title = l.target_norm
    JOIN pages p ON p.id = l.source_page_id AND p.is_deleted = 0
    WHERE nt.page_id = ? AND l.source_page_id != ?
    ORDER BY l.occurrences DESC
  `).all(pageId, pageId) as Record<string, any>[]

  const sharedTagRows = db.prepare(`
    SELECT other.page_id AS id, p.title, p.updated_at,
           GROUP_CONCAT(other.tag) AS tags, COUNT(*) AS shared
    FROM note_tags mine
    JOIN note_tags other ON other.tag = mine.tag AND other.page_id != mine.page_id
    JOIN pages p ON p.id = other.page_id AND p.is_deleted = 0
    WHERE mine.page_id = ?
    GROUP BY other.page_id
    ORDER BY shared DESC
  `).all(pageId) as Record<string, any>[]

  // "More like this": re-query the index with the note's own salient terms.
  const own = db.prepare(
    'SELECT text FROM note_chunks WHERE page_id = ? ORDER BY chunk_index LIMIT 8',
  ).all(pageId) as { text: string }[]
  const titleRow = db.prepare('SELECT title FROM pages WHERE id = ?').get(pageId) as
    | { title: string }
    | undefined
  const profile = `${titleRow?.title ?? ''} ${own.map((c) => c.text).join(' ')}`.trim()
  const similar = profile
    ? searchNotes(db, salientTerms(profile, 24).join(' '), {
        limit: limit * 3,
        excludePageIds: [pageId],
        maxPerNote: 1,
      }).map((h) => ({ id: h.pageId, title: h.title, updatedAt: h.updatedAt }))
    : []

  // One shape across all four lists so fusion can merge their payloads:
  // only the tag list carries `tags`, and the others must leave room for it.
  interface Candidate {
    id: string
    title: string
    updatedAt: number
    tags?: string
    [key: string]: unknown
  }
  const candidate = (r: Record<string, any>): Candidate => ({
    id: r.id,
    title: r.title,
    updatedAt: r.updated_at ?? r.updatedAt ?? 0,
    ...(r.tags ? { tags: String(r.tags) } : {}),
  })

  const fused = reciprocalRankFusion<Candidate>([
    { items: linked.map(candidate), weight: 2.5 },
    { items: backlinked.map(candidate), weight: 2.5 },
    { items: sharedTagRows.map(candidate), weight: 1.5 },
    { items: similar.map(candidate), weight: 1 },
  ])

  const reasonNames = ['link', 'backlink', 'tag', 'text']
  const myTags = new Set(
    (db.prepare('SELECT tag FROM note_tags WHERE page_id = ?').all(pageId) as { tag: string }[])
      .map((t) => t.tag),
  )

  return fused
    .filter((f) => f.item.id !== pageId)
    .slice(0, limit)
    .map((f) => ({
      pageId: f.item.id,
      title: String(f.item.title ?? ''),
      updatedAt: Number(f.item.updatedAt ?? 0),
      score: f.score,
      reasons: [...new Set(f.signals.map((s) => reasonNames[s]))],
      sharedTags: String(f.item.tags ?? '').split(',').filter((t) => t && myTags.has(t)),
    }))
}

// ─── Tags and stats ─────────────────────────────────────────────────────────

export function listTags(db: Database, limit = 200): { tag: string; notes: number }[] {
  initKnowledge(db)
  return db.prepare(`
    SELECT t.tag AS tag, COUNT(DISTINCT t.page_id) AS notes
    FROM note_tags t
    JOIN pages p ON p.id = t.page_id AND p.is_deleted = 0
    GROUP BY t.tag
    ORDER BY notes DESC, t.tag
    LIMIT ?
  `).all(limit) as { tag: string; notes: number }[]
}

/** Notes carrying a given tag. */
export function getNotesByTag(
  db: Database,
  tag: string,
  limit = 100,
): { pageId: string; title: string; updatedAt: number }[] {
  initKnowledge(db)
  return db.prepare(`
    SELECT p.id AS pageId, p.title AS title, p.updated_at AS updatedAt
    FROM note_tags t
    JOIN pages p ON p.id = t.page_id AND p.is_deleted = 0
    WHERE t.tag = ?
    ORDER BY p.updated_at DESC
    LIMIT ?
  `).all(tag.toLowerCase(), limit) as { pageId: string; title: string; updatedAt: number }[]
}

export function getKnowledgeStats(db: Database): IndexStats {
  const caps = initKnowledge(db)
  const one = <T>(sql: string): T => db.prepare(sql).get() as T

  const { notes } = one<{ notes: number }>('SELECT COUNT(*) AS notes FROM note_index_state')
  const { chunks } = one<{ chunks: number }>('SELECT COUNT(*) AS chunks FROM note_chunks')
  const { links } = one<{ links: number }>('SELECT COUNT(*) AS links FROM note_links')
  const { resolved } = one<{ resolved: number }>(`
    SELECT COUNT(*) AS resolved FROM note_links l
    JOIN note_titles nt ON nt.norm_title = l.target_norm
    JOIN pages p ON p.id = nt.page_id AND p.is_deleted = 0
  `)
  const { tags } = one<{ tags: number }>('SELECT COUNT(DISTINCT tag) AS tags FROM note_tags')
  const { last } = one<{ last: number | null }>('SELECT MAX(indexed_at) AS last FROM note_index_state')

  return {
    notes,
    chunks,
    links,
    resolvedLinks: resolved,
    unresolvedLinks: links - resolved,
    tags,
    orphans: getOrphanNotes(db, 1000).length,
    lastIndexedAt: last ?? null,
    fullTextSearch: caps.fts,
  }
}

// ─── Retrieval for the assistant ────────────────────────────────────────────

export interface RetrievalCitation {
  index: number
  pageId: string
  title: string
  headingPath: string[]
  text: string
  startOffset: number
}

export interface RetrievalResult {
  /** Ready to paste into a prompt, or `''` when nothing matched. */
  context: string
  citations: RetrievalCitation[]
}

/**
 * Retrieve passages for a question and render them as numbered references.
 *
 * ★ The numbering is a contract with the UI: the model is told to cite `[n]`,
 * and `citations[n - 1]` carries the page id that marker resolves to. That is
 * what makes an answer *checkable* rather than merely plausible — without it
 * the assistant is just a confident stranger talking about your notes.
 */
export function buildRetrievalContext(
  db: Database,
  query: string,
  options?: {
    maxPassages?: number
    maxCharsPerPassage?: number
    contextPageId?: string
    excludePageIds?: string[]
  },
): RetrievalResult {
  const maxPassages = options?.maxPassages ?? 6
  const maxChars = options?.maxCharsPerPassage ?? 700

  const hits = searchNotes(db, query, {
    limit: maxPassages,
    contextPageId: options?.contextPageId,
    excludePageIds: options?.excludePageIds,
    maxPerNote: 2,
  })
  if (hits.length === 0) return { context: '', citations: [] }

  const citations: RetrievalCitation[] = []
  const blocks: string[] = []
  const readChunk = db.prepare('SELECT text FROM note_chunks WHERE page_id = ? AND chunk_index = ?')

  hits.forEach((hit, i) => {
    const full = readChunk.get(hit.pageId, hit.chunkIndex) as { text: string } | undefined
    const text = (full?.text ?? hit.snippet).slice(0, maxChars)
    const where = hit.headingPath.length ? ` ${HEADING_SEPARATOR}${hit.headingPath.join(HEADING_SEPARATOR)}` : ''

    citations.push({
      index: i + 1,
      pageId: hit.pageId,
      title: hit.title,
      headingPath: hit.headingPath,
      text,
      startOffset: hit.startOffset,
    })
    blocks.push(`[${i + 1}] ${hit.title}${where}\n${text}`)
  })

  return { context: blocks.join('\n\n---\n\n'), citations }
}
