/**
 * The storage backend PrismMD ships today: note text in a SQLite column.
 *
 * This is a thin adapter over `documentService`, which is left untouched on
 * purpose — the point of stage 1 is that nothing about the current behaviour
 * changes, so the only honest way to write it is as a wrapper with no logic
 * of its own. The one exception is `renamePage`, which gathers a sequence
 * that used to be spread across the IPC handler and the knowledge service;
 * see the comment on it.
 */
import { getDb } from '../services/workspaceDb'
import { indexDb } from '../services/indexDatabase'
import { extractWikiLinks, normalizeTitle, rewriteWikiLinks } from '../knowledge/links'
import * as documents from '../services/documentService'
import { readAssetBytes } from '../services/assetService'
import { EMPTY_META, mergeMeta } from './noteRepository'
import type {
  CreateFolderInput,
  CreatePageInput,
  NoteMeta,
  NoteMetaListItem,
  NoteRepository,
  Page,
  PageSummary,
  PageTreeNode,
  PageUpdates,
  RenameResult,
} from './noteRepository'

export class SqliteNoteRepository implements NoteRepository {
  readonly kind = 'sqlite' as const

  // ── Reads ──

  async getPage(id: string): Promise<Page | null> {
    return documents.getPage(id)
  }

  async listPages(): Promise<Page[]> {
    // Read the flat table rather than walking the tree: the index does not
    // care about hierarchy, and a recursive walk is one query per level.
    const rows = getDb().prepare(
      `SELECT id, title, content, format, parent_id, position, created_at, updated_at,
              is_deleted, icon, is_folder
       FROM pages WHERE is_deleted = 0 AND is_folder = 0`,
    ).all() as Record<string, any>[]

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      content: row.content,
      format: row.format,
      parentId: row.parent_id ?? null,
      position: row.position,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isDeleted: !!row.is_deleted,
      icon: row.icon ?? null,
      isFolder: !!row.is_folder,
    }))
  }

  async getTree(): Promise<PageTreeNode[]> {
    return documents.getPageTree()
  }

  async getChildren(parentId: string | null): Promise<Page[]> {
    return documents.getChildren(parentId)
  }

  async getAncestors(id: string): Promise<PageSummary[]> {
    return documents.getAncestors(id)
  }

  async countPages(): Promise<number> {
    return documents.getPageCount()
  }

  async readPageBytes(id: string): Promise<Uint8Array | null> {
    const bytes = readAssetBytes(id)
    return bytes ? new Uint8Array(bytes) : null
  }

  async searchPages(query: string): Promise<PageSummary[]> {
    return documents.searchPages(query)
  }

  // ── Writes ──

  async createPage(input: CreatePageInput): Promise<Page> {
    return documents.createPage(
      input.title ?? 'Untitled',
      input.parentId ?? null,
      input.content ?? '',
      input.format ?? 'md',
      false,
    )
  }

  async createFolder(input: CreateFolderInput): Promise<Page> {
    return documents.createPage(input.title ?? 'New Folder', input.parentId ?? null, '', 'md', true)
  }

  async updatePage(id: string, updates: PageUpdates): Promise<void> {
    documents.updatePage(id, updates)
  }

  /**
   * Change a note's title and follow that change through every `[[link]]`
   * that pointed at the old one.
   *
   * ★ Both halves live here rather than in the caller because they are one
   * operation, not two: between "title changed" and "links rewritten" the
   * workspace is inconsistent, and in the vault implementation that window is
   * a multi-file write that needs a journal to survive a crash. Splitting it
   * across layers would put half of an atomic operation in an IPC handler.
   *
   * The link sources have to be collected *before* the title changes — after
   * it, there is nothing left for those links to match against.
   *
   * ★ Sources come from a scan of the notes themselves, not from the link
   * index, even though the index already holds exactly this relation. The
   * index is written on a 1.5s debounce, so a link typed a moment ago is not
   * in it yet — and "I linked it, then renamed it, and the link broke" is a
   * bug nobody would think to attribute to an index delay. A rename is rare
   * and user-initiated; a scan is the affordable correct answer.
   */
  async renamePage(id: string, title: string): Promise<RenameResult> {
    const before = documents.getPage(id)
    if (!before) throw new Error(`Page not found: ${id}`)

    const oldTitle = before.title
    const relinked: { pageId: string; title: string }[] = []

    if (normalizeTitle(oldTitle) === normalizeTitle(title)) {
      // Same note, different capitalization or spacing: rename it, but there
      // is nothing to rewrite — every existing link still resolves.
      documents.updatePage(id, { title })
      return { page: (await this.getPage(id))!, relinked }
    }

    const sources = this.findLinkSources(normalizeTitle(oldTitle), id)
    documents.updatePage(id, { title })

    for (const source of sources) {
      const rewritten = rewriteWikiLinks(source.content, oldTitle, title)
      if (rewritten === source.content) continue
      documents.updatePage(source.id, { content: rewritten })
      relinked.push({ pageId: source.id, title: source.title })
    }

    return { page: (await this.getPage(id))!, relinked }
  }

  /**
   * Notes containing a `[[link]]` that resolves to `normalizedTitle`.
   *
   * The `LIKE '%[[%'` prefilter is what keeps this affordable: it hands the
   * row filtering to SQLite and leaves only the plausible notes to parse.
   */
  private findLinkSources(
    normalizedTitle: string,
    excludePageId: string,
  ): { id: string; title: string; content: string }[] {
    const rows = getDb().prepare(
      `SELECT id, title, content FROM pages
       WHERE is_deleted = 0 AND is_folder = 0 AND id != ? AND content LIKE '%[[%'`,
    ).all(excludePageId) as { id: string; title: string; content: string }[]

    return rows.filter((row) =>
      extractWikiLinks(row.content).some((link) => link.normalized === normalizedTitle),
    )
  }

  async movePage(id: string, parentId: string | null, position: number): Promise<void> {
    documents.movePage(id, parentId, position)
  }

  async deletePage(id: string): Promise<void> {
    documents.deletePage(id)
  }

  async restorePage(id: string): Promise<void> {
    documents.restorePage(id)
  }

  // ── Editorial metadata ──

  async getNoteMeta(id: string): Promise<NoteMeta | null> {
    const row = indexDb()
      .prepare('SELECT status, genre, quality FROM page_meta WHERE page_id = ?')
      .get(id) as NoteMeta | undefined
    if (!row) return null
    return { status: row.status ?? null, genre: row.genre ?? null, quality: row.quality ?? null }
  }

  async setNoteMeta(id: string, partial: Partial<NoteMeta>): Promise<NoteMeta> {
    const merged = mergeMeta((await this.getNoteMeta(id)) ?? EMPTY_META, partial)
    // A page that was deleted under us is a no-op rather than an error: the
    // renderer fires this without awaiting, so a rejection would surface as
    // an unhandled promise instead of anything the user can act on.
    if (!getDb().prepare('SELECT 1 FROM pages WHERE id = ?').get(id)) return merged
    indexDb().prepare(
      `INSERT INTO page_meta (page_id, status, genre, quality, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(page_id) DO UPDATE SET
         status = excluded.status, genre = excluded.genre,
         quality = excluded.quality, updated_at = excluded.updated_at`,
    ).run(id, merged.status, merged.genre, merged.quality, Date.now())
    return merged
  }

  async listNoteMeta(): Promise<NoteMetaListItem[]> {
    // Two databases in vault mode, one here — so the join is done in JS
    // rather than in SQL. The row counts are workspace-sized, and a query
    // that only works when both tables happen to share a connection is a
    // trap for whoever moves them apart next.
    const meta = new Map(
      (indexDb().prepare('SELECT page_id, status, genre, quality FROM page_meta').all() as Array<
        { page_id: string } & NoteMeta
      >).map((row) => [row.page_id, row]),
    )
    const rows = getDb().prepare(
      `SELECT id, LENGTH(content) AS length, updated_at
       FROM pages WHERE is_deleted = 0 AND is_folder = 0`,
    ).all() as Array<{ id: string; length: number | null; updated_at: number | null }>

    return rows.map((row) => {
      const found = meta.get(row.id)
      return {
        pageId: row.id,
        status: found?.status ?? null,
        genre: found?.genre ?? null,
        quality: found?.quality ?? null,
        length: row.length ?? 0,
        updatedAt: row.updated_at ?? 0,
      }
    })
  }

  // ── Import / export ──

  async importFile(filePath: string, parentId?: string | null): Promise<Page> {
    return documents.importFile(filePath, parentId)
  }

  async importDroppedFile(fileName: string, data: Uint8Array, parentId?: string | null): Promise<Page> {
    return documents.importDroppedFile(fileName, data, parentId)
  }

  async importFolder(folderPath: string, parentId?: string | null): Promise<Page[]> {
    return documents.importFolder(folderPath, parentId)
  }

  async exportPage(id: string, targetPath: string): Promise<void> {
    documents.exportPageToFile(id, targetPath)
  }

  async exportFileNameFor(page: Page): Promise<string> {
    return documents.exportFileNameFor(page)
  }

  // ── Lifecycle ──

  async ensureWelcomePage(): Promise<void> {
    documents.ensureWelcomePage()
  }
}
