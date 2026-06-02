/**
 * Per-page TL;DR / suggested-question cache — SQLite, keyed by page ID.
 *
 * Stored in the `doc_summaries` table of the workspace DB with a foreign
 * key to `pages` (ON DELETE CASCADE). Avoids regenerating the TL;DR on
 * every re-open.
 */
import { getDb } from './workspaceDb'

export interface DocSummary {
  /** A short 2–3 sentence overview of the document. */
  tldr: string
  /** Suggested questions the reader might ask about it. */
  questions: string[]
  /** Unix ms when the summary was last (re)generated. */
  generatedAt: number
  /**
   * Cheap size+first/last-chars signature of the source content at
   * generation time, so substantial edits can invalidate the cache.
   */
  signature: string
}

/** Cheap non-crypto signature; enough to detect substantial edits. */
export function signatureForContent(content: string): string {
  const len = content.length
  const head = content.slice(0, 64).replace(/\s+/g, ' ')
  const tail = content.slice(-64).replace(/\s+/g, ' ')
  return `${len}:${head}…${tail}`
}

export async function getDocSummary(pageId: string): Promise<DocSummary | null> {
  const db = getDb()
  const row = db.prepare('SELECT * FROM doc_summaries WHERE page_id = ?').get(pageId) as any
  if (!row) return null
  let questions: string[] = []
  try {
    questions = JSON.parse(row.questions ?? '[]')
  } catch {
    questions = []
  }
  return {
    tldr: row.tldr ?? '',
    questions,
    generatedAt: row.generated_at ?? 0,
    signature: row.signature ?? '',
  }
}

export async function setDocSummary(pageId: string, summary: DocSummary): Promise<void> {
  const db = getDb()
  db.prepare(`
    INSERT INTO doc_summaries (page_id, tldr, questions, generated_at, signature)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(page_id) DO UPDATE SET
      tldr = excluded.tldr,
      questions = excluded.questions,
      generated_at = excluded.generated_at,
      signature = excluded.signature
  `).run(
    pageId,
    summary.tldr,
    JSON.stringify(summary.questions ?? []),
    summary.generatedAt,
    summary.signature,
  )
}

export async function clearDocSummaries(): Promise<void> {
  const db = getDb()
  db.prepare('DELETE FROM doc_summaries').run()
}
