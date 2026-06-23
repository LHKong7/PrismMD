/**
 * Per-page editorial metadata — status / genre / quality — backing the
 * "book-skin" taxonomy on the shelves. Stored in `page_meta` (keyed by page
 * id, FK to pages ON DELETE CASCADE). `listPageMeta` joins `pages` so the
 * shelf can size each book by content length in one round-trip.
 */
import { getDb } from './workspaceDb'

export type PageStatus = 'draft' | 'done' | 'revise' | 'hot'
export type PageGenre = 'tech' | 'biz' | 'essay' | 'note'

export interface PageMeta {
  status: string | null
  genre: string | null
  quality: number | null
}

export interface PageMetaListItem {
  pageId: string
  status: string | null
  genre: string | null
  quality: number | null
  length: number
  updatedAt: number
}

export function getPageMeta(pageId: string): PageMeta | null {
  const db = getDb()
  const r = db.prepare('SELECT status, genre, quality FROM page_meta WHERE page_id = ?').get(pageId) as
    | { status: string | null; genre: string | null; quality: number | null }
    | undefined
  if (!r) return null
  return { status: r.status ?? null, genre: r.genre ?? null, quality: r.quality ?? null }
}

export function setPageMeta(pageId: string, partial: Partial<PageMeta>): PageMeta {
  const db = getDb()
  const existing = getPageMeta(pageId) ?? { status: null, genre: null, quality: null }
  // The FK (foreign_keys = ON) would throw if the page was deleted under us;
  // no-op gracefully so the fire-and-forget renderer call never rejects.
  const exists = db.prepare('SELECT 1 FROM pages WHERE id = ?').get(pageId)
  if (!exists) return existing
  // Only override fields the caller actually provided — an `undefined` field
  // must leave the existing value untouched (a `null` clears it intentionally).
  const merged: PageMeta = { ...existing }
  if (partial.status !== undefined) merged.status = partial.status
  if (partial.genre !== undefined) merged.genre = partial.genre
  if (partial.quality !== undefined) merged.quality = partial.quality
  db.prepare(
    `INSERT INTO page_meta (page_id, status, genre, quality, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(page_id) DO UPDATE SET
       status = excluded.status, genre = excluded.genre, quality = excluded.quality, updated_at = excluded.updated_at`,
  ).run(pageId, merged.status, merged.genre, merged.quality, Date.now())
  return merged
}

export function listPageMeta(): PageMetaListItem[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT p.id AS page_id, m.status AS status, m.genre AS genre, m.quality AS quality,
              LENGTH(p.content) AS length, p.updated_at AS updated_at
       FROM pages p LEFT JOIN page_meta m ON m.page_id = p.id
       WHERE p.is_deleted = 0 AND p.is_folder = 0`,
    )
    .all() as Array<{
    page_id: string
    status: string | null
    genre: string | null
    quality: number | null
    length: number | null
    updated_at: number | null
  }>
  return rows.map((r) => ({
    pageId: r.page_id,
    status: r.status ?? null,
    genre: r.genre ?? null,
    quality: r.quality ?? null,
    length: r.length ?? 0,
    updatedAt: r.updated_at ?? 0,
  }))
}
