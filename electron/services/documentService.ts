/**
 * Document Service — CRUD operations for workspace pages.
 *
 * All pages are stored in SQLite. Pages can be nested (parent → child)
 * to form a tree structure like Notion.
 */
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { getDb } from './workspaceDb'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Page {
  id: string
  title: string
  content: string
  format: string
  parentId: string | null
  position: number
  createdAt: number
  updatedAt: number
  isDeleted: boolean
  icon: string | null
  /** Folders are pure containers (no document content) that group pages. */
  isFolder: boolean
}

export interface PageTreeNode {
  id: string
  title: string
  icon: string | null
  format: string
  parentId: string | null
  position: number
  isFolder: boolean
  children: PageTreeNode[]
}

export interface PageSummary {
  id: string
  title: string
  icon: string | null
  format: string
  updatedAt: number
  isFolder: boolean
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function rowToPage(row: any): Page {
  return {
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
  }
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export function createPage(
  title: string = 'Untitled',
  parentId?: string | null,
  content: string = '',
  format: string = 'md',
  isFolder: boolean = false,
): Page {
  const db = getDb()
  const id = crypto.randomUUID()
  const now = Date.now()

  // Get next position among siblings
  const siblings = db.prepare(
    'SELECT MAX(position) as maxPos FROM pages WHERE parent_id IS ? AND is_deleted = 0',
  ).get(parentId ?? null) as any
  const position = (siblings?.maxPos ?? -1) + 1

  db.prepare(`
    INSERT INTO pages (id, title, content, format, parent_id, position, created_at, updated_at, is_folder)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, content, format, parentId ?? null, position, now, now, isFolder ? 1 : 0)

  return { id, title, content, format, parentId: parentId ?? null, position, createdAt: now, updatedAt: now, isDeleted: false, icon: null, isFolder }
}

export function getPage(id: string): Page | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM pages WHERE id = ? AND is_deleted = 0').get(id) as any
  return row ? rowToPage(row) : null
}

export function updatePage(
  id: string,
  updates: Partial<Pick<Page, 'title' | 'content' | 'parentId' | 'position' | 'icon' | 'format' | 'isFolder'>>,
): void {
  const db = getDb()
  const sets: string[] = []
  const values: any[] = []

  if (updates.title !== undefined) { sets.push('title = ?'); values.push(updates.title) }
  if (updates.content !== undefined) { sets.push('content = ?'); values.push(updates.content) }
  if (updates.parentId !== undefined) { sets.push('parent_id = ?'); values.push(updates.parentId) }
  if (updates.position !== undefined) { sets.push('position = ?'); values.push(updates.position) }
  if (updates.icon !== undefined) { sets.push('icon = ?'); values.push(updates.icon) }
  if (updates.format !== undefined) { sets.push('format = ?'); values.push(updates.format) }
  if (updates.isFolder !== undefined) { sets.push('is_folder = ?'); values.push(updates.isFolder ? 1 : 0) }

  if (sets.length === 0) return

  sets.push('updated_at = ?')
  values.push(Date.now())
  values.push(id)

  db.prepare(`UPDATE pages SET ${sets.join(', ')} WHERE id = ?`).run(...values)
}

export function deletePage(id: string): void {
  const db = getDb()
  db.prepare('UPDATE pages SET is_deleted = 1, updated_at = ? WHERE id = ?').run(Date.now(), id)
  // Also soft-delete all children recursively
  const children = db.prepare('SELECT id FROM pages WHERE parent_id = ? AND is_deleted = 0').all(id) as any[]
  for (const child of children) {
    deletePage(child.id)
  }
}

export function restorePage(id: string): void {
  const db = getDb()
  db.prepare('UPDATE pages SET is_deleted = 0, updated_at = ? WHERE id = ?').run(Date.now(), id)
}

// ─── Tree Queries ───────────────────────────────────────────────────────────

export function getChildren(parentId: string | null): Page[] {
  const db = getDb()
  const rows = db.prepare(
    'SELECT * FROM pages WHERE parent_id IS ? AND is_deleted = 0 ORDER BY position ASC, created_at ASC',
  ).all(parentId ?? null) as any[]
  return rows.map(rowToPage)
}

export function getPageTree(): PageTreeNode[] {
  const db = getDb()
  const rows = db.prepare(
    'SELECT id, title, icon, format, parent_id, position, is_folder FROM pages WHERE is_deleted = 0 ORDER BY position ASC, created_at ASC',
  ).all() as any[]

  // Build tree in memory
  const nodeMap = new Map<string, PageTreeNode>()
  const roots: PageTreeNode[] = []

  for (const row of rows) {
    nodeMap.set(row.id, {
      id: row.id,
      title: row.title,
      icon: row.icon ?? null,
      format: row.format,
      parentId: row.parent_id ?? null,
      position: row.position,
      isFolder: !!row.is_folder,
      children: [],
    })
  }

  for (const node of nodeMap.values()) {
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

export function movePage(id: string, newParentId: string | null, position: number): void {
  const db = getDb()
  db.prepare('UPDATE pages SET parent_id = ?, position = ?, updated_at = ? WHERE id = ?')
    .run(newParentId, position, Date.now(), id)
}

export function getAncestors(id: string): PageSummary[] {
  const db = getDb()
  const ancestors: PageSummary[] = []
  let currentId: string | null = id

  while (currentId) {
    const row = db.prepare('SELECT id, title, icon, format, parent_id, updated_at, is_folder FROM pages WHERE id = ?').get(currentId) as any
    if (!row) break
    ancestors.unshift({ id: row.id, title: row.title, icon: row.icon, format: row.format, updatedAt: row.updated_at, isFolder: !!row.is_folder })
    currentId = row.parent_id
  }

  return ancestors
}

// ─── Search ─────────────────────────────────────────────────────────────────

export function searchPages(query: string): PageSummary[] {
  const db = getDb()
  const pattern = `%${query}%`
  // Folders are containers, not documents — keep them out of search results.
  const rows = db.prepare(
    'SELECT id, title, icon, format, updated_at FROM pages WHERE is_deleted = 0 AND is_folder = 0 AND (title LIKE ? OR content LIKE ?) ORDER BY updated_at DESC LIMIT 50',
  ).all(pattern, pattern) as any[]
  return rows.map((r) => ({ id: r.id, title: r.title, icon: r.icon, format: r.format, updatedAt: r.updated_at, isFolder: false }))
}

// ─── Import / Export ────────────────────────────────────────────────────────

export function importMarkdown(filePath: string, parentId?: string | null): Page {
  const content = fs.readFileSync(filePath, 'utf-8')
  const title = path.basename(filePath, path.extname(filePath))
  return createPage(title, parentId, content, 'md')
}

export function importFolder(folderPath: string, parentId?: string | null): Page[] {
  const imported: Page[] = []
  const entries = fs.readdirSync(folderPath, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))

  for (const entry of entries) {
    const fullPath = path.join(folderPath, entry.name)
    if (entry.isDirectory()) {
      // Mirror the directory as a real folder (container, not a document)
      const folderPage = createPage(entry.name, parentId, '', 'md', true)
      imported.push(folderPage)
      imported.push(...importFolder(fullPath, folderPage.id))
    } else if (/\.(md|markdown|mdx)$/i.test(entry.name)) {
      imported.push(importMarkdown(fullPath, parentId))
    }
  }

  return imported
}

export function exportMarkdown(pageId: string, targetPath: string): void {
  const page = getPage(pageId)
  if (!page) throw new Error(`Page not found: ${pageId}`)
  if (page.isFolder) throw new Error('Cannot export a folder')
  fs.writeFileSync(targetPath, page.content, 'utf-8')
}

// ─── Stats ──────────────────────────────────────────────────────────────────

export function getPageCount(): number {
  const db = getDb()
  const row = db.prepare('SELECT COUNT(*) as count FROM pages WHERE is_deleted = 0').get() as any
  return row?.count ?? 0
}

// ─── Seed ───────────────────────────────────────────────────────────────────

const WELCOME_CONTENT = `# Welcome to PrismMD

This is your workspace. Everything you write lives here — no files to manage.

## Getting started

- Click **New Page** in the sidebar to create a note
- Nest pages by creating subpages under any page
- **Import** existing Markdown files, or **Export** any page back to \`.md\`
- Ask the AI assistant questions about the page you're reading

Happy writing! ✨
`

/**
 * Create a welcome page on first launch so a brand-new workspace
 * isn't empty. No-op if any pages already exist.
 */
export function ensureWelcomePage(): void {
  if (getPageCount() > 0) return
  createPage('Welcome', null, WELCOME_CONTENT, 'md')
}
