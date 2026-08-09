import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react'
import type { PDFDocumentProxy, PageViewport } from 'pdfjs-dist'
import { Spinner } from '../ui/Spinner'
import { usePaneFileData } from '../../hooks/usePaneFileData'
import { usePdfSearch } from '../../hooks/usePdfSearch'
import { InFileSearchBar } from './InFileSearchBar'
import { pdfjsLib } from '../../lib/pdf/pdfjs'
import { ErrorBanner } from './components/ErrorBanner'
import '../../styles/pdf.css'

/**
 * PdfViewer — continuous, virtualized PDF rendering with a real text layer.
 *
 * This replaced a one-page-at-a-time canvas. Paging was a defensible trade
 * while PDFs were a side feature of a note app, but reader mode makes them
 * the main event, and the old viewer couldn't select, copy, or search text
 * at all — the canvas was the only thing on screen.
 *
 * Two things keep continuous scroll affordable:
 *
 *  - **Virtualization.** Page geometry is computed once from every page's
 *    viewport, so the scrollbar is correct for the whole document, but only
 *    pages within `OVERSCAN_PX` of the viewport are mounted. Memory stays
 *    proportional to the window, not the document.
 *  - **Per-page teardown.** Each page cancels its render task and drops its
 *    canvas when it scrolls out, so rasterized bitmaps don't accumulate.
 */

/** Render pages this far outside the viewport so scrolling feels instant. */
const OVERSCAN_PX = 800
/** Gap between pages, in CSS px at scale 1. */
const PAGE_GAP = 16
/** Matches the page ceiling in `lib/pdf/extractText.ts`. */
const MAX_PAGES = 2000

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const

interface PageBox {
  pageNumber: number
  /** CSS px at the current scale. */
  width: number
  height: number
  top: number
}

