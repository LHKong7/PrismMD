import { contextBridge, ipcRenderer } from 'electron'

export interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileTreeNode[]
}

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

const electronAPI = {
  // File operations
  openFileDialog: (): Promise<{ path: string } | null> =>
    ipcRenderer.invoke('dialog:open-file'),
  openFolderDialog: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:open-folder'),
  readFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:read-file', filePath),
  readFileBytes: (filePath: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('fs:read-file-bytes', filePath),
  readDirectory: (dirPath: string): Promise<FileTreeNode[]> =>
    ipcRenderer.invoke('fs:read-directory', dirPath),
  readDirectoryChildren: (dirPath: string): Promise<FileTreeNode[]> =>
    ipcRenderer.invoke('fs:read-directory-children', dirPath),
  writeFile: (filePath: string, content: string): Promise<void> =>
    ipcRenderer.invoke('fs:write-file', filePath, content),
  newFileDialog: (defaultDir?: string): Promise<{ cancelled: boolean; filePath?: string }> =>
    ipcRenderer.invoke('dialog:new-file', defaultDir),
  createDirectory: (dirPath: string): Promise<void> =>
    ipcRenderer.invoke('fs:create-directory', dirPath),
  rename: (oldPath: string, newPath: string): Promise<void> =>
    ipcRenderer.invoke('fs:rename', oldPath, newPath),
  trash: (itemPath: string): Promise<void> =>
    ipcRenderer.invoke('fs:trash', itemPath),
  duplicateFile: (srcPath: string, destPath: string): Promise<void> =>
    ipcRenderer.invoke('fs:duplicate-file', srcPath, destPath),
  showInFolder: (itemPath: string): Promise<void> =>
    ipcRenderer.invoke('fs:show-in-folder', itemPath),
  exists: (itemPath: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:exists', itemPath),

  // File watching
  watchFile: (filePath: string): void => { ipcRenderer.send('fs:watch-file', filePath) },
  unwatchFile: (filePath: string): void => { ipcRenderer.send('fs:unwatch-file', filePath) },
  watchDirectory: (dirPath: string): void => { ipcRenderer.send('fs:watch-directory', dirPath) },
  unwatchDirectory: (dirPath: string): void => { ipcRenderer.send('fs:unwatch-directory', dirPath) },
  onFileChanged: (callback: (filePath: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, filePath: string) => callback(filePath)
    ipcRenderer.on('fs:file-changed', handler)
    return () => ipcRenderer.removeListener('fs:file-changed', handler)
  },
  onDirectoryChanged: (callback: (dirPath: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, dirPath: string) => callback(dirPath)
    ipcRenderer.on('fs:directory-changed', handler)
    return () => ipcRenderer.removeListener('fs:directory-changed', handler)
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
  workspaceUpdatePage: (pageId: string, updates: Record<string, any>): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('workspace:update-page', pageId, updates),
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
  workspaceExportPage: (pageId: string): Promise<{ ok: boolean; filePath?: string; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke('workspace:export-page', pageId),

  // Platform info
  platform: process.platform,
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
