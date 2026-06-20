import { syntaxTree } from '@codemirror/language'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from '@codemirror/view'
import { RangeSetBuilder, StateField, type EditorState } from '@codemirror/state'
import i18n from '../../i18n'

/**
 * WYSIWYG table widget for the markdown editor (rich edit mode).
 *
 * Instead of forcing the user to edit raw `| … |` GFM source, each cell is a
 * real `<input>` you can click and type into, with Notion-style handles to
 * insert / delete rows & columns and set column alignment. The markdown source
 * remains the single source of truth: every edit is serialized back and written
 * into the CodeMirror document.
 *
 * Why `<input>` (not contentEditable): CodeMirror's `.cm-content` is itself a
 * contentEditable surface with a DOMObserver. Nesting another contentEditable
 * inside a widget fights CM's selection/mutation handling. Native form controls
 * are editing "islands" — typing in them changes `value` without mutating the
 * DOM tree, so CM's observer stays quiet and the two never collide.
 */

const t = (key: string) => i18n.t(`editorTable.${key}`)

// --- Source parsing / serialization -----------------------------------------

type Align = 'left' | 'center' | 'right' | null

interface TableModel {
  aligns: Align[]
  rows: string[][] // rows[0] is the header; the rest are body rows
}

/** Split a `| a | b |` row into trimmed cell strings (honours `\|` escapes). */
function splitRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  const cells: string[] = []
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '\\' && s[i + 1] === '|') {
      cur += '|'
      i++
      continue
    }
    if (ch === '|') {
      cells.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  cells.push(cur)
  return cells.map((c) => c.trim())
}

function parseAlign(cell: string): Align {
  const c = cell.trim()
  const l = c.startsWith(':')
  const r = c.endsWith(':')
  if (l && r) return 'center'
  if (r) return 'right'
  if (l) return 'left'
  return null
}

/** Parse GFM table source into a normalized model (equal column counts). */
function parseTable(source: string): TableModel {
  const lines = source.split('\n').filter((l) => l.trim() !== '')
  if (lines.length === 0) return { aligns: [null], rows: [['']] }
  const header = splitRow(lines[0])
  const rawAligns = lines.length > 1 ? splitRow(lines[1]).map(parseAlign) : []
  const cols = Math.max(header.length, 1)
  const norm = (r: string[]): string[] => {
    const out = r.slice(0, cols)
    while (out.length < cols) out.push('')
    return out
  }
  const body = lines.slice(2).map(splitRow).map(norm)
  return {
    aligns: Array.from({ length: cols }, (_, i) => rawAligns[i] ?? null),
    rows: [norm(header), ...body],
  }
}

/** Escape a cell's text so it survives a round-trip through GFM source. */
function escapeCell(text: string): string {
  return text.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|')
}

/** Build the delimiter token for a column given its alignment and width. */
function alignDelim(align: Align, width: number): string {
  const w = Math.max(width, 3)
  switch (align) {
    case 'left':
      return ':' + '-'.repeat(w - 1)
    case 'right':
      return '-'.repeat(w - 1) + ':'
    case 'center':
      return ':' + '-'.repeat(Math.max(w - 2, 1)) + ':'
    default:
      return '-'.repeat(w)
  }
}

/** Serialize a model back into padded, readable GFM table source. */
function serializeTable(model: TableModel): string {
  const cols = model.rows[0]?.length ?? 0
  if (cols === 0) return ''
  const widths: number[] = Array(cols).fill(3)
  for (const row of model.rows) {
    for (let c = 0; c < cols; c++) {
      widths[c] = Math.max(widths[c], escapeCell(row[c] ?? '').length)
    }
  }
  const pad = (text: string, w: number) => text.padEnd(w)
  const lines: string[] = []
  lines.push(
    '| ' + model.rows[0].map((c, i) => pad(escapeCell(c ?? ''), widths[i])).join(' | ') + ' |',
  )
  lines.push('| ' + model.aligns.map((a, i) => alignDelim(a, widths[i])).join(' | ') + ' |')
  for (let r = 1; r < model.rows.length; r++) {
    lines.push(
      '| ' + model.rows[r].map((c, i) => pad(escapeCell(c ?? ''), widths[i])).join(' | ') + ' |',
    )
  }
  return lines.join('\n')
}

