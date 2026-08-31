/**
 * Page version history, following whichever store holds the notes.
 *
 * A snapshot is a full copy of a page at a moment the user (or an AI rewrite)
 * chose to keep, tagged with where it came from. The Archive shows them so a
 * rewrite can be reviewed and rolled back.
 *
 * In SQLite mode they live in `page_versions`. In vault mode they live in
 * `.prism/versions/<pageId>/` as Markdown files, for two reasons:
 *
 * 1. ★ A snapshot is the only copy of what a note used to say. Keeping it in
 *    the vault's database would put user data in the one file the vault
 *    model declares disposable — and "Rebuild index", which is supposed to
 *    cost only time, would quietly cost history.
 * 2. Backing up the vault folder should back up the history, for the same
 *    reason it should back up the highlights.
 *
 * ★ Every function here is async even where the SQLite path is not, because
 * the vault path cannot be. A synchronous variant "for convenience" would be
 * the one every caller reached for, and it would be wrong in vault mode.
 */
import * as crypto from 'crypto'
import * as fs from 'fs'
import { indexDb } from './indexDatabase'
import { getNoteRepository } from '../repositories/repositoryFactory'
import { getStorageSettings } from './settingsStore'
import { versionsFor, type VaultVersions } from '../vault/vaultVersions'
import { vaultPaths } from '../vault/vaultLayout'

export interface VersionMeta {
  id: string
  pageId: string
  title: string | null
  source: string
  label: string | null
  createdAt: number
  /** Character length of the snapshot (content not loaded in lists). */
  length: number
}

export interface VersionFull extends VersionMeta {
  content: string
}

export interface VersionSaveOpts {
  title?: string | null
  source?: string
  label?: string | null
}

const MAX_PER_PAGE = 50

/** The vault's history store, or null when the notes are not in a vault. */
function sidecar(): VaultVersions | null {
  if (getNoteRepository().kind !== 'vault') return null
  const { vaultPath } = getStorageSettings()
  if (!vaultPath || !fs.existsSync(vaultPath)) return null
  return versionsFor(vaultPaths(vaultPath).versions)
}

export async function saveVersion(
  pageId: string,
  content: string,
  opts: VersionSaveOpts = {},
): Promise<VersionMeta> {
  const meta: VersionMeta = {
    id: crypto.randomUUID(),
    pageId,
    title: opts.title ?? null,
    source: opts.source ?? 'manual',
    label: opts.label ?? null,
    createdAt: Date.now(),
    length: content.length,
  }

  const store = sidecar()
  if (store) {
    await store.save({ ...meta, content })
    await store.prune(pageId, MAX_PER_PAGE)
    return meta
  }

  const db = indexDb()
  db.prepare(
    'INSERT INTO page_versions (id, page_id, content, title, source, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(meta.id, pageId, content, meta.title, meta.source, meta.label, meta.createdAt)

  // Prune oldest beyond the cap.
  const ids = db
    .prepare('SELECT id FROM page_versions WHERE page_id = ? ORDER BY created_at DESC')
    .all(pageId) as Array<{ id: string }>
  if (ids.length > MAX_PER_PAGE) {
    const del = db.prepare('DELETE FROM page_versions WHERE id = ?')
    for (const row of ids.slice(MAX_PER_PAGE)) del.run(row.id)
  }

  return meta
}

export async function listVersions(pageId: string): Promise<VersionMeta[]> {
  const store = sidecar()
  if (store) return store.list(pageId)

  const rows = indexDb()
    .prepare(
      'SELECT id, page_id, title, source, label, created_at, LENGTH(content) AS length FROM page_versions WHERE page_id = ? ORDER BY created_at DESC',
    )
    .all(pageId) as Array<{
    id: string
    page_id: string
    title: string | null
    source: string | null
    label: string | null
    created_at: number
    length: number
  }>
  return rows.map((r) => ({
    id: r.id,
    pageId: r.page_id,
    title: r.title,
    source: r.source ?? 'manual',
    label: r.label,
    createdAt: r.created_at,
    length: r.length,
  }))
}

/**
 * One snapshot, by id.
 *
 * `pageId` is optional because the database can find a snapshot from its id
 * alone and the older IPC signature did not carry one. In a vault the history
 * is filed per note, so without it there is nothing to do but look through
 * the notes that have any history at all — correct, just slower, and the
 * callers that know the note pass it.
 */
export async function getVersion(versionId: string, pageId?: string): Promise<VersionFull | null> {
  const store = sidecar()
  if (store) {
    const owners = pageId ? [pageId] : await store.pageIds()
    for (const owner of owners) {
      const found = await store.get(owner, versionId)
      if (found) return { ...found, length: found.content.length }
    }
    return null
  }

  const r = indexDb().prepare('SELECT * FROM page_versions WHERE id = ?').get(versionId) as
    | {
        id: string
        page_id: string
        content: string | null
        title: string | null
        source: string | null
        label: string | null
        created_at: number
      }
    | undefined
  if (!r) return null
  const content = r.content ?? ''
  return {
    id: r.id,
    pageId: r.page_id,
    title: r.title,
    source: r.source ?? 'manual',
    label: r.label,
    createdAt: r.created_at,
    length: content.length,
    content,
  }
}

export async function deleteVersion(versionId: string, pageId?: string): Promise<void> {
  const store = sidecar()
  if (store) {
    const owners = pageId ? [pageId] : await store.pageIds()
    for (const owner of owners) await store.remove(owner, versionId)
    return
  }
  indexDb().prepare('DELETE FROM page_versions WHERE id = ?').run(versionId)
}
