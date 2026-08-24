export interface WorkspacePage {
  id: string
  title: string
  content: string
  format: string
  parentId: string | null
  position: number
  createdAt: number
  updatedAt: number
  isDeleted: boolean
  icon: string | null
  /** Folders are pure containers (no document content) that group pages. */
  isFolder: boolean
}

/**
 * Metadata for a page whose real payload is a binary file (PDF, XLSX)
 * stored under {userData}/assets rather than in `pages.content`.
 */
export interface PageAsset {
  pageId: string
  fileName: string
  ext: string
  mime: string | null
  size: number
  sourcePath: string | null
  storageName: string
  createdAt: number
}

export interface PageTreeNode {
  id: string
  title: string
  icon: string | null
  format: string
  parentId: string | null
  position: number
  isFolder: boolean
  children: PageTreeNode[]
}

export interface KBEntry {
  id: string
  title: string
  originalPath?: string
  sourcePageId?: string
  tags: string[]
  summary: string
  addedAt: number
}

/** One row of a reader-mode folder listing. */
export interface LibraryEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  /** Stored-format id ('md' | 'pdf' | …); null for directories. */
  format: string | null
  size: number
  modifiedAt: number
}

export interface LibraryListing {
  path: string
  entries: LibraryEntry[]
  /** The directory held more entries than a single listing returns. */
  truncated: boolean
}

export interface LibraryFileInfo {
  path: string
  name: string
  format: string
  size: number
  modifiedAt: number
}

/** What a reader window was asked to show when it was created. */
export type LaunchTarget = { kind: 'folder' | 'file'; path: string }

export type LibraryResult<T> = ({ ok: true } & T) | { ok: false; error: string }

export interface Annotation {
  id: string
  filePath: string
  startOffset: number
  endOffset: number
  selectedText: string
  color: 'yellow' | 'green' | 'blue' | 'pink' | 'purple'
  note?: string
  createdAt: string
  updatedAt: string
}

export interface VersionMeta {
  id: string
  pageId: string
  title: string | null
  source: string
  label: string | null
  createdAt: number
  length: number
}

export interface VersionFull extends VersionMeta {
  content: string
}

export interface PageMeta {
  status: string | null
  genre: string | null
  quality: number | null
}

export interface PageMetaListItem extends PageMeta {
  pageId: string
  length: number
  updatedAt: number
}

export interface MuseCard {
  id: string
  kind: string
  text: string
  pageId: string | null
  createdAt: number
}

/**
 * The renderer's view of the preload bridge.
 *
 * **Derived, not mirrored.** This used to be a hand-copied duplicate of
 * `electron/preload.ts`, and it drifted: ~20 `insightGraph*` channels the
 * preload really exposed were missing here, so every call site was a type
 * error that `npm run typecheck` silently swallowed. Deriving the shape means
 * a channel added to preload is available here the moment it exists.
 *
 * `Overrides` is the escape hatch for the handful of channels preload types
 * loosely (`any`, `unknown`) that the renderer wants precisely. The `Assert`
 * below fails the build if an override names a channel preload doesn't have —
 * the drift guard the old hand-written mirror lacked.
 */
import type { ElectronAPI as PreloadAPI } from '../../electron/preload'

/**
 * Knowledge-index shapes. Re-exported from preload for the same reason the
 * API itself is derived there: one declaration, so a change to the channel
 * and a change to the renderer's view of it cannot drift apart.
 */
export type {
  KnowledgeCitation,
  KnowledgeHit,
  KnowledgeLink,
  KnowledgeNoteRef,
  KnowledgeOutgoingLink,
  KnowledgeRelatedNote,
  KnowledgeStats,
  KnowledgeUnresolvedLink,
} from '../../electron/preload'

type Assert<T extends true> = T

interface Overrides {
  workspaceGetPage: (pageId: string) => Promise<WorkspacePage | null>
  workspaceGetChildren: (parentId: string | null) => Promise<WorkspacePage[]>
  workspaceGetTree: () => Promise<PageTreeNode[]>
  workspaceGetAncestors: (pageId: string) => Promise<PageTreeNode[]>
  workspaceSearch: (query: string) => Promise<WorkspacePage[]>
  kbList: () => Promise<{ ok: boolean; entries?: KBEntry[]; error?: string }>
  kbSearch: (query: string) => Promise<{ ok: boolean; entries?: KBEntry[]; error?: string }>
}

// Every override must name a channel preload actually exposes.
type _OverridesAreReal = Assert<keyof Overrides extends keyof PreloadAPI ? true : false>

export type ElectronAPI = Omit<PreloadAPI, keyof Overrides> & Overrides


declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
