import { ViewPlugin, type ViewUpdate, type EditorView } from '@codemirror/view'

export interface EditorSelectionInfo {
  text: string
  from: number
  to: number
  anchor: { x: number; y: number }
}

/**
 * CodeMirror 6 extension that monitors text selection and reports it to React
 * via a callback. Used to show the AI rewrite bubble above the selected text.
 *
 * Includes a 150ms debounce to avoid rapid re-renders while the user drags.
 */
export function editorAIExtension(
  onSelection: (info: EditorSelectionInfo | null) => void,
) {
  return ViewPlugin.fromClass(
    class {
      private timer: ReturnType<typeof setTimeout> | null = null

      update(update: ViewUpdate) {
        if (!update.selectionSet && !update.docChanged) return
        if (this.timer) clearTimeout(this.timer)

        const { from, to } = update.state.selection.main
        if (from === to) {
          onSelection(null)
          return
        }

        const view = update.view
        this.timer = setTimeout(() => {
          this.report(view, from, to)
        }, 150)
      }

      private report(view: EditorView, from: number, to: number) {
        const text = view.state.sliceDoc(from, to)
        if (text.trim().length < 2) {
          onSelection(null)
          return
        }
        const coords = view.coordsAtPos(from)
        if (!coords) {
          onSelection(null)
          return
        }
        onSelection({ text, from, to, anchor: { x: coords.left, y: coords.top } })
      }

      destroy() {
        if (this.timer) clearTimeout(this.timer)
      }
    },
  )
}
