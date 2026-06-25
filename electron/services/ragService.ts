/**
 * ragService — semantic search over the user's notes.
 *
 * Chunks each note's body, embeds the chunks with an OpenAI-compatible endpoint
 * (resolved from a configured provider), and stores the vectors as Float32 BLOBs
 * in the `note_embeddings` table. `semanticSearch` embeds the query and ranks
 * chunks by cosine similarity (brute-force in JS — fine at personal-KB scale),
 * keeping the best chunk per note. This turns the MCP `search_notes` tool (and,
 * later, agent retrieval) from keyword `LIKE` into meaning-based retrieval.
 *
 * Design notes:
 *   • Indexing is incremental: a note is re-embedded only when its `updated_at`
 *     moved or the embedding model changed (tracked per row). Manual reindex
 *     keeps embedding-API spend predictable — no re-embedding on every keystroke.
 *   • Deleted notes are filtered at query time (getPage returns null) and purged
 *     on the next reindex, so no documentService coupling is needed.
 *   • The query path degrades gracefully: callers fall back to keyword search
 *     when RAG is disabled, unconfigured, or the index is empty.
 */

import crypto from 'node:crypto'
import { getDb } from './workspaceDb'
import { getPage } from './documentService'
import { cosineSimilarity } from '../agent/providers/embeddings'
import { getRagSettings, loadSettings } from './settingsStore'

// ── Embedding endpoint resolution ────────────────────────────────────────────

interface ResolvedEmbedder {
  apiKey: string
  baseUrl?: string
  model: string
}

/** Resolve the OpenAI-compatible embeddings endpoint from settings, or null. */
function resolveEmbedder(): ResolvedEmbedder | null {
  const rag = getRagSettings()
  const providers = loadSettings().providers
  const p = providers?.[rag.providerId]
  if (!p) return null
  const model = rag.model.trim()
  if (!model) return null

  if (rag.providerId === 'ollama') {
    return { apiKey: 'ollama', baseUrl: `${p.baseUrl ?? 'http://localhost:11434'}/v1`, model }
  }
  if (rag.providerId === 'custom') {
    if (!p.apiKey || !p.baseUrl) return null
    return { apiKey: p.apiKey, baseUrl: p.baseUrl, model }
  }
  // openai
  if (!p.apiKey) return null
  return { apiKey: p.apiKey, baseUrl: p.baseUrl, model }
}

let clientCache: { key: string; client: unknown } | null = null

async function getClient(e: ResolvedEmbedder): Promise<{ embeddings: { create: (a: unknown) => Promise<{ data: Array<{ index: number; embedding: number[] }> }> } }> {
  const key = `${e.apiKey}|${e.baseUrl ?? ''}`
  if (clientCache?.key === key) return clientCache.client as never
  const OpenAI = (await import('openai')).default
  const opts: Record<string, unknown> = { apiKey: e.apiKey }
  if (e.baseUrl) opts.baseURL = e.baseUrl
  const client = new OpenAI(opts as never)
  clientCache = { key, client }
  return client as never
}

/**
 * Embed texts. We deliberately do NOT send the OpenAI `dimensions` param — it's
 * unsupported by some models/endpoints (older OpenAI models, Ollama) and the
 * stored vectors only need to be self-consistent (query embedded by the same
 * model). Batched to keep request sizes sane.
 */
async function embedTexts(e: ResolvedEmbedder, texts: string[]): Promise<number[][]> {
  if (!texts.length) return []
  const client = await getClient(e)
  const out: number[][] = []
  const BATCH = 64
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH)
    const res = await client.embeddings.create({ model: e.model, input: slice })
    const sorted = res.data.slice().sort((a, b) => a.index - b.index)
    for (const d of sorted) out.push(d.embedding)
  }
  return out
}

// ── Chunking ─────────────────────────────────────────────────────────────────

const CHUNK_TARGET = 1200
const CHUNK_OVERLAP = 200

/** Split note body into ~CHUNK_TARGET-char chunks on paragraph boundaries. */
export function chunkText(content: string, target = CHUNK_TARGET, overlap = CHUNK_OVERLAP): string[] {
  const text = (content || '').replace(/\r\n/g, '\n').trim()
  if (!text) return []
  if (text.length <= target) return [text]

  const paras = text.split(/\n{2,}/)
  const chunks: string[] = []
  let buf = ''
  for (const para of paras) {
    const p = para.trim()
    if (!p) continue
    if (buf && buf.length + p.length + 2 > target) {
      chunks.push(buf)
      const tail = buf.slice(Math.max(0, buf.length - overlap))
      buf = `${tail}\n\n${p}`
    } else {
      buf = buf ? `${buf}\n\n${p}` : p
    }
  }
  if (buf.trim()) chunks.push(buf)

  // Hard-split any paragraph that blew past the target on its own.
  const out: string[] = []
  for (const c of chunks) {
    if (c.length <= target * 1.6) {
      out.push(c)
    } else {
      for (let i = 0; i < c.length; i += target - overlap) out.push(c.slice(i, i + target))
    }
  }
  return out
}

