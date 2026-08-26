/**
 * Muse Wall cards (灵感墙) — a global board of inspiration items: topics,
 * golden sentences, reference snippets, AI opening candidates. Stored in
 * `muse_cards` (global, optional `page_id` source link). Newest first.
 */
import * as crypto from 'crypto'
import { indexDb } from './indexDatabase'

export type MuseKind = 'topic' | 'quote' | 'snippet' | 'opening'

export interface MuseCard {
  id: string
  kind: string
  text: string
  pageId: string | null
  createdAt: number
}

/** Keep the board bounded — AI generation can add several cards per click. */
const MAX_CARDS = 300

export function listMuseCards(): MuseCard[] {
  const rows = indexDb()
    .prepare('SELECT id, kind, text, page_id, created_at FROM muse_cards ORDER BY created_at DESC LIMIT ?')
    .all(MAX_CARDS) as Array<{ id: string; kind: string; text: string; page_id: string | null; created_at: number }>
  return rows.map((r) => ({ id: r.id, kind: r.kind, text: r.text, pageId: r.page_id, createdAt: r.created_at }))
}

export function addMuseCard(kind: string, text: string, pageId?: string | null): MuseCard {
  const db = indexDb()
  const id = crypto.randomUUID()
  const createdAt = Date.now()
  db.prepare('INSERT INTO muse_cards (id, kind, text, page_id, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    kind,
    text,
    pageId ?? null,
    createdAt,
  )
  // Prune oldest beyond the cap.
  db.prepare('DELETE FROM muse_cards WHERE id NOT IN (SELECT id FROM muse_cards ORDER BY created_at DESC LIMIT ?)').run(
    MAX_CARDS,
  )
  return { id, kind, text, pageId: pageId ?? null, createdAt }
}

export function deleteMuseCard(id: string): void {
  indexDb().prepare('DELETE FROM muse_cards WHERE id = ?').run(id)
}
