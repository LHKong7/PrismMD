import { useCallback, useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'

export interface PdfMatch {
  /** 1-based page number. */
  page: number
  /** Character offset of the match within that page's text. */
  offset: number
}

export interface PdfSearch {
  open: boolean
  setOpen: (v: boolean) => void
  query: string
  setQuery: (q: string) => void
  matches: PdfMatch[]
  currentIdx: number
  current: PdfMatch | null
  next: () => void
  prev: () => void
  indexing: boolean
}

/**
 * Find-in-PDF across the *whole* document.
 *
 * The viewer only mounts pages near the viewport, so a DOM-based search — the
 * approach `useInFileSearch` takes for markdown — would silently only ever
 * find matches on the two or three pages currently rendered. This searches
 * pdfjs's text content instead, which is independent of what's on screen.
 *
 * The per-page text is extracted once per document, lazily on the first
 * search, and cached: a reader who never presses Cmd+F never pays for it.
 */
export function usePdfSearch(doc: PDFDocumentProxy | null, pageCount: number): PdfSearch {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<PdfMatch[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [indexing, setIndexing] = useState(false)

  /** Per-page lowercased text, built once per document. */
  const indexRef = useRef<string[] | null>(null)
  const buildingRef = useRef<Promise<string[]> | null>(null)

  // A new document invalidates everything.
  useEffect(() => {
    indexRef.current = null
    buildingRef.current = null
    setMatches([])
    setCurrentIdx(0)
    setQuery('')
  }, [doc])

  const buildIndex = useCallback(async (): Promise<string[]> => {
    if (indexRef.current) return indexRef.current
    if (buildingRef.current) return buildingRef.current
    if (!doc) return []

    const build = (async () => {
      const pages: string[] = []
      for (let n = 1; n <= pageCount; n++) {
        const page = await doc.getPage(n)
        const content = await page.getTextContent()
        const text = content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join('')
          .toLowerCase()
        pages.push(text)
      }
      indexRef.current = pages
      return pages
    })()

    buildingRef.current = build
    return build
  }, [doc, pageCount])

  // Re-run the search whenever the query changes.
  useEffect(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) {
      setMatches([])
      setCurrentIdx(0)
      return
    }

    let cancelled = false
    setIndexing(indexRef.current === null)
    void buildIndex().then((pages) => {
      if (cancelled) return
      setIndexing(false)
      const found: PdfMatch[] = []
      pages.forEach((text, i) => {
        let from = 0
        for (;;) {
          const at = text.indexOf(needle, from)
          if (at === -1) break
          found.push({ page: i + 1, offset: at })
          from = at + needle.length
        }
      })
      setMatches(found)
      setCurrentIdx(0)
    })

    return () => {
      cancelled = true
    }
  }, [query, buildIndex])

  const step = useCallback(
    (delta: number) => {
      setCurrentIdx((i) => {
        if (matches.length === 0) return 0
        return (i + delta + matches.length) % matches.length
      })
    },
    [matches.length],
  )

  return {
    open,
    setOpen,
    query,
    setQuery,
    matches,
    currentIdx,
    current: matches[currentIdx] ?? null,
    next: () => step(1),
    prev: () => step(-1),
    indexing,
  }
}