// ── Vector (de)serialization ─────────────────────────────────────────────────

function vecToBlob(v: number[]): Buffer {
  return Buffer.from(new Float32Array(v).buffer)
}

function blobToVec(b: Buffer): number[] {
  const n = Math.floor(b.byteLength / 4)
  const out = new Array<number>(n)
  for (let i = 0; i < n; i++) out[i] = b.readFloatLE(i * 4)
  return out
}

// ── In-memory cache of the index (rebuilt on mutation) ───────────────────────

interface CachedChunk {
  pageId: string
  chunkIndex: number
  content: string
  vec: number[]
}
let cache: { model: string; rows: CachedChunk[] } | null = null

function loadCache(model: string): CachedChunk[] {
  if (cache && cache.model === model) return cache.rows
  const db = getDb()
  const rows = db
    .prepare('SELECT page_id, chunk_index, content, embedding FROM note_embeddings WHERE model = ?')
    .all(model) as Array<{ page_id: string; chunk_index: number; content: string; embedding: Buffer }>
  const parsed = rows.map((r) => ({
    pageId: r.page_id,
    chunkIndex: r.chunk_index,
    content: r.content,
    vec: blobToVec(r.embedding),
  }))
  cache = { model, rows: parsed }
  return parsed
}

function invalidateCache(): void {
  cache = null
}

// ── Public status / config ───────────────────────────────────────────────────

export interface RagStatus {
  enabled: boolean
  /** Whether an embeddings endpoint is resolvable from settings. */
  configured: boolean
  providerId: string
  model: string
  /** Notes that have at least one up-to-date chunk for the current model. */
  indexedPages: number
  /** Total non-folder notes in the workspace. */
  totalPages: number
  /** Notes new or edited since they were last embedded. */
  stalePages: number
  /** Total stored chunks for the current model. */
  chunks: number
}

interface PageRow {
  id: string
  title: string
  content: string
  updated_at: number
}

function allDocumentPages(): PageRow[] {
  const db = getDb()
  return db
    .prepare('SELECT id, title, content, updated_at FROM pages WHERE is_deleted = 0 AND is_folder = 0')
    .all() as PageRow[]
}

export function getRagStatus(): RagStatus {
  const rag = getRagSettings()
  const embedder = resolveEmbedder()
  const db = getDb()
  const pages = allDocumentPages()

  // Map page_id → latest page_updated_at stored for the current model.
  const indexed = db
    .prepare(
      'SELECT page_id, MAX(page_updated_at) AS pat, COUNT(*) AS c FROM note_embeddings WHERE model = ? GROUP BY page_id',
    )
    .all(rag.model) as Array<{ page_id: string; pat: number; c: number }>
  const indexedMap = new Map(indexed.map((r) => [r.page_id, r.pat]))
  const chunks = indexed.reduce((s, r) => s + r.c, 0)

  let stale = 0
  for (const p of pages) {
    const has = indexedMap.get(p.id)
    if (has === undefined || has < p.updated_at) stale++
  }

  return {
    enabled: rag.enabled,
    configured: !!embedder,
    providerId: rag.providerId,
    model: rag.model,
    indexedPages: indexedMap.size,
    totalPages: pages.length,
    stalePages: stale,
    chunks,
  }
}

/** Is semantic search ready to serve queries (enabled + configured + non-empty)? */
export function isRagReady(): boolean {
  const rag = getRagSettings()
  if (!rag.enabled) return false
  if (!resolveEmbedder()) return false
  const db = getDb()
  const row = db.prepare('SELECT COUNT(*) AS c FROM note_embeddings WHERE model = ?').get(rag.model) as { c: number }
  return row.c > 0
}

// ── Indexing ─────────────────────────────────────────────────────────────────

export interface ReindexResult {
  ok: boolean
  error?: string
  embeddedPages: number
  removedPages: number
  chunks: number
}

export type ReindexProgress = (done: number, total: number, title: string) => void

/**
 * Bring the index in sync with the workspace for the current model: embed new /
 * changed notes, purge notes that vanished or whose model no longer matches.
 */
