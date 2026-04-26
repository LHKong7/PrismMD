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

function showToast(tone: 'info' | 'success' | 'error' | 'warning', message: string, duration?: number) {
  void import('./toastStore').then((m) =>
    m.useToastStore.getState().show(tone, message, duration),
  )
}

interface OpenFolder {
  path: string
  name: string
  tree: FileTreeNode[]
}

interface PendingDelete {
  path: string
  name: string
  isDirectory: boolean
}

/** A single open tab. */
export interface Tab {
  id: string
  filePath: string
  format: FileFormat | null
  content: string | null
  bytes: ArrayBuffer | null
  scrollY: number
}

const MAX_TABS = 20

interface FileStore {
  // --- Tab state ---
  tabs: Tab[]
  activeTabId: string | null

  // --- Compatibility layer (derived from active tab) ---
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
  renamingPath: string | null
  autoExpandPath: string | null
  pendingDelete: PendingDelete | null
  /** Stack of recently closed tab file paths (for Cmd+Shift+T reopen). */
  recentlyClosedPaths: string[]

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
  createNewFile: (defaultDir?: string) => Promise<void>
  createFolder: (parentDir: string) => Promise<void>
  renameItem: (oldPath: string, newName: string) => Promise<void>
  deleteItem: () => Promise<void>
  setPendingDelete: (info: PendingDelete) => void
  cancelDelete: () => void
  duplicateFile: (filePath: string) => Promise<void>
  showInFolder: (itemPath: string) => void
  setRenamingPath: (path: string | null) => void
  setAutoExpandPath: (path: string | null) => void
  loadChildren: (dirPath: string) => Promise<void>

  // --- Tab actions ---
  closeTab: (tabId: string) => void
  switchTab: (tabId: string) => void
  moveTab: (fromIndex: number, toIndex: number) => void
  closeOtherTabs: (tabId: string) => void
  closeTabsToRight: (tabId: string) => void
  reopenClosedTab: () => Promise<void>
}

function folderName(folderPath: string): string {
  return folderPath.split(/[/\\]/).pop() ?? folderPath
}

/**
 * Recursively walk the tree and replace the `children` of the node whose
 * `path` matches `targetPath`. Returns a new tree (immutable update).
 */
function patchChildren(
  nodes: FileTreeNode[],
  targetPath: string,
  children: FileTreeNode[],
): FileTreeNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) {
      return { ...node, children }
    }
    if (node.children && targetPath.startsWith(node.path + '/')) {
      return { ...node, children: patchChildren(node.children, targetPath, children) }
    }
    return node
  })
}

/**
 * Sync the "compatibility layer" fields from the active tab so every
 * existing consumer of `currentFilePath` / `currentContent` / etc
 * continues to work unchanged.
 */
function syncFromActiveTab(tabs: Tab[], activeTabId: string | null) {
  const tab = tabs.find((t) => t.id === activeTabId)
  if (!tab) {
    return {
      currentFilePath: null,
      currentFormat: null,
      currentContent: null,
      currentBytes: null,
    }
  }
  return {
    currentFilePath: tab.filePath,
    currentFormat: tab.format,
    currentContent: tab.content,
    currentBytes: tab.bytes,
  }
}

