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
 * makes the rest cheap: `annotations`, `page_versions`, `page_meta`,
 * `doc_summaries` and `muse_cards` are all keyed by page id, so each one is a
 * copy rather than a remapping. Generating fresh ids would have orphaned
 * every one of them silently.
 *
 * They are still copied, and that is a change from when the vault's database
 * lived in `userData` and they simply stayed put. Three of them land
 * somewhere new: highlights and snapshots become files in the vault, and
 * editorial metadata becomes front matter — because the vault's database is
 * declared disposable, and none of those three could survive being disposed.
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
import { versionsFor } from '../vault/vaultVersions'
import { ensureSatelliteSchema } from '../services/satelliteSchema'
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
   * The database being migrated *from*: highlights, snapshots, editorial
   * metadata, AI summaries and muse cards are all read out of it.
   *
   * ★ There is deliberately no destination parameter. The finished vault's
   * database is `<vault>/.prism/prism.db`, which this function creates inside
   * the staging directory and closes before the swap — so a caller cannot
   * hand it the wrong one, and cannot hold an open handle across the rename.
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

    // 3. Write the notes, folding `page_meta` into their front matter.
    const editorialMeta = readEditorialMeta(options.sourceDb)
    const { written, binaryIds } = await writeNotes({
      staging,
      pages: sourcePages,
      folderPathOf,
      readBytes: options.readBytes,
      metaOf: (pageId) => editorialMeta.get(pageId),
      onProgress: options.onProgress,
    })
    await binaryIdsFor(path.join(staging, PRISM_DIR)).replaceAll(binaryIds)

    // Everything else that is keyed by a note id. All of it comes across in
    // bulk, so a freshly migrated vault is complete from its first moment
    // rather than healing note by note as they are opened.
    await carryNoteScopedData(staging, sourcePages, options.sourceDb)

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
  /** Editorial metadata from `page_meta`, which becomes front matter. */
  metaOf?(pageId: string): { status?: string; genre?: string; quality?: string } | undefined
  onProgress?(update: { step: string; done: number; total: number }): void
}): Promise<{ written: number; binaryIds: Record<string, string> }> {
  const { staging, pages, folderPathOf, readBytes, metaOf, onProgress } = args
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
            // ★ `page_meta` has no destination table any more: in a vault
            // these three are front matter. Dropping them here would lose a
            // judgement the user made about every note they had classified.
            ...(metaOf?.(page.id) ?? {}),
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
 * Editorial metadata, read as strings because that is what front matter is.
 *
 * Returns an empty map when there is no source database or no such table —
 * an older workspace that never had one must still migrate.
 */
function readEditorialMeta(
  db?: Database.Database,
): Map<string, { status?: string; genre?: string; quality?: string }> {
  const out = new Map<string, { status?: string; genre?: string; quality?: string }>()
  if (!db) return out
  let rows: Array<{ page_id: string; status: string | null; genre: string | null; quality: number | null }>
  try {
    rows = db.prepare('SELECT page_id, status, genre, quality FROM page_meta').all() as typeof rows
  } catch {
    return out
  }
  for (const row of rows) {
    const fields: { status?: string; genre?: string; quality?: string } = {}
    if (row.status) fields.status = row.status
    if (row.genre) fields.genre = row.genre
    if (row.quality !== null && row.quality !== undefined) fields.quality = String(row.quality)
    if (Object.keys(fields).length > 0) out.set(row.page_id, fields)
  }
  return out
}

/**
 * Bring across everything keyed by a note id that is not the note.
 *
 * ★ This exists because of where the vault's database now lives. While it sat
 * in `userData`, all of these tables simply stayed where they were and kept
 * working — page ids are carried across verbatim, so nothing was orphaned.
 * Moving the derived database into the vault turns that inheritance into a
 * loss: the new database starts empty, and a migration that did not copy
 * would silently drop every snapshot, summary and highlight.
 *
 * Two of them stop being database rows on the way over. Snapshots and
 * highlights are things the user made, so they become files in the vault;
 * only the genuinely derived caches land in `prism.db`.
 *
 * The connection is closed before returning: the staging directory is about
 * to be renamed, and an open handle inside it fails that rename on Windows.
 */
async function carryNoteScopedData(
  staging: string,
  pages: Page[],
  sourceDb?: Database.Database,
): Promise<void> {
  await writeVersions(staging, sourceDb)
  if (sourceDb) await writeAnnotations(staging, sourceDb)

  const index = new Database(path.join(staging, PRISM_DIR, 'prism.db'))
  try {
    index.pragma('journal_mode = WAL')
    ensureCatalogSchema(index)
    ensureSatelliteSchema(index)

    // A PDF's searchable text cannot go into the PDF. Carrying it over means
    // documents stay findable the moment the migration lands, instead of only
    // after each has been opened once.
    for (const page of pages) {
      if (kindOfFormat(page.format) === 'binary' && page.content) {
        setExtractedText(index, page.id, page.content)
      }
    }
    copyRows(sourceDb, index, 'doc_summaries')
    copyRows(sourceDb, index, 'muse_cards')
  } finally {
    index.close()
  }
}

/**
 * Copy one table wholesale, matching on column name.
 *
 * Only used for tables that are pure caches on both sides, so a source that
 * cannot be read is a warning rather than a failed migration.
 */
function copyRows(from: Database.Database | undefined, to: Database.Database, table: string): void {
  if (!from) return
  let rows: Record<string, unknown>[]
  try {
    rows = from.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]
  } catch {
    return
  }
  if (rows.length === 0) return

  const target = new Set(
    (to.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name),
  )
  const columns = Object.keys(rows[0]).filter((column) => target.has(column))
  if (columns.length === 0) return

  const insert = to.prepare(
    `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((c) => `@${c}`).join(', ')})`,
  )
  to.transaction(() => {
    for (const row of rows) {
      insert.run(Object.fromEntries(columns.map((column) => [column, row[column]])))
    }
  })()
}

/**
 * Snapshot history into `.prism/versions/`.
 *
 * ★ Files, not rows, for the same reason highlights are: a snapshot is the
 * only copy of what a note used to say, and the vault's database is declared
 * disposable. Writing it into `prism.db` would mean "Rebuild index" could
 * cost a user their history.
 */
async function writeVersions(staging: string, db?: Database.Database): Promise<number> {
  if (!db) return 0
  let rows: Array<{
    id: string
    page_id: string
    content: string | null
    title: string | null
    source: string | null
    label: string | null
    created_at: number
  }>
  try {
    rows = db.prepare('SELECT * FROM page_versions ORDER BY created_at').all() as typeof rows
  } catch {
    return 0
  }
  if (rows.length === 0) return 0

  const versions = versionsFor(vaultPaths(staging).versions)
  for (const row of rows) {
    await versions.save({
      id: row.id,
      pageId: row.page_id,
      title: row.title,
      source: row.source ?? 'manual',
      label: row.label,
      createdAt: row.created_at,
      content: row.content ?? '',
    })
  }
  return rows.length
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
