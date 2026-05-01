import type { TocEntry } from './remarkToc'

export interface EditorTocEntry extends TocEntry {
  /** 1-based line number in the source text. */
  line: number
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\s]+/g, '-')
    .replace(/[^\w\u4e00-\u9fff\u3400-\u4dbf-]/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Extract headings from raw markdown source using regex.
 * Much cheaper than running the full unified pipeline —
 * suitable for real-time updates during editing.
 */
export function extractHeadingsFromSource(source: string): EditorTocEntry[] {
  const entries: EditorTocEntry[] = []
  const lines = source.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)$/)
    if (match) {
      const depth = match[1].length
      const text = match[2].trim()
      entries.push({
        depth,
        text,
        id: slugify(text),
        line: i + 1, // 1-based
      })
    }
  }

  return entries
}
