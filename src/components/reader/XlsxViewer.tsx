import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as XLSX from 'xlsx'
import { useFileStore } from '../../store/fileStore'
import { VirtualTable } from './VirtualTable'
import { TableSkeleton } from './TableSkeleton'
import { ErrorBanner } from './components/ErrorBanner'

// Files larger than this defer SheetJS parsing onto the next tick so
// the skeleton has a chance to paint first.
const ASYNC_PARSE_THRESHOLD_BYTES = 512 * 1024 // 512 KB (xlsx is denser than CSV)

/**
 * XlsxViewer — parses the current XLSX/XLS (binary) via SheetJS and
 * renders one sheet at a time through the shared VirtualTable.
 *
 * Why a sheet switcher instead of concatenating everything: workbooks
 * frequently carry reference sheets (lookups, metadata) with a totally
 * different schema from the "main" sheet. Flattening them loses meaning
 * and makes the header row ambiguous. Tabs are the native mental model
 * for spreadsheet users anyway.
 */
export function XlsxViewer() {
  const { t } = useTranslation()
  const bytes = useFileStore((s) => s.currentBytes)
  const [activeSheet, setActiveSheet] = useState<string | null>(null)
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [loading, setLoading] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  // Defer SheetJS parsing so the skeleton can paint first on big books.
  // Small books parse synchronously to avoid the flash.
  useEffect(() => {
    if (!bytes) {
      setWorkbook(null)
      setLoading(false)
      setParseError(null)
      return
    }
    setParseError(null)
    const parse = () => {
      try {
        return XLSX.read(bytes, { type: 'array' })
      } catch (e) {
        setParseError(e instanceof Error ? e.message : String(e))
        return null
      }
    }
    if (bytes.byteLength < ASYNC_PARSE_THRESHOLD_BYTES) {
      setWorkbook(parse())
      setLoading(false)
      return
    }
    setLoading(true)
    setWorkbook(null)
    let cancelled = false
    const handle = window.setTimeout(() => {
      if (cancelled) return
      const wb = parse()
      if (cancelled) return
      setWorkbook(wb)
      setLoading(false)
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [bytes])

  // Reset active sheet when the file changes, then default to the first.
  useEffect(() => {
    if (!workbook) {
      setActiveSheet(null)
      return
    }
    const first = workbook.SheetNames[0] ?? null
    setActiveSheet((prev) =>
      prev && workbook.SheetNames.includes(prev) ? prev : first,
    )
  }, [workbook])

  const sheetData = useMemo(() => {
    if (!workbook || !activeSheet) return null
    const sheet = workbook.Sheets[activeSheet]
    if (!sheet) return null
    // `header: 1` returns an array-of-arrays — matches what VirtualTable
    // expects. `defval: ''` replaces `undefined` cells with empty strings
    // so the table doesn't mix dashes from different causes.
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
    }) as string[][]
    if (rows.length === 0) return { headers: [], rows: [] }
    const [headers, ...data] = rows
    // Ensure every row has at least as many columns as the header so
    // tanstack-table doesn't render ragged rows.
    const normalized = data.map((r) => {
      const out = new Array<string>(headers.length).fill('')
      for (let i = 0; i < headers.length; i += 1) {
        out[i] = r[i] != null ? String(r[i]) : ''
      }
      return out
    })
    return {
      headers: headers.map((h) => (h != null ? String(h) : '')),
      rows: normalized,
    }
  }, [workbook, activeSheet])

  if (loading) {
    return (
      <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <TableSkeleton label={t('reader.parsing', { size: formatBytes(bytes?.byteLength ?? 0) })} />
      </div>
    )
  }

  if (!bytes || !workbook) {
    return (
      <ErrorBanner
        severity="error"
        title={t('reader.xlsx.parseErrorTitle')}
        message={parseError ?? t('reader.xlsx.parseErrorBody')}
      />
    )
  }

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Sheet tab strip — scrollable horizontally for workbooks with
          many sheets. */}
      <div
        className="flex items-center gap-1 px-2 py-1 border-b overflow-x-auto flex-shrink-0"
        style={{ borderColor: 'var(--border-color)' }}
      >
        {workbook.SheetNames.map((name) => {
          const active = name === activeSheet
          return (
            <button
              key={name}
              onClick={() => setActiveSheet(name)}
              className="px-2 py-0.5 rounded text-xs whitespace-nowrap transition-colors"
              style={{
                backgroundColor: active ? 'var(--accent-color)' : 'transparent',
                color: active ? '#fff' : 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
              }}
            >
              {name}
            </button>
          )
        })}
      </div>

      {sheetData && sheetData.headers.length > 0 ? (
        <>
          <div
            className="px-3 py-1 text-[10px] border-b flex-shrink-0"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
          >
            {t('reader.csv.summary', {
              rows: sheetData.rows.length,
              cols: sheetData.headers.length,
            })}
          </div>
          <div className="flex-1 min-h-0">
            <VirtualTable headers={sheetData.headers} rows={sheetData.rows} />
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t('reader.xlsx.emptySheet')}
          </p>
        </div>
      )}
    </div>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
