/**
 * Asset Service — binary payloads for non-text pages (PDF, XLSX).
 *
 * A page row in SQLite always holds *text*: for binary documents that text
 * is the extracted plain-text rendition (so FTS, RAG and the agent can read
 * a PDF like any other note), while the original bytes live here.
 *
 * The bytes are stored as plain files under `{userData}/assets/<pageId><ext>`
 * with only their metadata in the `page_assets` table. Storing a 50 MB PDF
 * as a BLOB would make every `SELECT * FROM pages` on that row materialize
 * the whole document; a file on disk keeps page reads O(text) and lets the
 * viewer pull the bytes only when a tab actually opens.
 *
 * `{userData}` is redirected at bootstrap by `dataLocation`, so assets follow
 * a custom data location automatically — `assetsDir()` resolves lazily and
 * `'assets'` is listed in `DATA_ENTRIES` for migration.
 */
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { getDb } from './workspaceDb'
import { extOf, mimeOfExt } from './fileFormats'

export interface PageAsset {
  pageId: string
  fileName: string
  ext: string
  mime: string | null
  size: number
  /** Where the file was imported from — informational, may no longer exist. */
  sourcePath: string | null
  storageName: string
  createdAt: number
}

/** {userData}/assets, created on demand. */
export function assetsDir(): string {
  const dir = path.join(app.getPath('userData'), 'assets')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function rowToAsset(row: any): PageAsset {
  return {
    pageId: row.page_id,
    fileName: row.file_name,
    ext: row.ext,
    mime: row.mime ?? null,
    size: row.size,
    sourcePath: row.source_path ?? null,
    storageName: row.storage_name,
    createdAt: row.created_at,
  }
}

export function getAsset(pageId: string): PageAsset | null {
  const row = getDb().prepare('SELECT * FROM page_assets WHERE page_id = ?').get(pageId) as any
  return row ? rowToAsset(row) : null
}

/** Absolute path of the stored file, or null when the page has no asset. */
export function assetPath(pageId: string): string | null {
  const asset = getAsset(pageId)
  return asset ? path.join(assetsDir(), asset.storageName) : null
}

function upsert(asset: PageAsset): PageAsset {
  getDb().prepare(`
    INSERT INTO page_assets (page_id, file_name, ext, mime, size, source_path, storage_name, created_at)
    VALUES (@pageId, @fileName, @ext, @mime, @size, @sourcePath, @storageName, @createdAt)
    ON CONFLICT(page_id) DO UPDATE SET
      file_name = excluded.file_name,
      ext = excluded.ext,
      mime = excluded.mime,
      size = excluded.size,
      source_path = excluded.source_path,
      storage_name = excluded.storage_name,
      created_at = excluded.created_at
  `).run(asset)
  return asset
}

/**
 * Copy `srcPath` into the asset store and register it against `pageId`.
 * The stored name is derived from the page UUID, so it is always filesystem
 * safe regardless of what the original file was called.
 */
export function saveAssetFromFile(pageId: string, srcPath: string): PageAsset {
  const ext = extOf(srcPath)
  const storageName = `${pageId}${ext}`
  const dest = path.join(assetsDir(), storageName)
  fs.copyFileSync(srcPath, dest)

  return upsert({
    pageId,
    fileName: path.basename(srcPath),
    ext,
    mime: mimeOfExt(ext),
    size: fs.statSync(dest).size,
    sourcePath: srcPath,
    storageName,
    createdAt: Date.now(),
  })
}

/** Same as `saveAssetFromFile` but for bytes handed over from the renderer
 *  (drag-and-drop, where there is no readable path on disk). */
export function saveAssetFromBytes(pageId: string, fileName: string, data: Uint8Array): PageAsset {
  const ext = extOf(fileName)
  const storageName = `${pageId}${ext}`
  const dest = path.join(assetsDir(), storageName)
  fs.writeFileSync(dest, data)

  return upsert({
    pageId,
    fileName,
    ext,
    mime: mimeOfExt(ext),
    size: data.byteLength,
    sourcePath: null,
    storageName,
    createdAt: Date.now(),
  })
}

/**
 * Raw bytes for a page, or null when it has no asset (or the file went
 * missing — e.g. the workspace DB was copied without the assets folder).
 */
export function readAssetBytes(pageId: string): Buffer | null {
  const full = assetPath(pageId)
  if (!full || !fs.existsSync(full)) return null
  return fs.readFileSync(full)
}

/** Write the original document back out (binary "export page"). */
export function copyAssetTo(pageId: string, targetPath: string): void {
  const full = assetPath(pageId)
  if (!full || !fs.existsSync(full)) throw new Error('Original file is no longer available')
  fs.copyFileSync(full, targetPath)
}

/** Drop both the row and the file. Used when a page is permanently removed. */
export function deleteAsset(pageId: string): void {
  const full = assetPath(pageId)
  getDb().prepare('DELETE FROM page_assets WHERE page_id = ?').run(pageId)
  if (full) {
    try {
      fs.rmSync(full, { force: true })
    } catch {
      /* best effort — a stale file is harmless */
    }
  }
}
