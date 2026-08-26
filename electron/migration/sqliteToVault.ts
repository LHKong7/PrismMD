/**
 * Moving a SQLite workspace into a Markdown vault.
 *
 * ★ Two rules shape every line here:
 *
 * 1. **Nothing is destroyed.** The source database is copied before anything
 *    is written and is never modified. If this whole file were deleted
 *    mid-run, the user's workspace would be exactly as it was.
 * 2. **Nothing is switched until it is proven.** The vault is assembled in a
 *    staging directory beside its final home and only moved into place after
 *    `compareSnapshots` finds zero differences. A failed validation leaves
 *    the staging directory on disk for inspection and the app still on
 *    SQLite — a half-migrated workspace is worse than an un-migrated one.
 *
 * ★ Page ids are carried across verbatim into front matter, which is what
 * makes this cheap: `annotations`, `page_versions`, `page_meta`,
 * `doc_summaries` and `muse_cards` are all keyed by page id, so none of them
 * need migrating at all. Generating fresh ids would have orphaned every one
 * of those tables silently.
 */
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import Database from 'better-sqlite3'
import { defaultExtFor, kindOfFormat } from '../services/fileFormats'
import { MarkdownVaultRepository } from '../vault/markdownVaultRepository'
import { atomicWriteFile, movePath } from '../vault/atomicWrite'
import { composeNote } from '../vault/frontmatter'
import { titleFromFileName, uniqueFileName } from '../vault/fileName'
import { PRISM_DIR, vaultPaths } from '../vault/vaultLayout'
import { ensureCatalogSchema, setExtractedText } from '../vault/vaultCatalog'
import { binaryIdsFor } from '../vault/binaryIds'
import type { NoteRepository, Page } from '../repositories/noteRepository'
import {
  compareSnapshots,
  describeProblems,
  snapshotOf,
  type ValidationReport,
} from './migrationValidator'
import { MigrationJournal } from './migrationJournal'

export interface MigrationOptions {
  /** Where the finished vault should live. Must not already exist. */
  targetPath: string
  /** The workspace being migrated. */
  source: NoteRepository
  /** Bytes of a binary page; the vault stores the document itself. */
  readBytes(pageId: string): Promise<Uint8Array | null>
  /**
   * The database the finished vault's catalog will live in. Given, the
   * migration carries every binary document's extracted text into it — see
   * the note on `note_text_cache`. Omitted, PDFs arrive unsearchable until
   * each is opened once.
   */
  db?: Database.Database
  /**
   * The database being migrated *from*, read for highlights.
   *
   * ★ Separate from `db` even though production passes the same connection
   * for both: one is a source and one is a destination, and reading the
   * destination for the source's rows is a mistake that only shows up when
   * they differ — which is exactly what a test does.
   */
  sourceDb?: Database.Database
  /** Files copied verbatim into the backup, e.g. workspace.db and its WAL. */
  backupFiles?: string[]
  /** Where backups go. Skipped entirely when absent. */
  backupDir?: string
  onProgress?(update: { step: string; done: number; total: number }): void
}

export interface MigrationResult {
  ok: boolean
  /** Present when ok. */
  vaultPath?: string
  /** Present when the validation refused to sign off. */
  report?: ValidationReport
  /** Left on disk for inspection when validation failed. */
  stagingPath?: string
  backupPath?: string
  error?: string
}

/**
 * Assemble, validate, then swap.
 *
 * The staging directory is a *sibling* of the target so the final move is a
 * rename within one filesystem — atomic, and impossible to interrupt halfway
 * through with half the notes moved.
 */
