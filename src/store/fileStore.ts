import { create } from 'zustand'
import type { FileTreeNode } from '../types/electron'
import type { TocEntry } from '../lib/markdown/remarkToc'
import { detectFormat, kindOfFormat, type FileFormat } from '../lib/fileFormat'

// Notify the search index that the indexed file set may have changed.
// Imported lazily inside the actions to avoid a circular module init.
function invalidateSearchIndex() {
  void import('./searchIndexStore').then((m) =>
    m.useSearchIndexStore.getState().invalidate(),
  )
}

interface OpenFolder {
  path: string
  name: string
  tree: FileTreeNode[]
}

interface FileStore {
  currentFilePath: string | null
  currentFormat: FileFormat | null
  /** Text-format content (markdown / csv / json). `null` for binary formats. */
  currentContent: string | null
  /**
   * Binary-format content (pdf / xlsx). `null` for text formats. We keep the
   * raw ArrayBuffer so viewers (pdfjs-dist, SheetJS) can consume it directly
   * without an extra round-trip.
   */
  currentBytes: ArrayBuffer | null
  openFolders: OpenFolder[]
  recentFiles: string[]
  toc: TocEntry[]
  /**
   * Most recent file/folder read failure (deleted file, permission denied,
   * dead IPC channel). Consumed by `DocumentReader` to render an
   * `ErrorBanner` above the viewer. Cleared on the next successful open.
   */
  openError: string | null

  openFile: (filePath: string) => Promise<void>
  openFileWithContent: (filePath: string, content: string) => void
  openFileWithBytes: (filePath: string, bytes: ArrayBuffer) => void
  openFolder: (folderPath: string) => Promise<void>
  closeFolder: (folderPath: string) => void
  setContent: (content: string) => void
  setToc: (toc: TocEntry[]) => void
  refreshFolder: (folderPath: string) => Promise<void>
  refreshAllFolders: () => Promise<void>
  addRecentFile: (filePath: string) => void
  clearOpenError: () => void
  openFileDialog: () => Promise<void>
  openFolderDialog: () => Promise<void>
}

function folderName(folderPath: string): string {
  return folderPath.split(/[/\\]/).pop() ?? folderPath
}

export const useFileStore = create<FileStore>((set, get) => ({
  currentFilePath: null,
  currentFormat: null,
  currentContent: null,
  currentBytes: null,
  openFolders: [],
  recentFiles: [],
  toc: [],
  openError: null,

  openFile: async (filePath: string) => {
    // Lazy import to avoid circular init (editorStore imports fileStore).
    const { useEditorStore } = await import('./editorStore')
    const editor = useEditorStore.getState()
    if (editor.editing && editor.isDirty) {
      const discard = window.confirm('You have unsaved changes. Discard them?')
      if (!discard) return
    }
    // Always drop back to reader mode on file switch.
    useEditorStore.getState().reset()

    // Dispatch on extension so the right reader is used for text vs
    // binary formats. Unknown extensions fall through to text (best-
    // effort for files the user drops in that we haven't catalogued).
    const format = detectFormat(filePath)
    const kind = format ? kindOfFormat(format) : 'text'

    try {
      if (kind === 'binary') {
        const bytes = await window.electronAPI.readFileBytes(filePath)
        set({
          currentFilePath: filePath,
          currentFormat: format,
          currentContent: null,
          currentBytes: bytes,
          openError: null,
        })
      } else {
        const content = await window.electronAPI.readFile(filePath)
        set({
          currentFilePath: filePath,
          currentFormat: format,
          currentContent: content,
          currentBytes: null,
          openError: null,
        })
      }
      get().addRecentFile(filePath)
      window.electronAPI.watchFile(filePath)
    } catch (err) {
      // Preserve the currently-open document so a transient failure
      // doesn't wipe the user's view; don't pollute recentFiles with an
      // unreadable path; surface the error via `openError`.
      const msg = err instanceof Error ? err.message : String(err)
      set({ openError: `${filePath}: ${msg}` })
    }
  },

  openFileWithContent: (filePath: string, content: string) => {
    const format = detectFormat(filePath)
    set({
      currentFilePath: filePath,
      currentFormat: format,
      currentContent: content,
      currentBytes: null,
    })
    get().addRecentFile(filePath)
    window.electronAPI.watchFile(filePath)
  },

  openFileWithBytes: (filePath: string, bytes: ArrayBuffer) => {
    const format = detectFormat(filePath)
    set({
      currentFilePath: filePath,
      currentFormat: format,
      currentContent: null,
      currentBytes: bytes,
    })
    get().addRecentFile(filePath)
    window.electronAPI.watchFile(filePath)
  },

  openFolder: async (folderPath: string) => {
    // Don't add duplicates
    const { openFolders } = get()
    if (openFolders.some((f) => f.path === folderPath)) return

    try {
      const tree = await window.electronAPI.readDirectory(folderPath)
      set({
        openFolders: [
          ...openFolders,
          { path: folderPath, name: folderName(folderPath), tree },
        ],
        openError: null,
      })
      window.electronAPI.watchDirectory(folderPath)
      invalidateSearchIndex()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ openError: `${folderPath}: ${msg}` })
    }
  },

  closeFolder: (folderPath: string) => {
    window.electronAPI.unwatchDirectory(folderPath)
    set((state) => ({
      openFolders: state.openFolders.filter((f) => f.path !== folderPath),
    }))
    invalidateSearchIndex()
  },

  setContent: (content: string) => {
    set({ currentContent: content })
  },

  setToc: (toc: TocEntry[]) => {
    set({ toc })
  },

  refreshFolder: async (folderPath: string) => {
    try {
      const tree = await window.electronAPI.readDirectory(folderPath)
      set((state) => ({
        openFolders: state.openFolders.map((f) =>
          f.path === folderPath ? { ...f, tree } : f
        ),
      }))
      invalidateSearchIndex()
    } catch (err) {
      // Refresh failures are silent by design — the folder may have been
      // unmounted / deleted externally. Surface via `openError` so the
      // user isn't left wondering why the tree is stale.
      const msg = err instanceof Error ? err.message : String(err)
      set({ openError: `${folderPath}: ${msg}` })
    }
  },

  refreshAllFolders: async () => {
    const { openFolders } = get()
    try {
      const updated = await Promise.all(
        openFolders.map(async (f) => {
          const tree = await window.electronAPI.readDirectory(f.path)
          return { ...f, tree }
        })
      )
      set({ openFolders: updated })
      invalidateSearchIndex()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ openError: msg })
    }
  },

  addRecentFile: (filePath: string) => {
    set((state) => {
      const filtered = state.recentFiles.filter((f) => f !== filePath)
      return { recentFiles: [filePath, ...filtered].slice(0, 20) }
    })
  },

  clearOpenError: () => set({ openError: null }),

  openFileDialog: async () => {
    const result = await window.electronAPI.openFileDialog()
    if (result) {
      // The dialog only returns a path now — `openFile` picks the right
      // reader based on extension (text vs binary).
      await get().openFile(result.path)
    }
  },

  openFolderDialog: async () => {
    const result = await window.electronAPI.openFolderDialog()
    if (result) {
      await get().openFolder(result)
    }
  },
}))
