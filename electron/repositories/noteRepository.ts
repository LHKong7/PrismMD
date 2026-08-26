/**
 * `NoteRepository` — the one seam between "what a note is" and "where a note
 * is stored".
 *
 * ★ Why this exists: PrismMD keeps note text in a SQLite column, and the
 * plan is to move it into a folder of real Markdown files (see
 * `recordDocs/2026-08-25-vault-migration-plan.md`). Doing that as one change
 * means rewriting the IPC layer, the knowledge index and the storage format
 * in a single step, with no way to tell which of the three broke. This
 * interface is the step that makes it two changes instead: everything routes
 * through here first, behaviour unchanged, and only then does a second
 * implementation appear underneath.
 *
 * Two rules that the whole migration depends on:
 *
 * 1. **Every method is async, including the ones SQLite could answer
 *    synchronously.** A synchronous escape hatch would be used — by the
 *    quit-time flush, by the index loop — and those are precisely the call
 *    sites where switching to files later is most dangerous. Paying the
 *    `async` cost now means the file-backed implementation is a drop-in.
 *
 * 2. **An implementation never reads `app.getPath()`.** Its root is injected
 *    by the factory. That is what lets the vault implementation be tested
 *    against a temp directory with no Electron in the process — the same
 *    thing that makes `libraryService` testable today and `documentService`
 *    untestable.
 */
import type { Page, PageSummary, PageTreeNode } from '../services/documentService'

export type { Page, PageSummary, PageTreeNode }

export interface CreatePageInput {
  title?: string
  parentId?: string | null
  content?: string
  format?: string
}

export interface CreateFolderInput {
  title?: string
  parentId?: string | null
}

/**
 * A partial write. `title` is deliberately *absent*: renaming is
 * `renamePage`, not an update.
 *
 * ★ In a vault a title change is a file rename plus a rewrite of every
 * `[[link]]` pointing at the old title — a multi-file operation that can
 * fail halfway. Letting it arrive as one field among several in a generic
 * update would bury that; the IPC layer routes it explicitly instead.
 */
export interface PageUpdates {
  content?: string
  icon?: string | null
  format?: string
  parentId?: string | null
  position?: number
  isFolder?: boolean
}

/**
 * Editorial judgements a user makes about a note: how finished it is, what
 * kind of thing it is, how good they think it is.
 *
 * ★ On the repository rather than in a table of its own because it is user
 * intent, and the vault's rule is that user intent must survive a lost
 * database. Each backend puts it where that backend's truth lives — a column
 * in SQLite mode, front matter in a vault.
 */
export interface NoteMeta {
  status: string | null
  genre: string | null
  quality: number | null
}

export interface NoteMetaListItem extends NoteMeta {
  pageId: string
  /** Characters of note text, for sizing the book on the shelf. */
  length: number
  updatedAt: number
}

export const EMPTY_META: NoteMeta = { status: null, genre: null, quality: null }

/**
 * Merge a partial update over what is already there.
 *
 * ★ Shared by both backends rather than written twice, because the rule it
 * encodes is subtle enough to get wrong differently in each: `undefined`
 * means "the caller said nothing about this field" and `null` means "the
 * caller cleared it". Collapsing the two would make un-setting a genre
 * impossible in one backend and make every partial save wipe the other two
 * fields in the other.
 */
export function mergeMeta(existing: NoteMeta, partial: Partial<NoteMeta>): NoteMeta {
  const merged: NoteMeta = { ...existing }
  if (partial.status !== undefined) merged.status = partial.status
  if (partial.genre !== undefined) merged.genre = partial.genre
  if (partial.quality !== undefined) merged.quality = partial.quality
  return merged
}

export interface RenameResult {
  page: Page
  /**
   * Notes whose text was rewritten to follow the new title. Their stored
   * content no longer matches whatever an open editor tab is holding, so the
   * renderer has to refresh them.
   */
  relinked: { pageId: string; title: string }[]
}

export interface ImportedPage {
  page: Page
  /** Where it came from, for logging and for de-duplicating a re-import. */
  sourcePath: string
}

/**
 * The storage contract. Implementations: `SqliteNoteRepository` (today),
 * `MarkdownVaultRepository` (stage 2).
 */
export interface NoteRepository {
  /** Identifies the backing store in logs and in the settings UI. */
  readonly kind: 'sqlite' | 'vault'

  // ── Reads ──
  getPage(id: string): Promise<Page | null>
  /** Every live, non-folder page. The knowledge index's only source of text. */
  listPages(): Promise<Page[]>
  getTree(): Promise<PageTreeNode[]>
  getChildren(parentId: string | null): Promise<Page[]>
  getAncestors(id: string): Promise<PageSummary[]>
  countPages(): Promise<number>
  /**
   * Raw bytes of a binary document (PDF, spreadsheet), or null for a text
   * note. ★ Without this the PDF viewer would have to reach past the
   * repository to whatever store the bytes happen to live in today, which is
   * exactly the coupling the seam removes — and it would break the moment
   * that store changed.
   */
  readPageBytes(id: string): Promise<Uint8Array | null>

  /**
   * Substring fallback search. The ranked search lives in the knowledge
   * index; this is what answers a partial word the tokenizer cannot produce
   * a term for ("sched").
   */
  searchPages(query: string): Promise<PageSummary[]>

  // ── Writes ──
  createPage(input: CreatePageInput): Promise<Page>
  createFolder(input: CreateFolderInput): Promise<Page>
  updatePage(id: string, updates: PageUpdates): Promise<void>
  renamePage(id: string, title: string): Promise<RenameResult>
  movePage(id: string, parentId: string | null, position: number): Promise<void>
  deletePage(id: string): Promise<void>
  restorePage(id: string): Promise<void>

  // ── Editorial metadata ──
  getNoteMeta(id: string): Promise<NoteMeta | null>
  /**
   * Merge in the fields the caller provided. `undefined` leaves a field as it
   * was; `null` clears it deliberately. Returns the merged result.
   */
  setNoteMeta(id: string, partial: Partial<NoteMeta>): Promise<NoteMeta>
  listNoteMeta(): Promise<NoteMetaListItem[]>

  // ── Import / export ──
  importFile(filePath: string, parentId?: string | null): Promise<Page>
  importDroppedFile(fileName: string, data: Uint8Array, parentId?: string | null): Promise<Page>
  importFolder(folderPath: string, parentId?: string | null): Promise<Page[]>
  exportPage(id: string, targetPath: string): Promise<void>
  /** Suggested filename for the save dialog, matching the page's real format. */
  exportFileNameFor(page: Page): Promise<string>

  // ── Lifecycle ──
  /** Seed a first note so a brand-new workspace is not empty. Idempotent. */
  ensureWelcomePage(): Promise<void>
}
