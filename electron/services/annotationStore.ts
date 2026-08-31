/**
 * Annotation storage, following whichever store holds the notes.
 *
 * In SQLite mode highlights live in the `annotations` table, keyed by page id.
 * In vault mode they live in `.prism/annotations/<pageId>.json`, so backing
 * up the vault folder backs up the highlights too — which is what anyone
 * looking at a folder full of their notes would assume.
 *
 * ★ The move is **lazy, on first read**, not a migration step. A vault that
 * was migrated before this existed still has its highlights in the database;
 * the first time such a note is opened, they are copied into the sidecar and
 * served from there afterwards. That means there is no version of the app in
 * which someone's highlights are stranded waiting for a migration they have
 * to remember to run.
 *
 * The database rows are left in place rather than deleted. They cost nothing,
 * and they are the only copy if a user ever switches back.
 */
import * as fs from 'fs'
import { getDb } from './workspaceDb'
import { getNoteRepository } from '../repositories/repositoryFactory'
import { getStorageSettings } from './settingsStore'
import { annotationsFor, type StoredAnnotation } from '../vault/vaultAnnotations'
import { vaultPaths } from '../vault/vaultLayout'

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

function toStored(annotation: Annotation): StoredAnnotation {
  const { filePath: _pageId, ...rest } = annotation
  return rest
}

function toAnnotation(stored: StoredAnnotation, pageId: string): Annotation {
  return { ...stored, filePath: pageId }
}

/** The sidecar store, or null when the notes are not in a vault. */
function sidecar() {
  if (getNoteRepository().kind !== 'vault') return null
  const { vaultPath } = getStorageSettings()
  if (!vaultPath || !fs.existsSync(vaultPath)) return null
  return annotationsFor(vaultPaths(vaultPath).annotations)
}

// ─── Database side ──────────────────────────────────────────────────────────

function loadFromDb(pageId: string): Annotation[] {
  const rows = getDb().prepare(
    'SELECT * FROM annotations WHERE page_id = ? ORDER BY start_offset ASC',
  ).all(pageId) as any[]
  return rows.map(rowToAnnotation)
}

function saveToDb(pageId: string, annotations: Annotation[]): void {
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

// ─── Public API ─────────────────────────────────────────────────────────────

export async function loadAnnotations(pageId: string): Promise<Annotation[]> {
  const store = sidecar()
  if (!store) return loadFromDb(pageId)

  const stored = await store.load(pageId)
  if (stored) return stored.map((item) => toAnnotation(item, pageId))

  // No sidecar yet. Highlights made before the vault existed are still in the
  // database — carry them over now so this note is whole from here on.
  const legacy = loadFromDb(pageId)
  if (legacy.length > 0) await store.save(pageId, legacy.map(toStored))
  return legacy
}

/**
 * Replace all annotations for a page. The renderer always saves the full
 * array, so both backends replace rather than merge.
 */
export async function saveAnnotations(pageId: string, annotations: Annotation[]): Promise<void> {
  const store = sidecar()
  if (!store) {
    saveToDb(pageId, annotations)
    return
  }
  await store.save(pageId, annotations.map(toStored))
}
