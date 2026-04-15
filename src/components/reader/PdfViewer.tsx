import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { Spinner } from '../ui/Spinner'
// The pdfjs worker is shipped alongside pdfjs-dist. Vite's `?url` import
// rewrites this to a static URL that Electron can load from the renderer
// bundle without a network request.
// @ts-expect-error — Vite handles the `?url` query param at bundle time.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useFileStore } from '../../store/fileStore'

// Register the worker URL once per renderer process. Guarded so HMR
// doesn't spam the option setter.
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl as string
}

/**
 * PdfViewer — renders the current PDF one page at a time on a canvas
 * backed by pdfjs-dist.
 *
 * Why paged instead of continuous scroll: this keeps memory usage flat
 * (one rasterized page at a time) and lets us render at device-pixel-
 * ratio scale without tanking large documents. For the typical research
 * workflow (scan → skim → feed to the knowledge graph) paging is
 * sufficient; we can virtualize continuous scroll later if needed.
 */
export function PdfViewer() {
  const { t } = useTranslation()
  const bytes = useFileStore((s) => s.currentBytes)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [loading, setLoading] = useState(false)
  const [pageRendering, setPageRendering] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load (or reload) the PDF whenever the byte payload changes.
  useEffect(() => {
    if (!bytes) {
      setDoc(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    // pdfjs consumes the ArrayBuffer directly. Pass a *copy* — the
    // library occasionally transfers/mutates the underlying buffer.
    const copy = bytes.slice(0)
    const task = pdfjsLib.getDocument({ data: copy })
    task.promise
      .then((d) => {
        if (cancelled) {
          d.destroy().catch(() => {})
          return
        }
        setDoc(d)
        setPageNumber(1)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      task.destroy().catch(() => {})
    }
  }, [bytes])

  // Render the current page on the canvas. Re-renders whenever the
  // doc, pageNumber, or canvas parent size changes.
  useEffect(() => {
    if (!doc || !canvasRef.current) return
    let cancelled = false
    const canvas = canvasRef.current
    setPageRendering(true)

    const render = async () => {
      const page = await doc.getPage(pageNumber)
      if (cancelled) return

      // Scale to the canvas's parent width so the page fills the view
      // without overflowing. We factor in devicePixelRatio so the
      // rasterized text stays crisp on HiDPI screens.
      const parent = canvas.parentElement
      const cssWidth = parent?.clientWidth ?? 800
      const unscaledViewport = page.getViewport({ scale: 1 })
      const scale = Math.min(
        cssWidth / unscaledViewport.width,
        2.5, // cap at 2.5× so tiny pages don't blow up
      )
      const viewport = page.getViewport({ scale })
      const dpr = window.devicePixelRatio || 1

      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      await page.render({
        canvasContext: ctx,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      }).promise
    }

    render()
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      })
      .finally(() => {
        if (!cancelled) setPageRendering(false)
      })

    return () => {
      cancelled = true
    }
  }, [doc, pageNumber])

  if (!bytes) {
    return null
  }

  if (error) {
    return (
      <div
        className="h-full flex items-center justify-center p-8 text-center"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <div className="flex items-start gap-2 max-w-sm text-left">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5 text-red-500" />
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

  const pageCount = doc?.numPages ?? 0
  const canPrev = pageNumber > 1
  const canNext = pageNumber < pageCount

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Page toolbar */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 border-b flex-shrink-0"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <button
          onClick={() => canPrev && setPageNumber((p) => p - 1)}
          disabled={!canPrev}
          className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
          title={t('reader.pdf.prev')}
        >
          <ChevronLeft size={14} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <PageInput
          page={pageNumber}
          pageCount={pageCount}
          onJump={setPageNumber}
          ariaLabel={t('reader.pageInputAria')}
        />
        <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
          / {pageCount || '…'}
        </span>
        <button
          onClick={() => canNext && setPageNumber((p) => p + 1)}
          disabled={!canNext}
          className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
          title={t('reader.pdf.next')}
        >
          <ChevronRight size={14} style={{ color: 'var(--text-secondary)' }} />
        </button>
        {loading && <Spinner size={14} />}
      </div>

      {/* Canvas viewport. We always mount the canvas so the render effect
          can write into it, but show a skeleton overlay when the document
          itself is loading or the page hasn't finished rasterizing yet —
          previously large PDFs showed a blank canvas which read as
          "frozen". */}
      <div className="flex-1 overflow-auto flex justify-center p-4 relative">
        <canvas ref={canvasRef} />
        {(loading || (!doc && pageRendering)) && (
          <PdfSkeleton label={t('reader.pdf.loading')} />
        )}
      </div>
    </div>
  )
}

/**
 * Inline "Go to page N" input. Accepts intermediate values while the
 * user types and only commits on Enter or blur so partial input doesn't
 * thrash the renderer. External page changes (prev/next buttons) are
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
 * Skeleton shown while pdfjs parses the document and rasterizes the
 * first page. Mirrors the chat sidebar's `animate-pulse` rhythm so the
 * loading vocabulary feels consistent across the app.
 */
function PdfSkeleton({ label }: { label: string }) {
  return (
    <div
      className="absolute inset-4 flex flex-col items-center justify-center gap-3 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <div
        className="w-full max-w-2xl h-full rounded-md animate-pulse"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      />
      <span
        className="absolute text-xs"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </span>
    </div>
  )
}
