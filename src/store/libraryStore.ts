/**
 * Library store — state for a reader window.
 *
 * Deliberately holds *nothing* that outlives the window: no reading
 * position, no highlights, no index. Close the window and the only trace
 * left is the recents list (see `electron/services/libraryRecents.ts`).
 * That is what makes reader mode safe to point at any folder — it reads,
 * and it forgets.
 *
 * One window shows one folder. "Open another folder" means "open another
 * window", which keeps this store free of cross-root bookkeeping.
 */
import { create } from 'zustand'
import { detectFormat, normalizeFormat, kindOfFormat, type FileFormat } from '../lib/fileFormat'
import type { LibraryEntry, LibraryListing, LaunchTarget } from '../types/electron'

export interface LibraryTab {
  path: string
  name: string
  format: FileFormat
  /** Text payload for text formats; null for PDF/XLSX. */
  content: string | null
  /** Raw bytes for binary formats; null for text. */
  bytes: ArrayBuffer | null
  loading: boolean
  error: string | null
}

interface LibraryState {
  /** The mounted folder. Null until the user picks one. */
  root: string | null
  /** Directory path → its entries. Populated lazily as the tree expands. */
  dirs: Record<string, LibraryEntry[]>
  expanded: Record<string, boolean>
  loadingDirs: Record<string, boolean>
  truncatedDirs: Record<string, boolean>

  tabs: LibraryTab[]
  activePath: string | null

  recents: { roots: string[]; files: string[] }
  error: string | null
  /** False until the launch target (if any) has been resolved. */
  ready: boolean

  /** Reload the directories already in the tree, plus any changed open tab. */
  applyDiskChanges: (paths: string[]) => Promise<void>

  init: () => Promise<void>
  pickFolder: () => Promise<void>
  pickFile: () => Promise<void>
  mount: (target: string, kind: 'folder' | 'file') => Promise<void>
  toggleDir: (dirPath: string) => Promise<void>
  refreshDir: (dirPath: string) => Promise<void>
  openFile: (filePath: string) => Promise<void>
  closeTab: (filePath: string) => void
  activate: (filePath: string) => void
  loadRecents: () => Promise<void>
}

/** IPC listener disposers — `init()` runs twice under React StrictMode. */
let disposeOpenTarget: (() => void) | null = null
let disposeChanged: (() => void) | null = null

/** Basename without the extension — what the tab and header show. */
function displayName(filePath: string): string {
  const base = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath
  return base.replace(/\.[^.]+$/, '')
}

/** Merge changes into one tab, leaving its position and the active tab alone. */
function patchTab(
  set: (fn: (s: LibraryState) => Partial<LibraryState>) => void,
  filePath: string,
  changes: Partial<LibraryTab>,
) {
  set((s) => ({ tabs: s.tabs.map((t) => (t.path === filePath ? { ...t, ...changes } : t)) }))
}

/**
 * Read one document off disk into the shape a tab holds. Shared by opening a
 * file and by reloading one that changed underneath us — a reload must not go
 * through `openFile`, which would append the tab and steal focus.
 */
