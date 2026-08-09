/**
 * Shared pdfjs-dist entry point.
 *
 * The worker URL must be registered exactly once per renderer process, and
 * two consumers need it (`PdfViewer` for rasterizing, `extractPdfText` for
 * indexing), so the setup lives here instead of in either of them.
 */
import * as pdfjsLib from 'pdfjs-dist'
// Vite rewrites `?url` to a static asset URL that Electron loads straight
// from the renderer bundle — no network request, no CSP surprises.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl as string
}

export { pdfjsLib }
