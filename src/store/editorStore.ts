import { create } from 'zustand'
import { useFileStore } from './fileStore'
import { extractHeadingsFromSource, type EditorTocEntry } from '../lib/markdown/extractHeadings'
import type { EditorView } from '@codemirror/view'

interface EditorStore {
  /** Whether the editor is active (vs read-only viewer). */
  editing: boolean
  /** The buffer content in the editor — diverges from fileStore.currentContent when dirty. */
  editorContent: string | null
  /** Whether editorContent differs from the last-saved/loaded content. */
  isDirty: boolean
  /** Snapshot of content when entering edit mode or after saving. */
  savedContent: string | null
  /** Headings extracted from the editor content for TOC navigation. */
  editorToc: EditorTocEntry[]
  /** Reference to the CodeMirror EditorView for programmatic scrolling. */
  editorViewRef: EditorView | null

  setEditing: (on: boolean) => void
  toggleEditing: () => void
  setEditorContent: (content: string) => void
  saveFile: () => Promise<void>
  discardChanges: () => void
  /** Reset editor state (used when switching files). */
  reset: () => void
  /** Set the CodeMirror EditorView ref for scroll-to-line support. */
  setEditorViewRef: (view: EditorView | null) => void
  /** Scroll the editor to a specific line number (1-based). */
  scrollToLine: (line: number) => void
}

let tocUpdateTimer: ReturnType<typeof setTimeout> | null = null

export const useEditorStore = create<EditorStore>((set, get) => ({
  editing: false,
  editorContent: null,
  isDirty: false,
  savedContent: null,
  editorToc: [],
  editorViewRef: null,

  setEditing: (on: boolean) => {
    if (on) {
      const content = useFileStore.getState().currentContent ?? ''
      const editorToc = extractHeadingsFromSource(content)
      set({
        editing: true,
        editorContent: content,
        savedContent: content,
        isDirty: false,
        editorToc,
      })
      // Update fileStore TOC so sidebar reflects editor headings
      useFileStore.getState().setToc(editorToc)
    } else {
      set({ editing: false, editorToc: [] })
    }
  },

  toggleEditing: () => {
    const { editing } = get()
    get().setEditing(!editing)
  },

  setEditorContent: (content: string) => {
    const { savedContent } = get()
    set({
      editorContent: content,
      isDirty: content !== savedContent,
    })
    // Debounced heading extraction (300ms)
    if (tocUpdateTimer) clearTimeout(tocUpdateTimer)
    tocUpdateTimer = setTimeout(() => {
      const editorToc = extractHeadingsFromSource(content)
      set({ editorToc })
      useFileStore.getState().setToc(editorToc)
    }, 300)
  },

  saveFile: async () => {
    const { editorContent } = get()
    const filePath = useFileStore.getState().currentFilePath
    if (!filePath || editorContent == null) return

    try {
      await window.electronAPI.writeFile(filePath, editorContent)
      useFileStore.getState().setContent(editorContent)
      set({ savedContent: editorContent, isDirty: false })
      // Lazy import to avoid circular init.
      const { useToastStore } = await import('./toastStore')
      useToastStore.getState().show('success', 'File saved')
    } catch (err) {
      const { useToastStore } = await import('./toastStore')
      const msg = err instanceof Error ? err.message : String(err)
      useToastStore.getState().show('error', `Save failed: ${msg}`, 5000)
    }
  },

  discardChanges: () => {
    const { savedContent } = get()
    set({
      editorContent: savedContent,
      isDirty: false,
    })
  },

  reset: () => {
    set({
      editing: false,
      editorContent: null,
      isDirty: false,
      savedContent: null,
      editorToc: [],
      editorViewRef: null,
    })
  },

  setEditorViewRef: (view) => {
    set({ editorViewRef: view })
  },

  scrollToLine: (line: number) => {
    const view = get().editorViewRef
    if (!view) return
    const maxLine = view.state.doc.lines
    const targetLine = Math.max(1, Math.min(line, maxLine))
    const pos = view.state.doc.line(targetLine).from
    view.dispatch({
      selection: { anchor: pos },
      scrollIntoView: true,
    })
    view.focus()
  },
}))
