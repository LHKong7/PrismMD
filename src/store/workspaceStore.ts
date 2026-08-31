import { create } from 'zustand'
import type { TocEntry } from '../lib/markdown/remarkToc'
import {
  isSupported,
  kindOfFormat,
  normalizeFormat as formatFromString,
  type FileFormat,
} from '../lib/fileFormat'
import type { PageTreeNode, WorkspacePage } from '../types/electron'

/**
 * Workspace Store — the Notion-like page management state.
 *
 * Replaces the filesystem-based fileStore. Pages live in SQLite (main
 * process); this store mirrors the open pages as tabs and exposes a
 * compatibility layer (currentPageId / currentContent / currentTitle)
 * so reader/editor components migrate mechanically.
 */

function showToast(tone: 'info' | 'success' | 'error' | 'warning', message: string, duration?: number) {
  void import('./toastStore').then((m) =>
    m.useToastStore.getState().show(tone, message, duration),
  )
}

// Workspace search is served directly by SQLite (workspaceSearch IPC), so
// there is no separate index to invalidate. Kept as a no-op hook point.
function invalidateSearchIndex() {
  /* no-op */
}

/** A single open page tab. */
export interface WorkspaceTab {
  id: string          // tab UUID (runtime only)
  pageId: string      // workspace page ID (stable)
  title: string
  format: FileFormat | null
  content: string | null
  /**
   * Raw payload for binary formats (PDF, XLSX), fetched from the asset
   * store when the tab opens. Null for text formats, whose payload is
   * `content`.
   */
  bytes: ArrayBuffer | null
  scrollY: number
}

const MAX_TABS = 20
/** Debounce window for autosaving edited content to SQLite. */
const AUTOSAVE_DEBOUNCE_MS = 600

interface WorkspaceStore {
  // --- Page tree (sidebar) ---
  pageTree: PageTreeNode[]
  expandedIds: Set<string>
  treeLoading: boolean

  // --- Tab state ---
  tabs: WorkspaceTab[]
  activeTabId: string | null

  // --- Compatibility layer (derived from active tab) ---
  currentPageId: string | null
  currentTitle: string | null
  currentFormat: FileFormat | null
  currentContent: string | null
  /**
   * Alias of `currentPageId`. Many consumers (agent, memory, annotations,
   * export) historically read `currentFilePath` as an opaque document
   * identity. In the workspace model that identity is the page ID, so we
   * expose it under the legacy name to keep those consumers working with a
   * one-line import swap. Display-name consumers use `currentTitle` instead.
   */
  currentFilePath: string | null
  /** Raw bytes of the active tab when it holds a binary document (PDF/XLSX). */
  currentBytes: ArrayBuffer | null

  toc: TocEntry[]
  openError: string | null
  renamingId: string | null
  /** Stack of recently closed page IDs (for reopen). */
  recentlyClosedIds: string[]

  // --- Tree actions ---
  loadTree: () => Promise<void>
  toggleExpand: (pageId: string) => void
  setExpanded: (pageId: string, expanded: boolean) => void

  // --- Page actions ---
  createPage: (title?: string, parentId?: string | null) => Promise<string | null>
  /** Create a folder (a container that groups pages — never opened as a doc). */
  createFolder: (title?: string, parentId?: string | null) => Promise<string | null>
  openPage: (pageId: string) => Promise<void>
  savePage: (pageId: string, content: string) => Promise<void>
  /** Update the active tab's in-memory content + schedule an autosave. */
  setContent: (content: string) => void
  /** Flush every pending debounced autosave to SQLite immediately (e.g. before a tab switch). */
  flushPendingSaves: () => Promise<void>
  deletePage: (pageId: string) => Promise<void>
  movePage: (pageId: string, newParentId: string | null, position: number) => Promise<void>
  renamePage: (pageId: string, title: string) => Promise<void>
  /**
   * Re-read a page whose text was changed by the main process (link rewrites
   * after a rename) and push it into any open tab and the editor buffer.
   */
  syncExternalEdit: (pageId: string) => Promise<void>
  setIcon: (pageId: string, icon: string | null) => Promise<void>
  setRenamingId: (id: string | null) => void
  setToc: (toc: TocEntry[]) => void
  clearOpenError: () => void

  // --- Import / Export ---
  importFile: (parentId?: string | null) => Promise<void>
  importFolder: (parentId?: string | null) => Promise<void>
  /** Import files dropped onto the window (any supported format). */
  importDroppedFiles: (files: File[], parentId?: string | null) => Promise<void>
  exportPage: (pageId: string) => Promise<void>

