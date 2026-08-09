/**
 * PDF → plain text.
 *
 * A PDF page stores its bytes in the asset store and its *extracted text* in
 * `pages.content`. That one line is what makes a PDF a first-class citizen of
 * the workspace: FTS5 search, the RAG index, the knowledge graph and every
 * agent tool read `pages.content` and need no idea that this particular page
 * happens to render on a canvas.
 *
 * Extraction runs in the renderer because pdfjs (and its worker) are already
 * wired up there for the viewer — no second copy of the library in main.
 */
import { pdfjsLib } from './pdfjs'

/** Stop after this many pages; beyond it the text is a search aid, not a copy. */
const MAX_PAGES = 2000
/** Hard cap on extracted characters so a giant scan can't bloat the DB. */
const MAX_CHARS = 1_000_000

export interface ExtractedPdfText {
  text: string
  pageCount: number
  /** Pages actually walked (< pageCount when a cap kicked in). */
  pagesExtracted: number
  truncated: boolean
}

/**
 * Extract the text layer of a PDF, one `[Page N]` marker per page so the
 * agent can cite a location and search snippets stay locatable.
 *
 * Scanned PDFs with no text layer come back (nearly) empty — that is a real
 * answer, not an error: OCR is out of scope, and the viewer still works.
 */
export async function extractPdfText(bytes: ArrayBuffer): Promise<ExtractedPdfText> {
  // pdfjs takes ownership of the buffer it is handed, so give it a copy —
  // the caller keeps using the original for the on-screen viewer.
  const task = pdfjsLib.getDocument({ data: bytes.slice(0) })
  const doc = await task.promise

  try {
    const pageCount = doc.numPages
    const limit = Math.min(pageCount, MAX_PAGES)
    const chunks: string[] = []
    let chars = 0
    let truncated = limit < pageCount
    let pagesExtracted = 0

    for (let n = 1; n <= limit; n++) {
      const page = await doc.getPage(n)
      try {
        const content = await page.getTextContent()
        const body = itemsToText(content.items as TextItemLike[])
        pagesExtracted = n
        if (!body) continue

        const chunk = `[Page ${n}]\n${body}`
        chunks.push(chunk)
        chars += chunk.length
        if (chars >= MAX_CHARS) {
          truncated = true
          break
        }
      } finally {
        // Release the page's operator list — without this a few hundred
        // pages of extraction keeps every page object alive at once.
        page.cleanup()
      }
    }

    return {
      text: chunks.join('\n\n').trimEnd(),
      pageCount,
      pagesExtracted,
      truncated,
    }
  } finally {
    await doc.destroy().catch(() => {})
  }
}

interface TextItemLike {
  str?: string
  hasEOL?: boolean
}

/**
 * Join a page's text items back into lines. pdfjs emits one item per run of
 * same-styled glyphs and flags the last run of each visual line with
 * `hasEOL`, which is a far better line oracle than guessing from coordinates.
 */
function itemsToText(items: TextItemLike[]): string {
  let out = ''
  for (const item of items) {
    if (typeof item.str !== 'string') continue
    out += item.str
    if (item.hasEOL) out += '\n'
  }
  // Collapse the blank-line runs that PDFs love (leading/trailing spaces on
  // otherwise empty lines) without touching real paragraph breaks.
  return out
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
