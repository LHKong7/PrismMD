import { useMemo, useRef } from 'react'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'

const ROW_HEIGHT = 28

type Row = readonly string[]

interface VirtualTableProps {
  /** First row is treated as the header. Subsequent rows are data. */
  headers: readonly string[]
  rows: readonly Row[]
}

/**
 * VirtualTable — a sticky-header, column-resizable, row-virtualized table
 * shared by `CsvViewer` and `XlsxViewer`. Handles arbitrary column counts
 * (CSVs with 100+ columns render fine because we don't virtualize
 * columns — most sheets are narrow enough that horizontal scroll is
 * cheaper than column virtualization complexity).
 *
 * Empty cells render as a thin dash so long runs of empty-string columns
 * don't collapse into an ambiguous blank row.
 */
export function VirtualTable({ headers, rows }: VirtualTableProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const columns = useMemo<ColumnDef<Row>[]>(() => {
    return headers.map((header, colIndex) => ({
      id: `col-${colIndex}`,
      header: header || `#${colIndex + 1}`,
      accessorFn: (row: Row) => row[colIndex] ?? '',
      cell: ({ getValue }) => {
        const v = getValue<string>()
        return v === '' ? <span className="opacity-30">—</span> : v
      },
    }))
  }, [headers])

  const table = useReactTable({
    data: rows as Row[],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const { rows: tableRows } = table.getRowModel()

  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    estimateSize: () => ROW_HEIGHT,
    getScrollElement: () => parentRef.current,
    overscan: 12,
  })

  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0
  const paddingBottom =
    virtualRows.length > 0
      ? totalSize - virtualRows[virtualRows.length - 1].end
      : 0

  return (
    <div
      ref={parentRef}
      className="h-full overflow-auto"
      style={{
        backgroundColor: 'var(--bg-primary)',
        // Tabular content uses a monospaced family for alignment cues but
        // keeps system-font fall-backs so long CJK runs remain legible.
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Noto Sans CJK SC", sans-serif',
        fontSize: 12,
      }}
    >
      <table
        className="w-full border-collapse text-left"
        style={{ color: 'var(--text-primary)' }}
      >
        <thead
          className="sticky top-0 z-10"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            // Sticky headers need a solid color otherwise the virtual
            // rows "bleed" through during fast scroll.
            boxShadow: '0 1px 0 var(--border-color)',
          }}
        >
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((h) => (
                <th
                  key={h.id}
                  className="px-2 py-1 font-semibold text-xs uppercase tracking-wider whitespace-nowrap"
                  style={{
                    color: 'var(--text-muted)',
                    borderRight: '1px solid var(--border-color)',
                  }}
                >
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr>
              <td style={{ height: paddingTop }} colSpan={headers.length} />
            </tr>
          )}
          {virtualRows.map((vr) => {
            const row = tableRows[vr.index]
            return (
              <tr
                key={row.id}
                className="hover:bg-black/5 dark:hover:bg-white/5"
                style={{ height: ROW_HEIGHT, borderBottom: '1px solid var(--border-color)' }}
              >
                {row.getVisibleCells().map((c) => (
                  <td
                    key={c.id}
                    className="px-2 whitespace-nowrap overflow-hidden text-ellipsis max-w-[400px]"
                    style={{ borderRight: '1px solid var(--border-color)' }}
                    title={String(c.getValue() ?? '')}
                  >
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </td>
                ))}
              </tr>
            )
          })}
          {paddingBottom > 0 && (
            <tr>
              <td style={{ height: paddingBottom }} colSpan={headers.length} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