export const useFileStore = create<FileStore>((set, get) => ({
  tabs: [],
  activeTabId: null,
  currentFilePath: null,
  currentFormat: null,
  currentContent: null,
  currentBytes: null,
  openFolders: [],
  recentFiles: [],
  toc: [],
  openError: null,
  renamingPath: null,
  autoExpandPath: null,
  pendingDelete: null,
  recentlyClosedPaths: [],

  openFile: async (filePath: string) => {
    // If the file is already open in a tab, just switch to it.
    const existing = get().tabs.find((t) => t.filePath === filePath)
    if (existing) {
      get().switchTab(existing.id)
      return
    }

    // Lazy import to avoid circular init (editorStore imports fileStore).
    const { useEditorStore } = await import('./editorStore')
    const editor = useEditorStore.getState()
    if (editor.editing && editor.isDirty) {
      const discard = window.confirm('You have unsaved changes. Discard them?')
      if (!discard) return
    }
    // Always drop back to reader mode on file switch.
    useEditorStore.getState().reset()

    const format = detectFormat(filePath)
    const kind = format ? kindOfFormat(format) : 'text'

    try {
      let content: string | null = null
      let bytes: ArrayBuffer | null = null

      if (kind === 'binary') {
        bytes = await window.electronAPI.readFileBytes(filePath)
      } else {
        content = await window.electronAPI.readFile(filePath)
      }

      const newTab: Tab = {
        id: crypto.randomUUID(),
        filePath,
        format,
        content,
        bytes,
        scrollY: 0,
      }

      set((state) => {
        // Evict oldest tab if at limit.
        let tabs = [...state.tabs, newTab]
        if (tabs.length > MAX_TABS) {
          const evicted = tabs.shift()!
          window.electronAPI.unwatchFile(evicted.filePath)
        }
        return {
          tabs,
          activeTabId: newTab.id,
          ...syncFromActiveTab(tabs, newTab.id),
          openError: null,
        }
      })

      get().addRecentFile(filePath)
      window.electronAPI.watchFile(filePath)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ openError: `${filePath}: ${msg}` })
      showToast('error', msg, 5000)
    }
  },

  openFileWithContent: (filePath: string, content: string) => {
    const existing = get().tabs.find((t) => t.filePath === filePath)
    if (existing) {
      get().switchTab(existing.id)
      return
    }

    const format = detectFormat(filePath)
    const newTab: Tab = {
      id: crypto.randomUUID(),
      filePath,
      format,
      content,
      bytes: null,
      scrollY: 0,
    }
    set((state) => {
      let tabs = [...state.tabs, newTab]
      if (tabs.length > MAX_TABS) {
        const evicted = tabs.shift()!
        window.electronAPI.unwatchFile(evicted.filePath)
      }
      return {
        tabs,
        activeTabId: newTab.id,
        ...syncFromActiveTab(tabs, newTab.id),
      }
    })
    get().addRecentFile(filePath)
    window.electronAPI.watchFile(filePath)
  },

  openFileWithBytes: (filePath: string, bytes: ArrayBuffer) => {
    const existing = get().tabs.find((t) => t.filePath === filePath)
    if (existing) {
      get().switchTab(existing.id)
      return
    }

    const format = detectFormat(filePath)
    const newTab: Tab = {
      id: crypto.randomUUID(),
      filePath,
      format,
      content: null,
      bytes,
      scrollY: 0,
    }
    set((state) => {
      let tabs = [...state.tabs, newTab]
      if (tabs.length > MAX_TABS) {
        const evicted = tabs.shift()!
        window.electronAPI.unwatchFile(evicted.filePath)
      }
      return {
        tabs,
        activeTabId: newTab.id,
        ...syncFromActiveTab(tabs, newTab.id),
      }
    })
    get().addRecentFile(filePath)
    window.electronAPI.watchFile(filePath)
  },

  openFolder: async (folderPath: string) => {
    // Don't add duplicates
    const { openFolders } = get()
    if (openFolders.some((f) => f.path === folderPath)) return

    try {
      // Shallow read (1 level) for fast initial load — subdirectories
      // appear as stubs and their children are loaded lazily on expand.
      const tree = await window.electronAPI.readDirectoryChildren(folderPath)
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
    set((state) => {
      const tabs = state.tabs.map((t) =>
        t.id === state.activeTabId ? { ...t, content } : t,
      )
      return { currentContent: content, tabs }
    })
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

  createNewFile: async (defaultDir?: string) => {
    const result = await window.electronAPI.newFileDialog(defaultDir)
    if (result.cancelled || !result.filePath) return
    await get().openFile(result.filePath)
    // Enter edit mode immediately so the user can start typing.
    const { useEditorStore } = await import('./editorStore')
    useEditorStore.getState().setEditing(true)
  },

  createFolder: async (parentDir: string) => {
    // Find the owning top-level open folder for refresh.
    const owning = get().openFolders.find((f) =>
      parentDir === f.path || parentDir.startsWith(f.path + '/') || parentDir.startsWith(f.path + '\\'),
    )
    // Generate a unique name.
    let name = 'New Folder'
    let fullPath = `${parentDir}/${name}`
    let counter = 2
    while (await window.electronAPI.exists(fullPath)) {
      name = `New Folder (${counter})`
      fullPath = `${parentDir}/${name}`
      counter++
    }
    try {
      await window.electronAPI.createDirectory(fullPath)
      if (owning) await get().refreshFolder(owning.path)
      set({ autoExpandPath: fullPath, renamingPath: fullPath })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ openError: msg })
    }
  },

  renameItem: async (oldPath: string, newName: string) => {
    // Validate
    if (!newName || newName.includes('/') || newName.includes('\\')) return
    const sep = oldPath.includes('\\') ? '\\' : '/'
    const dir = oldPath.substring(0, oldPath.lastIndexOf(sep))
    const newPath = `${dir}${sep}${newName}`
    if (newPath === oldPath) {
      set({ renamingPath: null })
      return
    }
    const owning = get().openFolders.find((f) =>
      oldPath === f.path || oldPath.startsWith(f.path + '/') || oldPath.startsWith(f.path + '\\'),
    )
    try {
      await window.electronAPI.rename(oldPath, newPath)
      // Update any open tabs whose paths are affected by the rename.
      set((state) => {
        const tabs = state.tabs.map((t) => {
          if (t.filePath === oldPath) {
            window.electronAPI.unwatchFile(oldPath)
            window.electronAPI.watchFile(newPath)
            return { ...t, filePath: newPath, format: detectFormat(newPath) }
          }
          if (t.filePath.startsWith(oldPath + sep)) {
            const updated = newPath + t.filePath.substring(oldPath.length)
            window.electronAPI.unwatchFile(t.filePath)
            window.electronAPI.watchFile(updated)
            return { ...t, filePath: updated, format: detectFormat(updated) }
          }
          return t
        })
        return {
          tabs,
          ...syncFromActiveTab(tabs, state.activeTabId),
          renamingPath: null,
        }
      })
      if (owning) await get().refreshFolder(owning.path)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ openError: msg, renamingPath: null })
    }
  },

  deleteItem: async () => {
    const pending = get().pendingDelete
    if (!pending) return
    const owning = get().openFolders.find((f) =>
      pending.path === f.path || pending.path.startsWith(f.path + '/') || pending.path.startsWith(f.path + '\\'),
    )
    try {
      await window.electronAPI.trash(pending.path)
      // Close any tabs whose files were deleted.
      set((state) => {
        const affected = state.tabs.filter((t) =>
          t.filePath === pending.path ||
          t.filePath.startsWith(pending.path + '/') ||
          t.filePath.startsWith(pending.path + '\\'),
        )
        for (const t of affected) {
          window.electronAPI.unwatchFile(t.filePath)
        }
        const affectedIds = new Set(affected.map((t) => t.id))
        const tabs = state.tabs.filter((t) => !affectedIds.has(t.id))
        let activeTabId = state.activeTabId
        if (activeTabId && affectedIds.has(activeTabId)) {
          activeTabId = tabs.length > 0 ? tabs[tabs.length - 1].id : null
        }
        return {
          tabs,
          activeTabId,
          ...syncFromActiveTab(tabs, activeTabId),
          pendingDelete: null,
        }
      })
      if (owning) await get().refreshFolder(owning.path)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ openError: msg, pendingDelete: null })
    }
  },

  setPendingDelete: (info: PendingDelete) => set({ pendingDelete: info }),
  cancelDelete: () => set({ pendingDelete: null }),

  duplicateFile: async (filePath: string) => {
    const sep = filePath.includes('\\') ? '\\' : '/'
    const lastSep = filePath.lastIndexOf(sep)
    const dir = filePath.substring(0, lastSep)
    const fullName = filePath.substring(lastSep + 1)
    const dotIdx = fullName.lastIndexOf('.')
    const baseName = dotIdx > 0 ? fullName.substring(0, dotIdx) : fullName
    const ext = dotIdx > 0 ? fullName.substring(dotIdx) : ''

    let destPath = `${dir}${sep}${baseName}-copy${ext}`
    let counter = 2
    while (await window.electronAPI.exists(destPath)) {
      destPath = `${dir}${sep}${baseName}-copy-${counter}${ext}`
      counter++
    }

    const owning = get().openFolders.find((f) =>
      filePath.startsWith(f.path + '/') || filePath.startsWith(f.path + '\\'),
    )
    try {
      await window.electronAPI.duplicateFile(filePath, destPath)
      if (owning) await get().refreshFolder(owning.path)
      await get().openFile(destPath)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ openError: msg })
    }
  },

  showInFolder: (itemPath: string) => {
    void window.electronAPI.showInFolder(itemPath)
  },

  setRenamingPath: (path: string | null) => set({ renamingPath: path }),
  setAutoExpandPath: (path: string | null) => set({ autoExpandPath: path }),

  loadChildren: async (dirPath: string) => {
    try {
      const children = await window.electronAPI.readDirectoryChildren(dirPath)
      set((state) => ({
        openFolders: state.openFolders.map((f) => ({
          ...f,
          tree: patchChildren(f.tree, dirPath, children),
        })),
      }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ openError: `${dirPath}: ${msg}` })
    }
  },

  // --- Tab actions ---

  closeTab: (tabId: string) => {
    set((state) => {
      const idx = state.tabs.findIndex((t) => t.id === tabId)
      if (idx < 0) return {}
      const closing = state.tabs[idx]
      window.electronAPI.unwatchFile(closing.filePath)
      const tabs = state.tabs.filter((t) => t.id !== tabId)

      let activeTabId = state.activeTabId
      if (activeTabId === tabId) {
        // Activate the nearest remaining tab.
        if (tabs.length === 0) {
          activeTabId = null
        } else if (idx < tabs.length) {
          activeTabId = tabs[idx].id
        } else {
          activeTabId = tabs[tabs.length - 1].id
        }
      }

      // Clean up pane references for the closed tab.
      void import('./uiStore').then(({ useUIStore }) => {
        const { splitLayout, setPaneTabId } = useUIStore.getState()
        if (splitLayout.split) {
          for (const pane of splitLayout.panes) {
            if (pane.tabId === tabId) {
              // Assign next available tab or null.
              const next = tabs.length > 0 ? tabs[0].id : null
              setPaneTabId(pane.id, next)
            }
          }
        }
      })

      return {
        tabs,
        activeTabId,
        ...syncFromActiveTab(tabs, activeTabId),
        recentlyClosedPaths: [closing.filePath, ...state.recentlyClosedPaths].slice(0, 10),
      }
    })
  },

  switchTab: (tabId: string) => {
    const { tabs, activeTabId } = get()
    if (tabId === activeTabId) return
    // Reset editor mode when switching.
    void import('./editorStore').then(({ useEditorStore }) => {
      const editor = useEditorStore.getState()
      if (editor.editing && editor.isDirty) {
        const discard = window.confirm('You have unsaved changes. Discard them?')
        if (!discard) return
      }
      useEditorStore.getState().reset()
      set({
        activeTabId: tabId,
        ...syncFromActiveTab(tabs, tabId),
        toc: [],
      })
      // Sync the active pane's tab reference in split mode.
      void import('./uiStore').then(({ useUIStore }) => {
        const { splitLayout, setPaneTabId } = useUIStore.getState()
        if (splitLayout.split) {
          setPaneTabId(splitLayout.activePaneId, tabId)
        }
      })
    })
  },

  moveTab: (fromIndex: number, toIndex: number) => {
    set((state) => {
      const tabs = [...state.tabs]
      const [moved] = tabs.splice(fromIndex, 1)
      tabs.splice(toIndex, 0, moved)
      return { tabs }
    })
  },

  closeOtherTabs: (tabId: string) => {
    set((state) => {
      const keep = state.tabs.find((t) => t.id === tabId)
      if (!keep) return {}
      for (const t of state.tabs) {
        if (t.id !== tabId) window.electronAPI.unwatchFile(t.filePath)
      }
      const tabs = [keep]
      return {
        tabs,
        activeTabId: tabId,
        ...syncFromActiveTab(tabs, tabId),
      }
    })
  },

  closeTabsToRight: (tabId: string) => {
    set((state) => {
      const idx = state.tabs.findIndex((t) => t.id === tabId)
      if (idx < 0) return {}
      const closing = state.tabs.slice(idx + 1)
      for (const t of closing) window.electronAPI.unwatchFile(t.filePath)
      const tabs = state.tabs.slice(0, idx + 1)
      let activeTabId = state.activeTabId
      if (activeTabId && !tabs.some((t) => t.id === activeTabId)) {
        activeTabId = tabId
      }
      return {
        tabs,
        activeTabId,
        ...syncFromActiveTab(tabs, activeTabId),
      }
    })
  },

  reopenClosedTab: async () => {
    const { recentlyClosedPaths } = get()
    if (recentlyClosedPaths.length === 0) return
    const [filePath, ...rest] = recentlyClosedPaths
    set({ recentlyClosedPaths: rest })
    await get().openFile(filePath)
  },
}))
