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
}

export interface PageTreeNode {
  id: string
  title: string
  icon: string | null
  format: string
  parentId: string | null
  position: number
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

export interface ElectronAPI {
  // File operations
  openFileDialog: () => Promise<{ path: string } | null>
  openFolderDialog: () => Promise<string | null>
  readFile: (filePath: string) => Promise<string>
  readFileBytes: (filePath: string) => Promise<ArrayBuffer>
  readDirectory: (dirPath: string) => Promise<FileTreeNode[]>
  readDirectoryChildren: (dirPath: string) => Promise<FileTreeNode[]>
  writeFile: (filePath: string, content: string) => Promise<void>
  newFileDialog: (defaultDir?: string) => Promise<{ cancelled: boolean; filePath?: string }>
  createDirectory: (dirPath: string) => Promise<void>
  rename: (oldPath: string, newPath: string) => Promise<void>
  trash: (itemPath: string) => Promise<void>
  duplicateFile: (srcPath: string, destPath: string) => Promise<void>
  showInFolder: (itemPath: string) => Promise<void>
  exists: (itemPath: string) => Promise<boolean>

  // File watching
  watchFile: (filePath: string) => void
  unwatchFile: (filePath: string) => void
  watchDirectory: (dirPath: string) => void
  unwatchDirectory: (dirPath: string) => void
  onFileChanged: (callback: (filePath: string) => void) => () => void
  onDirectoryChanged: (callback: (dirPath: string) => void) => () => void

  // Annotations
  loadAnnotations: (filePath: string) => Promise<Annotation[]>
  saveAnnotations: (filePath: string, annotations: Annotation[]) => Promise<void>

  // Theme
  getSystemTheme: () => Promise<'light' | 'dark'>
  onThemeChanged: (callback: (theme: 'light' | 'dark') => void) => () => void

  // Window controls
  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void
  isMaximized: () => Promise<boolean>
  onMaximizeChange: (callback: (isMaximized: boolean) => void) => () => void

  // Shell
  openExternal: (url: string) => Promise<void>

  // Export
  exportHtml: (html: string, title: string) => Promise<{ cancelled: boolean; filePath?: string }>
  exportPdf: (html: string, title: string) => Promise<{ cancelled: boolean; filePath?: string }>
  exportDocx: (buffer: ArrayBuffer, title: string) => Promise<{ cancelled: boolean; filePath?: string }>
  printDocument: (html: string) => Promise<void>

  // Knowledge Base
  kbAdd: (filePath: string, title?: string, tags?: string[]) => Promise<{ ok: boolean; entry?: KBEntry; error?: string }>
  kbAddPage: (pageId: string, tags?: string[]) => Promise<{ ok: boolean; entry?: KBEntry; error?: string }>
  kbRemove: (id: string) => Promise<{ ok: boolean; error?: string }>
  kbList: () => Promise<{ ok: boolean; entries?: KBEntry[]; error?: string }>
  kbSearch: (query: string) => Promise<{ ok: boolean; entries?: KBEntry[]; error?: string }>
  kbGetContext: (query: string, maxDocs?: number) => Promise<{ ok: boolean; context?: string; error?: string }>

  // Settings
  loadSettings: () => Promise<Record<string, unknown>>
  saveSettings: (settings: Record<string, unknown>) => Promise<void>

  // Agent / AI
  sendAgentMessage: (request: {
    messages: Array<{ role: string; content: string }>
    documentContext?: string
    memoryContext?: string
  }) => Promise<{ provider: string; model: string }>
  onAgentStream: (callback: (chunk: string) => void) => () => void
  onAgentStreamError: (callback: (error: string) => void) => () => void
  onAgentMcpWarning: (callback: (message: string) => void) => () => void
  onAgentTrace: (callback: (entry: {
    id: string
    timestamp: number
    type: 'request' | 'system-prompt' | 'messages' | 'tools' | 'response' | 'tool-call' | 'error'
    label: string
    data: unknown
    durationMs?: number
  }) => void) => () => void
  stopAgentGeneration: () => void
  testAgentConnection: (provider: string, apiKey: string, baseUrl?: string, model?: string) => Promise<boolean>

  sendAgentOneShot: (request: {
    prompt: string
    systemPrompt?: string
    jsonSchema?: Record<string, unknown>
  }) => Promise<
    | { ok: true; result: { provider: string; model: string; reply: string; json?: unknown } }
    | { ok: false; error: string }
  >

  // Autonomous task (Horse Mode)
  sendAgentTask: (request: {
    task: string
    systemPrompt?: string
    qualityThreshold?: number
    maxIterations?: number
  }) => Promise<
    | { ok: true; result: { provider: string; model: string; result: string; iterations: number; qualityScore: number; thresholdMet: boolean } }
    | { ok: false; error: string }
  >
  onAgentTaskProgress: (callback: (progress: {
    iteration: number
    phase: 'plan' | 'execute' | 'review' | 'evaluate'
    qualityScore?: number
  }) => void) => () => void

