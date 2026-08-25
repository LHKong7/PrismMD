/**
 * `NoteRepository` over a folder of Markdown files.
 *
 * ★ The rule everything here answers to: **the files are the only content
 * truth**. Nothing in SQLite may be the sole copy of anything a user wrote;
 * the catalog is a cache that a full scan can rebuild, and the sidecar holds
 * only what a directory cannot express (order, icons) and is explicitly
 * losable. If this class and the vault ever disagree, the vault wins.
 *
 * Identity is a UUID in front matter, never the path. A note moved in Finder,
 * renamed in Obsidian, or reorganised by a git merge is still the same note —
 * with its backlinks, its annotations and its history intact. A path-based id
 * would turn every one of those into a delete plus a create.
 *
 * Takes its root by injection and imports no Electron API, so the whole class
 * is testable against a temp directory — the same contract the SQLite backend
 * passes, run against files.
 */
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import type { Database } from 'better-sqlite3'
import { detectFormat, defaultExtFor, isSupported, kindOfFormat } from '../services/fileFormats'
import { extractWikiLinks, normalizeTitle, rewriteWikiLinks } from '../knowledge/links'
import type {
  CreateFolderInput,
  CreatePageInput,
  NoteRepository,
  Page,
  PageSummary,
  PageTreeNode,
  PageUpdates,
  RenameResult,
} from '../repositories/noteRepository'
import { atomicWriteFile, isTempFile, movePath, sweepTempFiles } from './atomicWrite'
import { composeNote, parseNote, setFrontmatter } from './frontmatter'
import { sanitizeStem, titleFromFileName, uniqueFileName } from './fileName'
import {
  clearCatalog,
  ensureCatalogSchema,
  getEntry,
  getEntryByPath,
  getTrash,
  listEntries,
  listTrash,
  recordTrash,
  removeEntry,
  removeTrash,
  upsertEntry,
  type CatalogEntry,
} from './vaultCatalog'
import { sidecarFor, VaultSidecar } from './vaultSidecar'
import {
  folderIdFor,
  folderPathFromId,
  isFolderId,
  isIgnoredDir,
  toAbsolute,
  toRelative,
  vaultPaths,
  type VaultPaths,
} from './vaultLayout'

const WELCOME_TITLE = 'Welcome'
const WELCOME_CONTENT = `# Welcome to PrismMD

Your notes are plain Markdown files in this folder. Open it in Finder, in git,
in any other editor — PrismMD reads whatever is there and writes nothing you
cannot read yourself.

## Getting started

- Link one note to another by typing \`[[\` and picking a title
- Tag a note by writing \`#topic\` anywhere in it
- Ask the AI assistant a question and it will answer from your own notes

Happy writing.
`

export interface VaultRepositoryOptions {
  /** Absolute path to the vault root. */
  root: string
  /** Where the catalog cache lives. Any database; nothing here is truth. */
  db: Database
}

export class MarkdownVaultRepository implements NoteRepository {
  readonly kind = 'vault' as const

  private readonly root: string
  private readonly paths: VaultPaths
  private readonly db: Database
  private readonly sidecar: VaultSidecar
  private scanned = false

  /**
   * Paths this process is in the middle of writing.
   *
   * ★ The watcher reads this so the app's own saves do not come back as
   * "someone edited this file externally" — which would raise a conflict
   * prompt against the user's own keystroke.
   */
  private readonly selfWrites = new Set<string>()

  constructor(options: VaultRepositoryOptions) {
    this.root = path.resolve(options.root)
    this.paths = vaultPaths(this.root)
    this.db = options.db
    this.sidecar = sidecarFor(this.paths.prism)
    ensureCatalogSchema(this.db)
  }

  // ── Scanning ──────────────────────────────────────────────────────────────

  /**
   * Reconcile the catalog with the files. Cheap after the first pass: an
   * unchanged file costs a stat and a hash of its bytes.
   */
  async scan(options?: { force?: boolean }): Promise<{ indexed: number; removed: number }> {
    await fs.promises.mkdir(this.paths.prism, { recursive: true })
    if (options?.force) clearCatalog(this.db)
    await sweepTempFiles(this.root)

    const seen = new Set<string>()
    let indexed = 0

    for (const relativePath of await this.walk('')) {
      const entry = await this.readIntoCatalog(relativePath)
      if (!entry) continue
      seen.add(entry.id)
      indexed++
    }

    let removed = 0
    for (const entry of listEntries(this.db)) {
      if (seen.has(entry.id)) continue
      removeEntry(this.db, entry.id)
      removed++
    }

    this.scanned = true
    return { indexed, removed }
  }