  // --- Tab actions ---
  closeTab: (tabId: string) => void
  switchTab: (tabId: string) => void
  moveTab: (fromIndex: number, toIndex: number) => void
  closeOtherTabs: (tabId: string) => void
  closeTabsToRight: (tabId: string) => void
  reopenClosedTab: () => Promise<void>

  // --- Session persistence ---
  saveSession: () => Promise<void>
  restoreSession: () => Promise<void>
}

/**
 * Sync the compatibility-layer fields from the active tab.
 */
function syncFromActiveTab(tabs: WorkspaceTab[], activeTabId: string | null) {
  const tab = tabs.find((t) => t.id === activeTabId)
  if (!tab) {
    return {
      currentPageId: null,
      currentTitle: null,
      currentFormat: null,
      currentContent: null,
      currentFilePath: null,
      currentBytes: null,
    }
  }
  return {
    currentPageId: tab.pageId,
    currentTitle: tab.title,
    currentFormat: tab.format,
    currentContent: tab.content,
    currentFilePath: tab.pageId,
    currentBytes: tab.bytes,
  }
}

/**
 * Fetch the binary payload of an asset-backed page. Returns null for text
 * formats (their payload is `content`) and for a binary page whose file has
 * gone missing — the viewers render their own "nothing to show" state.
 */
async function loadPageBytes(pageId: string, format: FileFormat): Promise<ArrayBuffer | null> {
  if (kindOfFormat(format) !== 'binary') return null
  try {
    const bytes = await window.electronAPI.workspaceGetPageBytes(pageId)
    if (!bytes) return null
    // The IPC boundary hands back a Uint8Array that may be a view into a
    // larger pooled buffer — copy so pdfjs/SheetJS get exactly our document.
    return bytes.slice().buffer as ArrayBuffer
  } catch (err) {
    console.error('[workspace] failed to read page bytes:', err)
    return null
  }
}

// Per-page autosave timers so rapid edits coalesce into one write.
const autosaveTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Pages extraction has already been attempted for this session.
 *
 * Importing a PDF both opens it (which extracts) and queues a background
 * pass over the imported set, so the same page arrives here twice — once
 * while the first run is still going, and once after it finished with a
 * `content` snapshot that is now stale. A single "attempted" set covers
 * both without re-parsing.
 */
const extractionAttempted = new Set<string>()

/**
 * Backfill a PDF page's `content` with its text layer.
 *
 * The bytes render the document; the extracted text is what search, RAG and
 * the agent actually read. Extraction is lazy and idempotent — it runs once,
 * when a PDF is first imported or first opened, and skips any page that
 * already has content (including one where a previous run legitimately found
 * nothing, e.g. a scan without a text layer, so we don't re-parse it forever).
 */
async function ensureExtractedText(
  pageId: string,
  format: FileFormat,
  bytes: ArrayBuffer | null,
  currentContent: string | null,
): Promise<void> {
  if (format !== 'pdf' || !bytes) return
  if (extractionAttempted.has(pageId)) return
  if ((currentContent ?? '').trim().length > 0) return

  extractionAttempted.add(pageId)
  try {
    const { extractPdfText } = await import('../lib/pdf/extractText')
    const { text, pageCount, truncated } = await extractPdfText(bytes)
    const body = truncated
      ? `${text}\n\n[Extraction stopped early — this PDF has ${pageCount} pages.]`
      : text
    // A scan with no text layer yields nothing; leaving content empty keeps
    // the page honest (it just won't match text queries).
    if (!body.trim()) return
    await useWorkspaceStore.getState().savePage(pageId, body)
  } catch (err) {
    // Transient failure (corrupt read, worker hiccup) — let the next open
    // try again rather than writing the page off for the whole session.
    extractionAttempted.delete(pageId)
    console.warn('[workspace] PDF text extraction failed:', pageId, err)
  }
}