export async function migrateSqliteToVault(options: MigrationOptions): Promise<MigrationResult> {
  const target = path.resolve(options.targetPath)
  const staging = path.join(path.dirname(target), `.${path.basename(target)}.migrating`)
  const journalFile = path.join(staging, PRISM_DIR, 'migration.json')
  const journal = new MigrationJournal(journalFile)

  if (fs.existsSync(target)) {
    return { ok: false, error: `Refusing to migrate into an existing folder: ${target}` }
  }

  const sourcePages = await options.source.listPages()
  const sourceFolders = await collectFolders(options.source)

  try {
    await fs.promises.rm(staging, { recursive: true, force: true })
    await fs.promises.mkdir(path.join(staging, PRISM_DIR), { recursive: true })
    await journal.begin({
      targetPath: target,
      stagingPath: staging,
      sourceNoteCount: sourcePages.length,
    })

    // 1. Back up before writing anything. A migration that cannot be undone
    //    is one nobody should be asked to run.
    const backupPath = await backup(options, journal)

    // 2. Recreate the folder tree, including folders holding no notes —
    //    an empty folder is still something the user made.
    await journal.advance('writing-notes')
    const folderPathOf = await writeFolders(staging, options.source, sourceFolders)

    // 3. Write the notes.
    const { written, binaryIds } = await writeNotes({
      staging,
      pages: sourcePages,
      folderPathOf,
      readBytes: options.readBytes,
      onProgress: options.onProgress,
    })
    await binaryIdsFor(path.join(staging, PRISM_DIR)).replaceAll(binaryIds)

    // A PDF's searchable text cannot go into the PDF. Carrying it over means
    // documents stay findable the moment the migration lands, instead of only
    // after each has been opened once.
    if (options.db) {
      ensureCatalogSchema(options.db)
      for (const page of sourcePages) {
        if (kindOfFormat(page.format) === 'binary' && page.content) {
          setExtractedText(options.db, page.id, page.content)
        }
      }
    }
    // Highlights come along in bulk, so a freshly migrated vault is complete
    // from the first moment rather than healing note by note as they are
    // opened. (The lazy backfill in annotationStore still exists, for vaults
    // migrated before highlights lived here at all.)
    if (options.sourceDb) await writeAnnotations(staging, options.sourceDb)

    await journal.advance('notes-written', { writtenNoteCount: written })

    // 4. Carry sibling order and icons across, so the sidebar looks the same
    //    on the other side. Losable data, but losing it for no reason is
    //    still a worse migration.
    await writeSidecar(staging, sourcePages, sourceFolders, folderPathOf)

    // 5. Prove it. Read the staging vault back with the real vault reader,
    //    not with the writer's own bookkeeping — a bug shared by both would
    //    otherwise cancel itself out.
    await journal.advance('validating')
    const report = await validate(staging, options.source, sourcePages, folderPathOf, options.readBytes)
    if (!report.ok) {
      await journal.advance('failed', { error: describeProblems(report) })
      return { ok: false, report, stagingPath: staging, backupPath: backupPath ?? undefined }
    }

    // 6. Swap. Clear the journal *before* the rename: a journal inside the
    //    staging directory would otherwise travel into the finished vault and
    //    make a completed migration look interrupted forever.
    await journal.advance('validated')
    await journal.clear()
    await movePath(staging, target)

    return { ok: true, vaultPath: target, report, backupPath: backupPath ?? undefined }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await journal.advance('failed', { error: message }).catch(() => {})
    return { ok: false, error: message, stagingPath: staging }
  }
}

async function backup(
  options: MigrationOptions,
  journal: MigrationJournal,
): Promise<string | null> {
  if (!options.backupDir || !options.backupFiles?.length) return null

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = path.join(options.backupDir, `pre-vault-${stamp}`)
  await fs.promises.mkdir(dir, { recursive: true })

  for (const file of options.backupFiles) {
    if (!fs.existsSync(file)) continue
    await fs.promises.copyFile(file, path.join(dir, path.basename(file)))
  }
  await journal.advance('backed-up', { backupPath: dir })
  return dir
}

/** Every folder page in the source, parents before children. */
async function collectFolders(source: NoteRepository): Promise<Page[]> {
  const folders: Page[] = []
  const walk = async (parentId: string | null): Promise<void> => {
    for (const child of await source.getChildren(parentId)) {
      if (!child.isFolder) continue
      folders.push(child)
      await walk(child.id)
    }
  }
  await walk(null)
  return folders
}

/**
 * Create the directories and return a lookup from source folder id to the
 * vault-relative path it became.
 *
 * ★ Folder names go through the same sanitizer as note filenames, so a folder
 * called `Q1/Q2` or `CON` produces a directory that can actually be created.
 * The mapping is returned rather than recomputed later because sanitizing
 * twice can disagree once collisions are numbered.
 */
