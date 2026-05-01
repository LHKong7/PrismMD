import { StateEffect, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'

/** Effect to set the highlighted range (from, to) or clear it (null). */
export const setAIHighlight = StateEffect.define<{ from: number; to: number } | null>()

const aiHighlightMark = Decoration.mark({ class: 'cm-ai-highlight' })

const aiHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    // Map existing decorations through document changes
    deco = deco.map(tr.changes)
    for (const effect of tr.effects) {
      if (effect.is(setAIHighlight)) {
        if (effect.value) {
          const { from, to } = effect.value
          deco = Decoration.set([aiHighlightMark.range(from, to)])
        } else {
          deco = Decoration.none
        }
      }
    }
    return deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

/** CM6 theme for the AI working highlight. */
const aiHighlightTheme = EditorView.baseTheme({
  '.cm-ai-highlight': {
    backgroundColor: 'rgba(250, 204, 21, 0.18)',
    borderBottom: '2px solid rgba(250, 204, 21, 0.5)',
    borderRadius: '2px',
  },
})

/** Extensions to add to the editor — includes the state field and theme. */
export const aiHighlightExtension = [aiHighlightField, aiHighlightTheme]