export async function reindex(onProgress?: ReindexProgress): Promise<ReindexResult> {
  const rag = getRagSettings()
  const embedder = resolveEmbedder()
  if (!embedder) {
    return { ok: false, error: 'No embeddings provider configured.', embeddedPages: 0, removedPages: 0, chunks: 0 }
  }
  const db = getDb()
  const pages = allDocumentPages()
  const liveIds = new Set(pages.map((p) => p.id))

  // Purge rows for notes that no longer exist or were embedded with another model.
  const purgeOrphans = db.prepare(
    'DELETE FROM note_embeddings WHERE page_id NOT IN (SELECT id FROM pages WHERE is_deleted = 0 AND is_folder = 0)',
  )
  const orphanInfo = purgeOrphans.run()
  db.prepare('DELETE FROM note_embeddings WHERE model != ?').run(rag.model)

  // Which pages are up to date for the current model?
  const indexed = db
    .prepare('SELECT page_id, MAX(page_updated_at) AS pat FROM note_embeddings WHERE model = ? GROUP BY page_id')
    .all(rag.model) as Array<{ page_id: string; pat: number }>
  const upToDate = new Map(indexed.map((r) => [r.page_id, r.pat]))

  const dirty = pages.filter((p) => {
    if (!liveIds.has(p.id)) return false
    const pat = upToDate.get(p.id)
    return pat === undefined || pat < p.updated_at
  })

  const insert = db.prepare(
    'INSERT INTO note_embeddings (id, page_id, chunk_index, content, embedding, dim, model, page_updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
  const deleteForPage = db.prepare('DELETE FROM note_embeddings WHERE page_id = ?')

  let embeddedPages = 0
  let removedPages = 0
  try {
    for (let i = 0; i < dirty.length; i++) {
      const page = dirty[i]
      onProgress?.(i, dirty.length, page.title)
      const chunks = chunkText(page.content)
      // Replace any prior chunks for this page (handles content shrink / model change).
      deleteForPage.run(page.id)
      if (!chunks.length) {
        removedPages++
        continue
      }
      const vectors = await embedTexts(embedder, chunks)
      const now = Date.now()
      const tx = db.transaction(() => {
        for (let c = 0; c < chunks.length; c++) {
          const vec = vectors[c]
          if (!vec) continue
          insert.run(
            crypto.randomUUID(),
            page.id,
            c,
            chunks[c],
            vecToBlob(vec),
            vec.length,
            rag.model,
            page.updated_at,
            now,
          )
        }
      })
      tx()
      embeddedPages++
    }
    onProgress?.(dirty.length, dirty.length, '')
  } catch (err) {
    invalidateCache()
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      embeddedPages,
      removedPages,
      chunks: 0,
    }
  }

  invalidateCache()
  const total = db.prepare('SELECT COUNT(*) AS c FROM note_embeddings WHERE model = ?').get(rag.model) as { c: number }
  removedPages += orphanInfo.changes ?? 0
  return { ok: true, embeddedPages, removedPages, chunks: total.c }
}

/** Drop the entire index (all models). */
export function clearIndex(): void {
  getDb().prepare('DELETE FROM note_embeddings').run()
  invalidateCache()
}

// ── Search ───────────────────────────────────────────────────────────────────

export interface SemanticHit {
  pageId: string
  title: string
  score: number
  snippet: string
}

/** Embed `query` and return the best-matching notes (one hit per note). */
export async function semanticSearch(query: string, limit = 10): Promise<SemanticHit[]> {
  const q = (query || '').trim()
  if (!q) return []
  const embedder = resolveEmbedder()
  if (!embedder) throw new Error('No embeddings provider configured.')

  const rows = loadCache(embedder.model)
  if (!rows.length) return []

  const [qv] = await embedTexts(embedder, [q])
  if (!qv) return []

  const best = new Map<string, { score: number; content: string }>()
  for (const r of rows) {
    if (r.vec.length !== qv.length) continue
    const score = cosineSimilarity(qv, r.vec)
    const cur = best.get(r.pageId)
    if (!cur || score > cur.score) best.set(r.pageId, { score, content: r.content })
  }

  const ranked = [...best.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit)

  const hits: SemanticHit[] = []
  for (const [pageId, v] of ranked) {
    const page = getPage(pageId) // null if deleted since indexing — skip
    if (!page) continue
    const snip = v.content.replace(/\s+/g, ' ').trim().slice(0, 200)
    hits.push({ pageId, title: page.title, score: v.score, snippet: snip + (v.content.length > 200 ? '…' : '') })
  }
  return hits
}
