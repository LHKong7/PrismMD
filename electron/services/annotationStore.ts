/**
 * Annotation storage — SQLite, keyed by page ID.
 *
 * Annotations live in the `annotations` table of the workspace DB with a
 * foreign key to `pages` (ON DELETE CASCADE), so deleting a page removes
 * its annotations automatically. The legacy `filePath` field on the
 * Annotation shape now carries the page ID for renderer compatibility.
 */
import { getDb } from './workspaceDb'

interface Annotation {
  id: string
  filePath: string // page ID (legacy field name)
  startOffset: number
  endOffset: number
  selectedText: string
  color: string
  note?: string
  createdAt: string
  updatedAt: string
}

function rowToAnnotation(row: any): Annotation {
  return {
    id: row.id,
    filePath: row.page_id,
    startOffset: row.start_offset,
    endOffset: row.end_offset,
    selectedText: row.selected_text ?? '',
    color: row.color ?? 'yellow',
    ...(row.note ? { note: row.note } : {}),
    createdAt: row.created_at ?? '',
    updatedAt: row.updated_at ?? '',
  }
}

export async function loadAnnotations(pageId: string): Promise<Annotation[]> {
  const db = getDb()
  const rows = db.prepare(
    'SELECT * FROM annotations WHERE page_id = ? ORDER BY start_offset ASC',
  ).all(pageId) as any[]
  return rows.map(rowToAnnotation)
}

/**
 * Replace all annotations for a page with the provided set. The renderer
 * always saves the full array, so we delete + re-insert in a transaction.
 */
export async function saveAnnotations(pageId: string, annotations: Annotation[]): Promise<void> {
  const db = getDb()
  const replace = db.transaction((items: Annotation[]) => {
    db.prepare('DELETE FROM annotations WHERE page_id = ?').run(pageId)
    const insert = db.prepare(`
      INSERT INTO annotations
        (id, page_id, start_offset, end_offset, selected_text, color, note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const a of items) {
      insert.run(
        a.id,
        pageId,
        a.startOffset,
        a.endOffset,
        a.selectedText,
        a.color,
        a.note ?? null,
        a.createdAt,
        a.updatedAt,
      )
    }
  })
  replace(annotations)
}
