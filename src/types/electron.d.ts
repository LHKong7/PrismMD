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
  stopAgentGeneration: () => void
  testAgentConnection: (provider: string, apiKey: string, baseUrl?: string) => Promise<boolean>

  // Memory
  memorySave: (filePath: string, summary: string, topics: string[]) => Promise<void>
  memoryGetContext: (filePath?: string, query?: string) => Promise<string>
  memoryExtractSummary: (messages: Array<{ role: string; content: string }>) => Promise<{ summary: string; topics: string[] }>
  memoryClear: () => Promise<void>

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