/** Read the live model straight out of the widget DOM (inputs + aligns). */
function readModelFromDom(wrap: HTMLElement): TableModel {
  const ths = Array.from(wrap.querySelectorAll('thead th'))
  const header = ths.map((th) => th.querySelector('input')?.value ?? '')
  const aligns = ths.map((th) => ((th as HTMLElement).dataset.align || null) as Align)
  const rows: string[][] = [header]
  wrap.querySelectorAll('tbody tr').forEach((tr) => {
    const inputs = Array.from(tr.querySelectorAll('input'))
    rows.push(inputs.map((i) => (i as HTMLInputElement).value))
  })
  return { aligns, rows }
}

// --- Document range resolution ----------------------------------------------

/** Scan outward from `pos` over contiguous pipe-bearing lines (fallback). */
function scanRange(state: EditorState, pos: number): { from: number; to: number } {
  const line = state.doc.lineAt(pos)
  let from = line.from
  let to = line.to
  let n = line.number
  while (n > 1) {
    const prev = state.doc.line(n - 1)
    if (prev.text.trim() === '' || !prev.text.includes('|')) break
    from = prev.from
    n--
  }
  n = line.number
  while (n < state.doc.lines) {
    const next = state.doc.line(n + 1)
    if (next.text.trim() === '' || !next.text.includes('|')) break
    to = next.to
    n++
  }
  return { from, to }
}

/**
 * Resolve the document range currently occupied by this widget's table.
 * Uses the widget DOM position (robust against edits elsewhere) and the syntax
 * tree, falling back to a line scan.
 */
function getTableRange(view: EditorView, wrap: HTMLElement): { from: number; to: number } | null {
  // A detached widget (CM tore it down) makes posAtDOM resolve a bogus 0 /
  // doc.length position instead of throwing — bail before that corrupts a range.
  if (!view.contentDOM.contains(wrap)) return null
  let pos: number
  try {
    pos = view.posAtDOM(wrap)
  } catch {
    return null
  }
  const state = view.state
  const tree = syntaxTree(state)
  let res: { from: number; to: number } | null = null
  tree.iterate({
    from: pos,
    to: Math.min(pos + 1, state.doc.length),
    enter(node) {
      if (node.name === 'Table') {
        res = { from: state.doc.lineAt(node.from).from, to: state.doc.lineAt(node.to).to }
        return false
      }
      return undefined
    },
  })
  return res ?? scanRange(state, pos)
}

// --- DOM helpers -------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  return node
}

function iconBtn(glyph: string, className: string, title: string): HTMLButtonElement {
  const b = el('button', className)
  b.type = 'button'
  b.textContent = glyph
  b.title = title
  b.setAttribute('aria-label', title)
  b.tabIndex = -1
  return b
}

// --- Floating menu (column / row options) -----------------------------------

let activeMenuCleanup: (() => void) | null = null

function closeMenu() {
  if (activeMenuCleanup) {
    activeMenuCleanup()
    activeMenuCleanup = null
  }
}

interface MenuItem {
  label?: string
  active?: boolean
  divider?: boolean
  action?: () => void
}

function openMenu(wrap: HTMLElement, anchor: HTMLElement, items: MenuItem[]) {
  closeMenu()
  const menu = el('div', 'cm-tbl-menu')
  for (const it of items) {
    if (it.divider) {
      menu.appendChild(el('div', 'cm-tbl-menu-sep'))
      continue
    }
    const b = el('button', 'cm-tbl-menu-item' + (it.active ? ' active' : ''))
    b.type = 'button'
    b.textContent = it.label ?? ''
    b.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      closeMenu()
      it.action?.()
    })
    menu.appendChild(b)
  }
  const wrapRect = wrap.getBoundingClientRect()
  const aRect = anchor.getBoundingClientRect()
  menu.style.left = `${aRect.left - wrapRect.left}px`
  menu.style.top = `${aRect.bottom - wrapRect.top + 4}px`
  wrap.appendChild(menu)

  const onDown = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) closeMenu()
  }
  const id = window.setTimeout(() => document.addEventListener('mousedown', onDown, true), 0)
  activeMenuCleanup = () => {
    window.clearTimeout(id)
    document.removeEventListener('mousedown', onDown, true)
    menu.remove()
  }
}

// --- Rendering & editing controller -----------------------------------------

/** Pending debounced-flush timers, keyed by widget wrapper. */
const flushTimers = new WeakMap<HTMLElement, number>()

/** The exact document source each widget DOM was last rendered / synced from. */
const renderBaseline = new WeakMap<HTMLElement, string>()