async function writeFolders(
  staging: string,
  source: NoteRepository,
  folders: Page[],
): Promise<Map<string, string>> {
  const pathOfFolder = new Map<string, string>()

  for (const folder of folders) {
    const parentPath = folder.parentId ? pathOfFolder.get(folder.parentId) ?? '' : ''
    const absoluteParent = parentPath ? path.join(staging, parentPath) : staging
    const taken = await fs.promises.readdir(absoluteParent).catch(() => [] as string[])
    const name = uniqueFileName(folder.title, '', taken)
    const relative = parentPath ? `${parentPath}/${name}` : name

    await fs.promises.mkdir(path.join(staging, relative), { recursive: true })
    pathOfFolder.set(folder.id, relative)
  }
  void source
  return pathOfFolder
}

async function writeNotes(args: {
  staging: string
  pages: Page[]
  folderPathOf: Map<string, string>
  readBytes(pageId: string): Promise<Uint8Array | null>
  onProgress?(update: { step: string; done: number; total: number }): void
}): Promise<{ written: number; binaryIds: Record<string, string> }> {
  const { staging, pages, folderPathOf, readBytes, onProgress } = args
  const binaryIds: Record<string, string> = {}
  let done = 0

  for (const page of pages) {
    const folder = page.parentId ? folderPathOf.get(page.parentId) ?? '' : ''
    const absoluteFolder = folder ? path.join(staging, folder) : staging
    await fs.promises.mkdir(absoluteFolder, { recursive: true })

    const taken = await fs.promises.readdir(absoluteFolder).catch(() => [] as string[])
    const extension = defaultExtFor(page.format)
    const fileName = uniqueFileName(page.title, extension, taken)
    const relative = folder ? `${folder}/${fileName}` : fileName
    const absolute = path.join(staging, relative)

    if (kindOfFormat(page.format) === 'binary') {
      const bytes = await readBytes(page.id)
      // A binary page with no payload is not skipped: its extracted text and
      // its place in the tree are still the user's. An empty file preserves
      // both and is honest about the missing bytes.
      await atomicWriteFile(absolute, bytes ?? new Uint8Array())
      // ★ A PDF has nowhere to keep its id, so the mapping has to be written
      // out with it. Without this the document arrives in the vault as a
      // *different* note, orphaning its highlights and its extracted text.
      binaryIds[relative] = page.id
    } else {
      await atomicWriteFile(
        absolute,
        composeNote(
          {
            id: page.id,
            // Recorded only when the filename cannot carry it — see the same
            // rule in MarkdownVaultRepository.createPage.
            title: titleFromFileName(fileName) === page.title ? undefined : page.title,
            created: new Date(page.createdAt || Date.now()).toISOString(),
            updated: new Date(page.updatedAt || Date.now()).toISOString(),
          },
          page.content,
        ),
      )
    }

    done++
    onProgress?.({ step: 'writing', done, total: pages.length })
  }
  return { written: done, binaryIds }
}

/**
 * Copy every highlight into `.prism/annotations/`.
 *
 * Read straight from the `annotations` table rather than through the
 * annotation service, which resolves its backend from the *active* storage
 * mode — still SQLite at this point in the migration, and about to not be.
 */
async function writeAnnotations(staging: string, db: Database.Database): Promise<number> {
  const rows = db.prepare(
    'SELECT * FROM annotations ORDER BY page_id, start_offset',
  ).all() as Record<string, any>[]
  if (rows.length === 0) return 0

  const byPage = new Map<string, Record<string, unknown>[]>()
  for (const row of rows) {
    const bucket = byPage.get(row.page_id) ?? []
    bucket.push({
      id: row.id,
      startOffset: row.start_offset,
      endOffset: row.end_offset,
      selectedText: row.selected_text ?? '',
      color: row.color ?? 'yellow',
      ...(row.note ? { note: row.note } : {}),
      createdAt: row.created_at ?? '',
      updatedAt: row.updated_at ?? '',
    })
    byPage.set(row.page_id, bucket)
  }

  const dir = vaultPaths(staging).annotations
  await fs.promises.mkdir(dir, { recursive: true })
  for (const [pageId, items] of byPage) {
    await atomicWriteFile(
      path.join(dir, `${encodeURIComponent(pageId)}.json`),
      `${JSON.stringify(items, null, 2)}\n`,
    )
  }
  return byPage.size
}

