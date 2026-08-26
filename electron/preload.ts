import { contextBridge, ipcRenderer } from 'electron'

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

type LibraryResult<T> = ({ ok: true } & T) | { ok: false; error: string }

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

/**
 * Knowledge-index shapes, re-declared here rather than imported from
 * `electron/knowledge/engine.ts`.
 *
 * ★ The preload bundle is what the renderer loads; importing the engine to
 * borrow one interface would drag better-sqlite3 (a native module) into it.
 * `src/types/electron.d.ts` derives the renderer's API from this file, so
 * these declarations are still the single source of truth for the renderer.
 */
export interface KnowledgeHit {
  pageId: string
  title: string
  chunkIndex: number
  headingPath: string[]
  snippet: string
  startOffset: number
  endOffset: number
  score: number
  /** Which signals matched: `body`, `title`, `tag`, `link`. */
  matchedOn: string[]
  updatedAt: number
}

export interface KnowledgeLink {
  pageId: string
  title: string
  updatedAt: number
  occurrences: number
  heading: string | null
  context?: string
}

export interface KnowledgeOutgoingLink extends KnowledgeLink {
  /** The link target as it was typed. */
  target: string
  /** False when no note with that title exists yet. */
  resolved: boolean
}

export interface KnowledgeRelatedNote {
  pageId: string
  title: string
  updatedAt: number
  score: number
  /** Why: `link`, `backlink`, `tag`, `text`. */
  reasons: string[]
  sharedTags: string[]
}

export interface KnowledgeUnresolvedLink {
  target: string
  normalized: string
  sources: { pageId: string; title: string }[]
}

export interface KnowledgeNoteRef {
  pageId: string
  title: string
  updatedAt: number
}

export interface KnowledgeCitation {
  index: number
  pageId: string
  title: string
  headingPath: string[]
  text: string
  startOffset: number
}

export interface KnowledgeStats {
  notes: number
  chunks: number
  links: number
  resolvedLinks: number
  unresolvedLinks: number
  tags: number
  orphans: number
  lastIndexedAt: number | null
  fullTextSearch: boolean
}

/** Where note text is stored, and whether the store is reachable. */
export interface StorageStatus {
  mode: 'sqlite' | 'vault'
  vaultPath: string | null
  migratedAt: number | null
  vaultReachable: boolean
  interrupted: { step: string; stagingPath: string; error: string | null } | null
}

/** One note-level thing that happened to the vault outside the app. */
export interface VaultChange {
  kind: 'created' | 'modified' | 'moved' | 'deleted'
  pageId: string | null
  relativePath: string
  previousPath?: string
}

export interface MigrateOutcome {
  ok: boolean
  vaultPath?: string
  /** What the validator refused to sign off on. */
  problems?: string[]
  stagingPath?: string
  backupPath?: string
  error?: string
}

