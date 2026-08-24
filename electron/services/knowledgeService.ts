/**
 * Knowledge Service — binds the pure index engine in `electron/knowledge/`
 * to the app's real database, page store and window.
 *
 * Everything with interesting logic lives in the engine and is unit-tested
 * there; what is here is scheduling (when to index), plumbing (where the
 * pages come from) and notification (telling the renderer the graph moved).
 */
import { BrowserWindow } from 'electron'
import { getDb } from './workspaceDb'
import { getPage, updatePage } from './documentService'
import { normalizeTitle, rewriteWikiLinks } from '../knowledge/links'
import {
  buildRetrievalContext,
  getBacklinks,
  getKnowledgeStats,
  getNotesByTag,
  getOrphanNotes,
  getOutgoingLinks,
  getRelatedNotes,
  getUnresolvedLinks,
  indexPage,
  initKnowledge,
  listTags,
  removePageFromIndex,
  resetKnowledgeIndex,
  searchNotes,
  syncIndex,
  type IndexablePage,
  type RetrievalResult,
  type SearchOptions,
  type SyncReport,
} from '../knowledge/engine'

// ─── Page source ────────────────────────────────────────────────────────────

function rowToIndexable(row: Record<string, any>): IndexablePage {
  return {
    id: row.id,
    title: row.title ?? 'Untitled',
    content: row.content ?? '',
    format: row.format ?? 'md',
    updatedAt: row.updated_at ?? 0,
    isFolder: !!row.is_folder,
  }
}

/**
 * Every live, non-folder page. Read straight from SQLite rather than through
 * `documentService.getChildren` recursion: a flat scan of a few thousand rows
 * is one query, and the tree shape is irrelevant to the index.
 */
function allIndexablePages(): IndexablePage[] {
  const rows = getDb().prepare(
    'SELECT id, title, content, format, updated_at, is_folder FROM pages WHERE is_deleted = 0 AND is_folder = 0',
  ).all() as Record<string, any>[]
  return rows.map(rowToIndexable)
}

// ─── Change notification ────────────────────────────────────────────────────

/**
 * Told to the renderer whenever the index moved, so the knowledge panel can
 * refresh without polling.
 *
 * Goes through `BrowserWindow.getAllWindows()` rather than importing
 * `getMainWindow` from main.ts, which would close an import cycle
 * (main -> ipc -> this service -> main). Nothing to notify is not an error:
 * indexing also runs before the window exists and after it is gone.
 */
function notifyRenderer(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('knowledge:updated')
  }
}

// ─── Indexing ───────────────────────────────────────────────────────────────

/**
 * Pending re-index timers, keyed by page id.
 *
 * ★ PrismMD autosaves while you type. The engine's content hash already makes
 * an unchanged note cheap, but a *changing* note would still be re-chunked on
 * every autosave tick. Debouncing means the index settles a moment after you
 * stop typing, which is soon enough for a panel nobody is looking at mid-word.
 */
const pending = new Map<string, ReturnType<typeof setTimeout>>()
const INDEX_DEBOUNCE_MS = 1500

export function scheduleIndex(pageId: string, delayMs = INDEX_DEBOUNCE_MS): void {
  const existing = pending.get(pageId)
  if (existing) clearTimeout(existing)
  pending.set(
    pageId,
    setTimeout(() => {
      pending.delete(pageId)
      try {
        indexPageNow(pageId)
      } catch (err) {
        console.error('[knowledge] Failed to index page', pageId, err)
      }
    }, delayMs),
  )
}

/** Index one page immediately, cancelling any debounced run for it. */
export function indexPageNow(pageId: string): boolean {
  const timer = pending.get(pageId)
  if (timer) {
    clearTimeout(timer)
    pending.delete(pageId)
  }

  const page = getPage(pageId)
  if (!page) {
    removePageFromIndex(getDb(), pageId)
    notifyRenderer()
    return true
  }

  const changed = indexPage(getDb(), {
    id: page.id,
    title: page.title,
    content: page.content,
    format: page.format,
    updatedAt: page.updatedAt,
    isFolder: page.isFolder,
  })
  if (changed) notifyRenderer()
  return changed
}

export function forgetPage(pageId: string): void {
  const timer = pending.get(pageId)
  if (timer) {
    clearTimeout(timer)
    pending.delete(pageId)
  }
  removePageFromIndex(getDb(), pageId)
  notifyRenderer()
}

/** Flush every debounced index job. Call before the app quits. */
export function flushPendingIndexing(): void {
  const ids = [...pending.keys()]
  for (const id of ids) {
    try {
      indexPageNow(id)
    } catch {
      // A page that vanished mid-flush is not worth blocking shutdown over.
    }
  }
}

/**
 * Reconcile the index with the workspace. Run at startup so an index that
 * fell behind (a crash mid-write, an older app version, a restored backup)
 * repairs itself without the user knowing there was an index.
 */
export function syncWorkspaceIndex(options?: { force?: boolean }): SyncReport {
  const report = syncIndex(getDb(), allIndexablePages(), options)
  if (report.indexed > 0 || report.removed > 0) notifyRenderer()
  return report
}

