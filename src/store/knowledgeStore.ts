import { create } from 'zustand'
import type {
  KnowledgeCitation,
  KnowledgeHit,
  KnowledgeLink,
  KnowledgeNoteRef,
  KnowledgeOutgoingLink,
  KnowledgeRelatedNote,
  KnowledgeStats,
} from '../types/electron'
import { useWorkspaceStore } from './workspaceStore'
import type { PageTreeNode } from '../types/electron'

/**
 * Renderer-side view of the note index.
 *
 * Two different things live here on purpose:
 *
 *  - **Index reads** (backlinks, related notes, search) come from the main
 *    process, because that is where the database is.
 *  - **Link resolution** (does `[[Kalman Filter]]` point at a real note?) is
 *    answered *locally* from the page tree the sidebar already has. ★ Every
 *    rendered wiki-link asks this question, and a document with forty links
 *    would otherwise fire forty IPC round trips on every re-render — and each
 *    one would land a frame late, so links would visibly flicker from broken
 *    to working as the answers arrived.
 */

/** Must match `normalizeTitle` in `electron/knowledge/links.ts`. */
export function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase()
}

export interface ResolvedNote {
  pageId: string
  title: string
}

function collectTitles(nodes: PageTreeNode[], into: Map<string, ResolvedNote>): void {
  for (const node of nodes) {
    // Folders are containers, not notes — a link to one has nothing to open.
    if (!node.isFolder) {
      const key = normalizeTitle(node.title)
      // First wins, so a stable order (the tree's) decides ties rather than
      // whichever note happened to be indexed last.
      if (key && !into.has(key)) into.set(key, { pageId: node.id, title: node.title })
    }
    if (node.children?.length) collectTitles(node.children, into)
  }
}

let titleCacheSource: PageTreeNode[] | null = null
let titleCache: Map<string, ResolvedNote> = new Map()

/**
 * Normalized title -> note, rebuilt only when the page tree object identity
 * changes. zustand replaces `pageTree` wholesale on every tree load, so
 * reference equality is a correct and very cheap staleness check.
 *
 * The tree is a parameter rather than a `getState()` read so React callers
 * can pass the value they are already subscribed to — that subscription is
 * what re-renders a link when its target note appears.
 */
function titleIndex(tree = useWorkspaceStore.getState().pageTree): Map<string, ResolvedNote> {
  if (tree !== titleCacheSource) {
    titleCacheSource = tree
    titleCache = new Map()
    collectTitles(tree, titleCache)
  }
  return titleCache
}

/** The note a `[[link]]` target points at, or null when it does not exist yet. */
export function resolveWikiTarget(target: string, tree?: PageTreeNode[]): ResolvedNote | null {
  return titleIndex(tree).get(normalizeTitle(target)) ?? null
}

export interface NoteContext {
  backlinks: KnowledgeLink[]
  outgoing: KnowledgeOutgoingLink[]
  related: KnowledgeRelatedNote[]
  tags: string[]
}

const EMPTY_CONTEXT: NoteContext = { backlinks: [], outgoing: [], related: [], tags: [] }

interface KnowledgeStore {
  /** Context for the note currently open, or null while none is. */
  context: NoteContext | null
  contextPageId: string | null
  contextLoading: boolean

  stats: KnowledgeStats | null
  unresolved: { target: string; normalized: string; sources: { pageId: string; title: string }[] }[]
  orphans: KnowledgeNoteRef[]
  reindexing: boolean

  loadContext: (pageId: string | null) => Promise<void>
  refreshContext: () => Promise<void>
  loadStats: () => Promise<void>
  loadUnresolved: () => Promise<void>
  loadOrphans: () => Promise<void>
  reindex: () => Promise<void>
  search: (query: string, options?: { limit?: number; contextPageId?: string }) => Promise<KnowledgeHit[]>
  retrieve: (
    query: string,
    options?: { maxPassages?: number; contextPageId?: string },
  ) => Promise<{ context: string; citations: KnowledgeCitation[] }>
}

export const useKnowledgeStore = create<KnowledgeStore>((set, get) => ({
  context: null,
  contextPageId: null,
  contextLoading: false,
  stats: null,
  unresolved: [],
  orphans: [],
  reindexing: false,

  loadContext: async (pageId) => {
    if (!pageId) {
      set({ context: null, contextPageId: null, contextLoading: false })
      return
    }
    set({ contextPageId: pageId, contextLoading: true })
    try {
      const res = await window.electronAPI.knowledgeNoteContext(pageId)
      // A slower request for a note the user already navigated away from
      // must not overwrite the newer one's results.
      if (get().contextPageId !== pageId) return
      set({
        context: res.ok
          ? {
              backlinks: res.backlinks ?? [],
              outgoing: res.outgoing ?? [],
              related: res.related ?? [],
              tags: res.tags ?? [],
            }
          : EMPTY_CONTEXT,
        contextLoading: false,
      })
    } catch {
      if (get().contextPageId === pageId) set({ context: EMPTY_CONTEXT, contextLoading: false })
    }
  },

  refreshContext: async () => {
    const { contextPageId, loadContext } = get()
    if (contextPageId) await loadContext(contextPageId)
  },

  loadStats: async () => {
    try {
      const res = await window.electronAPI.knowledgeStats()
      if (res.ok && res.stats) set({ stats: res.stats })
    } catch { /* stats are decoration; failing to load one is not an error */ }
  },

  loadUnresolved: async () => {
    try {
      const res = await window.electronAPI.knowledgeUnresolved(50)
      if (res.ok) set({ unresolved: res.links ?? [] })
    } catch { /* ignore */ }
  },

  loadOrphans: async () => {
    try {
      const res = await window.electronAPI.knowledgeOrphans(50)
      if (res.ok) set({ orphans: res.notes ?? [] })
    } catch { /* ignore */ }
  },

  reindex: async () => {
    set({ reindexing: true })
    try {
      await window.electronAPI.knowledgeReindex(true)
      await Promise.all([get().loadStats(), get().loadUnresolved(), get().loadOrphans(), get().refreshContext()])
    } catch (err) {
      const { useToastStore } = await import('./toastStore')
      useToastStore.getState().show('error', err instanceof Error ? err.message : String(err))
    }
    set({ reindexing: false })
  },

  search: async (query, options) => {
    try {
      const res = await window.electronAPI.knowledgeSearch(query, options)
      return res.ok ? res.hits ?? [] : []
    } catch {
      return []
    }
  },

  retrieve: async (query, options) => {
    try {
      const res = await window.electronAPI.knowledgeRetrieve(query, options)
      if (!res.ok) return { context: '', citations: [] }
      return { context: res.context ?? '', citations: res.citations ?? [] }
    } catch {
      return { context: '', citations: [] }
    }
  },
}))

/**
 * Keep the panel in step with the index. Bound once at module load: the
 * subscription is process-wide and the renderer outlives every component
 * that reads from it.
 */
let bound = false
export function bindKnowledgeListeners(): void {
  if (bound) return
  if (typeof window === 'undefined' || !window.electronAPI?.onKnowledgeUpdated) return
  bound = true
  window.electronAPI.onKnowledgeUpdated(() => {
    const store = useKnowledgeStore.getState()
    void store.refreshContext()
    void store.loadStats()
  })
}
