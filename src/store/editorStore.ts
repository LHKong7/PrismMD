import { create } from 'zustand'
import { useFileStore } from './fileStore'

interface EditorStore {
  /** Whether the editor is active (vs read-only viewer). */
  editing: boolean
  /** The buffer content in the editor — diverges from fileStore.currentContent when dirty. */
  editorContent: string | null
  /** Whether editorContent differs from the last-saved/loaded content. */
  isDirty: boolean
  /** Snapshot of content when entering edit mode or after saving. */
  savedContent: string | null

  setEditing: (on: boolean) => void
  toggleEditing: () => void
  setEditorContent: (content: string) => void
  saveFile: () => Promise<void>
  discardChanges: () => void
  /** Reset editor state (used when switching files). */
  reset: () => void
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  editing: false,
  editorContent: null,
  isDirty: false,
  savedContent: null,

  setEditing: (on: boolean) => {
    if (on) {
      const content = useFileStore.getState().currentContent ?? ''
      set({
        editing: true,
        editorContent: content,
        savedContent: content,
        isDirty: false,
      })
    } else {
      set({ editing: false })
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
  },

  saveFile: async () => {
    const { editorContent } = get()
    const filePath = useFileStore.getState().currentFilePath
    if (!filePath || editorContent == null) return

    await window.electronAPI.writeFile(filePath, editorContent)
    // Sync the saved content back to fileStore so the reader shows the
    // latest version when the user switches back to reading mode.
    useFileStore.getState().setContent(editorContent)
    set({ savedContent: editorContent, isDirty: false })
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
    })
  },
}))
