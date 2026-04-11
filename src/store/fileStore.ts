import { create } from 'zustand'
import type { FileTreeNode } from '../types/electron'
import type { TocEntry } from '../lib/markdown/remarkToc'

interface OpenFolder {
  path: string
  name: string
  tree: FileTreeNode[]
}

interface FileStore {
  currentFilePath: string | null
  currentContent: string | null
  openFolders: OpenFolder[]
  recentFiles: string[]
  toc: TocEntry[]

  openFile: (filePath: string) => Promise<void>
  openFileWithContent: (filePath: string, content: string) => void
  openFolder: (folderPath: string) => Promise<void>
  closeFolder: (folderPath: string) => void
  setContent: (content: string) => void
  setToc: (toc: TocEntry[]) => void
  refreshFolder: (folderPath: string) => Promise<void>
  refreshAllFolders: () => Promise<void>
  addRecentFile: (filePath: string) => void
  openFileDialog: () => Promise<void>
  openFolderDialog: () => Promise<void>
}

function folderName(folderPath: string): string {
  return folderPath.split(/[/\\]/).pop() ?? folderPath
}

export const useFileStore = create<FileStore>((set, get) => ({
  currentFilePath: null,
  currentContent: null,
  openFolders: [],
  recentFiles: [],
  toc: [],

  openFile: async (filePath: string) => {
    const content = await window.electronAPI.readFile(filePath)
    set({ currentFilePath: filePath, currentContent: content })
    get().addRecentFile(filePath)
    window.electronAPI.watchFile(filePath)
  },

  openFileWithContent: (filePath: string, content: string) => {
    set({ currentFilePath: filePath, currentContent: content })
    get().addRecentFile(filePath)
    window.electronAPI.watchFile(filePath)
  },

  openFolder: async (folderPath: string) => {
    // Don't add duplicates
    const { openFolders } = get()
    if (openFolders.some((f) => f.path === folderPath)) return

    const tree = await window.electronAPI.readDirectory(folderPath)
    set({
      openFolders: [
        ...openFolders,
        { path: folderPath, name: folderName(folderPath), tree },
      ],
    })
    window.electronAPI.watchDirectory(folderPath)
  },

  closeFolder: (folderPath: string) => {
    window.electronAPI.unwatchDirectory(folderPath)
    set((state) => ({
      openFolders: state.openFolders.filter((f) => f.path !== folderPath),
    }))
  },

  setContent: (content: string) => {
    set({ currentContent: content })
  },

  setToc: (toc: TocEntry[]) => {
    set({ toc })
  },

  refreshFolder: async (folderPath: string) => {
    const tree = await window.electronAPI.readDirectory(folderPath)
    set((state) => ({
      openFolders: state.openFolders.map((f) =>
        f.path === folderPath ? { ...f, tree } : f
      ),
    }))
  },

  refreshAllFolders: async () => {
    const { openFolders } = get()
    const updated = await Promise.all(
      openFolders.map(async (f) => {
        const tree = await window.electronAPI.readDirectory(f.path)
        return { ...f, tree }
      })
    )
    set({ openFolders: updated })
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
