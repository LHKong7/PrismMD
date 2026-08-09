/**
 * Supported document formats — main-process copy.
 *
 * Mirrors `src/lib/fileFormat.ts` in the renderer. The two live in separate
 * TypeScript projects (tsconfig.node vs tsconfig.web) so the table is
 * duplicated rather than imported — **keep them in sync when adding a
 * format**, including the `formatFromString()` mapping on the renderer side.
 */

/** Format ids as persisted in `pages.format`. */
export type StoredFormat = 'md' | 'txt' | 'pdf' | 'csv' | 'json' | 'xlsx'

/** 'text' pages keep their content in `pages.content`; 'binary' pages keep
 *  it in `page_assets` + a file under {userData}/assets. */
export type FileKind = 'text' | 'binary'

interface FormatDef {
  format: StoredFormat
  kind: FileKind
  extensions: readonly string[]
  mime: string
  /** Shown in the open/save dialog's filter list. */
  label: string
}

const FORMATS: readonly FormatDef[] = [
  { format: 'md',   kind: 'text',   extensions: ['.md', '.markdown', '.mdx'], mime: 'text/markdown',  label: 'Markdown' },
  { format: 'txt',  kind: 'text',   extensions: ['.txt', '.log'],             mime: 'text/plain',     label: 'Text' },
  { format: 'pdf',  kind: 'binary', extensions: ['.pdf'],                     mime: 'application/pdf', label: 'PDF' },
  { format: 'csv',  kind: 'text',   extensions: ['.csv'],                     mime: 'text/csv',       label: 'CSV' },
  { format: 'json', kind: 'text',   extensions: ['.json'],                    mime: 'application/json', label: 'JSON' },
  {
    format: 'xlsx',
    kind: 'binary',
    extensions: ['.xlsx', '.xls'],
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    label: 'Spreadsheet',
  },
] as const

/** Lowercased extension including the leading dot ('' when there is none). */
export function extOf(filePath: string): string {
  const base = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath
  const i = base.lastIndexOf('.')
  if (i <= 0) return ''
  return base.slice(i).toLowerCase()
}

export function detectFormat(filePath: string): StoredFormat | null {
  const ext = extOf(filePath)
  if (!ext) return null
  return FORMATS.find((f) => f.extensions.includes(ext))?.format ?? null
}

export function kindOfFormat(format: string): FileKind {
  return FORMATS.find((f) => f.format === format)?.kind ?? 'text'
}

export function mimeOfExt(ext: string): string {
  return FORMATS.find((f) => f.extensions.includes(ext.toLowerCase()))?.mime
    ?? 'application/octet-stream'
}

export function isSupported(filePath: string): boolean {
  return detectFormat(filePath) !== null
}

/** Every supported extension, without the leading dot (Electron dialog form). */
export const ALL_SUPPORTED_EXTS: readonly string[] = FORMATS
  .flatMap((f) => f.extensions)
  .map((e) => e.slice(1))

/**
 * Filter list for `dialog.showOpenDialog` — an "everything" entry first
 * (what the user almost always wants) then one row per format.
 */
export function openDialogFilters(): Array<{ name: string; extensions: string[] }> {
  return [
    { name: 'Documents', extensions: [...ALL_SUPPORTED_EXTS] },
    ...FORMATS.map((f) => ({ name: f.label, extensions: f.extensions.map((e) => e.slice(1)) })),
  ]
}

/** Default extension used when exporting a page of this format. */
export function defaultExtFor(format: string): string {
  return FORMATS.find((f) => f.format === format)?.extensions[0] ?? '.md'
}