/**
 * Throw the derived tables away and build them again from the notes.
 *
 * ★ Why this exists as more than a forced re-index: a forced re-index rewrites
 * the rows it knows about, and the failure mode this button is *for* is rows
 * it does not know about — an FTS entry orphaned by a crash between the two
 * writes in `clearPageRows`, which keeps matching a passage that no longer
 * exists. Nothing here is a source of truth, so dropping it costs only time.
 */
export function rebuildIndex(): SyncReport {
  const db = getDb()
  resetKnowledgeIndex(db)
  const report = syncIndex(db, allIndexablePages(), { force: true })
  notifyRenderer()
  return report
}

/** Called once at startup. Never throws: a broken index must not block launch. */
export function initKnowledgeIndex(): void {
  try {
    initKnowledge(getDb())
    const report = syncWorkspaceIndex()
    console.log(
      `[knowledge] index ready — ${report.indexed} indexed, ${report.skipped} unchanged, ${report.removed} removed`,
    )
  } catch (err) {
    console.error('[knowledge] Failed to initialize the note index:', err)
  }
}

// ─── Rename propagation ─────────────────────────────────────────────────────

export interface RenameReport {
  /** Notes whose text was rewritten. */
  updated: { pageId: string; title: string }[]
}

/**
 * Follow a note rename through every `[[link]]` that pointed at it.
 *
 * ★ A knowledge base that breaks all its own links when you rename a note
 * teaches you not to rename notes, which is the same as teaching you not to
 * improve them. The rewrite is done on the *source text* rather than by
 * remapping ids, so what is on disk stays the truth and stays readable in any
 * other markdown tool.
 */
export function propagateRename(pageId: string, oldTitle: string, newTitle: string): RenameReport {
  const db = getDb()
  initKnowledge(db)
  const report: RenameReport = { updated: [] }

  const fromNorm = normalizeTitle(oldTitle)
  if (!fromNorm || fromNorm === normalizeTitle(newTitle)) return report

  const sources = db.prepare(`
    SELECT DISTINCT l.source_page_id AS id
    FROM note_links l
    WHERE l.target_norm = ? AND l.source_page_id != ?
  `).all(fromNorm, pageId) as { id: string }[]

  for (const { id } of sources) {
    const page = getPage(id)
    if (!page) continue
    const rewritten = rewriteWikiLinks(page.content, oldTitle, newTitle)
    if (rewritten === page.content) continue
    updatePage(id, { content: rewritten })
    indexPageNow(id)
    report.updated.push({ pageId: id, title: page.title })
  }

  if (report.updated.length > 0) notifyRenderer()
  return report
}

// ─── Read paths ─────────────────────────────────────────────────────────────

export function search(query: string, options?: SearchOptions) {
  return searchNotes(getDb(), query, options)
}

/**
 * Ranked results in the shape the workspace search UI already speaks
 * (`PageSummary`), so the command palette and sidebar search get real ranking
 * without a rewrite. One row per note — a palette listing the same note three
 * times because three passages matched is worse than one that lists it once.
 */
export function searchPageSummaries(query: string, limit = 30) {
  const hits = searchNotes(getDb(), query, { limit: limit * 2, maxPerNote: 1 })
  const out: { id: string; title: string; icon: string | null; format: string; updatedAt: number; isFolder: false }[] = []
  const seen = new Set<string>()
  const read = getDb().prepare('SELECT id, title, icon, format, updated_at FROM pages WHERE id = ? AND is_deleted = 0')

  for (const hit of hits) {
    if (seen.has(hit.pageId)) continue
    const row = read.get(hit.pageId) as Record<string, any> | undefined
    if (!row) continue
    seen.add(hit.pageId)
    out.push({
      id: row.id,
      title: row.title,
      icon: row.icon ?? null,
      format: row.format,
      updatedAt: row.updated_at,
      isFolder: false,
    })
    if (out.length >= limit) break
  }
  return out
}

export function backlinks(pageId: string) {
  return getBacklinks(getDb(), pageId)
}

export function outgoing(pageId: string) {
  return getOutgoingLinks(getDb(), pageId)
}

export function related(pageId: string, limit?: number) {
  return getRelatedNotes(getDb(), pageId, limit)
}

export function unresolved(limit?: number) {
  return getUnresolvedLinks(getDb(), limit)
}

export function orphans(limit?: number) {
  return getOrphanNotes(getDb(), limit)
}

export function tags(limit?: number) {
  return listTags(getDb(), limit)
}

export function notesByTag(tag: string, limit?: number) {
  return getNotesByTag(getDb(), tag, limit)
}

export function stats() {
  return getKnowledgeStats(getDb())
}

/**
 * Everything the knowledge panel shows for one note, in a single IPC round
 * trip. Four separate calls would each re-open the same database and arrive
 * in an arbitrary order, making the panel flicker through partial states.
 */
export function noteContext(pageId: string) {
  const db = getDb()
  initKnowledge(db)
  return {
    backlinks: getBacklinks(db, pageId),
    outgoing: getOutgoingLinks(db, pageId),
    related: getRelatedNotes(db, pageId),
    tags: (db.prepare('SELECT tag FROM note_tags WHERE page_id = ? ORDER BY tag').all(pageId) as
      { tag: string }[]).map((t) => t.tag),
  }
}

export function retrieve(
  query: string,
  options?: { maxPassages?: number; contextPageId?: string },
): RetrievalResult {
  return buildRetrievalContext(getDb(), query, options)
}