/**
 * Build (or rebuild) the full table DOM inside `wrap` and wire up every
 * interaction. Called by `toDOM` and by `updateDOM` when an external change
 * needs the DOM re-synced. All handlers re-read the live model from the DOM, so
 * they always act on current values.
 */
function render(wrap: HTMLElement, source: string, view: EditorView) {
  closeMenu()
  const prevTimer = flushTimers.get(wrap)
  if (prevTimer) {
    window.clearTimeout(prevTimer)
    flushTimers.delete(wrap)
  }
  const model = parseTable(source)
  // Remember the exact source this DOM mirrors, so commit() can detect a
  // concurrent external edit and avoid clobbering it (compare-and-swap).
  renderBaseline.set(wrap, source)
  wrap.textContent = ''
  wrap.className = 'cm-tbl'
  wrap.setAttribute('contenteditable', 'false')

  const cols = model.rows[0]?.length ?? 0
  const rowCount = model.rows.length

  // ── write-back ────────────────────────────────────────────────────────────
  const commit = (next: string) => {
    const range = getTableRange(view, wrap)
    if (!range) return
    const currentDoc = view.state.sliceDoc(range.from, range.to)
    // Compare-and-swap: if the document's table source changed out from under us
    // (an external / agent edit) since we last rendered, don't overwrite it with
    // our stale DOM — resync the DOM to the external version instead. This drops
    // any in-flight cell edit, the documented lesser-evil over losing the edit.
    if (currentDoc !== renderBaseline.get(wrap)) {
      render(wrap, currentDoc, view)
      return
    }
    if (currentDoc === next) return
    view.dispatch({ changes: { from: range.from, to: range.to, insert: next } })
    renderBaseline.set(wrap, next)
  }
  /** Flush the live cell values into the document (no structural change). */
  const flush = () => commit(serializeTable(readModelFromDom(wrap)))
  const scheduleFlush = () => {
    const existing = flushTimers.get(wrap)
    if (existing) window.clearTimeout(existing)
    flushTimers.set(wrap, window.setTimeout(flush, 150))
  }
  const focusCell = (r: number, c: number) => {
    window.requestAnimationFrame(() => {
      const colN = wrap.querySelectorAll('thead th').length
      const rowN = 1 + wrap.querySelectorAll('tbody tr').length
      const rr = Math.max(0, Math.min(r, rowN - 1))
      const cc = Math.max(0, Math.min(c, colN - 1))
      const inp = wrap.querySelector<HTMLInputElement>(
        `input[data-row="${rr}"][data-col="${cc}"]`,
      )
      if (inp) {
        inp.focus()
        inp.setSelectionRange(inp.value.length, inp.value.length)
      }
    })
  }

  // ── structural operations (read live model → mutate → commit) ─────────────
  const blurActive = () => {
    const ae = document.activeElement as HTMLElement | null
    if (ae && ae.tagName === 'INPUT' && wrap.contains(ae)) ae.blur()
  }
  const insertCol = (at: number) => {
    blurActive()
    const m = readModelFromDom(wrap)
    const pos = Math.max(0, Math.min(at, m.rows[0].length))
    m.rows.forEach((row) => row.splice(pos, 0, ''))
    m.aligns.splice(pos, 0, null)
    commit(serializeTable(m))
    focusCell(0, pos)
  }
  const deleteCol = (i: number) => {
    blurActive()
    const m = readModelFromDom(wrap)
    if (m.rows[0].length <= 1) return
    m.rows.forEach((row) => row.splice(i, 1))
    m.aligns.splice(i, 1)
    commit(serializeTable(m))
    focusCell(0, Math.max(0, i - 1))
  }
  const insertRow = (at: number) => {
    blurActive()
    const m = readModelFromDom(wrap)
    const colN = m.rows[0].length
    const pos = Math.max(1, Math.min(at, m.rows.length))
    m.rows.splice(pos, 0, Array(colN).fill(''))
    commit(serializeTable(m))
    focusCell(pos, 0)
  }
  const deleteRow = (i: number) => {
    blurActive()
    const m = readModelFromDom(wrap)
    if (i <= 0 || m.rows.length <= 1) return // never delete the header
    m.rows.splice(i, 1)
    commit(serializeTable(m))
    focusCell(Math.min(i, m.rows.length - 1), 0)
  }
  const setAlign = (i: number, align: Align) => {
    blurActive()
    const m = readModelFromDom(wrap)
    m.aligns[i] = align
    commit(serializeTable(m))
    focusCell(0, i)
  }
  const deleteTable = () => {
    blurActive()
    const range = getTableRange(view, wrap)
    if (!range) return
    let to = range.to
    if (to < view.state.doc.length && view.state.sliceDoc(to, to + 1) === '\n') to += 1
    view.dispatch({
      changes: { from: range.from, to, insert: '' },
      selection: { anchor: range.from },
    })
    view.focus()
  }

  const makeCell = (text: string, r: number, c: number): HTMLInputElement => {
    const input = el('input', 'cm-tbl-cell')
    input.type = 'text'
    input.value = text
    input.dataset.row = String(r)
    input.dataset.col = String(c)
    input.spellcheck = false
    const align = model.aligns[c]
    if (align) input.style.textAlign = align
    input.addEventListener('input', scheduleFlush)
    input.addEventListener('blur', () => {
      const existing = flushTimers.get(wrap)
      if (existing) {
        window.clearTimeout(existing)
        flushTimers.delete(wrap)
      }
      flush()
    })
    input.addEventListener('keydown', (e) => {
      const colN = wrap.querySelectorAll('thead th').length
      const rowN = 1 + wrap.querySelectorAll('tbody tr').length
      const atStart = input.selectionStart === 0 && input.selectionEnd === 0
      const atEnd =
        input.selectionStart === input.value.length && input.selectionEnd === input.value.length
      if (e.key === 'Tab') {
        e.preventDefault()
        if (e.shiftKey) {
          if (c - 1 >= 0) focusCell(r, c - 1)
          else if (r - 1 >= 0) focusCell(r - 1, colN - 1)
        } else if (c + 1 < colN) focusCell(r, c + 1)
        else if (r + 1 < rowN) focusCell(r + 1, 0)
        else insertRow(rowN)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (r + 1 < rowN) focusCell(r + 1, c)
        else insertRow(rowN)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        input.blur()
        view.focus()
      } else if (e.key === 'ArrowUp' && r > 0) {
        e.preventDefault()
        focusCell(r - 1, c)
      } else if (e.key === 'ArrowDown' && r + 1 < rowN) {
        e.preventDefault()
        focusCell(r + 1, c)
      } else if (e.key === 'ArrowLeft' && atStart && c > 0) {
        e.preventDefault()
        focusCell(r, c - 1)
      } else if (e.key === 'ArrowRight' && atEnd && c + 1 < colN) {
        e.preventDefault()
        focusCell(r, c + 1)
      }
    })
    return input
  }

  // ── table ─────────────────────────────────────────────────────────────────
  const main = el('div', 'cm-tbl-main')
  const scroll = el('div', 'cm-tbl-scroll')
  const table = el('table', 'cm-tbl-grid')

  const thead = el('thead')
  const htr = el('tr')
  model.rows[0].forEach((cell, c) => {
    const th = el('th', 'cm-tbl-th')
    th.dataset.col = String(c)
    th.dataset.align = model.aligns[c] ?? ''
    th.appendChild(makeCell(cell, 0, c))
    const menuBtn = iconBtn('⋯', 'cm-tbl-colmenu', t('columnOptions'))
    menuBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const curAlign = (th.dataset.align || null) as Align
      openMenu(wrap, menuBtn, [
        { label: t('insertColLeft'), action: () => insertCol(c) },
        { label: t('insertColRight'), action: () => insertCol(c + 1) },
        { divider: true },
        { label: t('alignLeft'), active: curAlign === 'left', action: () => setAlign(c, 'left') },
        {
          label: t('alignCenter'),
          active: curAlign === 'center',
          action: () => setAlign(c, 'center'),
        },
        {
          label: t('alignRight'),
          active: curAlign === 'right',
          action: () => setAlign(c, 'right'),
        },
        { divider: true },
        { label: t('deleteColumn'), action: () => deleteCol(c) },
      ])
    })
    th.appendChild(menuBtn)
    htr.appendChild(th)
  })
  thead.appendChild(htr)
  table.appendChild(thead)

  const tbody = el('tbody')
  for (let r = 1; r < rowCount; r++) {
    const tr = el('tr', 'cm-tbl-row')
    tr.dataset.row = String(r)
    model.rows[r].forEach((cell, c) => {
      const td = el('td', 'cm-tbl-td')
      td.dataset.col = String(c)
      td.appendChild(makeCell(cell, r, c))
      if (c === 0) {
        const rowBtn = iconBtn('⋮', 'cm-tbl-rowmenu', t('rowOptions'))
        const rr = r
        rowBtn.addEventListener('mousedown', (e) => {
          e.preventDefault()
          e.stopPropagation()
          openMenu(wrap, rowBtn, [
            { label: t('insertRowAbove'), action: () => insertRow(rr) },
            { label: t('insertRowBelow'), action: () => insertRow(rr + 1) },
            { divider: true },
            { label: t('deleteRow'), action: () => deleteRow(rr) },
          ])
        })
        td.appendChild(rowBtn)
      }
      tr.appendChild(td)
    })
    tbody.appendChild(tr)
  }
  table.appendChild(tbody)
  scroll.appendChild(table)
  main.appendChild(scroll)

  // ── append-column bar (right edge) ─────────────────────────────────────────
  const addCol = iconBtn('+', 'cm-tbl-add-col', t('addColumn'))
  addCol.addEventListener('mousedown', (e) => {
    e.preventDefault()
    insertCol(cols)
  })
  main.appendChild(addCol)
  wrap.appendChild(main)

  // ── append-row bar (bottom edge) ───────────────────────────────────────────
  const addRow = iconBtn('+', 'cm-tbl-add-row', t('addRow'))
  addRow.addEventListener('mousedown', (e) => {
    e.preventDefault()
    insertRow(rowCount)
  })
  wrap.appendChild(addRow)

  // ── delete-table (top-right corner) ────────────────────────────────────────
  const del = iconBtn('×', 'cm-tbl-del', t('deleteTable'))
  del.addEventListener('mousedown', (e) => {
    e.preventDefault()
    deleteTable()
  })
  wrap.appendChild(del)
}

