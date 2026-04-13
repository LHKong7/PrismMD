import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'

/**
 * Per-document TL;DR / suggested-question cache.
 *
 * Kept separate from memoryService because the shape (structured JSON per
 * file) and purpose (avoid regenerating the TL;DR on every re-open) are
 * different. Same on-disk pattern — a single JSON blob under userData —
 * so it adds no new infra.
 */

export interface DocSummary {
  /** A short 2–3 sentence overview of the document. */
  tldr: string
  /** Three suggested questions the reader might ask about it. */
  questions: string[]
  /** Unix ms when the summary was last (re)generated. */
  generatedAt: number
  /**
   * Hash-ish stamp of the source content at generation time, so if the
   * document changes substantially we can decide to invalidate.
   * We use a cheap size+first-chars signature (not a crypto hash).
   */
  signature: string
}

interface SummaryStore {
  summaries: Record<string, DocSummary>
}

function storeFile(): string {
  return path.join(app.getPath('userData'), 'memory', 'docSummaries.json')
}

async function load(): Promise<SummaryStore> {
  try {
    const raw = await fs.readFile(storeFile(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<SummaryStore>
    return { summaries: parsed.summaries ?? {} }
  } catch {
    return { summaries: {} }
  }
}

async function save(store: SummaryStore): Promise<void> {
  const dir = path.dirname(storeFile())
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(storeFile(), JSON.stringify(store, null, 2), 'utf-8')
}

/** Cheap non-crypto signature; enough to detect substantial edits. */
export function signatureForContent(content: string): string {
  const len = content.length
  const head = content.slice(0, 64).replace(/\s+/g, ' ')
  const tail = content.slice(-64).replace(/\s+/g, ' ')
  return `${len}:${head}…${tail}`
}

export async function getDocSummary(filePath: string): Promise<DocSummary | null> {
  const store = await load()
  return store.summaries[filePath] ?? null
}

export async function setDocSummary(filePath: string, summary: DocSummary): Promise<void> {
  const store = await load()
  store.summaries[filePath] = summary
  // Keep bounded so the file never grows unbounded on huge workspaces.
  const MAX_ENTRIES = 500
  const entries = Object.entries(store.summaries)
  if (entries.length > MAX_ENTRIES) {
    entries.sort((a, b) => (b[1].generatedAt ?? 0) - (a[1].generatedAt ?? 0))
    store.summaries = Object.fromEntries(entries.slice(0, MAX_ENTRIES))
  }
  await save(store)
}

export async function clearDocSummaries(): Promise<void> {
  await save({ summaries: {} })
}
