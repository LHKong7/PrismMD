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
  openFileDialog: () => Promise<{ path: string; content: string } | null>
  openFolderDialog: () => Promise<string | null>
  readFile: (filePath: string) => Promise<string>
  readDirectory: (dirPath: string) => Promise<FileTreeNode[]>

  // File watching
  watchFile: (filePath: string) => void
  unwatchFile: (filePath: string) => void
  watchDirectory: (dirPath: string) => void
  unwatchDirectory: (dirPath: string) => void
  onFileChanged: (callback: (filePath: string, content: string) => void) => () => void
  onDirectoryChanged: (callback: () => void) => () => void

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
  }) => Promise<{ provider: string; model: string }>
  onAgentStream: (callback: (chunk: string) => void) => () => void
  stopAgentGeneration: () => void
  testAgentConnection: (provider: string, apiKey: string) => Promise<boolean>

  // Platform
  platform: string
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