// --- Widget ------------------------------------------------------------------

class TableWidget extends WidgetType {
  constructor(readonly source: string) {
    super()
  }

  eq(other: TableWidget) {
    return other.source === this.source
  }

  toDOM(view: EditorView) {
    const wrap = el('div', 'cm-tbl')
    render(wrap, this.source, view)
    return wrap
  }

  updateDOM(dom: HTMLElement, view: EditorView) {
    // While a cell is actively focused, the DOM is authoritative — never
    // disturb it (debounced flushes keep the document in sync). This is what
    // preserves the caret while typing despite the source changing underneath.
    // A concurrent external edit is reconciled later by commit()'s CAS guard.
    const active = document.activeElement
    if (active && active.tagName === 'INPUT' && dom.contains(active)) return true

    // Otherwise reconcile: if the DOM already encodes this source (our own
    // committed edit) leave it; if it differs (external change) rebuild.
    if (serializeTable(readModelFromDom(dom)) === this.source) return true
    render(dom, this.source, view)
    return true
  }

  ignoreEvent() {
    return true
  }

  destroy(dom: HTMLElement) {
    // CM dropped this widget — clear any pending flush (so a stale timer can't
    // write over the wrong range) and close any menu it left open.
    closeMenu()
    const timer = flushTimers.get(dom)
    if (timer) {
      window.clearTimeout(timer)
      flushTimers.delete(dom)
    }
  }