/** Kick off extraction for freshly imported pages without blocking the UI. */
function extractImportedPdfs(pages: Array<{ id: string; format: string; content: string }>): void {
  void (async () => {
    for (const page of pages) {
      const format = formatFromString(page.format)
      // Checked before fetching bytes — the page opened right after import
      // is already handled, and its file shouldn't be read a second time.
      if (format !== 'pdf' || extractionAttempted.has(page.id)) continue
      const bytes = await loadPageBytes(page.id, format)
      await ensureExtractedText(page.id, format, bytes, page.content)
    }
  })()
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  pageTree: [],
  expandedIds: new Set<string>(),
  treeLoading: false,

  tabs: [],
  activeTabId: null,

  currentPageId: null,
  currentTitle: null,
  currentFormat: null,
  currentContent: null,
  currentFilePath: null,
  currentBytes: null,

  toc: [],
  openError: null,
  renamingId: null,
  recentlyClosedIds: [],

  // ─── Tree ─────────────────────────────────────────────────────────────────

  loadTree: async () => {
    set({ treeLoading: true })
    try {
      const tree = await window.electronAPI.workspaceGetTree()
      set({ pageTree: tree, treeLoading: false })
    } catch (err) {
      set({ treeLoading: false, openError: err instanceof Error ? err.message : String(err) })
    }
  },

  toggleExpand: (pageId: string) => {
    set((state) => {
      const next = new Set(state.expandedIds)
      if (next.has(pageId)) next.delete(pageId)
      else next.add(pageId)
      return { expandedIds: next }
    })
  },

  setExpanded: (pageId: string, expanded: boolean) => {
    set((state) => {
      const next = new Set(state.expandedIds)
      if (expanded) next.add(pageId)
      else next.delete(pageId)
      return { expandedIds: next }
    })
  },

  // ─── Pages ──────────────────────────────────────────────────────────────

  createPage: async (title = 'Untitled', parentId = null) => {
    try {
      const res = await window.electronAPI.workspaceCreatePage(title, parentId ?? undefined, '')
      if (!res.ok || !res.page) {
        showToast('error', res.error ?? 'Failed to create page')
        return null
      }
      await get().loadTree()
      // Expand the parent so the new child is visible.
      if (parentId) get().setExpanded(parentId, true)
      await get().openPage(res.page.id)
      invalidateSearchIndex()
      return res.page.id
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : String(err))
      return null
    }
  },

  createFolder: async (title = 'New Folder', parentId = null) => {
    try {
      const res = await window.electronAPI.workspaceCreateFolder(title, parentId ?? undefined)
      if (!res.ok || !res.page) {
        showToast('error', res.error ?? 'Failed to create folder')
        return null
      }
      await get().loadTree()
      // Expand the parent (so the new folder shows) and the folder itself.
      if (parentId) get().setExpanded(parentId, true)
      get().setExpanded(res.page.id, true)
      invalidateSearchIndex()
      // NOTE: folders are not opened as documents — callers that want an
      // inline rename affordance set `renamingId` to the returned id.
      return res.page.id
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : String(err))
      return null
    }
  },

  openPage: async (pageId: string) => {
    // Already open? Just switch.
    const existing = get().tabs.find((t) => t.pageId === pageId)
    if (existing) {
      get().switchTab(existing.id)
      return
    }

    // Fetch first so folders short-circuit before any editor state is touched.
    let page: WorkspacePage | null
    try {
      page = await window.electronAPI.workspaceGetPage(pageId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ openError: msg })
      showToast('error', msg, 5000)
      return
    }
    if (!page) {
      set({ openError: 'Page not found' })
      return
    }
    // Folders are containers, not documents — reveal their children instead
    // of opening an (empty) editor tab. This guards every openPage caller
    // (sidebar, search, breadcrumb, command palette, session restore…).
    if (page.isFolder) {
      get().setExpanded(pageId, true)
      return
    }

    // Single always-editable mode — persist any pending edits before switching.
    const { useEditorStore } = await import('./editorStore')
    await get().flushPendingSaves()

    const format = formatFromString(page.format)
    const bytes = await loadPageBytes(page.id, format)

    const newTab: WorkspaceTab = {
      id: crypto.randomUUID(),
      pageId: page.id,
      title: page.title,
      format,
      content: page.content,
      bytes,
      scrollY: 0,
    }

    set((state) => {
      let tabs = [...state.tabs, newTab]
      if (tabs.length > MAX_TABS) tabs.shift()
      return {
        tabs,
        activeTabId: newTab.id,
        ...syncFromActiveTab(tabs, newTab.id),
        toc: [],
        openError: null,
      }
    })
    // Load the freshly-active document into the editor buffer.
    useEditorStore.getState().syncForActiveTab()
    // A PDF opened before extraction ever ran (imported via a folder scan,
    // or created by an older build) gets its text layer indexed now.
    void ensureExtractedText(page.id, newTab.format!, bytes, page.content)
  },

  savePage: async (pageId: string, content: string) => {
    try {
      await window.electronAPI.workspaceUpdatePage(pageId, { content })
      // Keep any open tab in sync with what we just persisted. Without this a
      // programmatic save (e.g. Horse Mode writing into a freshly created page)
      // leaves the already-open tab showing its stale initial content, because
      // openPage() short-circuits to switchTab when the page is already open
      // and never re-reads from SQLite.
      set((state) => {
        if (!state.tabs.some((t) => t.pageId === pageId && t.content !== content)) {
          return {}
        }
        const tabs = state.tabs.map((t) =>
          t.pageId === pageId ? { ...t, content } : t,
        )
        return { tabs, ...syncFromActiveTab(tabs, state.activeTabId) }
      })
      invalidateSearchIndex()
      // If this write targeted the currently-open page and the editor has no
      // unsaved local edits, refresh its buffer — the editor renders from
      // editorStore.editorContent, so a programmatic save (Horse Mode, weekly
      // summary, template insert) would otherwise be clobbered on the next
      // keystroke. The !isDirty guard preserves a user who is actively typing,
      // and skips the editor's own autosave writes (dirty while saving).
      if (get().currentPageId === pageId) {
        const { useEditorStore } = await import('./editorStore')
        const ed = useEditorStore.getState()
        if (ed.editing && !ed.isDirty && ed.editorContent !== content) {
          ed.loadExternalContent(content)
        }
      }
    } catch (err) {
      showToast('error', `Save failed: ${err instanceof Error ? err.message : String(err)}`, 5000)
    }
  },

  setContent: (content: string) => {
    const { activeTabId, tabs } = get()
    if (!activeTabId) return
    const tab = tabs.find((t) => t.id === activeTabId)
    if (!tab) return

    // Update in-memory content immediately.
    set((state) => {
      const nextTabs = state.tabs.map((t) =>
        t.id === activeTabId ? { ...t, content } : t,
      )
      return { tabs: nextTabs, ...syncFromActiveTab(nextTabs, activeTabId) }
    })

    // Debounced autosave to SQLite.
    const pageId = tab.pageId
    const existing = autosaveTimers.get(pageId)
    if (existing) clearTimeout(existing)
    autosaveTimers.set(pageId, setTimeout(() => {
      autosaveTimers.delete(pageId)
      void (async () => {
        await get().savePage(pageId, content)
        // Clear the editor's dirty flag once this page is actually persisted.
        if (get().currentPageId === pageId) {
          const { useEditorStore } = await import('./editorStore')
          useEditorStore.getState().markSaved(content)
        }
      })()
    }, AUTOSAVE_DEBOUNCE_MS))
  },

  flushPendingSaves: async () => {
    const entries = Array.from(autosaveTimers.entries())
    for (const [pageId, timer] of entries) {
      clearTimeout(timer)
      autosaveTimers.delete(pageId)
      const tab = get().tabs.find((t) => t.pageId === pageId)
      if (!tab || tab.content == null) continue
      const content = tab.content
      await get().savePage(pageId, content)
      if (get().currentPageId === pageId) {
        const { useEditorStore } = await import('./editorStore')
        useEditorStore.getState().markSaved(content)
      }
    }
  },

  deletePage: async (pageId: string) => {
    try {
      await window.electronAPI.workspaceDeletePage(pageId)
      // Close any tabs referencing this page (or its descendants we no longer track).
      set((state) => {
        const closing = state.tabs.filter((t) => t.pageId === pageId)
        const tabs = state.tabs.filter((t) => t.pageId !== pageId)
        let activeTabId = state.activeTabId
        if (closing.some((t) => t.id === activeTabId)) {
          activeTabId = tabs.length > 0 ? tabs[tabs.length - 1].id : null
        }
        return {
          tabs,
          activeTabId,
          ...syncFromActiveTab(tabs, activeTabId),
          recentlyClosedIds: [pageId, ...state.recentlyClosedIds].slice(0, 10),
        }
      })
      await get().loadTree()
      invalidateSearchIndex()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : String(err))
    }
  },

  movePage: async (pageId: string, newParentId: string | null, position: number) => {
    try {
      await window.electronAPI.workspaceMovePage(pageId, newParentId, position)
      await get().loadTree()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : String(err))
    }
  },

  renamePage: async (pageId: string, title: string) => {
    const trimmed = title.trim()
    if (!trimmed) {
      set({ renamingId: null })
      return
    }
    try {
      const res = await window.electronAPI.workspaceUpdatePage(pageId, { title: trimmed })
      // Update any open tabs.
      set((state) => {
        const tabs = state.tabs.map((t) => (t.pageId === pageId ? { ...t, title: trimmed } : t))
        return { tabs, ...syncFromActiveTab(tabs, state.activeTabId), renamingId: null }
      })
      // A rename rewrites every [[link]] that pointed at the old title. Those
      // notes changed on disk, so any tab holding them has to be refreshed or
      // its next autosave puts the old links straight back.
      for (const id of res.relinkedPageIds ?? []) {
        if (get().tabs.some((t) => t.pageId === id)) await get().syncExternalEdit(id)
      }
      await get().loadTree()
      invalidateSearchIndex()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : String(err))
      set({ renamingId: null })
    }
  },

  syncExternalEdit: async (pageId: string) => {
    const page = await window.electronAPI.workspaceGetPage(pageId)
    if (!page) return
    const content = page.content ?? ''

    set((state) => {
      if (!state.tabs.some((t) => t.pageId === pageId && t.content !== content)) return {}
      const tabs = state.tabs.map((t) => (t.pageId === pageId ? { ...t, content } : t))
      return { tabs, ...syncFromActiveTab(tabs, state.activeTabId) }
    })

    // Same guard as savePage: never yank the buffer out from under someone who
    // is mid-edit. Their own text wins; the rewrite is re-applied next time
    // the note is opened clean.
    if (get().currentPageId === pageId) {
      const { useEditorStore } = await import('./editorStore')
      const ed = useEditorStore.getState()
      if (ed.editing && !ed.isDirty && ed.editorContent !== content) {
        ed.loadExternalContent(content)
      }
    }
  },

  setIcon: async (pageId: string, icon: string | null) => {
    try {
      await window.electronAPI.workspaceUpdatePage(pageId, { icon })
      await get().loadTree()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : String(err))
    }
  },

  setRenamingId: (id: string | null) => set({ renamingId: id }),
  setToc: (toc: TocEntry[]) => set({ toc }),
  clearOpenError: () => set({ openError: null }),

  // ─── Import / Export ────────────────────────────────────────────────────

  importFile: async (parentId = null) => {
    try {
      const res = await window.electronAPI.workspaceImportFile(parentId ?? undefined)
      if (res.canceled) return
      if (!res.ok) {
        showToast('error', res.error ?? 'Import failed')
        return
      }
      await get().loadTree()
      invalidateSearchIndex()
      const count = res.pages?.length ?? 0
      showToast('success', `Imported ${count} page${count === 1 ? '' : 's'}`)
      // Open the first imported page.
      if (res.pages && res.pages.length > 0) {
        await get().openPage(res.pages[0].id)
        // Index the rest in the background — the user explicitly picked this
        // set, so it is bounded (unlike a folder scan, which stays lazy).
        extractImportedPdfs(res.pages)
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : String(err))
    }
  },

  importDroppedFiles: async (files, parentId = null) => {
    const supported = files.filter((f) => isSupported(f.name))
    if (supported.length === 0) {
      if (files.length > 0) showToast('warning', 'No supported files in that drop')
      return
    }

    const imported: WorkspacePage[] = []
    for (const file of supported) {
      try {
        const buffer = await file.arrayBuffer()
        const res = await window.electronAPI.workspaceImportDroppedFile(
          file.name,
          new Uint8Array(buffer),
          parentId ?? undefined,
        )
        if (!res.ok || !res.page) {
          showToast('error', res.error ?? `Failed to import ${file.name}`)
          continue
        }
        imported.push(res.page)
      } catch (err) {
        showToast('error', `${file.name}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    if (imported.length === 0) return
    await get().loadTree()
    invalidateSearchIndex()
    showToast('success', `Imported ${imported.length} file${imported.length === 1 ? '' : 's'}`)
    await get().openPage(imported[0].id)
    extractImportedPdfs(imported)
  },

  importFolder: async (parentId = null) => {
    try {
      const res = await window.electronAPI.workspaceImportFolder(parentId ?? undefined)
      if (res.canceled) return
      if (!res.ok) {
        showToast('error', res.error ?? 'Import failed')
        return
      }
      await get().loadTree()
      invalidateSearchIndex()
      showToast('success', `Imported ${res.count ?? 0} page${res.count === 1 ? '' : 's'}`)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : String(err))
    }
  },

  exportPage: async (pageId: string) => {
    try {
      const res = await window.electronAPI.workspaceExportPage(pageId)
      if (res.canceled) return
      if (!res.ok) {
        showToast('error', res.error ?? 'Export failed')
        return
      }
      showToast('success', `Exported to ${res.filePath}`)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : String(err))
    }
  },

  // ─── Tabs ─────────────────────────────────────────────────────────────────

  closeTab: (tabId: string) => {
    void import('./editorStore').then(async ({ useEditorStore }) => {
      // Persist any pending edits (the closing tab may be the one being edited).
      await get().flushPendingSaves()
      set((state) => {
        const idx = state.tabs.findIndex((t) => t.id === tabId)
        if (idx < 0) return {}
        const closing = state.tabs[idx]
        const tabs = state.tabs.filter((t) => t.id !== tabId)

        let activeTabId = state.activeTabId
        if (activeTabId === tabId) {
          if (tabs.length === 0) activeTabId = null
          else if (idx < tabs.length) activeTabId = tabs[idx].id
          else activeTabId = tabs[tabs.length - 1].id
        }

        return {
          tabs,
          activeTabId,
          ...syncFromActiveTab(tabs, activeTabId),
          recentlyClosedIds: [closing.pageId, ...state.recentlyClosedIds].slice(0, 10),
        }
      })
      // Re-sync the editor to whatever tab is now active (or clear if none).
      useEditorStore.getState().syncForActiveTab()
    })
  },

  switchTab: (tabId: string) => {
    const { activeTabId } = get()
    if (tabId === activeTabId) return
    void import('./editorStore').then(async ({ useEditorStore }) => {
      // Persist the outgoing tab's edits, switch, then load the new tab's buffer.
      await get().flushPendingSaves()
      set({ activeTabId: tabId, ...syncFromActiveTab(get().tabs, tabId), toc: [] })
      useEditorStore.getState().syncForActiveTab()
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
      const tabs = [keep]
      return { tabs, activeTabId: tabId, ...syncFromActiveTab(tabs, tabId) }
    })
  },

  closeTabsToRight: (tabId: string) => {
    set((state) => {
      const idx = state.tabs.findIndex((t) => t.id === tabId)
      if (idx < 0) return {}
      const tabs = state.tabs.slice(0, idx + 1)
      let activeTabId = state.activeTabId
      if (activeTabId && !tabs.some((t) => t.id === activeTabId)) activeTabId = tabId
      return { tabs, activeTabId, ...syncFromActiveTab(tabs, activeTabId) }
    })
  },

  reopenClosedTab: async () => {
    const { recentlyClosedIds } = get()
    if (recentlyClosedIds.length === 0) return
    const [pageId, ...rest] = recentlyClosedIds
    set({ recentlyClosedIds: rest })
    await get().openPage(pageId)
  },

  // ─── Session ──────────────────────────────────────────────────────────────

  saveSession: async () => {
    if (typeof window === 'undefined' || !window.electronAPI) return
    try {
      const { tabs, activeTabId } = get()
      const activeTab = tabs.find((t) => t.id === activeTabId)
      const settings = await window.electronAPI.loadSettings() as Record<string, unknown>
      await window.electronAPI.saveSettings({
        ...settings,
        workspaceSession: {
          openPageIds: tabs.map((t) => ({ pageId: t.pageId, scrollY: t.scrollY })),
          activePageId: activeTab?.pageId ?? null,
          expandedIds: Array.from(get().expandedIds),
        },
      })
    } catch {
      // Silent
    }
  },

  restoreSession: async () => {
    if (typeof window === 'undefined' || !window.electronAPI) return
    try {
      await get().loadTree()
      const settings = await window.electronAPI.loadSettings() as Record<string, unknown>
      const session = settings.workspaceSession as {
        openPageIds?: { pageId: string; scrollY: number }[]
        activePageId?: string | null
        expandedIds?: string[]
      } | undefined
      if (!session) return

      if (session.expandedIds) {
        set({ expandedIds: new Set(session.expandedIds) })
      }

      // Re-open previously open pages (skip any that were deleted).
      if (session.openPageIds) {
        for (const { pageId } of session.openPageIds) {
          const page = await window.electronAPI.workspaceGetPage(pageId)
          if (page) await get().openPage(pageId)
        }
      }
      // Restore active tab.
      if (session.activePageId) {
        const tab = get().tabs.find((t) => t.pageId === session.activePageId)
        if (tab) get().switchTab(tab.id)
      }
    } catch {
      // Silent
    }
  },
}))