export function PdfViewer() {
  const { t } = useTranslation()
  const { bytes } = usePaneFileData()
  const scrollRef = useRef<HTMLDivElement>(null)

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  /** Unscaled page sizes, indexed by pageNumber - 1. */
  const [sizes, setSizes] = useState<Array<{ width: number; height: number }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [containerWidth, setContainerWidth] = useState(0)
  /** User zoom multiplier on top of fit-to-width. */
  const [zoom, setZoom] = useState(1)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const search = usePdfSearch(doc, sizes.length)

  // ── Load the document ──
  useEffect(() => {
    if (!bytes) {
      setDoc(null)
      setSizes([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    // pdfjs consumes the ArrayBuffer directly. Pass a *copy* — the library
    // occasionally transfers/mutates the underlying buffer.
    const task = pdfjsLib.getDocument({ data: bytes.slice(0) })
    task.promise
      .then(async (d) => {
        if (cancelled) {
          d.destroy().catch(() => {})
          return
        }
        // Collect every page's intrinsic size up front so the scrollbar
        // reflects the true document length instead of growing as pages
        // render. This is metadata only — no rasterization.
        const count = Math.min(d.numPages, MAX_PAGES)
        const collected: Array<{ width: number; height: number }> = []
        for (let n = 1; n <= count; n++) {
          if (cancelled) return
          const page = await d.getPage(n)
          const v = page.getViewport({ scale: 1 })
          collected.push({ width: v.width, height: v.height })
        }
        if (cancelled) return
        setDoc(d)
        setSizes(collected)
        setCurrentPage(1)
        scrollRef.current?.scrollTo({ top: 0 })
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      task.destroy().catch(() => {})
    }
  }, [bytes])

  // ── Track the viewport ──
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => {
      setContainerWidth(el.clientWidth)
      setViewportHeight(el.clientHeight)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [doc])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (el) setScrollTop(el.scrollTop)
  }, [])

  // ── Geometry ──
  // Fit the widest page to the container, then apply the user's zoom. Using
  // the widest page (not each page's own) keeps a mixed-orientation document
  // from jumping in size as you scroll.
  const scale = useMemo(() => {
    if (sizes.length === 0 || containerWidth === 0) return 1
    const widest = Math.max(...sizes.map((s) => s.width))
    const padding = 32
    return ((containerWidth - padding) / widest) * zoom
  }, [sizes, containerWidth, zoom])

  const { boxes, totalHeight } = useMemo(() => {
    let top = PAGE_GAP
    const out: PageBox[] = sizes.map((s, i) => {
      const box: PageBox = {
        pageNumber: i + 1,
        width: s.width * scale,
        height: s.height * scale,
        top,
      }
      top += box.height + PAGE_GAP
      return box
    })
    return { boxes: out, totalHeight: top }
  }, [sizes, scale])

  // ── Virtualization + page indicator ──
  const visible = useMemo(() => {
    if (boxes.length === 0) return []
    const from = scrollTop - OVERSCAN_PX
    const to = scrollTop + viewportHeight + OVERSCAN_PX
    return boxes.filter((b) => b.top + b.height >= from && b.top <= to)
  }, [boxes, scrollTop, viewportHeight])

  useEffect(() => {
    if (boxes.length === 0) return
    // "Current" is the page covering the upper third of the viewport — the
    // one the reader is actually looking at, not the sliver still leaving.
    const probe = scrollTop + viewportHeight / 3
    const hit = boxes.find((b) => probe >= b.top && probe < b.top + b.height)
    if (hit && hit.pageNumber !== currentPage) setCurrentPage(hit.pageNumber)
  }, [scrollTop, viewportHeight, boxes, currentPage])

  const jumpToPage = useCallback(
    (n: number) => {
      const box = boxes[n - 1]
      if (!box || !scrollRef.current) return
      scrollRef.current.scrollTo({ top: Math.max(0, box.top - PAGE_GAP) })
    },
    [boxes],
  )

  // Cmd/Ctrl+F — find in this PDF. Scoped to while the viewer is mounted so
  // it doesn't fight the markdown reader's own search binding.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        search.setOpen(true)
      } else if (e.key === 'Escape' && search.open) {
        search.setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [search])

  // Follow the active match. Jumping scrolls the page into view; the
  // highlight itself is applied by the page once its text layer exists.
  const activeMatch = search.current
  useEffect(() => {
    if (activeMatch) jumpToPage(activeMatch.page)
  }, [activeMatch, jumpToPage])

  const stepZoom = (dir: 1 | -1) => {
    const idx = ZOOM_STEPS.findIndex((z) => z >= zoom - 0.001)
    const next = ZOOM_STEPS[Math.min(Math.max(0, idx + dir), ZOOM_STEPS.length - 1)]
    setZoom(next ?? 1)
  }

  // A PDF page with no bytes means the asset file went missing (a workspace
  // DB copied without its assets folder) — say so instead of rendering an
  // empty pane the user can't interpret.
  if (!bytes) {
    return (
      <ErrorBanner
        severity="error"
        title={t('reader.asset.missingTitle')}
        message={t('reader.asset.missingBody')}
      />
    )
  }

  if (error) {
    return (
      <div
        className="h-full flex items-center justify-center p-8 text-center"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <div className="flex items-start gap-2 max-w-sm text-left">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5 text-error" />
          <div>
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
              {t('reader.pdf.errorTitle')}
            </h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {error}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const pageCount = sizes.length

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div
        className="flex items-center gap-2 px-3 py-1.5 border-b flex-shrink-0"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <button
          onClick={() => jumpToPage(currentPage - 1)}
          disabled={currentPage <= 1}
          className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
          title={t('reader.pdf.prev')}
        >
          <ChevronLeft size={14} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <PageInput
          page={currentPage}
          pageCount={pageCount}
          onJump={jumpToPage}
          ariaLabel={t('reader.pageInputAria')}
        />
        <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
          / {pageCount || '…'}
        </span>
        <button
          onClick={() => jumpToPage(currentPage + 1)}
          disabled={currentPage >= pageCount}
          className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
          title={t('reader.pdf.next')}
        >
          <ChevronRight size={14} style={{ color: 'var(--text-secondary)' }} />
        </button>

        <div className="flex-1" />

        <button
          onClick={() => stepZoom(-1)}
          disabled={zoom <= ZOOM_STEPS[0]}
          className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30"
          title={t('reader.pdf.zoomOut', 'Zoom out')}
          aria-label={t('reader.pdf.zoomOut', 'Zoom out')}
        >
          <Minus size={14} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <button
          onClick={() => setZoom(1)}
          className="text-xs tabular-nums px-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
          style={{ color: 'var(--text-muted)' }}
          title={t('reader.pdf.zoomReset', 'Fit width')}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={() => stepZoom(1)}
          disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
          className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30"
          title={t('reader.pdf.zoomIn', 'Zoom in')}
          aria-label={t('reader.pdf.zoomIn', 'Zoom in')}
        >
          <Plus size={14} style={{ color: 'var(--text-secondary)' }} />
        </button>
        {loading && <Spinner size={14} />}
      </div>

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-auto relative">
        {search.open && (
          <div className="sticky top-2 z-20 flex justify-end pr-3 pointer-events-none">
            <div className="pointer-events-auto">
              <InFileSearchBar
                query={search.query}
                onQueryChange={search.setQuery}
                matchCount={search.matches.length}
                currentIdx={search.currentIdx}
                onPrev={search.prev}
                onNext={search.next}
                onClose={() => search.setOpen(false)}
              />
            </div>
          </div>
        )}
        {loading && <PdfSkeleton label={t('reader.pdf.loading')} />}
        <div className="relative mx-auto" style={{ height: totalHeight, width: '100%' }}>
          {visible.map((box) => (
            <PdfPage
              key={box.pageNumber}
              doc={doc}
              box={box}
              scale={scale}
              containerWidth={containerWidth}
              highlight={search.open ? search.query.trim() : ''}
              activeOffset={activeMatch?.page === box.pageNumber ? activeMatch.offset : null}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * One page: a rasterized canvas with pdfjs's transparent text layer on top.
 * Mounted only while near the viewport; unmounting cancels the render task
 * and releases the bitmap.
 */
function PdfPage({
  doc,
  box,
  scale,
  containerWidth,
  highlight,
  activeOffset,
}: {
  doc: PDFDocumentProxy | null
  box: PageBox
  scale: number
  containerWidth: number
  /** Current find query; empty when the search bar is closed. */
  highlight: string
  /** Character offset of the active match on this page, else null. */
  activeOffset: number | null
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [rendered, setRendered] = useState(false)

  useEffect(() => {
    if (!doc) return
    let cancelled = false
    let renderTask: { cancel: () => void } | null = null
    setRendered(false)

    const run = async () => {
      const page = await doc.getPage(box.pageNumber)
      if (cancelled) return
      const viewport: PageViewport = page.getViewport({ scale })

      const canvas = canvasRef.current
      if (!canvas) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const task = page.render({
        canvasContext: ctx,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      })
      renderTask = task
      await task.promise
      if (cancelled) return

      // The text layer is what makes the PDF selectable, copyable and
      // reachable by find — the canvas alone is just a picture.
      const container = textRef.current
      if (container) {
        container.replaceChildren()
        const textLayer = new pdfjsLib.TextLayer({
          textContentSource: page.streamTextContent(),
          container,
          viewport,
        })
        await textLayer.render()
      }
      if (!cancelled) setRendered(true)
    }

    run().catch((err: unknown) => {
      // A cancelled render rejects with RenderingCancelledException — that's
      // just a page scrolling away, not a failure worth surfacing.
      if (!cancelled && !/cancel/i.test(String(err))) {
        console.warn('[pdf] page render failed:', box.pageNumber, err)
      }
    })

    return () => {
      cancelled = true
      renderTask?.cancel()
      textRef.current?.replaceChildren()
    }
  }, [doc, box.pageNumber, scale])

  // Highlight find matches inside this page's text layer.
  //
  // Matching has to span runs: pdfjs emits one <span> per text run, so
  // "SECTION 5 MARKER" is five spans and no single one contains the phrase.
  // Concatenating the runs reproduces exactly the string `usePdfSearch`
  // indexed (both are `items.map(str).join('')`), so offsets from the search
  // line up here by construction. Whole overlapping runs get marked rather
  // than splitting text nodes — the spans are absolutely positioned, and
  // re-wrapping their contents would shift text off the glyphs beneath.
  useEffect(() => {
    const container = textRef.current
    if (!container) return
    const spans = [...container.querySelectorAll('span')].filter(
      (el) => !el.classList.contains('endOfContent'),
    )
    spans.forEach((el) => el.classList.remove('pdf-find-hit', 'pdf-find-active'))

    const needle = highlight.toLowerCase()
    if (!needle) return

    // Run i covers [starts[i], starts[i] + len) of the page's text.
    const starts: number[] = []
    let joined = ''
    for (const el of spans) {
      starts.push(joined.length)
      joined += el.textContent ?? ''
    }
    joined = joined.toLowerCase()

    const markRange = (from: number, to: number, active: boolean) => {
      spans.forEach((el, i) => {
        const spanStart = starts[i]
        const spanEnd = spanStart + (el.textContent?.length ?? 0)
        if (spanEnd <= from || spanStart >= to) return
        el.classList.add('pdf-find-hit')
        if (active) el.classList.add('pdf-find-active')
      })
    }

    for (let at = joined.indexOf(needle); at !== -1; at = joined.indexOf(needle, at + needle.length)) {
      markRange(at, at + needle.length, at === activeOffset)
    }
  }, [highlight, activeOffset, rendered])

  return (
    <div
      className="absolute"
      style={{
        top: box.top,
        left: Math.max(0, (containerWidth - box.width) / 2),
        width: box.width,
        height: box.height,
      }}
    >
      <div
        className="relative shadow-sm"
        style={{
          width: box.width,
          height: box.height,
          backgroundColor: '#fff',
          // pdfjs reads this to lay out the text runs.
          ['--scale-factor' as string]: String(scale),
        }}
      >
        <canvas ref={canvasRef} className="block" />
        <div ref={textRef} className="pdf-text-layer" />
        {!rendered && (
          <div className="absolute inset-0 animate-pulse" style={{ backgroundColor: 'var(--bg-secondary)' }} />
        )}
      </div>
      <div
        className="absolute -bottom-4 right-0 text-[10px] tabular-nums select-none"
        style={{ color: 'var(--text-muted)' }}
      >
        {box.pageNumber}
      </div>
    </div>
  )
}

/**
 * Inline "Go to page N" input. Accepts intermediate values while the
 * user types and only commits on Enter or blur so partial input doesn't
 * thrash the renderer. External page changes (scrolling, prev/next) are
 * mirrored back via useEffect so the field stays in sync.
 */
function PageInput({
  page,
  pageCount,
  onJump,
  ariaLabel,
}: {
  page: number
  pageCount: number
  onJump: (n: number) => void
  ariaLabel: string
}) {
  const [draft, setDraft] = useState(String(page))
  useEffect(() => {
    setDraft(String(page))
  }, [page])

  const commit = () => {
    const n = parseInt(draft, 10)
    if (!Number.isFinite(n)) {
      setDraft(String(page))
      return
    }
    const clamped = Math.min(Math.max(1, n), Math.max(1, pageCount))
    if (clamped !== page) onJump(clamped)
    setDraft(String(clamped))
  }

  return (
    <input
      type="number"
      min={1}
      max={pageCount || undefined}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      onBlur={commit}
      disabled={pageCount === 0}
      aria-label={ariaLabel}
      className="w-12 text-xs tabular-nums bg-transparent rounded px-1 py-0.5 border focus:outline-none focus-visible:ring-1"
      style={{
        borderColor: 'var(--border-color)',
        color: 'var(--text-secondary)',
      }}
    />
  )
}

/**
 * Skeleton shown while pdfjs parses the document. Mirrors the chat sidebar's
 * `animate-pulse` rhythm so the loading vocabulary feels consistent.
 */
function PdfSkeleton({ label }: { label: string }) {
  return (
    <div
      className="absolute inset-4 flex flex-col items-center justify-center gap-3 pointer-events-none z-10"
      role="status"
      aria-live="polite"
    >
      <div
        className="w-full max-w-2xl h-full rounded-md animate-pulse"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      />
      <span className="absolute text-xs" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
    </div>
  )
}