  get estimatedHeight() {
    return -1
  }
}

// --- Decoration builder ------------------------------------------------------

function buildTableDecos(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const tree = syntaxTree(state)
  const sel = state.selection.main

  tree.iterate({
    enter(node) {
      if (node.name === 'Document') return undefined
      if (node.name !== 'Table') return false
      const tFrom = state.doc.lineAt(node.from).from
      const tTo = state.doc.lineAt(node.to).to
      // Cursor / selection inside the table → keep raw source (escape hatch).
      if (sel.from <= tTo && sel.to >= tFrom) return false
      const source = state.sliceDoc(tFrom, tTo)
      builder.add(
        tFrom,
        tTo,
        Decoration.replace({ widget: new TableWidget(source), block: true }),
      )
      return false
    },
  })

  return builder.finish()
}

const tableField = StateField.define<DecorationSet>({
  create(state) {
    return buildTableDecos(state)
  },
  update(deco, tr) {
    if (tr.docChanged || tr.selection) return buildTableDecos(tr.state)
    return deco.map(tr.changes)
  },
  provide: (f) => EditorView.decorations.from(f),
})

const tableTheme = EditorView.baseTheme({
  '.cm-tbl': {
    position: 'relative',
    padding: '6px 20px 6px 22px',
  },
  '.cm-tbl-main': {
    display: 'flex',
    alignItems: 'stretch',
  },
  '.cm-tbl-scroll': {
    flex: '1',
    minWidth: '0',
    overflowX: 'auto',
  },
  '.cm-tbl-grid': {
    borderCollapse: 'collapse',
    width: '100%',
    fontSize: '0.9em',
    fontFamily: 'var(--font-body, ui-sans-serif, system-ui, sans-serif)',
  },
  '.cm-tbl-th, .cm-tbl-td': {
    position: 'relative',
    border: '1px solid var(--border-color)',
    padding: '0',
    verticalAlign: 'middle',
  },
  '.cm-tbl-th': {
    backgroundColor: 'var(--bg-secondary)',
    borderBottomWidth: '2px',
  },
  '.cm-tbl-cell': {
    width: '100%',
    boxSizing: 'border-box',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: 'var(--text-primary)',
    font: 'inherit',
    padding: '0.5em 0.85em',
    margin: '0',
  },
  '.cm-tbl-th .cm-tbl-cell': {
    fontWeight: '600',
  },
  '.cm-tbl-cell:focus': {
    boxShadow: 'inset 0 0 0 2px var(--accent-color)',
    borderRadius: '2px',
  },
  // ── handles: hidden until the table is hovered ─────────────────────────────
  '.cm-tbl-colmenu, .cm-tbl-rowmenu, .cm-tbl-add-col, .cm-tbl-add-row, .cm-tbl-del': {
    position: 'absolute',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    padding: '0',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    background: 'var(--bg-secondary)',
    opacity: '0',
    transition: 'opacity 0.12s ease, background 0.12s ease, color 0.12s ease',
    zIndex: '5',
  },
  '.cm-tbl:hover .cm-tbl-colmenu, .cm-tbl:hover .cm-tbl-rowmenu, .cm-tbl:hover .cm-tbl-add-col, .cm-tbl:hover .cm-tbl-add-row, .cm-tbl:hover .cm-tbl-del':
    {
      opacity: '0.55',
    },
  '.cm-tbl-colmenu:hover, .cm-tbl-rowmenu:hover, .cm-tbl-add-col:hover, .cm-tbl-add-row:hover, .cm-tbl-del:hover':
    {
      opacity: '1',
      background: 'var(--bg-tertiary, var(--bg-secondary))',
      color: 'var(--text-primary)',
    },
  '.cm-tbl-colmenu': {
    top: '1px',
    right: '1px',
    width: '18px',
    height: '18px',
    fontSize: '13px',
    lineHeight: '1',
    borderRadius: '3px',
  },
  '.cm-tbl-rowmenu': {
    left: '-20px',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '16px',
    height: '20px',
    fontSize: '13px',
    lineHeight: '1',
    borderRadius: '3px',
  },
  '.cm-tbl-add-col': {
    position: 'static',
    flex: '0 0 16px',
    marginLeft: '3px',
    borderRadius: '3px',
    fontSize: '14px',
  },
  '.cm-tbl-add-row': {
    position: 'static',
    display: 'block',
    width: '100%',
    height: '15px',
    marginTop: '3px',
    borderRadius: '3px',
    fontSize: '14px',
    lineHeight: '15px',
    textAlign: 'center',
  },
  '.cm-tbl-del': {
    top: '-2px',
    right: '-2px',
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    fontSize: '14px',
    lineHeight: '1',
    zIndex: '6',
  },
  // ── floating option menu ───────────────────────────────────────────────────
  '.cm-tbl-menu': {
    position: 'absolute',
    zIndex: '20',
    minWidth: '150px',
    padding: '4px',
    borderRadius: '8px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border-color)',
    boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
    fontFamily: 'var(--font-ui, var(--font-body))',
    fontSize: '13px',
  },
  '.cm-tbl-menu-item': {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '6px 10px',
    border: 'none',
    borderRadius: '5px',
    background: 'transparent',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    font: 'inherit',
  },
  '.cm-tbl-menu-item:hover': {
    background: 'var(--bg-secondary)',
  },
  '.cm-tbl-menu-item.active': {
    color: 'var(--accent-color)',
    fontWeight: '600',
  },
  '.cm-tbl-menu-sep': {
    height: '1px',
    margin: '4px 6px',
    background: 'var(--border-color)',
  },
  '.cm-tbl-grid code': {
    fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace",
    backgroundColor: 'var(--code-bg)',
    padding: '1px 4px',
    borderRadius: '3px',
    fontSize: '0.9em',
  },
})

/** WYSIWYG table editing for the markdown editor (rich mode). */
export const editorTableWidgetExtension = [tableField, tableTheme]
