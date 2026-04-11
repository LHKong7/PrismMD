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
  openFileDialog: () => Promise<{ path: string; content: string } | null>
  openFolderDialog: () => Promise<string | null>
  readFile: (filePath: string) => Promise<string>
  readDirectory: (dirPath: string) => Promise<FileTreeNode[]>
  watchFile: (filePath: string) => void
  unwatchFile: (filePath: string) => void
  watchDirectory: (dirPath: string) => void
  unwatchDirectory: (dirPath: string) => void
  onFileChanged: (callback: (filePath: string, content: string) => void) => () => void
  onDirectoryChanged: (callback: () => void) => () => void
  loadAnnotations: (filePath: string) => Promise<Annotation[]>
  saveAnnotations: (filePath: string, annotations: Annotation[]) => Promise<void>
  getSystemTheme: () => Promise<'light' | 'dark'>
  onThemeChanged: (callback: (theme: 'light' | 'dark') => void) => () => void
  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void
  isMaximized: () => Promise<boolean>
  onMaximizeChange: (callback: (isMaximized: boolean) => void) => () => void
  platform: string
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
