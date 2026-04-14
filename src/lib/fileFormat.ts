/**
 * Single source of truth for "which formats are supported by the Library".
 * Mirrors `SUPPORTED_EXTENSIONS` in `electron/services/fileTree.ts` — keep
 * the two in sync when adding a format.
 */

export type FileFormat = 'markdown' | 'pdf' | 'csv' | 'json' | 'xlsx'

/** File-reader dispatch: 'text' → `readFile`, 'binary' → `readFileBytes`. */
export type FileKind = 'text' | 'binary'

interface FormatDef {
  format: FileFormat
  kind: FileKind
  extensions: readonly string[]
}

const FORMATS: readonly FormatDef[] = [
  { format: 'markdown', kind: 'text',   extensions: ['.md', '.markdown', '.mdx'] },
  { format: 'pdf',      kind: 'binary', extensions: ['.pdf'] },
  { format: 'csv',      kind: 'text',   extensions: ['.csv'] },
  { format: 'json',     kind: 'text',   extensions: ['.json'] },
  { format: 'xlsx',     kind: 'binary', extensions: ['.xlsx', '.xls'] },
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

export function isSupported(filePath: string): boolean {
  return detectFormat(filePath) !== null
}

/** All supported extensions, for file-tree / dialog filters. */
export const ALL_SUPPORTED_EXTS: readonly string[] = FORMATS.flatMap((f) => f.extensions)
