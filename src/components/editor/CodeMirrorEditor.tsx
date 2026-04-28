import { useRef, useEffect, useState } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightSpecialChars } from '@codemirror/view'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { useSettingsStore } from '../../store/settingsStore'
import { editorAIExtension, type EditorSelectionInfo } from './editorAIPlugin'
import { EditorAIBubble } from './EditorAIBubble'

interface Props {
  content: string
  onChange: (value: string) => void
  language?: Extension
}

/** Compartment for dynamic word-wrap toggle without recreating the editor. */
const wrapCompartment = new Compartment()

/** Theme that reads CSS variables from the host app so the editor matches the active theme. */
const appTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '14px',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
  },
  '.cm-content': {
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
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
  const activeProvider = useSettingsStore((s) => s.activeProvider)
  const [editorSelection, setEditorSelection] = useState<EditorSelectionInfo | null>(null)

  // Stable callback ref for the AI extension
  const selectionCbRef = useRef(setEditorSelection)
  selectionCbRef.current = setEditorSelection

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
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      appTheme,
      wrapCompartment.of(wordWrap ? EditorView.lineWrapping : []),
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

    return () => {
      view.destroy()
      viewRef.current = null
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
      {editorSelection && activeProvider && (
        <EditorAIBubble
          selection={editorSelection}
          viewRef={viewRef}
          onDismiss={() => setEditorSelection(null)}
        />
      )}
    </>
  )
}
