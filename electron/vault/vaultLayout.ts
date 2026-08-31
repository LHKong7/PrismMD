/**
 * Where things live inside a vault, and what counts as inside it.
 *
 * ```text
 * Vault/
 * ├── Inbox/一个想法.md          notes — the only content truth
 * ├── Attachments/diagram.png    binaries, likewise
 * ├── .trash/<uuid>/Note.md      deleted notes, with a meta.json saying where
 *                              they came from (main data — a scan rebuilds the table)
 * └── .prism/                    app data
 *     ├── ui.json                sibling ordering + icons (user intent, losable)
 *     ├── binaries.json          ids for documents that cannot hold one (main data)
 *     ├── annotations/<uuid>.json  highlights (main data — must be backed up)
 *     ├── versions/<uuid>/*.md   snapshot history (main data — must be backed up)
 *     └── prism.db               catalog, search index, caches (losable)
 * ```
 *
 * ★ `.prism/` is **not** uniformly a cache, and the split is named here
 * rather than left to be inferred, because a backup rule that treats the
 * whole directory as one thing is wrong in one direction or the other:
 *
 * | Must be backed up | Safe to delete |
 * | --- | --- |
 * | `binaries.json`, `annotations/`, `versions/` | `prism.db` |
 *
 * `ui.json` sits between the two: it is user intent (the order you dragged
 * things into), but it is **declared losable** — without it the sidebar
 * falls back to alphabetical and icons vanish, and no note is affected.
 *
 * The rule that decides which column a thing lands in is the one the whole
 * vault model rests on: **if walking the files can rebuild it, it is a
 * cache.** `prism.db` holds only answers derived from the notes; the other
 * three hold things the notes cannot express.
 */
import * as path from 'path'

export const PRISM_DIR = '.prism'
export const TRASH_DIR = '.trash'
export const ATTACHMENTS_DIR = 'Attachments'

/** Directory names never scanned as notes. */
const IGNORED_DIRS = new Set([PRISM_DIR, TRASH_DIR, '.git', '.obsidian', 'node_modules'])

export interface VaultPaths {
  root: string
  prism: string
  trash: string
  attachments: string
  uiFile: string
  binariesFile: string
  annotations: string
  versions: string
  /**
   * Everything derived: the catalog, the search index, the AI caches.
   *
   * ★ Inside the vault so that a vault is one self-contained thing — copy the
   * folder to another machine and its search index comes with it — and so
   * that two vaults on one machine cannot share a catalog. Deletable at any
   * time: the next scan rebuilds it from the files.
   */
  indexFile: string
}

export function vaultPaths(root: string): VaultPaths {
  const prism = path.join(root, PRISM_DIR)
  return {
    root,
    prism,
    trash: path.join(root, TRASH_DIR),
    attachments: path.join(root, ATTACHMENTS_DIR),
    uiFile: path.join(prism, 'ui.json'),
    binariesFile: path.join(prism, 'binaries.json'),
    annotations: path.join(prism, 'annotations'),
    versions: path.join(prism, 'versions'),
    indexFile: path.join(prism, 'prism.db'),
  }
}

export function isIgnoredDir(name: string): boolean {
  // Dot-directories in general: an editor's or a sync client's metadata is
  // never the user's notes, and walking `.git` alone would dwarf the vault.
  return IGNORED_DIRS.has(name) || name.startsWith('.')
}

/**
 * Vault-relative path with forward slashes, whatever the platform.
 *
 * ★ The separator is normalized because this string is an *identifier*: it is
 * stored in the catalog, compared against watcher events, and used as a
 * folder id. A path recorded on Windows and compared on macOS after a sync
 * would otherwise never match itself.
 */
export function toRelative(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join('/')
}

export function toAbsolute(root: string, relative: string): string {
  return path.join(root, ...relative.split('/'))
}

/**
 * Whether `absolute` is inside `root`.
 *
 * ★ Compares resolved paths with a separator-terminated prefix, so `/vaultX`
 * is not accepted as being inside `/vault`. This is the same containment
 * check `libraryService` makes for reader mode, and for the same reason: a
 * relative path arriving from the renderer must never be able to address a
 * file outside the vault.
 *
 * Symlinks are *not* resolved here — callers that accept an arbitrary path
 * from outside must `realpath` first.
 */
export function isInside(root: string, absolute: string): boolean {
  const base = path.resolve(root)
  const target = path.resolve(absolute)
  if (target === base) return true
  return target.startsWith(base.endsWith(path.sep) ? base : base + path.sep)
}

/** Reject a relative path that tries to climb out of the vault. */
export function isSafeRelative(relative: string): boolean {
  if (!relative || path.isAbsolute(relative)) return false
  // A NUL truncates the path at the syscall boundary, so a string that looks
  // contained in JavaScript can address something else entirely on disk.
  if (relative.includes('\u0000')) return false
  return !relative.split(/[\\/]/).some((part) => part === '..')
}

/**
 * Folder ids are derived from the path, unlike note ids.
 *
 * ★ A directory cannot carry front matter, so there is nowhere to keep a
 * UUID for it — path is the only identity available. That is acceptable
 * *only* for folders: nothing links to a folder, so a renamed folder losing
 * its id costs at most an expanded/collapsed state. Every note keeps a real
 * UUID precisely because links, backlinks and annotations hang off it.
 */
export function folderIdFor(relativeDir: string): string {
  return relativeDir ? `dir:${relativeDir}` : ''
}

/** Inverse of `folderIdFor`; null for the vault root or a non-folder id. */
export function folderPathFromId(id: string | null): string | null {
  if (!id) return null
  return id.startsWith('dir:') ? id.slice(4) : null
}

export function isFolderId(id: string): boolean {
  return id.startsWith('dir:')
}