  // Sessions
  sessionGetDir: () => Promise<string>
  sessionCreate: () => Promise<string>
  sessionRestore: (sessionId: string) => Promise<{
    id: string
    messages: Array<{ role: string; content: string }>
  } | null>
  sessionList: (limit?: number) => Promise<Array<{
    id: string
    updatedAt: number
    turns: number
    state: string
    preview: string
    source: 'chat' | 'horse-mode'
  }>>
  sessionDelete: (sessionId: string) => Promise<boolean>
  sessionSaveHistory: (
    sessionId: string,
    messages: Array<{ role: string; content: string }>,
    metadata?: { source?: 'chat' | 'horse-mode' },
  ) => Promise<void>
  sessionGetHistory: (sessionId: string) => Promise<Array<{
    role: string
    content: string
  }> | null>

  // Per-page TL;DR cache
  docSummaryGet: (pageId: string) => Promise<null | { tldr: string; questions: string[]; generatedAt: number; signature: string }>
  docSummarySet: (pageId: string, summary: { tldr: string; questions: string[]; generatedAt: number; signature: string }) => Promise<void>
  docSummaryClear: () => Promise<void>

  // Memory
  memorySave: (filePath: string, summary: string, topics: string[]) => Promise<void>
  memoryGetContext: (filePath?: string, query?: string) => Promise<string>
  memoryExtractSummary: (messages: Array<{ role: string; content: string }>) => Promise<{ summary: string; topics: string[] }>
  memoryClear: () => Promise<void>

  // Workspace
  workspaceCreatePage: (title?: string, parentId?: string, content?: string) => Promise<{ ok: boolean; page?: WorkspacePage; error?: string }>
  workspaceGetPage: (pageId: string) => Promise<WorkspacePage | null>
  workspaceUpdatePage: (pageId: string, updates: Partial<Pick<WorkspacePage, 'title' | 'content' | 'parentId' | 'position' | 'icon' | 'format'>>) => Promise<{ ok: boolean; error?: string }>
  workspaceDeletePage: (pageId: string) => Promise<{ ok: boolean; error?: string }>
  workspaceRestorePage: (pageId: string) => Promise<{ ok: boolean; error?: string }>
  workspaceGetChildren: (parentId: string | null) => Promise<WorkspacePage[]>
  workspaceGetTree: () => Promise<PageTreeNode[]>
  workspaceMovePage: (pageId: string, newParentId: string | null, position: number) => Promise<{ ok: boolean; error?: string }>
  workspaceGetAncestors: (pageId: string) => Promise<Array<{ id: string; title: string; icon: string | null; format: string; updatedAt: number }>>
  workspaceSearch: (query: string) => Promise<Array<{ id: string; title: string; icon: string | null; format: string; updatedAt: number }>>
  workspaceGetPageCount: () => Promise<number>
  workspaceImportFile: (parentId?: string) => Promise<{ ok: boolean; pages?: WorkspacePage[]; canceled?: boolean; error?: string }>
  workspaceImportFolder: (parentId?: string) => Promise<{ ok: boolean; count?: number; canceled?: boolean; error?: string }>
  workspaceExportPage: (pageId: string) => Promise<{ ok: boolean; filePath?: string; canceled?: boolean; error?: string }>

  // Platform
  platform: string

  // Auto-updater
  updaterCurrentVersion: () => Promise<string>
  updaterLastError: () => Promise<string | null>
  updaterCheckNow: () => Promise<void>
  updaterQuitAndInstall: () => void
  onUpdaterEvent: (
    callback: (ev: {
      kind: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
      version?: string
      releaseNotes?: string
      releaseName?: string
      releaseDate?: string
      error?: string
    }) => void,
  ) => () => void

  // MCP
  mcpStatusAll: () => Promise<
    | {
        ok: true
        servers: Array<{ id: string; running: boolean; error?: string; toolCount: number }>
      }
    | { ok: false; error: string }
  >
  mcpListTools: (serverId: string) => Promise<
    | {
        ok: true
        tools: Array<{
          name: string
          description?: string
          inputSchema: Record<string, unknown>
        }>
      }
    | { ok: false; error: string }
  >
  mcpCallTool: (
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<{ ok: true; result: unknown } | { ok: false; error: string }>
  mcpRestart: () => Promise<{ ok: true } | { ok: false; error: string }>
  mcpStop: (serverId: string) => Promise<{ ok: true } | { ok: false; error: string }>

  // Plugins
  pluginsDiscover: () => Promise<
    | {
        ok: true
        plugins: Array<{
          manifest: {
            id: string
            name: string
            version: string
            description?: string
            main?: string
          }
          source: string
          dir: string
        }>
        errors: Array<{ dir: string; error: string }>
      }
    | { ok: false; error: string }
  >
  pluginsGetDir: () => Promise<string>
  pluginsOpenDir: () => Promise<{ ok: true } | { ok: false; error: string }>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
