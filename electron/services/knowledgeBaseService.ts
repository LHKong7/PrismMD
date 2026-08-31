import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { getNoteRepository } from '../repositories/repositoryFactory'

export interface KBEntry {
  id: string
  title: string
  /** Source file path (legacy, external imports). Optional in workspace model. */
  originalPath?: string
  /** Source workspace page ID (for pages added from the workspace). */
  sourcePageId?: string
  tags: string[]
  summary: string
  addedAt: number
}

function getKBDir(): string {
  return path.join(app.getPath('userData'), 'knowledge')
}

function getDocsDir(): string {
  return path.join(getKBDir(), 'docs')
}

function getIndexFile(): string {
  return path.join(getKBDir(), 'index.json')
}

async function ensureKBDir(): Promise<void> {
  await fs.mkdir(getDocsDir(), { recursive: true })
}

async function loadIndex(): Promise<KBEntry[]> {
  try {
    const data = await fs.readFile(getIndexFile(), 'utf-8')
    return JSON.parse(data) as KBEntry[]
  } catch {
    return []
  }
}

async function saveIndex(entries: KBEntry[]): Promise<void> {
  await ensureKBDir()
  await fs.writeFile(getIndexFile(), JSON.stringify(entries, null, 2), 'utf-8')
}

/**
 * Add a document to the Knowledge Base.
 * Copies the file content into the KB docs folder and adds metadata to the index.
 */
export async function addDocument(
  filePath: string,
  title?: string,
  tags?: string[],
  summary?: string,
): Promise<KBEntry> {
  await ensureKBDir()

  const content = await fs.readFile(filePath, 'utf-8')
  const id = crypto.randomUUID()
  const fileName = path.basename(filePath)
  const docTitle = title || fileName.replace(/\.[^/.]+$/, '')

  // Store the document content
  const ext = path.extname(filePath) || '.md'
  await fs.writeFile(path.join(getDocsDir(), `${id}${ext}`), content, 'utf-8')

  const entry: KBEntry = {
    id,
    title: docTitle,
    originalPath: filePath,
    tags: tags ?? [],
    summary: summary ?? '',
    addedAt: Date.now(),
  }

  const index = await loadIndex()
  // Don't add duplicates (by original path)
  const existing = index.findIndex((e) => e.originalPath === filePath)
  if (existing >= 0) {
    // Update existing entry
    index[existing] = entry
  } else {
    index.push(entry)
  }
  await saveIndex(index)

  return entry
}

/**
 * Add a workspace page to the Knowledge Base. Reads the page content from
 * the document service and stores a copy. Dedupes by source page ID.
 */
export async function addPage(pageId: string, tags?: string[], summary?: string): Promise<KBEntry> {
  await ensureKBDir()

  const page = await getNoteRepository().getPage(pageId)
  if (!page) throw new Error('Page not found')

  const id = crypto.randomUUID()
  await fs.writeFile(path.join(getDocsDir(), `${id}.md`), page.content, 'utf-8')

  const entry: KBEntry = {
    id,
    title: page.title || 'Untitled',
    sourcePageId: pageId,
    tags: tags ?? [],
    summary: summary ?? '',
    addedAt: Date.now(),
  }

  const index = await loadIndex()
  const existing = index.findIndex((e) => e.sourcePageId === pageId)
  if (existing >= 0) index[existing] = entry
  else index.push(entry)
  await saveIndex(index)

  return entry
}

/**
 * Remove a document from the Knowledge Base.
 */
export async function removeDocument(id: string): Promise<void> {
  const index = await loadIndex()
  const entry = index.find((e) => e.id === id)
  if (!entry) return

  // Remove doc file (try common extensions)
  for (const ext of ['.md', '.txt', '.json', '.csv']) {
    try {
      await fs.unlink(path.join(getDocsDir(), `${id}${ext}`))
    } catch { /* file may not exist with this extension */ }
  }

  await saveIndex(index.filter((e) => e.id !== id))
}

/**
 * List all documents in the Knowledge Base.
 */
export async function listDocuments(): Promise<KBEntry[]> {
  return loadIndex()
}

/**
 * Search KB entries by keyword match on title, tags, and summary.
 */
export async function searchDocuments(query: string): Promise<KBEntry[]> {
  const index = await loadIndex()
  if (!query.trim()) return index

  const terms = query.toLowerCase().split(/\s+/)
  return index.filter((entry) => {
    const haystack = `${entry.title} ${entry.tags.join(' ')} ${entry.summary}`.toLowerCase()
    return terms.some((t) => haystack.includes(t))
  })
}

/**
 * Build a context string from relevant KB documents for the Agent.
 * Returns numbered references with doc content snippets.
 */
export async function getContext(query: string, maxDocs = 3): Promise<string> {
  const matches = await searchDocuments(query)
  if (matches.length === 0) return ''

  const selected = matches.slice(0, maxDocs)
  const parts: string[] = []

  for (let i = 0; i < selected.length; i++) {
    const entry = selected[i]
    let content = ''
    try {
      // Try to read the stored doc
      const files = await fs.readdir(getDocsDir())
      const docFile = files.find((f) => f.startsWith(entry.id))
      if (docFile) {
        const raw = await fs.readFile(path.join(getDocsDir(), docFile), 'utf-8')
        // Truncate to ~2000 chars to avoid overwhelming context
        content = raw.length > 2000 ? raw.slice(0, 2000) + '\n... (truncated)' : raw
      }
    } catch { /* doc file missing */ }

    parts.push(
      `[KB ${i + 1}] "${entry.title}"${entry.tags.length > 0 ? ` (tags: ${entry.tags.join(', ')})` : ''}\n${content || entry.summary}`,
    )
  }

  return parts.join('\n\n---\n\n')
}

/**
 * Update the summary/tags of an existing KB entry.
 */
export async function updateEntry(
  id: string,
  updates: { title?: string; tags?: string[]; summary?: string },
): Promise<void> {
  const index = await loadIndex()
  const entry = index.find((e) => e.id === id)
  if (!entry) return
  if (updates.title != null) entry.title = updates.title
  if (updates.tags != null) entry.tags = updates.tags
  if (updates.summary != null) entry.summary = updates.summary
  await saveIndex(index)
}
