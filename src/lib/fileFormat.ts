/**
 * Single source of truth for "which formats the reader can open" — renderer side.
 * Mirrors `electron/services/fileFormats.ts` (which owns the ids persisted in
 * `pages.format`) — keep the two in sync when adding a format, along with
 * `formatFromString()` in `src/store/workspaceStore.ts`.
 */

export type FileFormat = 'markdown' | 'plaintext' | 'pdf' | 'csv' | 'json' | 'xlsx'

/**
 * Where a page's payload lives: 'text' → `pages.content` in SQLite,
 * 'binary' → a file in the asset store, fetched as bytes on open.
 */
export type FileKind = 'text' | 'binary'

interface FormatDef {
  format: FileFormat
  kind: FileKind
  extensions: readonly string[]
}

const FORMATS: readonly FormatDef[] = [
  { format: 'markdown',  kind: 'text',   extensions: ['.md', '.markdown', '.mdx'] },
  { format: 'plaintext', kind: 'text',   extensions: ['.txt', '.log'] },
  { format: 'pdf',       kind: 'binary', extensions: ['.pdf'] },
  { format: 'csv',       kind: 'text',   extensions: ['.csv'] },
  { format: 'json',      kind: 'text',   extensions: ['.json'] },
  { format: 'xlsx',      kind: 'binary', extensions: ['.xlsx', '.xls'] },
] as const

/** Extract the lowercased extension (including the leading dot). */
export function extOf(filePath: string): string {
  const i = filePath.lastIndexOf('.')
  if (i < 0) return ''
  // Strip any trailing query/hash just in case (e.g. from dragged URLs).
  const raw = filePath.slice(i).toLowerCase()
  return raw.replace(/[?#].*$/, '')
}

/** Returns the format or `null` if the extension isn't supported. */
export function detectFormat(filePath: string): FileFormat | null {
  const ext = extOf(filePath)
  if (!ext) return null
  const def = FORMATS.find((f) => f.extensions.includes(ext))
  return def?.format ?? null
}

export function kindOfFormat(format: FileFormat): FileKind {
  return FORMATS.find((f) => f.format === format)?.kind ?? 'text'
}

/**
 * Map a `pages.format` value as persisted by the main process onto a
 * renderer `FileFormat`. Markdown is stored under several aliases (`md`,
 * `mdx`), and anything unrecognized is treated as markdown — an old row
 * with a stale format id should still open as a note rather than as
 * "unsupported".
 */
export function normalizeFormat(stored: string): FileFormat {
  switch (stored) {
    case 'md':
    case 'mdx':
    case 'markdown':
      return 'markdown'
    case 'txt':
    case 'log':
    case 'plaintext':
      return 'plaintext'
    case 'pdf':
    case 'csv':
    case 'json':
    case 'xlsx':
      return stored
    default:
      return 'markdown'
  }
}

export function isSupported(filePath: string): boolean {
  return detectFormat(filePath) !== null
}

/** All supported extensions, for file-tree / dialog filters. */
export const ALL_SUPPORTED_EXTS: readonly string[] = FORMATS.flatMap((f) => f.extensions)