  private async ensureScanned(): Promise<void> {
    if (!this.scanned) await this.scan()
  }

  /** Every supported file under `relativeDir`, depth-first, vault-relative. */
  private async walk(relativeDir: string): Promise<string[]> {
    const absolute = relativeDir ? toAbsolute(this.root, relativeDir) : this.root
    const entries = await fs.promises.readdir(absolute, { withFileTypes: true }).catch(() => [])
    const found: string[] = []

    for (const entry of entries) {
      const childRelative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (isIgnoredDir(entry.name)) continue
        found.push(...(await this.walk(childRelative)))
        continue
      }
      if (isTempFile(entry.name) || !isSupported(entry.name)) continue
      found.push(childRelative)
    }
    return found
  }

  /**
   * Read one file into the catalog, assigning it an id if it has none.
   *
   * ★ Assigning an id **writes to the user's file**. That is a real cost and
   * a deliberate one: without a UUID in the file there is no way to tell a
   * note moved in Finder from a note deleted and another created, and every
   * external reorganisation would silently orphan its backlinks. The write is
   * surgical — one front matter line, everything else byte-identical.
   */
  private async readIntoCatalog(relativePath: string): Promise<CatalogEntry | null> {
    const absolute = toAbsolute(this.root, relativePath)
    const stat = await fs.promises.stat(absolute).catch(() => null)
    if (!stat?.isFile()) return null

    const format = detectFormat(relativePath) ?? 'md'
    const isText = kindOfFormat(format) === 'text'

    let source = ''
    let id: string | null = null
    let title = titleFromFileName(path.basename(relativePath))
    let created: number = stat.birthtimeMs || stat.mtimeMs

    if (isText) {
      source = await fs.promises.readFile(absolute, 'utf-8')
      const parsed = parseNote(source)
      id = parsed.frontmatter.id ?? null
      if (parsed.frontmatter.title) title = parsed.frontmatter.title
      const stamped = parsed.frontmatter.created ? Date.parse(parsed.frontmatter.created) : NaN
      if (Number.isFinite(stamped)) created = stamped

      if (!id) {
        id = crypto.randomUUID()
        const stampedSource = setFrontmatter(source, {
          id,
          created: new Date(created).toISOString(),
        })
        await this.writeFile(absolute, stampedSource)
        source = stampedSource
      }
    } else {
      // A binary file cannot carry front matter, so its identity is keyed to
      // its path in the catalog and re-derived if it moves. Losing a PDF's id
      // costs a re-extraction, not a broken link — nothing links to one.
      const existing = getEntryByPath(this.db, relativePath)
      id = existing?.id ?? crypto.randomUUID()
    }

    const entry: CatalogEntry = {
      id,
      relativePath,
      title,
      contentHash: hashOf(isText ? source : `${stat.size}:${stat.mtimeMs}`),
      modifiedAt: Math.round(stat.mtimeMs),
      createdAt: Math.round(created),
      format,
    }
    upsertEntry(this.db, entry)
    return entry
  }

  private async writeFile(absolute: string, contents: string | Uint8Array): Promise<void> {
    this.selfWrites.add(path.resolve(absolute))
    try {
      await atomicWriteFile(absolute, contents)
    } finally {
      // Held briefly past the write: chokidar reports the change a moment
      // later, and clearing the mark synchronously would let our own save
      // arrive as an external edit.
      setTimeout(() => this.selfWrites.delete(path.resolve(absolute)), 2000)
    }
  }

  /** Whether this process wrote `absolute` moments ago. Read by the watcher. */
  wroteRecently(absolute: string): boolean {
    return this.selfWrites.has(path.resolve(absolute))
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  async getPage(id: string): Promise<Page | null> {
    await this.ensureScanned()
    if (isFolderId(id)) return this.folderPage(id)

    const entry = getEntry(this.db, id)
    if (!entry) return null
    const absolute = toAbsolute(this.root, entry.relativePath)
    if (!fs.existsSync(absolute)) {
      // The catalog outlived the file — a delete from another tool. Trust the
      // filesystem, not the cache.
      removeEntry(this.db, id)
      return null
    }
    return this.entryToPage(entry)
  }

  private async entryToPage(entry: CatalogEntry): Promise<Page> {
    const absolute = toAbsolute(this.root, entry.relativePath)
    const isText = kindOfFormat(entry.format) === 'text'
    const body = isText ? parseNote(await fs.promises.readFile(absolute, 'utf-8')).body : ''
    const dir = path.posix.dirname(entry.relativePath)
    const folder = dir === '.' ? '' : dir

    return {
      id: entry.id,
      title: entry.title,
      content: body,
      format: entry.format,
      parentId: folderIdFor(folder) || null,
      position: this.sidecar.positionOf(folder, entry.id),
      createdAt: entry.createdAt,
      updatedAt: entry.modifiedAt,
      isDeleted: false,
      icon: this.sidecar.iconOf(entry.id),
      isFolder: false,
    }
  }

  private folderPage(id: string): Page | null {
    const relative = folderPathFromId(id)
    if (relative === null) return null
    const absolute = toAbsolute(this.root, relative)
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) return null

    const stat = fs.statSync(absolute)
    const parent = path.posix.dirname(relative)
    return {
      id,
      title: path.posix.basename(relative),
      content: '',
      format: 'md',
      parentId: folderIdFor(parent === '.' ? '' : parent) || null,
      position: this.sidecar.positionOf(parent === '.' ? '' : parent, id),
      createdAt: Math.round(stat.birthtimeMs || stat.mtimeMs),
      updatedAt: Math.round(stat.mtimeMs),
      isDeleted: false,
      icon: this.sidecar.iconOf(id),
      isFolder: true,
    }
  }

  async listPages(): Promise<Page[]> {
    await this.ensureScanned()
    const pages: Page[] = []
    for (const entry of listEntries(this.db)) {
      const absolute = toAbsolute(this.root, entry.relativePath)
      if (!fs.existsSync(absolute)) continue
      pages.push(await this.entryToPage(entry))
    }
    return pages
  }

  async getTree(): Promise<PageTreeNode[]> {
    await this.ensureScanned()
    return this.treeOf('')
  }

  private async treeOf(relativeDir: string): Promise<PageTreeNode[]> {
    const children = await this.childrenOf(relativeDir)
    const nodes: PageTreeNode[] = []
    for (const child of children) {
      nodes.push({
        id: child.id,
        title: child.title,
        icon: child.icon,
        format: child.format,
        parentId: child.parentId,
        position: child.position,
        isFolder: child.isFolder,
        children: child.isFolder
          ? await this.treeOf(folderPathFromId(child.id) ?? '')
          : [],
      })
    }
    return nodes
  }

  private async childrenOf(relativeDir: string): Promise<Page[]> {
    const absolute = relativeDir ? toAbsolute(this.root, relativeDir) : this.root
    const entries = await fs.promises.readdir(absolute, { withFileTypes: true }).catch(() => [])

    const pages: Page[] = []
    for (const entry of entries) {
      const childRelative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (isIgnoredDir(entry.name)) continue
        const folder = this.folderPage(folderIdFor(childRelative))
        if (folder) pages.push(folder)
        continue
      }
      if (isTempFile(entry.name) || !isSupported(entry.name)) continue
      const catalogued = getEntryByPath(this.db, childRelative) ?? (await this.readIntoCatalog(childRelative))
      if (catalogued) pages.push(await this.entryToPage(catalogued))
    }

    const byId = new Map(pages.map((page) => [page.id, page]))
    const ordered = this.sidecar.sortByOrder(
      relativeDir,
      [...byId.keys()],
      (id) => byId.get(id)?.title ?? '',
    )
    return ordered.map((id, index) => ({ ...byId.get(id)!, position: index }))
  }

  async getChildren(parentId: string | null): Promise<Page[]> {
    await this.ensureScanned()
    return this.childrenOf(parentId ? folderPathFromId(parentId) ?? '' : '')
  }

  async getAncestors(id: string): Promise<PageSummary[]> {
    const page = await this.getPage(id)
    if (!page) return []

    const chain: PageSummary[] = [toSummary(page)]
    let parentId = page.parentId
    while (parentId) {
      const parent = this.folderPage(parentId)
      if (!parent) break
      chain.unshift(toSummary(parent))
      parentId = parent.parentId
    }
    return chain
  }

  async countPages(): Promise<number> {
    return (await this.listPages()).length
  }

  async readPageBytes(id: string): Promise<Uint8Array | null> {
    const entry = getEntry(this.db, id)
    if (!entry || kindOfFormat(entry.format) !== 'binary') return null
    const absolute = toAbsolute(this.root, entry.relativePath)
    if (!fs.existsSync(absolute)) return null
    return new Uint8Array(await fs.promises.readFile(absolute))
  }

  async searchPages(query: string): Promise<PageSummary[]> {
    const needle = query.trim().toLowerCase()
    if (!needle) return []

    const matches: PageSummary[] = []
    for (const page of await this.listPages()) {
      if (
        page.title.toLowerCase().includes(needle) ||
        page.content.toLowerCase().includes(needle)
      ) {
        matches.push(toSummary(page))
      }
      if (matches.length >= 50) break
    }
    return matches.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  // ── Writes ────────────────────────────────────────────────────────────────

  async createPage(input: CreatePageInput): Promise<Page> {
    await this.ensureScanned()
    const title = (input.title ?? 'Untitled').trim() || 'Untitled'
    const format = input.format ?? 'md'
    const folder = input.parentId ? folderPathFromId(input.parentId) ?? '' : ''

    const fileName = await this.availableName(folder, title, defaultExtFor(format))
    const relativePath = folder ? `${folder}/${fileName}` : fileName
    const id = crypto.randomUUID()
    const now = new Date()

    const source = composeNote(
      {
        id,
        // Only recorded when it differs from the filename. A vault where every
        // note repeats its own filename in front matter is noise, and the
        // stem is already a title (see the alias rule in the plan's D5).
        title: titleFromFileName(fileName) === title ? undefined : title,
        created: now.toISOString(),
        updated: now.toISOString(),
      },
      input.content ?? '',
    )

    await this.writeFile(toAbsolute(this.root, relativePath), source)
    const entry = await this.readIntoCatalog(relativePath)
    return this.entryToPage(entry!)
  }

  async createFolder(input: CreateFolderInput): Promise<Page> {
    await this.ensureScanned()
    const title = (input.title ?? 'New Folder').trim() || 'New Folder'
    const parent = input.parentId ? folderPathFromId(input.parentId) ?? '' : ''
    const name = await this.availableName(parent, title, '')
    const relative = parent ? `${parent}/${name}` : name

    await fs.promises.mkdir(toAbsolute(this.root, relative), { recursive: true })
    return this.folderPage(folderIdFor(relative))!
  }

  /** A filename not already taken in `folder`, on a case-insensitive filesystem. */
  private async availableName(folder: string, title: string, extension: string): Promise<string> {
    const absolute = folder ? toAbsolute(this.root, folder) : this.root
    const taken = await fs.promises.readdir(absolute).catch(() => [] as string[])
    return extension
      ? uniqueFileName(title, extension, taken)
      : uniqueFileName(title, '', taken)
  }

  async updatePage(id: string, updates: PageUpdates): Promise<void> {
    await this.ensureScanned()

    if (updates.icon !== undefined) await this.sidecar.setIcon(id, updates.icon)

    const entry = isFolderId(id) ? null : getEntry(this.db, id)
    if (entry && updates.content !== undefined) {
      const absolute = toAbsolute(this.root, entry.relativePath)
      const existing = await fs.promises.readFile(absolute, 'utf-8').catch(() => '')
      const parsed = parseNote(existing)
      // Front matter is preserved wholesale and only the body replaced. If
      // there is none to preserve, the id is re-stamped rather than dropped:
      // a note that loses its id loses its backlinks and its annotations, and
      // nothing about the file would look wrong afterwards.
      const rebuilt = setFrontmatter(
        parsed.rawFrontmatter === null
          ? updates.content
          : `---\n${parsed.rawFrontmatter}\n---\n${updates.content}`,
        { id: entry.id, updated: new Date().toISOString() },
      )
      await this.writeFile(absolute, rebuilt)
      await this.readIntoCatalog(entry.relativePath)
    }

    if (updates.parentId !== undefined) {
      await this.relocate(id, updates.parentId)
    }
    if (updates.position !== undefined) {
      const page = await this.getPage(id)
      const folder = page?.parentId ? folderPathFromId(page.parentId) ?? '' : ''
      await this.sidecar.place(folder, id, updates.position)
    }
  }

  async renamePage(id: string, title: string): Promise<RenameResult> {
    await this.ensureScanned()
    const before = await this.getPage(id)
    if (!before) throw new Error(`Page not found: ${id}`)

    const relinked: { pageId: string; title: string }[] = []
    const oldTitle = before.title

    if (isFolderId(id)) {
      const page = await this.renameFolder(id, title)
      return { page, relinked }
    }

    const entry = getEntry(this.db, id)!
    const dir = path.posix.dirname(entry.relativePath)
    const folder = dir === '.' ? '' : dir
    const extension = path.extname(entry.relativePath) || defaultExtFor(entry.format)

    // Collected before the rename: afterwards there is nothing for those
    // links to match against. Scanned from the files rather than the link
    // index, which is debounced and would miss a link typed a moment ago.
    const sources = normalizeTitle(oldTitle) === normalizeTitle(title)
      ? []
      : await this.findLinkSources(normalizeTitle(oldTitle), id)

    const desired = sanitizeStem(title) + extension
    const currentName = path.posix.basename(entry.relativePath)
    let relativePath = entry.relativePath
    if (desired.toLowerCase() !== currentName.toLowerCase()) {
      const fileName = await this.availableName(folder, title, extension)
      relativePath = folder ? `${folder}/${fileName}` : fileName
      await movePath(toAbsolute(this.root, entry.relativePath), toAbsolute(this.root, relativePath))
    }

    const absolute = toAbsolute(this.root, relativePath)
    const source = await fs.promises.readFile(absolute, 'utf-8')
    await this.writeFile(
      absolute,
      setFrontmatter(source, {
        // Only kept when the filename cannot express the title — a title with
        // a `/` or a trailing dot, or one truncated to fit the byte budget.
        title: titleFromFileName(path.posix.basename(relativePath)) === title ? null : title,
        updated: new Date().toISOString(),
      }),
    )
    await this.readIntoCatalog(relativePath)

    for (const linkSource of sources) {
      const rewritten = rewriteWikiLinks(linkSource.content, oldTitle, title)
      if (rewritten === linkSource.content) continue
      await this.updatePage(linkSource.id, { content: rewritten })
      relinked.push({ pageId: linkSource.id, title: linkSource.title })
    }

    return { page: (await this.getPage(id))!, relinked }
  }

  private async renameFolder(id: string, title: string): Promise<Page> {
    const relative = folderPathFromId(id)!
    const parentDir = path.posix.dirname(relative)
    const parent = parentDir === '.' ? '' : parentDir
    const name = await this.availableName(parent, title, '')
    const next = parent ? `${parent}/${name}` : name

    await movePath(toAbsolute(this.root, relative), toAbsolute(this.root, next))
    await this.sidecar.renameFolder(relative, next)
    // Every descendant's path changed; the ids did not.
    await this.scan()
    return this.folderPage(folderIdFor(next))!
  }

  private async findLinkSources(
    normalizedTitle: string,
    excludeId: string,
  ): Promise<{ id: string; title: string; content: string }[]> {
    const out: { id: string; title: string; content: string }[] = []
    for (const page of await this.listPages()) {
      if (page.id === excludeId || !page.content.includes('[[')) continue
      if (extractWikiLinks(page.content).some((link) => link.normalized === normalizedTitle)) {
        out.push({ id: page.id, title: page.title, content: page.content })
      }
    }
    return out
  }

  async movePage(id: string, parentId: string | null, position: number): Promise<void> {
    await this.relocate(id, parentId)
    const folder = parentId ? folderPathFromId(parentId) ?? '' : ''
    await this.sidecar.place(folder, id, position)
  }

  private async relocate(id: string, parentId: string | null): Promise<void> {
    await this.ensureScanned()
    const target = parentId ? folderPathFromId(parentId) ?? '' : ''

    if (isFolderId(id)) {
      const relative = folderPathFromId(id)!
      const name = path.posix.basename(relative)
      const next = target ? `${target}/${name}` : name
      if (next === relative) return
      // Moving a folder into itself would delete it; the check is cheap and
      // the mistake is one drag away in the tree.
      if (next.startsWith(`${relative}/`)) throw new Error('Cannot move a folder into itself')
      await movePath(toAbsolute(this.root, relative), toAbsolute(this.root, next))
      await this.sidecar.renameFolder(relative, next)
      await this.scan()
      return
    }

    const entry = getEntry(this.db, id)
    if (!entry) return
    const fileName = path.posix.basename(entry.relativePath)
    const next = target ? `${target}/${fileName}` : fileName
    if (next === entry.relativePath) return

    const available = await this.availableName(target, titleFromFileName(fileName), path.extname(fileName))
    const finalPath = target ? `${target}/${available}` : available
    await movePath(toAbsolute(this.root, entry.relativePath), toAbsolute(this.root, finalPath))
    await this.readIntoCatalog(finalPath)
  }

  /**
   * Move a note into `.trash/<uuid>/`, keeping its original path on record.
   *
   * ★ Not an unlink. A knowledge base where "delete" means gone is one people
   * are afraid to prune, and an un-pruned knowledge base stops being useful.
   * The `<uuid>` subdirectory means two notes with the same filename can be
   * in the trash at once without one shadowing the other.
   */
  async deletePage(id: string): Promise<void> {
    await this.ensureScanned()
    const page = await this.getPage(id)
    if (!page) return

    if (isFolderId(id)) {
      const relative = folderPathFromId(id)!
      // Descendants leave the catalog with the directory they live in.
      for (const entry of listEntries(this.db)) {
        if (entry.relativePath === relative || entry.relativePath.startsWith(`${relative}/`)) {
          recordTrash(this.db, {
            id: entry.id,
            originalPath: entry.relativePath,
            title: entry.title,
            deletedAt: Date.now(),
          })
          removeEntry(this.db, entry.id)
        }
      }
      recordTrash(this.db, {
        id,
        originalPath: relative,
        title: page.title,
        deletedAt: Date.now(),
      })
      await movePath(
        toAbsolute(this.root, relative),
        path.join(this.paths.trash, encodeURIComponent(id), path.posix.basename(relative)),
      )
      await this.sidecar.forget(id)
      return
    }

    const entry = getEntry(this.db, id)!
    recordTrash(this.db, {
      id,
      originalPath: entry.relativePath,
      title: entry.title,
      deletedAt: Date.now(),
    })
    await movePath(
      toAbsolute(this.root, entry.relativePath),
      path.join(this.paths.trash, encodeURIComponent(id), path.posix.basename(entry.relativePath)),
    )
    removeEntry(this.db, id)
    await this.sidecar.forget(id)
  }

  async restorePage(id: string): Promise<void> {
    const trashed = getTrash(this.db, id)
    if (!trashed) return

    const from = path.join(
      this.paths.trash,
      encodeURIComponent(id),
      path.posix.basename(trashed.originalPath),
    )
    if (!fs.existsSync(from)) {
      removeTrash(this.db, id)
      return
    }

    // The original path may have been reused while the note was in the trash;
    // landing next to the new occupant beats overwriting it.
    const dir = path.posix.dirname(trashed.originalPath)
    const folder = dir === '.' ? '' : dir
    const extension = path.extname(trashed.originalPath)
    const name = fs.statSync(from).isDirectory()
      ? await this.availableName(folder, trashed.title, '')
      : await this.availableName(folder, titleFromFileName(path.posix.basename(trashed.originalPath)), extension)
    const to = folder ? `${folder}/${name}` : name

    await movePath(from, toAbsolute(this.root, to))
    await fs.promises.rm(path.join(this.paths.trash, encodeURIComponent(id)), {
      recursive: true,
      force: true,
    }).catch(() => {})
    removeTrash(this.db, id)

    // A folder was trashed with its descendants inside it, so restoring it
    // restores them — their trash records have to go too, or they would sit
    // there forever claiming to be deleted while the note is back on disk.
    for (const trashedChild of listTrash(this.db)) {
      if (trashedChild.originalPath.startsWith(`${trashed.originalPath}/`)) {
        removeTrash(this.db, trashedChild.id)
      }
    }
    await this.scan()
  }

  // ── Import / export ───────────────────────────────────────────────────────

  async importFile(filePath: string, parentId?: string | null): Promise<Page> {
    const format = detectFormat(filePath)
    if (!format) throw new Error(`Unsupported file type: ${path.basename(filePath)}`)

    if (kindOfFormat(format) === 'binary') {
      const bytes = await fs.promises.readFile(filePath)
      return this.importBytes(path.basename(filePath), bytes, parentId, format)
    }
    const content = await fs.promises.readFile(filePath, 'utf-8')
    return this.createPage({
      title: titleFromFileName(path.basename(filePath)),
      parentId,
      content,
      format,
    })
  }

  async importDroppedFile(
    fileName: string,
    data: Uint8Array,
    parentId?: string | null,
  ): Promise<Page> {
    const format = detectFormat(fileName)
    if (!format) throw new Error(`Unsupported file type: ${fileName}`)

    if (kindOfFormat(format) === 'binary') {
      return this.importBytes(fileName, data, parentId, format)
    }
    return this.createPage({
      title: titleFromFileName(fileName),
      parentId,
      content: Buffer.from(data).toString('utf-8'),
      format,
    })
  }

  /** A binary document joins the vault as itself — the file *is* the note. */
  private async importBytes(
    fileName: string,
    data: Uint8Array,
    parentId: string | null | undefined,
    format: string,
  ): Promise<Page> {
    await this.ensureScanned()
    const folder = parentId ? folderPathFromId(parentId) ?? '' : ''
    const available = await this.availableName(
      folder,
      titleFromFileName(fileName),
      path.extname(fileName) || defaultExtFor(format),
    )
    const relativePath = folder ? `${folder}/${available}` : available
    await this.writeFile(toAbsolute(this.root, relativePath), data)
    const entry = await this.readIntoCatalog(relativePath)
    return this.entryToPage(entry!)
  }

  async importFolder(folderPath: string, parentId?: string | null): Promise<Page[]> {
    await this.ensureScanned()
    const imported: Page[] = []
    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true })

    for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
      const source = path.join(folderPath, entry.name)
      if (entry.isDirectory()) {
        const folder = await this.createFolder({ title: entry.name, parentId })
        imported.push(folder)
        imported.push(...(await this.importFolder(source, folder.id)))
        continue
      }
      if (!isSupported(entry.name)) continue
      try {
        imported.push(await this.importFile(source, parentId))
      } catch (err) {
        // One unreadable file must not abort a whole folder import.
        console.warn('[vault] skipped during folder import:', source, err)
      }
    }
    return imported
  }

  async exportPage(id: string, targetPath: string): Promise<void> {
    const entry = getEntry(this.db, id)
    if (!entry) throw new Error(`Page not found: ${id}`)
    if (kindOfFormat(entry.format) === 'binary') {
      await fs.promises.copyFile(toAbsolute(this.root, entry.relativePath), targetPath)
      return
    }
    // Exported without front matter: the ids and timestamps are PrismMD's
    // bookkeeping, and pasting them into someone else's vault would collide.
    const page = await this.getPage(id)
    await atomicWriteFile(targetPath, page?.content ?? '')
  }

  async exportFileNameFor(page: Page): Promise<string> {
    const entry = getEntry(this.db, page.id)
    const extension = entry ? path.extname(entry.relativePath) : defaultExtFor(page.format)
    return `${page.title}${extension || defaultExtFor(page.format)}`
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async ensureWelcomePage(): Promise<void> {
    await this.ensureScanned()
    if ((await this.countPages()) > 0) return
    await this.createPage({ title: WELCOME_TITLE, content: WELCOME_CONTENT })
  }
}

function toSummary(page: Page): PageSummary {
  return {
    id: page.id,
    title: page.title,
    icon: page.icon,
    format: page.format,
    updatedAt: page.updatedAt,
    isFolder: page.isFolder,
  }
}

function hashOf(text: string): string {
  return crypto.createHash('sha1').update(text).digest('hex')
}
