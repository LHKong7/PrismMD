/**
 * Page version history — SQLite, keyed by page ID.
 *
 * A `page_versions` row is a full content snapshot of a page at a point in
 * time, tagged with its source (manual / round-table / restore). Used by the
 * 档案柜 / Archive so AI rewrites can be reviewed and rolled back. Pruned to the
 * most recent MAX_PER_PAGE snapshots per page.
 */
import * as crypto from 'crypto'
import { getDb } from './workspaceDb'

export interface VersionMeta {
  id: string
  pageId: string
  title: string | null
  source: string
  label: string | null
  createdAt: number
  /** Character length of the snapshot (content not loaded in lists). */
  length: number
}

export interface VersionFull extends VersionMeta {
  content: string
}

export interface VersionSaveOpts {
  title?: string | null
  source?: string
  label?: string | null
}

const MAX_PER_PAGE = 50

export function saveVersion(pageId: string, content: string, opts: VersionSaveOpts = {}): VersionMeta {
  const db = getDb()
  const id = crypto.randomUUID()
  const createdAt = Date.now()
  const title = opts.title ?? null
  const source = opts.source ?? 'manual'
  const label = opts.label ?? null

  db.prepare(
    'INSERT INTO page_versions (id, page_id, content, title, source, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, pageId, content, title, source, label, createdAt)

  // Prune oldest beyond the cap.
  const ids = db
    .prepare('SELECT id FROM page_versions WHERE page_id = ? ORDER BY created_at DESC')
    .all(pageId) as Array<{ id: string }>
  if (ids.length > MAX_PER_PAGE) {
    const del = db.prepare('DELETE FROM page_versions WHERE id = ?')
    for (const row of ids.slice(MAX_PER_PAGE)) del.run(row.id)
  }

  return { id, pageId, title, source, label, createdAt, length: content.length }
}

export function listVersions(pageId: string): VersionMeta[] {
  const db = getDb()
  const rows = db
    .prepare(
      'SELECT id, page_id, title, source, label, created_at, LENGTH(content) AS length FROM page_versions WHERE page_id = ? ORDER BY created_at DESC',
    )
    .all(pageId) as Array<{
    id: string
    page_id: string
    title: string | null
    source: string | null
    label: string | null
    created_at: number
    length: number
  }>
  return rows.map((r) => ({
    id: r.id,
    pageId: r.page_id,
    title: r.title,
    source: r.source ?? 'manual',
    label: r.label,
    createdAt: r.created_at,
    length: r.length,
  }))
}

export function getVersion(versionId: string): VersionFull | null {
  const db = getDb()
  const r = db.prepare('SELECT * FROM page_versions WHERE id = ?').get(versionId) as
    | {
        id: string
        page_id: string
        content: string | null
        title: string | null
        source: string | null
        label: string | null
        created_at: number
      }
    | undefined
  if (!r) return null
  const content = r.content ?? ''
  return {
    id: r.id,
    pageId: r.page_id,
    title: r.title,
    source: r.source ?? 'manual',
    label: r.label,
    createdAt: r.created_at,
    length: content.length,
    content,
  }
}

export function deleteVersion(versionId: string): void {
  getDb().prepare('DELETE FROM page_versions WHERE id = ?').run(versionId)
}
