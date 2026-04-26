import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Papa from 'papaparse'
import { AlertCircle } from 'lucide-react'
import { usePaneFileData } from '../../hooks/usePaneFileData'
import { VirtualTable } from './VirtualTable'
import { TableSkeleton } from './TableSkeleton'

// Files larger than this defer parsing onto a microtask + show a
// skeleton so the UI stays responsive on big CSVs (~5MB+).
const ASYNC_PARSE_THRESHOLD_BYTES = 1024 * 1024 // 1 MB

interface ParsedCsv {
  headers: string[]
  rows: string[][]
  error: string | null
}

function parseCsv(content: string): ParsedCsv {
  const result = Papa.parse<string[]>(content, {
    skipEmptyLines: 'greedy',
    // Keep raw strings — a CSV viewer shouldn't silently coerce "01"
    // into a number. The user can inspect the table as-written.
    dynamicTyping: false,
  })
  const firstError = result.errors?.[0]
  const all = result.data as string[][]
  if (all.length === 0) {
    return { headers: [], rows: [], error: firstError?.message ?? null }
  }
  const [headers, ...rows] = all
  return {
    headers: headers.map((h) => h ?? ''),
    rows,
    error: firstError?.message ?? null,
  }
}

/**
 * CsvViewer — parses the current CSV synchronously with papaparse and
 * renders a virtualized table. papaparse handles quoted fields and
 * embedded newlines correctly, which is why we prefer it over a split()
 * shortcut.
 *
 * Very large CSVs (> a few MB) still parse quickly in the main thread,
 * but if we ever need to support 100MB+ files we can switch papaparse
 * to worker mode here without touching the table.
 */
export function CsvViewer() {
  const { t } = useTranslation()
  const { content } = usePaneFileData()
  const [parsed, setParsed] = useState<ParsedCsv | null>(null)
  const [loading, setLoading] = useState(false)

  // Defer parsing for big files so the main thread can render the
  // skeleton first. Small files parse synchronously to avoid the flash.
  useEffect(() => {
    if (!content) {
      setParsed({ headers: [], rows: [], error: null })
      setLoading(false)
      return
    }
    if (content.length < ASYNC_PARSE_THRESHOLD_BYTES) {
      setParsed(parseCsv(content))
      setLoading(false)
      return
    }
    setLoading(true)
    setParsed(null)
    let cancelled = false
    // setTimeout(0) yields one frame so the skeleton paints before the
    // main thread blocks on papaparse. Web Worker would be cleaner but
    // would require shipping a worker bundle just for this viewer.
    const handle = window.setTimeout(() => {
      if (cancelled) return
      const result = parseCsv(content)
      if (cancelled) return
      setParsed(result)
      setLoading(false)
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [content])

  if (loading || !parsed) {
    return (
      <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <TableSkeleton label={t('reader.parsing', { size: formatBytes(content?.length ?? 0) })} />
      </div>
    )
  }

  if (parsed.headers.length === 0) {
    return (
      <div
        className="h-full flex items-center justify-center p-8 text-center"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <div className="max-w-sm">
          <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
            {t('reader.csv.emptyTitle')}
          </h3>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {parsed.error ?? t('reader.csv.emptyBody')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {parsed.error && (
        <div
          className="flex items-start gap-2 px-3 py-2 text-xs border-b"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
        >
          <AlertCircle size={12} className="flex-shrink-0 mt-0.5 text-warning" />
          <span>{t('reader.csv.parseWarning', { error: parsed.error })}</span>
        </div>
      )}
      <div
        className="px-3 py-1 text-[10px] border-b"
        style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
      >
        {t('reader.csv.summary', {
          rows: parsed.rows.length,
          cols: parsed.headers.length,
        })}
      </div>
      <div className="flex-1 min-h-0">
        <VirtualTable headers={parsed.headers} rows={parsed.rows} />
      </div>
    </div>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
