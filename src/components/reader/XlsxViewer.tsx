import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as XLSX from 'xlsx'
import { AlertCircle } from 'lucide-react'
import { useFileStore } from '../../store/fileStore'
import { VirtualTable } from './VirtualTable'

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

  const workbook = useMemo(() => {
    if (!bytes) return null
    try {
      // SheetJS accepts an ArrayBuffer directly via `type: 'array'`.
      return XLSX.read(bytes, { type: 'array' })
    } catch {
      return null
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

  if (!bytes || !workbook) {
    return (
      <div
        className="h-full flex items-center justify-center p-8 text-center"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <div className="flex items-start gap-2 max-w-sm text-left">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5 text-red-500" />
          <div>
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
              {t('reader.xlsx.parseErrorTitle')}
            </h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('reader.xlsx.parseErrorBody')}
            </p>
          </div>
        </div>
      </div>
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
