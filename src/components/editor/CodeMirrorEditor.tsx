import { useRef, useEffect, useState } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightSpecialChars } from '@codemirror/view'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { useSettingsStore } from '../../store/settingsStore'
import { useEditorStore } from '../../store/editorStore'
import { editorAIExtension, type EditorSelectionInfo } from './editorAIPlugin'
import { aiHighlightExtension } from './editorAIHighlight'
import { EditorAIBubble } from './EditorAIBubble'

interface Props {
  content: string
  onChange: (value: string) => void
  language?: Extension
}

/** Compartment for dynamic word-wrap toggle without recreating the editor. */
const wrapCompartment = new Compartment()
/** Compartment for dynamic font-size changes. */
const fontSizeCompartment = new Compartment()

function fontSizeTheme(size: number) {
  return EditorView.theme({
    '&': { fontSize: `${size}px` },
    '.cm-gutters': { fontSize: `${size}px` },
  })
}

/** Theme that reads CSS variables from the host app so the editor matches the active theme. */
const appTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
  },
  '.cm-content': {
    fontFamily: 'var(--font-body, ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace)',
    padding: '16px 0',
    caretColor: 'var(--accent-color)',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--accent-color)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'var(--accent-color-alpha, rgba(99,102,241,0.2))',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-muted)',
    borderRight: '1px solid var(--border-color)',
    minWidth: '40px',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--bg-tertiary, var(--bg-secondary))',
    color: 'var(--text-secondary)',
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--bg-secondary)',
  },
  '.cm-scroller': {
    overflow: 'auto',
  },
  '.cm-line': {
    padding: '0 16px',
  },
})

export function CodeMirrorEditor({ content, onChange, language }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const wordWrap = useSettingsStore((s) => s.wordWrap)
  const editorFontSize = useSettingsStore((s) => s.editorFontSize)
  const setEditorFontSize = useSettingsStore((s) => s.setEditorFontSize)
  const activeProvider = useSettingsStore((s) => s.activeProvider)
  const [editorSelection, setEditorSelection] = useState<EditorSelectionInfo | null>(null)
  const [focusCustomInput, setFocusCustomInput] = useState(false)

  // Stable refs for callbacks used inside extensions (avoids editor rebuild)
  const selectionCbRef = useRef(setEditorSelection)
  selectionCbRef.current = setEditorSelection
  const fontSizeRef = useRef({ get: () => useSettingsStore.getState().editorFontSize, set: setEditorFontSize })

  useEffect(() => {
    if (!containerRef.current) return

    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLine(),
      highlightSpecialChars(),
      history(),
      bracketMatching(),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      keymap.of([
        {
          key: 'Mod-a',
          run: (view) => {
            const doc = view.state.doc
            const { from, to } = view.state.selection.main

            // Find the paragraph block around the cursor.
            // A paragraph is delimited by blank lines (or doc boundaries).
            let paraStart = from
            let paraEnd = to

            // Walk backward to find paragraph start (blank line or doc start)
            const startLine = doc.lineAt(from)
            for (let ln = startLine.number; ln >= 1; ln--) {
              const line = doc.line(ln)
              if (line.text.trim() === '' && ln < startLine.number) {
                paraStart = doc.line(ln + 1).from
                break
              }
              if (ln === 1) paraStart = 0
            }

            // Walk forward to find paragraph end (blank line or doc end)
            const endLine = doc.lineAt(to)
            for (let ln = endLine.number; ln <= doc.lines; ln++) {
              const line = doc.line(ln)
              if (line.text.trim() === '' && ln > endLine.number) {
                paraEnd = doc.line(ln - 1).to
                break
              }
              if (ln === doc.lines) paraEnd = doc.length
            }

            // If already selecting the full paragraph (or more), select all
            if (from <= paraStart && to >= paraEnd) {
              view.dispatch({ selection: { anchor: 0, head: doc.length } })
            } else {
              // Select the current paragraph
              view.dispatch({ selection: { anchor: paraStart, head: paraEnd } })
            }
            return true
          },
        },
        ...defaultKeymap,
        ...historyKeymap,
        indentWithTab,
        {
          key: 'Mod-=',
          run: () => {
            fontSizeRef.current.set(fontSizeRef.current.get() + 1)
            return true
          },
        },
        {
          key: 'Mod--',
          run: () => {
            fontSizeRef.current.set(fontSizeRef.current.get() - 1)
            return true
          },
        },
        {
          key: 'Mod-0',
          run: () => {
            fontSizeRef.current.set(14)
            return true
          },
        },
        {
          key: 'Mod-k',
          run: (view) => {
            const { from, to } = view.state.selection.main
            if (from === to) return false
            const text = view.state.sliceDoc(from, to)
            if (text.trim().length < 2) return false
            const coords = view.coordsAtPos(from)
            if (!coords) return false
            selectionCbRef.current({ text, from, to, anchor: { x: coords.left, y: coords.top } })
            setFocusCustomInput(true)
            return true
          },
        },
      ]),
      appTheme,
      fontSizeCompartment.of(fontSizeTheme(editorFontSize)),
      wrapCompartment.of(wordWrap ? EditorView.lineWrapping : []),
      aiHighlightExtension,
      editorAIExtension((info) => selectionCbRef.current(info)),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString())
        }
      }),
    ]

    if (language) {
      extensions.push(language)
    }

    const state = EditorState.create({
      doc: content,
      extensions,
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view
    useEditorStore.getState().setEditorViewRef(view)

    return () => {
      view.destroy()
      viewRef.current = null
      useEditorStore.getState().setEditorViewRef(null)
    }
    // Only create the editor once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Dynamic word wrap toggle
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: wrapCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : []),
    })
  }, [wordWrap])

  // Dynamic font size
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: fontSizeCompartment.reconfigure(fontSizeTheme(editorFontSize)),
    })
  }, [editorFontSize])

  // Sync external content changes into the editor without recreating it.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== content) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: content },
      })
    }
  }, [content])

  return (
    <>
      <div
        ref={containerRef}
        className="h-full overflow-hidden"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      />
      {editorSelection && (
        <EditorAIBubble
          selection={editorSelection}
          viewRef={viewRef}
          focusCustomInput={focusCustomInput}
          onDismiss={() => {
            setEditorSelection(null)
            setFocusCustomInput(false)
          }}
        />
      )}
    </>
  )
}
