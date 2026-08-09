/**
 * Library — read-only access to folders of documents on disk.
 *
 * This is the storage layer for **reader mode**, where PrismMD browses a
 * folder the user already has instead of a workspace it owns. Two invariants
 * make "read-only" structural rather than a UI convention:
 *
 * 1. **There is no write function in this module.** Not a disabled one —
 *    none at all. Reader mode cannot modify the folder it is showing because
 *    the capability was never handed to it.
 * 2. **Every read is confined to a mounted root.** The renderer can name a
 *    path but can never widen the set of paths it may read; roots are only
 *    added when the user picks a folder in a dialog or the OS hands us a file
 *    to open. Without this, `library:read-text` would be an
 *    arbitrary-file-read primitive for anything running in the renderer.
 *
 * Listings are one level deep — the tree loads children as the user expands,
 * so mounting a 50k-file folder costs one `readdir`, not a full walk.
 */
import * as fs from 'fs'
import * as path from 'path'
import { detectFormat, isSupported, type StoredFormat } from './fileFormats'
export interface LibraryEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  /** Always null for directories. */
  format: StoredFormat | null
  size: number
  modifiedAt: number
}

export interface LibraryListing {
  path: string
  entries: LibraryEntry[]
  /** True when the directory held more than `MAX_DIR_ENTRIES` readable items. */
  truncated: boolean
}

export interface LibraryFileInfo {
  path: string
  name: string
  format: StoredFormat
  size: number
  modifiedAt: number
}

/** A 16 MB markdown file is already pathological; refuse rather than hang. */
const MAX_TEXT_BYTES = 16 * 1024 * 1024
/** PDFs get a far higher ceiling, but not an unbounded one. */
const MAX_BINARY_BYTES = 512 * 1024 * 1024
/** Cap a single listing so one enormous directory can't stall the tree. */
const MAX_DIR_ENTRIES = 5000

/** macOS and Windows compare paths case-insensitively; containment must too. */
const CASE_INSENSITIVE = process.platform === 'darwin' || process.platform === 'win32'

// ─── Mounted roots ──────────────────────────────────────────────────────────

/** Canonical (symlink-resolved) absolute paths the renderer may read under. */
const roots = new Set<string>()

/**
 * Resolve symlinks so that containment checks can't be defeated by a link
 * inside a mounted folder pointing somewhere else. Falls back to a plain
 * resolve when the path doesn't exist yet — the subsequent stat will fail
 * with a better message than realpath's ENOENT.
 */
function canonicalize(p: string): string {
  const abs = path.resolve(p)
  try {
    return fs.realpathSync.native(abs)
  } catch {
    return abs
  }
}

function contains(root: string, target: string): boolean {
  const a = CASE_INSENSITIVE ? root.toLowerCase() : root
  const b = CASE_INSENSITIVE ? target.toLowerCase() : target
  const rel = path.relative(a, b)
  if (rel === '') return true
  return !rel.startsWith('..') && !path.isAbsolute(rel)
}

/** Register a folder as readable. Returns its canonical path. */
export function mountRoot(dirPath: string): string {
  const canonical = canonicalize(dirPath)
  const stat = fs.statSync(canonical)
  if (!stat.isDirectory()) throw new Error(`Not a folder: ${dirPath}`)
  roots.add(canonical)
  return canonical
}

/**
 * Register the *containing* folder of a file. Used when the OS hands us a
 * single file (double-click, `open -a`, argv) — the user asked for one
 * document, but a reader with no sibling files is a dead end.
 */
export function mountFileParent(filePath: string): string {
  return mountRoot(path.dirname(canonicalize(filePath)))
}

export function mountedRoots(): string[] {
  return [...roots]
}

export function unmountRoot(dirPath: string): void {
  roots.delete(canonicalize(dirPath))
}

/**
 * Resolve a renderer-supplied path, refusing anything outside every mounted
 * root. Every read below goes through this — it is the single choke point.
 */
function resolveInsideRoot(p: unknown): string {
  if (typeof p !== 'string' || p.length === 0) throw new Error('Invalid path')
  const canonical = canonicalize(p)
  for (const root of roots) {
    if (contains(root, canonical)) return canonical
  }
  throw new Error(`Path is outside every mounted folder: ${p}`)
}

// ─── Reads ──────────────────────────────────────────────────────────────────

/**
 * One level of a directory: sub-folders plus files in a format we can render.
 * Dotfiles are skipped — a reading list shouldn't show `.DS_Store`.
 */
export function listDir(dirPath: string): LibraryListing {
  const dir = resolveInsideRoot(dirPath)
  const dirents = fs.readdirSync(dir, { withFileTypes: true })

  const entries: LibraryEntry[] = []
  let truncated = false

  for (const dirent of dirents) {
    if (entries.length >= MAX_DIR_ENTRIES) {
      truncated = true
      break
    }
    if (dirent.name.startsWith('.')) continue

    const full = path.join(dir, dirent.name)

    // A symlink can point outside the mounted root, and reading it would be
    // refused later anyway — drop it here so the tree never shows a node that
    // errors on click. Only symlinks pay the realpath cost.
    if (dirent.isSymbolicLink()) {
      const target = canonicalize(full)
      if (![...roots].some((r) => contains(r, target))) continue
    }

    let stat: fs.Stats
    try {
      // statSync (not lstat) so a symlink is classified by its target.
      stat = fs.statSync(full)
    } catch {
      continue // broken link, or no permission — not worth surfacing
    }

    if (stat.isDirectory()) {
      entries.push({
        name: dirent.name,
        path: full,
        type: 'directory',
        format: null,
        size: 0,
        modifiedAt: stat.mtimeMs,
      })
    } else if (stat.isFile() && isSupported(dirent.name)) {
      entries.push({
        name: dirent.name,
        path: full,
        type: 'file',
        format: detectFormat(dirent.name),
        size: stat.size,
        modifiedAt: stat.mtimeMs,
      })
    }
  }

  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  })

  return { path: dir, entries, truncated }
}

export function statFile(filePath: string): LibraryFileInfo {
  const file = resolveInsideRoot(filePath)
  const stat = fs.statSync(file)
  if (!stat.isFile()) throw new Error(`Not a file: ${filePath}`)

  const format = detectFormat(file)
  if (!format) throw new Error(`Unsupported file type: ${path.basename(file)}`)

  return {
    path: file,
    name: path.basename(file),
    format,
    size: stat.size,
    modifiedAt: stat.mtimeMs,
  }
}

/** UTF-8 text of a file, BOM stripped. */
export function readText(filePath: string): string {
  const file = resolveInsideRoot(filePath)
  const stat = fs.statSync(file)
  if (!stat.isFile()) throw new Error(`Not a file: ${filePath}`)
  if (stat.size > MAX_TEXT_BYTES) {
    throw new Error(
      `File is too large to open as text (${(stat.size / 1024 / 1024).toFixed(1)} MB)`,
    )
  }
  const raw = fs.readFileSync(file, 'utf-8')
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
}

/** Raw bytes, for the PDF and spreadsheet viewers. */
export function readBytes(filePath: string): Uint8Array {
  const file = resolveInsideRoot(filePath)
  const stat = fs.statSync(file)
  if (!stat.isFile()) throw new Error(`Not a file: ${filePath}`)
  if (stat.size > MAX_BINARY_BYTES) {
    throw new Error(
      `File is too large to open (${(stat.size / 1024 / 1024).toFixed(0)} MB)`,
    )
  }
  return new Uint8Array(fs.readFileSync(file))
}