const electronAPI = {
  // ── Library (reader mode) ──
  // Read-only browsing of a folder on disk. There is no library write
  // channel here because the main process has none to bind to — see the
  // invariants at the top of `electron/services/libraryService.ts`.
  libraryPickFolder: (): Promise<
    LibraryResult<{ canceled: boolean; root: string | null; listing: LibraryListing | null }>
  > => ipcRenderer.invoke('library:pick-folder'),
  libraryPickFile: (): Promise<
    LibraryResult<{ canceled: boolean; file: LibraryFileInfo | null; root: string | null }>
  > => ipcRenderer.invoke('library:pick-file'),
  libraryMount: (
    target: string,
    kind: 'folder' | 'file',
  ): Promise<
    LibraryResult<{ root: string; listing: LibraryListing; file: LibraryFileInfo | null }>
  > => ipcRenderer.invoke('library:mount', target, kind),
  libraryMountedRoots: (): Promise<string[]> => ipcRenderer.invoke('library:mounted-roots'),
  libraryListDir: (dirPath: string): Promise<LibraryResult<{ listing: LibraryListing }>> =>
    ipcRenderer.invoke('library:list-dir', dirPath),
  libraryReadText: (filePath: string): Promise<LibraryResult<{ content: string }>> =>
    ipcRenderer.invoke('library:read-text', filePath),
  libraryReadBytes: (filePath: string): Promise<LibraryResult<{ bytes: Uint8Array }>> =>
    ipcRenderer.invoke('library:read-bytes', filePath),
  libraryStat: (filePath: string): Promise<LibraryResult<{ file: LibraryFileInfo }>> =>
    ipcRenderer.invoke('library:stat', filePath),
  libraryRecents: (): Promise<{ roots: string[]; files: string[] }> =>
    ipcRenderer.invoke('library:recents'),
  libraryClearRecents: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('library:clear-recents'),
  libraryReveal: (itemPath: string): Promise<LibraryResult<object>> =>
    ipcRenderer.invoke('library:reveal', itemPath),
  libraryOpenWindow: (target?: LaunchTarget): Promise<LibraryResult<object>> =>
    ipcRenderer.invoke('library:open-window', target),
  libraryOpenWorkspace: (): Promise<LibraryResult<object>> =>
    ipcRenderer.invoke('library:open-workspace'),
  /** Copy a document being read into the workspace. The original is untouched. */
  libraryImportToWorkspace: (filePath: string): Promise<LibraryResult<{ page: unknown }>> =>
    ipcRenderer.invoke('library:import-to-workspace', filePath),
  /** The workbench's page tree changed underneath it (e.g. a reader import). */
  onWorkspaceTreeChanged: (callback: () => void): (() => void) => {
    const handler = () => callback()
    ipcRenderer.on('workspace:tree-changed', handler)
    return () => ipcRenderer.removeListener('workspace:tree-changed', handler)
  },
  /** What this window was launched with; null on a plain launch. */
  libraryLaunchTarget: (): Promise<LaunchTarget | null> =>
    ipcRenderer.invoke('library:launch-target'),
  /** The watched folder changed on disk; the payload is the changed paths. */
  onLibraryChanged: (callback: (paths: string[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, paths: string[]) => callback(paths)
    ipcRenderer.on('library:changed', handler)
    return () => ipcRenderer.removeListener('library:changed', handler)
  },
  /** The OS handed an already-open reader window another document. */
  onLibraryOpenTarget: (callback: (target: LaunchTarget) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, target: LaunchTarget) => callback(target)
    ipcRenderer.on('library:open-target', handler)
    return () => ipcRenderer.removeListener('library:open-target', handler)
  },

  onFlushBeforeQuit: (callback: () => void): (() => void) => {
    const handler = () => callback()
    ipcRenderer.on('app:flush-before-quit', handler)
    return () => ipcRenderer.removeListener('app:flush-before-quit', handler)
  },
  notifyFlushComplete: (): void => {
    ipcRenderer.send('workspace:flush-complete')
  },

  // Annotations
  loadAnnotations: (filePath: string): Promise<Annotation[]> =>
    ipcRenderer.invoke('annotations:load', filePath),
  saveAnnotations: (filePath: string, annotations: Annotation[]): Promise<void> =>
    ipcRenderer.invoke('annotations:save', filePath, annotations),

  // Theme
  getSystemTheme: (): Promise<'light' | 'dark'> =>
    ipcRenderer.invoke('theme:get-system'),
  onThemeChanged: (callback: (theme: 'light' | 'dark') => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, theme: 'light' | 'dark') => callback(theme)
    ipcRenderer.on('theme:changed', handler)
    return () => ipcRenderer.removeListener('theme:changed', handler)
  },

  // Window controls
  minimizeWindow: (): void => { ipcRenderer.send('window:minimize') },
  maximizeWindow: (): void => { ipcRenderer.send('window:maximize') },
  closeWindow: (): void => { ipcRenderer.send('window:close') },
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
  onMaximizeChange: (callback: (isMaximized: boolean) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, isMaximized: boolean) => callback(isMaximized)
    ipcRenderer.on('window:maximize-change', handler)
    return () => ipcRenderer.removeListener('window:maximize-change', handler)
  },

  // Shell
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:open-external', url),

  // Data storage location
  dataLocationGet: (): Promise<{ currentDir: string; defaultDir: string; isCustom: boolean }> =>
    ipcRenderer.invoke('data-location:get'),
  dataLocationChoose: (): Promise<string | null> => ipcRenderer.invoke('data-location:choose'),
  dataLocationApply: (dir: string | null, migrate: boolean): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('data-location:apply', dir, migrate),
  dataLocationReveal: (): Promise<void> => ipcRenderer.invoke('data-location:reveal'),
  dataLocationRelaunch: (): Promise<void> => ipcRenderer.invoke('data-location:relaunch'),

  // Export
  exportHtml: (html: string, title: string): Promise<{ cancelled: boolean; filePath?: string }> =>
    ipcRenderer.invoke('export:html', html, title),
  exportPdf: (html: string, title: string): Promise<{ cancelled: boolean; filePath?: string }> =>
    ipcRenderer.invoke('export:pdf', html, title),
  exportDocx: (buffer: ArrayBuffer, title: string): Promise<{ cancelled: boolean; filePath?: string }> =>
    ipcRenderer.invoke('export:docx', buffer, title),
  printDocument: (html: string): Promise<void> =>
    ipcRenderer.invoke('export:print', html),

  // Knowledge Base
  kbAdd: (filePath: string, title?: string, tags?: string[]): Promise<{ ok: boolean; entry?: unknown; error?: string }> =>
    ipcRenderer.invoke('kb:add', filePath, title, tags),
  kbAddPage: (pageId: string, tags?: string[]): Promise<{ ok: boolean; entry?: unknown; error?: string }> =>
    ipcRenderer.invoke('kb:add-page', pageId, tags),
  kbRemove: (id: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('kb:remove', id),
  kbList: (): Promise<{ ok: boolean; entries?: unknown[]; error?: string }> =>
    ipcRenderer.invoke('kb:list'),
  kbSearch: (query: string): Promise<{ ok: boolean; entries?: unknown[]; error?: string }> =>
    ipcRenderer.invoke('kb:search', query),
  kbGetContext: (query: string, maxDocs?: number): Promise<{ ok: boolean; context?: string; error?: string }> =>
    ipcRenderer.invoke('kb:get-context', query, maxDocs),

  // Knowledge index — search, the link graph and index maintenance over the
  // live workspace. Unlike the `kb*` channels above (a curated snapshot list),
  // everything here reads the notes as they are right now.
  knowledgeSearch: (
    query: string,
    options?: { limit?: number; contextPageId?: string; excludePageIds?: string[] },
  ): Promise<{ ok: boolean; hits?: KnowledgeHit[]; error?: string }> =>
    ipcRenderer.invoke('knowledge:search', query, options),
  knowledgeNoteContext: (pageId: string): Promise<{
    ok: boolean
    backlinks?: KnowledgeLink[]
    outgoing?: KnowledgeOutgoingLink[]
    related?: KnowledgeRelatedNote[]
    tags?: string[]
    error?: string
  }> => ipcRenderer.invoke('knowledge:note-context', pageId),
  knowledgeBacklinks: (pageId: string): Promise<{ ok: boolean; links?: KnowledgeLink[]; error?: string }> =>
    ipcRenderer.invoke('knowledge:backlinks', pageId),
  knowledgeOutgoing: (pageId: string): Promise<{ ok: boolean; links?: KnowledgeOutgoingLink[]; error?: string }> =>
    ipcRenderer.invoke('knowledge:outgoing', pageId),
  knowledgeRelated: (pageId: string, limit?: number): Promise<{ ok: boolean; notes?: KnowledgeRelatedNote[]; error?: string }> =>
    ipcRenderer.invoke('knowledge:related', pageId, limit),
  knowledgeUnresolved: (limit?: number): Promise<{ ok: boolean; links?: KnowledgeUnresolvedLink[]; error?: string }> =>
    ipcRenderer.invoke('knowledge:unresolved', limit),
  knowledgeOrphans: (limit?: number): Promise<{ ok: boolean; notes?: KnowledgeNoteRef[]; error?: string }> =>
    ipcRenderer.invoke('knowledge:orphans', limit),
  knowledgeTags: (limit?: number): Promise<{ ok: boolean; tags?: { tag: string; notes: number }[]; error?: string }> =>
    ipcRenderer.invoke('knowledge:tags', limit),
  knowledgeNotesByTag: (tag: string, limit?: number): Promise<{ ok: boolean; notes?: KnowledgeNoteRef[]; error?: string }> =>
    ipcRenderer.invoke('knowledge:notes-by-tag', tag, limit),
  knowledgeStats: (): Promise<{ ok: boolean; stats?: KnowledgeStats; error?: string }> =>
    ipcRenderer.invoke('knowledge:stats'),
  knowledgeRetrieve: (
    query: string,
    options?: { maxPassages?: number; contextPageId?: string },
  ): Promise<{ ok: boolean; context?: string; citations?: KnowledgeCitation[]; error?: string }> =>
    ipcRenderer.invoke('knowledge:retrieve', query, options),
  knowledgeIndexPage: (pageId: string): Promise<{ ok: boolean; changed?: boolean; error?: string }> =>
    ipcRenderer.invoke('knowledge:index-page', pageId),
  knowledgeReindex: (force?: boolean): Promise<{
    ok: boolean
    report?: { indexed: number; skipped: number; removed: number }
    error?: string
  }> => ipcRenderer.invoke('knowledge:reindex', force),
  // Storage — which store holds the notes, and moving them into a vault.
  storageStatus: (): Promise<{ ok: boolean; status?: StorageStatus; error?: string }> =>
    ipcRenderer.invoke('storage:status'),
  storageMigrateToVault: (folderName?: string): Promise<{
    ok: boolean
    canceled?: boolean
    result?: MigrateOutcome
    error?: string
  }> => ipcRenderer.invoke('storage:migrate-to-vault', folderName),
  storageRevealVault: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('storage:reveal-vault'),
  onStorageMigrationProgress: (
    callback: (update: { step: string; done: number; total: number }) => void,
  ): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, update: { step: string; done: number; total: number }) =>
      callback(update)
    ipcRenderer.on('storage:migration-progress', handler)
    return () => ipcRenderer.removeListener('storage:migration-progress', handler)
  },
  /**
   * Fires when the vault changed on disk — someone edited a note in another
   * editor, or a sync client dropped one in.
   */
  onVaultChanged: (callback: (changes: VaultChange[]) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, changes: VaultChange[]) => callback(changes)
    ipcRenderer.on('vault:changed', handler)
    return () => ipcRenderer.removeListener('vault:changed', handler)
  },
  onStorageChanged: (callback: (next: StorageStatus) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, next: StorageStatus) => callback(next)
    ipcRenderer.on('storage:changed', handler)
    return () => ipcRenderer.removeListener('storage:changed', handler)
  },

  /** Fires whenever the note index changes, so panels refresh without polling. */
  onKnowledgeUpdated: (callback: () => void): (() => void) => {
    const handler = () => callback()
    ipcRenderer.on('knowledge:updated', handler)
    return () => ipcRenderer.removeListener('knowledge:updated', handler)
  },

  // Settings
  loadSettings: (): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('settings:load'),
  saveSettings: (settings: Record<string, unknown>): Promise<void> =>
    ipcRenderer.invoke('settings:save', settings),

  // Agent / AI
  sendAgentMessage: (request: {
    messages: Array<{ role: string; content: string }>
    documentContext?: string
    memoryContext?: string
    graphContext?: string
  }): Promise<{ provider: string; model: string }> =>
    ipcRenderer.invoke('agent:send-message', request),
  onAgentStream: (callback: (chunk: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, chunk: string) => callback(chunk)
    ipcRenderer.on('agent:stream-chunk', handler)
    return () => ipcRenderer.removeListener('agent:stream-chunk', handler)
  },
  onAgentStreamError: (callback: (error: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, error: string) => callback(error)
    ipcRenderer.on('agent:stream-error', handler)
    return () => ipcRenderer.removeListener('agent:stream-error', handler)
  },
  onAgentMcpWarning: (callback: (message: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, message: string) => callback(message)
    ipcRenderer.on('agent:mcp-warning', handler)
    return () => ipcRenderer.removeListener('agent:mcp-warning', handler)
  },
  onAgentTrace: (callback: (entry: {
    id: string
    timestamp: number
    type: 'request' | 'system-prompt' | 'messages' | 'tools' | 'response' | 'tool-call' | 'error'
    label: string
    data: unknown
    durationMs?: number
  }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, entry: Parameters<typeof callback>[0]) => callback(entry)
    ipcRenderer.on('agent:trace', handler)
    return () => ipcRenderer.removeListener('agent:trace', handler)
  },
  stopAgentGeneration: (): void => { ipcRenderer.send('agent:stop') },
  testAgentConnection: (provider: string, apiKey: string, baseUrl?: string, model?: string): Promise<boolean> =>
    ipcRenderer.invoke('agent:test-connection', provider, apiKey, baseUrl, model),

  /**
   * Fire-and-wait AI call. Used by selection AI actions, doc TL;DRs,
   * quiz generation — anything that wants a single synchronous reply
   * instead of a streamed chat.
   */
  sendAgentOneShot: (request: {
    prompt: string
    systemPrompt?: string
    jsonSchema?: Record<string, unknown>
  }): Promise<
    | { ok: true; result: { provider: string; model: string; reply: string; json?: unknown } }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('agent:one-shot', request),

  /**
   * Run an autonomous agent task (plan → execute → review → evaluate loop).
   * Used by Horse Mode for iterative document generation with quality evaluation.
   */
  sendAgentTask: (request: {
    task: string
    systemPrompt?: string
    qualityThreshold?: number
    maxIterations?: number
  }): Promise<
    | { ok: true; result: { provider: string; model: string; result: string; iterations: number; qualityScore: number; thresholdMet: boolean } }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('agent:run-task', request),
  onAgentTaskProgress: (callback: (progress: {
    iteration: number
    phase: 'plan' | 'execute' | 'review' | 'evaluate'
    qualityScore?: number
  }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: Parameters<typeof callback>[0]) => callback(progress)
    ipcRenderer.on('agent:task-progress', handler)
    return () => ipcRenderer.removeListener('agent:task-progress', handler)
  },

  // Sessions
  sessionGetDir: (): Promise<string> =>
    ipcRenderer.invoke('session:get-dir'),
  sessionCreate: (): Promise<string> =>
    ipcRenderer.invoke('session:create'),
  sessionRestore: (sessionId: string): Promise<{
    id: string
    messages: Array<{ role: string; content: string }>
  } | null> => ipcRenderer.invoke('session:restore', sessionId),
  sessionList: (limit?: number): Promise<Array<{
    id: string
    updatedAt: number
    turns: number
    state: string
    preview: string
    source: 'chat' | 'horse-mode'
  }>> => ipcRenderer.invoke('session:list', limit),
  sessionDelete: (sessionId: string): Promise<boolean> =>
    ipcRenderer.invoke('session:delete', sessionId),
  sessionSaveHistory: (
    sessionId: string,
    messages: Array<{ role: string; content: string }>,
    metadata?: { source?: 'chat' | 'horse-mode' },
  ): Promise<void> => ipcRenderer.invoke('session:save-history', sessionId, messages, metadata),
  sessionGetHistory: (sessionId: string): Promise<Array<{
    role: string
    content: string
  }> | null> => ipcRenderer.invoke('session:get-history', sessionId),

  // Memory
  memorySave: (filePath: string, summary: string, topics: string[]): Promise<void> =>
    ipcRenderer.invoke('memory:save', filePath, summary, topics),
  memoryGetContext: (filePath?: string, query?: string): Promise<string> =>
    ipcRenderer.invoke('memory:get-context', filePath, query),
  memoryExtractSummary: (messages: Array<{ role: string; content: string }>): Promise<{ summary: string; topics: string[] }> =>
    ipcRenderer.invoke('memory:extract-summary', messages),
  memoryClear: (): Promise<void> =>
    ipcRenderer.invoke('memory:clear'),

  // Per-document TL;DR cache (used by DocSummary component)
  docSummaryGet: (
    filePath: string,
  ): Promise<null | { tldr: string; questions: string[]; generatedAt: number; signature: string }> =>
    ipcRenderer.invoke('doc-summary:get', filePath),
  docSummarySet: (
    filePath: string,
    summary: { tldr: string; questions: string[]; generatedAt: number; signature: string },
  ): Promise<void> => ipcRenderer.invoke('doc-summary:set', filePath, summary),
  docSummaryClear: (): Promise<void> => ipcRenderer.invoke('doc-summary:clear'),

  // Page version history (Archive)
  versionSave: (
    pageId: string,
    content: string,
    opts?: { title?: string | null; source?: string; label?: string | null },
  ): Promise<{ id: string; pageId: string; title: string | null; source: string; label: string | null; createdAt: number; length: number }> =>
    ipcRenderer.invoke('version:save', pageId, content, opts),
  versionList: (
    pageId: string,
  ): Promise<Array<{ id: string; pageId: string; title: string | null; source: string; label: string | null; createdAt: number; length: number }>> =>
    ipcRenderer.invoke('version:list', pageId),
  versionGet: (
    versionId: string,
  ): Promise<null | { id: string; pageId: string; title: string | null; source: string; label: string | null; createdAt: number; length: number; content: string }> =>
    ipcRenderer.invoke('version:get', versionId),
  versionDelete: (versionId: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('version:delete', versionId),

  // Book-skin metadata
  pageMetaGet: (pageId: string): Promise<{ status: string | null; genre: string | null; quality: number | null } | null> =>
    ipcRenderer.invoke('page-meta:get', pageId),
  pageMetaSet: (
    pageId: string,
    partial: { status?: string | null; genre?: string | null; quality?: number | null },
  ): Promise<{ status: string | null; genre: string | null; quality: number | null }> =>
    ipcRenderer.invoke('page-meta:set', pageId, partial),
  pageMetaList: (): Promise<Array<{ pageId: string; status: string | null; genre: string | null; quality: number | null; length: number; updatedAt: number }>> =>
    ipcRenderer.invoke('page-meta:list'),

  // Muse Wall
  museList: (): Promise<Array<{ id: string; kind: string; text: string; pageId: string | null; createdAt: number }>> =>
    ipcRenderer.invoke('muse:list'),
  museAdd: (kind: string, text: string, pageId?: string | null): Promise<{ id: string; kind: string; text: string; pageId: string | null; createdAt: number }> =>
    ipcRenderer.invoke('muse:add', kind, text, pageId),
  museDelete: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('muse:delete', id),

  // InsightGraph (optional knowledge-graph RAG)
  insightGraphTestNeo4j: (uri: string, user: string, password: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('insightgraph:test-neo4j', uri, user, password),
  insightGraphIngest: (
    filePath: string,
  ): Promise<{ ok: true; result: Record<string, unknown> } | { ok: false; error: string }> =>
    ipcRenderer.invoke('insightgraph:ingest', filePath),
  insightGraphQuery: (
    question: string,
    sessionId?: string,
  ): Promise<{ ok: true; result: Record<string, unknown> } | { ok: false; error: string }> =>
    ipcRenderer.invoke('insightgraph:query', question, sessionId),
  insightGraphListReports: (): Promise<
    { ok: true; reports: Record<string, unknown>[] } | { ok: false; error: string }
  > => ipcRenderer.invoke('insightgraph:list-reports'),
  insightGraphCreateSession: (): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> =>
    ipcRenderer.invoke('insightgraph:create-session'),
  onInsightGraphProgress: (callback: (event: { stage: string; reportId?: string; [k: string]: unknown }) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, ev: { stage: string; reportId?: string }) => callback(ev)
    ipcRenderer.on('insightgraph:progress', handler)
    return () => ipcRenderer.removeListener('insightgraph:progress', handler)
  },

  // Read-only graph queries. All share the same `{ ok, data | error }`
  // envelope as the handlers above.
  insightGraphGetReport: (
    reportId: string,
  ): Promise<{ ok: true; data: Record<string, unknown> | null } | { ok: false; error: string }> =>
    ipcRenderer.invoke('insightgraph:get-report', reportId),
  insightGraphFindEntities: (
    query?: { name?: string; type?: string; limit?: number },
  ): Promise<{ ok: true; data: Record<string, unknown>[] } | { ok: false; error: string }> =>
    ipcRenderer.invoke('insightgraph:find-entities', query ?? {}),
  insightGraphGetEntity: (
    entityId: string,
  ): Promise<{ ok: true; data: Record<string, unknown> | null } | { ok: false; error: string }> =>
    ipcRenderer.invoke('insightgraph:get-entity', entityId),
  insightGraphGetEntityProfile: (
    name: string,
  ): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> =>
    ipcRenderer.invoke('insightgraph:get-entity-profile', name),
  insightGraphGetClaimsAbout: (
    name: string,
  ): Promise<{ ok: true; data: Record<string, unknown>[] } | { ok: false; error: string }> =>
    ipcRenderer.invoke('insightgraph:get-claims-about', name),
  insightGraphGetEntityMetrics: (
    name: string,
  ): Promise<{ ok: true; data: Record<string, unknown>[] } | { ok: false; error: string }> =>
    ipcRenderer.invoke('insightgraph:get-entity-metrics', name),
  insightGraphGetMetricHistory: (
    metric: string,
    entity?: string,
  ): Promise<{ ok: true; data: Record<string, unknown>[] } | { ok: false; error: string }> =>
    ipcRenderer.invoke('insightgraph:get-metric-history', metric, entity),
  insightGraphFindEvidenceForClaim: (
    claimId: string,
  ): Promise<{ ok: true; data: Record<string, unknown>[] } | { ok: false; error: string }> =>
    ipcRenderer.invoke('insightgraph:find-evidence-for-claim', claimId),
  insightGraphGetSubgraph: (
    nodeId: string,
    depth?: number,
  ): Promise<{ ok: true; data: { nodes: unknown[]; edges: unknown[] } } | { ok: false; error: string }> =>
    ipcRenderer.invoke('insightgraph:get-subgraph', nodeId, depth),
  insightGraphGetEntityRelationships: (
    name: string,
  ): Promise<{ ok: true; data: Record<string, unknown>[] } | { ok: false; error: string }> =>
    ipcRenderer.invoke('insightgraph:get-entity-relationships', name),
  insightGraphFindPath: (
    entityA: string,
    entityB: string,
    maxDepth?: number,
  ): Promise<
    | { ok: true; data: { nodes: unknown[]; edges: unknown[]; found: boolean } }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('insightgraph:find-path', entityA, entityB, maxDepth),
  insightGraphCompareEntityAcrossReports: (
    name: string,
  ): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> =>
    ipcRenderer.invoke('insightgraph:compare-entity-across-reports', name),
  insightGraphFindMetricTrend: (
    entity: string,
    metric: string,
  ): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> =>
    ipcRenderer.invoke('insightgraph:find-metric-trend', entity, metric),
  insightGraphFindContradictions: (
    name: string,
  ): Promise<{ ok: true; data: Record<string, unknown>[] } | { ok: false; error: string }> =>
    ipcRenderer.invoke('insightgraph:find-contradictions', name),
  insightGraphEntityTimeline: (
    name: string,
  ): Promise<{ ok: true; data: Record<string, unknown>[] } | { ok: false; error: string }> =>
    ipcRenderer.invoke('insightgraph:entity-timeline', name),

  // Composite graph shapes for GraphView.
  insightGraphGlobalGraph: (
    maxEntities?: number,
  ): Promise<
    | {
        ok: true
        data: {
          nodes: Array<{ id: string; name: string; type?: string } & Record<string, unknown>>
          edges: Array<{ id: string; source: string; target: string; type?: string } & Record<string, unknown>>
        }
      }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('insightgraph:global-graph', maxEntities),
  insightGraphEntityEgoGraph: (
    entityName: string,
    depth?: number,
  ): Promise<
    | {
        ok: true
        data: {
          nodes: Array<{ id: string; name: string; type?: string } & Record<string, unknown>>
          edges: Array<{ id: string; source: string; target: string; type?: string } & Record<string, unknown>>
        }
      }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('insightgraph:entity-ego-graph', entityName, depth),
  insightGraphBuildSubgraphFromEntities: (
    names: string[],
    opts?: { maxEntities?: number },
  ): Promise<
    | {
        ok: true
        data: {
          nodes: Array<{ id: string; name: string; type?: string } & Record<string, unknown>>
          edges: Array<{ id: string; source: string; target: string; type?: string } & Record<string, unknown>>
        }
      }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('insightgraph:build-subgraph-from-entities', names, opts),
  insightGraphEntitiesForReport: (
    reportId: string,
  ): Promise<{ ok: true; data: string[] } | { ok: false; error: string }> =>
    ipcRenderer.invoke('insightgraph:entities-for-report', reportId),
  insightGraphRelatedReports: (
    reportId: string,
    limit?: number,
  ): Promise<
    | {
        ok: true
        data: Array<{
          reportId: string
          title?: string
          date?: string
          sourcePath?: string
          sharedEntities: string[]
          sharedEntityCount: number
        }>
      }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('insightgraph:related-reports', reportId, limit),

  // External plugin loading (reads <userData>/plugins/<id>/).
  // Auto-update. `onUpdaterEvent` subscribes to every event emitted by
  // the main-process `autoUpdater` (checking / available / downloaded / …).
  updaterCurrentVersion: (): Promise<string> =>
    ipcRenderer.invoke('updater:current-version'),
  updaterLastError: (): Promise<string | null> =>
    ipcRenderer.invoke('updater:last-error'),
  updaterCheckNow: (): Promise<void> => ipcRenderer.invoke('updater:check-now'),
  updaterQuitAndInstall: (): void => {
    ipcRenderer.send('updater:quit-and-install')
  },
  onUpdaterEvent: (
    callback: (ev: {
      kind: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
      version?: string
      releaseNotes?: string
      releaseName?: string
      releaseDate?: string
      error?: string
    }) => void,
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      ev: Parameters<typeof callback>[0],
    ) => callback(ev)
    ipcRenderer.on('updater:event', handler)
    return () => ipcRenderer.removeListener('updater:event', handler)
  },

  // MCP (Model Context Protocol) — tool servers the AI assistant can
  // call. Configured in settings.mcp.servers.
  mcpStatusAll: (): Promise<
    | { ok: true; servers: Array<{ id: string; running: boolean; error?: string; toolCount: number }> }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('mcp:status-all'),
  mcpListTools: (
    serverId: string,
  ): Promise<
    | {
        ok: true
        tools: Array<{ name: string; description?: string; inputSchema: Record<string, unknown> }>
      }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('mcp:list-tools', serverId),
  mcpCallTool: (
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> =>
    ipcRenderer.invoke('mcp:call-tool', serverId, toolName, args),
  mcpRestart: (): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('mcp:restart'),
  mcpStop: (serverId: string): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('mcp:stop', serverId),

  pluginsDiscover: (): Promise<
    | { ok: true; plugins: Array<{
          manifest: { id: string; name: string; version: string; description?: string; main?: string }
          source: string
          dir: string
        }>
        errors: Array<{ dir: string; error: string }>
      }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('plugins:discover'),
  pluginsGetDir: (): Promise<string> => ipcRenderer.invoke('plugins:get-dir'),
  pluginsOpenDir: (): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('plugins:open-dir'),

  // Workspace (Notion-like page management)
  workspaceCreatePage: (title?: string, parentId?: string, content?: string): Promise<{ ok: boolean; page?: any; error?: string }> =>
    ipcRenderer.invoke('workspace:create-page', title, parentId, content),
  workspaceCreateFolder: (title?: string, parentId?: string): Promise<{ ok: boolean; page?: any; error?: string }> =>
    ipcRenderer.invoke('workspace:create-folder', title, parentId),
  workspaceGetPage: (pageId: string): Promise<any> =>
    ipcRenderer.invoke('workspace:get-page', pageId),
  workspaceUpdatePage: (
    pageId: string,
    updates: Record<string, any>,
  ): Promise<{
    ok: boolean
    /**
     * Notes whose text was rewritten to follow a title change. Their content
     * on disk no longer matches whatever an open tab is holding.
     */
    relinkedPageIds?: string[]
    error?: string
  }> => ipcRenderer.invoke('workspace:update-page', pageId, updates),
  workspaceDeletePage: (pageId: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('workspace:delete-page', pageId),
  workspaceRestorePage: (pageId: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('workspace:restore-page', pageId),
  workspaceGetChildren: (parentId: string | null): Promise<any[]> =>
    ipcRenderer.invoke('workspace:get-children', parentId),
  workspaceGetTree: (): Promise<any[]> =>
    ipcRenderer.invoke('workspace:get-tree'),
  workspaceMovePage: (pageId: string, newParentId: string | null, position: number): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('workspace:move-page', pageId, newParentId, position),
  workspaceGetAncestors: (pageId: string): Promise<any[]> =>
    ipcRenderer.invoke('workspace:get-ancestors', pageId),
  workspaceSearch: (query: string): Promise<any[]> =>
    ipcRenderer.invoke('workspace:search', query),
  workspaceGetPageCount: (): Promise<number> =>
    ipcRenderer.invoke('workspace:get-page-count'),
  workspaceImportFile: (parentId?: string): Promise<{ ok: boolean; pages?: any[]; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke('workspace:import-file', parentId),
  workspaceImportFolder: (parentId?: string): Promise<{ ok: boolean; count?: number; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke('workspace:import-folder', parentId),
  workspaceImportDroppedFile: (fileName: string, data: Uint8Array, parentId?: string): Promise<{ ok: boolean; page?: any; error?: string }> =>
    ipcRenderer.invoke('workspace:import-dropped-file', fileName, data, parentId),
  workspaceExportPage: (pageId: string): Promise<{ ok: boolean; filePath?: string; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke('workspace:export-page', pageId),
  /** Raw bytes of an asset-backed page (PDF/XLSX); null for text pages. */
  workspaceGetPageBytes: (pageId: string): Promise<Uint8Array | null> =>
    ipcRenderer.invoke('workspace:get-page-bytes', pageId),
  workspaceGetPageAsset: (pageId: string): Promise<any | null> =>
    ipcRenderer.invoke('workspace:get-page-asset', pageId),

  // Platform info
  platform: process.platform,
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
