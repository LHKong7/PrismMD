import { syntaxTree } from '@codemirror/language'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'
import i18n from '../../i18n'

/**
 * Interactive checklist for the markdown editor (rich edit mode).
 *
 * GFM task-list items (`- [ ] todo` / `- [x] done`) normally show their raw
 * `[ ]` / `[x]` marker — and the list bullet — as plain text. This replaces the
 * list marker + checkbox marker with a real, clickable checkbox: clicking it
 * toggles the underlying markdown between `[ ]` and `[x]`. Done items get their
 * text struck through. The markdown source stays the single source of truth.
 *
 * Like the rest of the live-preview editor, when the cursor is on a task line
 * the raw source is revealed so it can be edited directly.
 */

const TASK_MARKER_RE = /^\[[ xX]\]$/

class TaskCheckboxWidget extends WidgetType {
  constructor(
    readonly from: number,
    readonly checked: boolean,
  ) {
    super()
  }

  eq(other: TaskCheckboxWidget) {
    return other.from === this.from && other.checked === this.checked
  }

  toDOM(view: EditorView) {
    const box = document.createElement('span')
    box.className = 'cm-task-checkbox' + (this.checked ? ' cm-task-checked' : '')
    box.setAttribute('role', 'checkbox')
    box.setAttribute('aria-checked', this.checked ? 'true' : 'false')
    box.setAttribute('aria-label', i18n.t('editorTask.toggle'))
    box.addEventListener('mousedown', (e) => {
      // Don't move the editor cursor onto the line — just toggle in place.
      e.preventDefault()
      e.stopPropagation()
      const from = this.from
      if (from + 3 > view.state.doc.length) return
      const cur = view.state.sliceDoc(from, from + 3)
      if (!TASK_MARKER_RE.test(cur)) return
      const isChecked = cur[1] !== ' '
      view.dispatch({
        changes: { from, to: from + 3, insert: isChecked ? '[ ]' : '[x]' },
      })
    })
    return box
  }

  ignoreEvent() {
    return true
  }
}

function buildChecklistDecos(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const state = view.state
  const tree = syntaxTree(state)
  const sel = state.selection.main

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        if (node.name !== 'TaskMarker') return
        // Reveal raw source while the cursor / selection is on this task line.
        const line = state.doc.lineAt(node.from)
        if (sel.from <= line.to && sel.to >= line.from) return

        // Swallow the list bullet too, so the checkbox stands alone:
        //   TaskMarker -> Task -> ListItem -> ListMark
        const listItem = node.node.parent?.parent
        const listMark = listItem?.getChild('ListMark')
        const start = listMark ? listMark.from : node.from

        const checked = state.sliceDoc(node.from, node.to)[1] !== ' '
        builder.add(
          start,
          node.to,
          Decoration.replace({ widget: new TaskCheckboxWidget(node.from, checked) }),
        )

        // Strike through the text of a completed item.
        if (checked) {
          const task = node.node.parent
          if (task && task.to > node.to) {
            builder.add(node.to, task.to, Decoration.mark({ class: 'cm-task-done' }))
          }
        }
      },
    })
  }

  return builder.finish()
}

const checklistPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildChecklistDecos(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildChecklistDecos(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
)

const checklistTheme = EditorView.baseTheme({
  '.cm-task-checkbox': {
    display: 'inline-block',
    boxSizing: 'border-box',
    width: '1.05em',
    height: '1.05em',
    marginRight: '0.4em',
    verticalAlign: '-0.18em',
    border: '1.5px solid var(--text-muted)',
    borderRadius: '4px',
    cursor: 'pointer',
    position: 'relative',
    transition: 'background-color 0.12s ease, border-color 0.12s ease',
  },
  '.cm-task-checkbox:hover': {
    borderColor: 'var(--accent-color)',
  },
  '.cm-task-checkbox.cm-task-checked': {
    backgroundColor: 'var(--accent-color)',
    borderColor: 'var(--accent-color)',
  },
  '.cm-task-checkbox.cm-task-checked::after': {
    content: '""',
    position: 'absolute',
    left: '0.32em',
    top: '0.12em',
    width: '0.28em',
    height: '0.5em',
    border: 'solid #fff',
    borderWidth: '0 2px 2px 0',
    transform: 'rotate(45deg)',
  },
  '.cm-task-done': {
    textDecoration: 'line-through',
    color: 'var(--text-muted)',
  },
})

/** Interactive checklist (GFM task lists) for the markdown editor (rich mode). */
export const editorChecklistExtension = [checklistPlugin, checklistTheme]