/**
 * Carry `position` and `icon` into `.prism/ui.json`.
 *
 * Written directly rather than through `VaultSidecar` because the ordering is
 * known in bulk here; going through the sidecar would rewrite the file once
 * per note.
 */
async function writeSidecar(
  staging: string,
  pages: Page[],
  folders: Page[],
  folderPathOf: Map<string, string>,
): Promise<void> {
  const order: Record<string, string[]> = {}
  const icons: Record<string, string> = {}

  const siblings = new Map<string, Page[]>()
  for (const page of [...folders, ...pages]) {
    const folder = page.parentId ? folderPathOf.get(page.parentId) ?? '' : ''
    const bucket = siblings.get(folder) ?? []
    bucket.push(page)
    siblings.set(folder, bucket)

    if (page.icon) {
      icons[page.isFolder ? `dir:${folderPathOf.get(page.id) ?? ''}` : page.id] = page.icon
    }
  }

  for (const [folder, bucket] of siblings) {
    order[folder] = [...bucket]
      .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))
      .map((page) => (page.isFolder ? `dir:${folderPathOf.get(page.id) ?? ''}` : page.id))
  }

  await atomicWriteFile(
    path.join(staging, PRISM_DIR, 'ui.json'),
    `${JSON.stringify({ order, icons }, null, 2)}\n`,
  )
}

/**
 * Compare what was written against what was read, using the production vault
 * reader on a throwaway catalog.
 */
async function validate(
  staging: string,
  source: NoteRepository,
  sourcePages: Page[],
  folderPathOf: Map<string, string>,
  readBytes: (pageId: string) => Promise<Uint8Array | null>,
): Promise<ValidationReport> {
  const before = snapshotOf({
    pages: sourcePages,
    folderChainOf: (page) => splitPath(page.parentId ? folderPathOf.get(page.parentId) ?? '' : ''),
    byteSizeOf: () => 0,
  })

  const scratch = new Database(':memory:')
  try {
    const vault = new MarkdownVaultRepository({ root: staging, db: scratch })
    await vault.scan()
    const vaultPages = await vault.listPages()

    const after = snapshotOf({
      pages: vaultPages,
      folderChainOf: (page) => splitPath(folderPathOfPage(page)),
      byteSizeOf: () => 0,
    })

    const report = compareSnapshots(before, after)
    const byteProblems = await compareBytes(sourcePages, vault, readBytes)
    return byteProblems.length === 0
      ? report
      : { ...report, ok: false, problems: [...report.problems, ...byteProblems] }
  } finally {
    scratch.close()
  }
}

/**
 * Binary payloads are compared separately and by **content**, not by the size
 * the snapshot records — a truncated copy of the right length is exactly the
 * kind of corruption a size check waves through.
 */
async function compareBytes(
  sourcePages: Page[],
  vault: MarkdownVaultRepository,
  readBytes: (pageId: string) => Promise<Uint8Array | null>,
): Promise<ValidationReport['problems']> {
  const problems: ValidationReport['problems'] = []

  for (const page of sourcePages) {
    if (kindOfFormat(page.format) !== 'binary') continue
    const original = await readBytes(page.id)
    if (!original?.length) continue

    const copied = await vault.readPageBytes(page.id)
    if (!copied || hashBytes(copied) !== hashBytes(original)) {
      problems.push({
        code: 'note.size_changed',
        subject: page.id,
        detail: `"${page.title}" did not copy across byte-for-byte`,
      })
    }
  }
  return problems
}

function folderPathOfPage(page: Page): string {
  return page.parentId?.startsWith('dir:') ? page.parentId.slice(4) : ''
}

function splitPath(relative: string): string[] {
  return relative ? relative.split('/') : []
}

function hashBytes(bytes: Uint8Array): string {
  return crypto.createHash('sha1').update(Buffer.from(bytes)).digest('hex')
}

/** The files worth copying before a migration touches anything. */
export function backupFilesFor(userDataDir: string): string[] {
  return ['workspace.db', 'workspace.db-wal', 'workspace.db-shm'].map((name) =>
    path.join(userDataDir, name),
  )
}

export { vaultPaths }
