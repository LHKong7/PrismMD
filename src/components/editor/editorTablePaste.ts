import { EditorView } from '@codemirror/view'

/**
 * Parse an HTML table string into a 2D array of cell text.
 * Only returns a result when the clipboard content is PURELY a table
 * (no significant text outside the table element), so mixed content
 * like "paragraph + table + paragraph" falls through to default paste.
 */
function parseHtmlTable(html: string): string[][] | null {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const table = doc.querySelector('table')
  if (!table) return null

  // Check if there is meaningful content outside the table.
  // Clone the body, remove the table, and see if any text remains.
  const bodyClone = doc.body.cloneNode(true) as HTMLElement
  const tables = bodyClone.querySelectorAll('table')
  tables.forEach((t) => t.remove())
  const remainingText = bodyClone.textContent?.trim() ?? ''
  if (remainingText.length > 0) {
    // Mixed content — don't intercept; let default paste handle it.
    return null
  }

  const rows: string[][] = []
  for (const tr of table.querySelectorAll('tr')) {
    const cells: string[] = []
    for (const cell of tr.querySelectorAll('th, td')) {
      cells.push((cell.textContent ?? '').trim().replace(/\|/g, '\\|'))
    }
    if (cells.length > 0) rows.push(cells)
  }
  return rows.length > 0 ? rows : null
}

/**
 * Parse tab-separated (TSV) text into a 2D array.
 * Only treated as a table if there are at least 2 rows and 2 columns.
 */
function parseTsv(text: string): string[][] | null {
  const lines = text.split('\n').filter((l) => l.trim().length > 0)
  if (lines.length < 2) return null

  const rows = lines.map((line) =>
    line.split('\t').map((cell) => cell.trim().replace(/\|/g, '\\|')),
  )

  // All rows must have the same column count (or close)
  const cols = rows[0].length
  if (cols < 2) return null
  if (!rows.every((r) => r.length === cols)) return null

  return rows
}

/**
 * Convert a 2D cell array to a markdown table string.
 */
function toMarkdownTable(rows: string[][]): string {
  const cols = rows[0].length

  // Pad each column to equal width for readability
  const widths: number[] = Array(cols).fill(3)
  for (const row of rows) {
    for (let c = 0; c < cols; c++) {
      widths[c] = Math.max(widths[c], (row[c] ?? '').length)
    }
  }

  const pad = (text: string, width: number) => text.padEnd(width)

  const lines: string[] = []

  // Header row (first row)
  lines.push('| ' + rows[0].map((c, i) => pad(c, widths[i])).join(' | ') + ' |')

  // Separator
  lines.push('| ' + widths.map((w) => '-'.repeat(w)).join(' | ') + ' |')

  // Data rows
  for (let r = 1; r < rows.length; r++) {
    lines.push('| ' + rows[r].map((c, i) => pad(c ?? '', widths[i])).join(' | ') + ' |')
  }

  return lines.join('\n')
}

/**
 * CodeMirror extension that intercepts paste events containing
 * HTML tables or tab-separated data and converts them to markdown tables.
 */
export const tablePasteExtension = EditorView.domEventHandlers({
  paste(event, view) {
    const clipboard = event.clipboardData
    if (!clipboard) return false

    // Try HTML first — Excel, Google Sheets, web tables all copy HTML
    const html = clipboard.getData('text/html')
    if (html) {
      const rows = parseHtmlTable(html)
      if (rows) {
        event.preventDefault()
        const md = toMarkdownTable(rows)
        const { from, to } = view.state.selection.main
        view.dispatch({
          changes: { from, to, insert: md },
          selection: { anchor: from + md.length },
        })
        return true
      }
    }

    // Fallback: tab-separated plain text (e.g. pasted from spreadsheets without HTML)
    const text = clipboard.getData('text/plain')
    if (text && text.includes('\t')) {
      const rows = parseTsv(text)
      if (rows) {
        event.preventDefault()
        const md = toMarkdownTable(rows)
        const { from, to } = view.state.selection.main
        view.dispatch({
          changes: { from, to, insert: md },
          selection: { anchor: from + md.length },
        })
        return true
      }
    }

    return false
  },
})
