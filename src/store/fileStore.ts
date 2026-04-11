import { create } from 'zustand'
import type { FileTreeNode } from '../types/electron'
import type { TocEntry } from '../lib/markdown/remarkToc'

interface FileStore {
  currentFilePath: string | null
  currentContent: string | null
  rootFolderPath: string | null
  fileTree: FileTreeNode[] | null
  recentFiles: string[]
  toc: TocEntry[]

  openFile: (filePath: string) => Promise<void>
  openFileWithContent: (filePath: string, content: string) => void
  openFolder: (folderPath: string) => Promise<void>
  setContent: (content: string) => void
  setToc: (toc: TocEntry[]) => void
  refreshFileTree: () => Promise<void>
  addRecentFile: (filePath: string) => void
  openFileDialog: () => Promise<void>
  openFolderDialog: () => Promise<void>
}

export const useFileStore = create<FileStore>((set, get) => ({
  currentFilePath: null,
  currentContent: null,
  rootFolderPath: null,
  fileTree: null,
  recentFiles: [],
  toc: [],

  openFile: async (filePath: string) => {
    const content = await window.electronAPI.readFile(filePath)
    set({ currentFilePath: filePath, currentContent: content })
    get().addRecentFile(filePath)

    // Watch this file for changes
    window.electronAPI.watchFile(filePath)
  },

  openFileWithContent: (filePath: string, content: string) => {
    set({ currentFilePath: filePath, currentContent: content })
    get().addRecentFile(filePath)
    window.electronAPI.watchFile(filePath)
  },

  openFolder: async (folderPath: string) => {
    const tree = await window.electronAPI.readDirectory(folderPath)
    set({ rootFolderPath: folderPath, fileTree: tree })

    // Watch the directory for changes
    window.electronAPI.watchDirectory(folderPath)
  },

  setContent: (content: string) => {
    set({ currentContent: content })
  },

  setToc: (toc: TocEntry[]) => {
    set({ toc })
  },

  refreshFileTree: async () => {
    const { rootFolderPath } = get()
    if (!rootFolderPath) return
    const tree = await window.electronAPI.readDirectory(rootFolderPath)
    set({ fileTree: tree })
  },

  addRecentFile: (filePath: string) => {
    set((state) => {
      const filtered = state.recentFiles.filter((f) => f !== filePath)
      return { recentFiles: [filePath, ...filtered].slice(0, 20) }
    })
  },

  openFileDialog: async () => {
    const result = await window.electronAPI.openFileDialog()
    if (result) {
      get().openFileWithContent(result.path, result.content)
    }
  },

  openFolderDialog: async () => {
    const result = await window.electronAPI.openFolderDialog()
    if (result) {
      await get().openFolder(result)
    }
  },
}))