async function readDocument(filePath: string): Promise<Partial<LibraryTab>> {
  try {
    // Trust the main process's format detection over the extension guess —
    // it owns the format table that decides text vs binary.
    const statRes = await window.electronAPI.libraryStat(filePath)
    if (!statRes.ok) return { loading: false, error: statRes.error }
    const format = normalizeFormat(statRes.file.format)

    if (kindOfFormat(format) === 'binary') {
      const res = await window.electronAPI.libraryReadBytes(filePath)
      if (!res.ok) return { loading: false, error: res.error, format }
      return { loading: false, error: null, format, bytes: toArrayBuffer(res.bytes), content: null }
    }
    const res = await window.electronAPI.libraryReadText(filePath)
    if (!res.ok) return { loading: false, error: res.error, format }
    return { loading: false, error: null, format, content: res.content, bytes: null }
  } catch (err) {
    return { loading: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Copy out of the IPC-transferred view; `.buffer` may be a pooled arena. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  root: null,
  dirs: {},
  expanded: {},
  loadingDirs: {},
  truncatedDirs: {},
  tabs: [],
  activePath: null,
  recents: { roots: [], files: [] },
  error: null,
  ready: false,

  init: async () => {
    await get().loadRecents()

    // A window opened by double-clicking a file (or "open in new window")
    // knows its target before the renderer starts.
    const target = await window.electronAPI.libraryLaunchTarget()
    if (target) {
      await get().mount(target.path, target.kind)
    }
    set({ ready: true })

    // The OS can hand this window another document while it is already open.
    disposeOpenTarget?.()
    disposeOpenTarget = window.electronAPI.onLibraryOpenTarget((next: LaunchTarget) => {
      void get().mount(next.path, next.kind)
    })

    // The folder is the source of truth; when it moves, the view follows.
    disposeChanged?.()
    disposeChanged = window.electronAPI.onLibraryChanged((paths) => {
      void get().applyDiskChanges(paths)
    })
  },

  loadRecents: async () => {
    try {
      set({ recents: await window.electronAPI.libraryRecents() })
    } catch {
      /* recents are a convenience — never block the window on them */
    }
  },

  pickFolder: async () => {
    const res = await window.electronAPI.libraryPickFolder()
    if (!res.ok) {
      set({ error: res.error })
      return
    }
    if (res.canceled || !res.root || !res.listing) return
    applyMount(set, get, res.root, res.listing, null)
  },

  pickFile: async () => {
    const res = await window.electronAPI.libraryPickFile()
    if (!res.ok) {
      set({ error: res.error })
      return
    }
    if (res.canceled || !res.file) return
    await get().mount(res.file.path, 'file')
  },

  mount: async (target, kind) => {
    const res = await window.electronAPI.libraryMount(target, kind)
    if (!res.ok) {
      set({ error: res.error })
      return
    }
    applyMount(set, get, res.root, res.listing, res.file?.path ?? null)
    void get().loadRecents()
  },

  toggleDir: async (dirPath) => {
    const { expanded, dirs } = get()
    if (expanded[dirPath]) {
      set({ expanded: { ...expanded, [dirPath]: false } })
      return
    }
    set({ expanded: { ...expanded, [dirPath]: true } })
    if (!dirs[dirPath]) await get().refreshDir(dirPath)
  },

  refreshDir: async (dirPath) => {
    set((s) => ({ loadingDirs: { ...s.loadingDirs, [dirPath]: true } }))
    try {
      const res = await window.electronAPI.libraryListDir(dirPath)
      if (!res.ok) {
        set({ error: res.error })
        return
      }
      set((s) => ({
        dirs: { ...s.dirs, [dirPath]: res.listing.entries },
        truncatedDirs: { ...s.truncatedDirs, [dirPath]: res.listing.truncated },
      }))
    } finally {
      set((s) => ({ loadingDirs: { ...s.loadingDirs, [dirPath]: false } }))
    }
  },

  openFile: async (filePath) => {
    const existing = get().tabs.find((t) => t.path === filePath)
    if (existing) {
      set({ activePath: filePath })
      return
    }

    // Optimistic guess so the tab renders its icon immediately; `stat` below
    // replaces it with the main process's authoritative answer.
    const format = detectFormat(filePath) ?? 'markdown'
    const tab: LibraryTab = {
      path: filePath,
      name: displayName(filePath),
      format,
      content: null,
      bytes: null,
      loading: true,
      error: null,
    }
    set((s) => ({ tabs: [...s.tabs, tab], activePath: filePath }))

    patchTab(set, filePath, await readDocument(filePath))
  },

  applyDiskChanges: async (paths) => {
    const { dirs, tabs } = get()

    // Refresh only the directories the tree has actually loaded — a change
    // deep inside a collapsed folder costs nothing until it's expanded.
    const parents = new Set(
      paths.map((p) => p.replace(/\\/g, '/').split('/').slice(0, -1).join('/')),
    )
    const toRefresh = Object.keys(dirs).filter(
      (dir) => parents.has(dir.replace(/\\/g, '/')) || paths.includes(dir),
    )
    await Promise.all(toRefresh.map((dir) => get().refreshDir(dir)))

    // Reload any open document whose bytes changed underneath it. Reader mode
    // has no unsaved state, so there is nothing to lose by just re-reading.
    const changed = new Set(paths)
    await Promise.all(
      tabs
        .filter((tab) => changed.has(tab.path))
        .map(async (tab) => patchTab(set, tab.path, await readDocument(tab.path))),
    )
  },

  closeTab: (filePath) => {
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.path === filePath)
      if (idx === -1) return s
      const tabs = s.tabs.filter((t) => t.path !== filePath)
      let activePath = s.activePath
      if (activePath === filePath) {
        const neighbour = tabs[idx] ?? tabs[idx - 1] ?? null
        activePath = neighbour?.path ?? null
      }
      return { ...s, tabs, activePath }
    })
  },

  activate: (filePath) => set({ activePath: filePath }),
}))

/**
 * Adopt a freshly-mounted root: reset the tree, then open the file the user
 * actually asked for (when they picked a file rather than a folder).
 */
function applyMount(
  set: (partial: Partial<LibraryState>) => void,
  get: () => LibraryState,
  root: string,
  listing: LibraryListing,
  openPath: string | null,
) {
  const sameRoot = get().root === root
  set({
    root,
    error: null,
    // Re-mounting the same root (a second file from the same folder) must
    // not blow away the tabs the user already has open.
    dirs: sameRoot ? { ...get().dirs, [listing.path]: listing.entries } : { [listing.path]: listing.entries },
    expanded: sameRoot ? get().expanded : { [listing.path]: true },
    truncatedDirs: sameRoot
      ? { ...get().truncatedDirs, [listing.path]: listing.truncated }
      : { [listing.path]: listing.truncated },
    ...(sameRoot ? {} : { tabs: [], activePath: null }),
  })
  if (openPath) void get().openFile(openPath)
}
