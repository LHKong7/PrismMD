import { create } from 'zustand'
import { useWorkspaceStore } from './workspaceStore'
import { extractHeadingsFromSource, type EditorTocEntry } from '../lib/markdown/extractHeadings'
import { kindOfFormat } from '../lib/fileFormat'
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
  setEditorContent: (content: string) => void
  saveFile: () => Promise<void>
  /** Mark the buffer as persisted (clears dirty) — called by the autosave path. */
  markSaved: (content: string) => void
  /** Replace the buffer with content written externally (e.g. an agent) into the open page. */
  loadExternalContent: (content: string) => void
  /** Re-sync the editor to the active tab: enable editing for text docs. */
  syncForActiveTab: () => void
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
      const content = useWorkspaceStore.getState().currentContent ?? ''
      const editorToc = extractHeadingsFromSource(content)
      set({
        editing: true,
        editorContent: content,
        savedContent: content,
        isDirty: false,
        editorToc,
      })
      // Update workspace TOC so sidebar reflects editor headings
      useWorkspaceStore.getState().setToc(editorToc)
    } else {
      set({ editing: false, editorToc: [] })
    }
  },

  markSaved: (content: string) => {
    // Clear dirty only if the buffer hasn't moved on since the save started.
    const { editorContent } = get()
    set({ savedContent: content, isDirty: editorContent !== content })
  },

  loadExternalContent: (content: string) => {
    // A programmatic write (Horse Mode, weekly summary, template insert) landed
    // in the currently-open page. Refresh the editor's own buffer so it shows the
    // new text and a later keystroke doesn't clobber it with the stale buffer.
    const editorToc = extractHeadingsFromSource(content)
    set({ editorContent: content, savedContent: content, isDirty: false, editorToc })
    useWorkspaceStore.getState().setToc(editorToc)
  },

  syncForActiveTab: () => {
    const ws = useWorkspaceStore.getState()
    const isText = ws.currentFormat ? kindOfFormat(ws.currentFormat) === 'text' : false
    if (isText) {
      // Single always-editable mode — load the active document into the buffer.
      get().setEditing(true)
    } else {
      // Non-text formats (pdf/csv/xlsx) render their own viewers, no editor.
      set({ editing: false, editorContent: null, isDirty: false, savedContent: null, editorToc: [] })
    }
  },

  setEditorContent: (content: string) => {
    const { savedContent } = get()
    set({
      editorContent: content,
      isDirty: content !== savedContent,
    })
    // Live-sync the active tab and schedule the debounced SQLite autosave.
    useWorkspaceStore.getState().setContent(content)
    // Debounced heading extraction (300ms)
    if (tocUpdateTimer) clearTimeout(tocUpdateTimer)
    tocUpdateTimer = setTimeout(() => {
      const editorToc = extractHeadingsFromSource(content)
      set({ editorToc })
      useWorkspaceStore.getState().setToc(editorToc)
    }, 300)
  },

  saveFile: async () => {
    const { editorContent } = get()
    const pageId = useWorkspaceStore.getState().currentPageId
    if (!pageId || editorContent == null) return

    try {
      // Edits already stream into SQLite via the debounced autosave; an explicit
      // Cmd+S just forces an immediate persist.
      await useWorkspaceStore.getState().savePage(pageId, editorContent)
      set({ savedContent: editorContent, isDirty: false })
      const { useToastStore } = await import('./toastStore')
      useToastStore.getState().show('success', 'Page saved')
    } catch (err) {
      const { useToastStore } = await import('./toastStore')
      const msg = err instanceof Error ? err.message : String(err)
      useToastStore.getState().show('error', `Save failed: ${msg}`, 5000)
    }
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
