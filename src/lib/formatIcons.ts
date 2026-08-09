/**
 * One icon per document format, shared by the tab bar and the page tree so
 * a PDF looks like the same thing wherever it appears in the UI.
 */
import {
  FileText,
  FileSpreadsheet,
  FileJson,
  FileType2,
  FileCode2,
  type LucideIcon,
} from 'lucide-react'
import { normalizeFormat, type FileFormat } from './fileFormat'

export function iconForFormat(format: FileFormat | null): LucideIcon {
  switch (format) {
    case 'pdf':       return FileType2
    case 'csv':       return FileSpreadsheet
    case 'xlsx':      return FileSpreadsheet
    case 'json':      return FileJson
    case 'plaintext': return FileCode2
    case 'markdown':
    default:          return FileText
  }
}

/** Same, from a raw `pages.format` value (tree nodes carry the stored id). */
export function iconForStoredFormat(stored: string): LucideIcon {
  return iconForFormat(normalizeFormat(stored))
}
