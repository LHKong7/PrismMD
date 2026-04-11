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
  openFileDialog: (): Promise<{ path: string; content: string } | null> =>
    ipcRenderer.invoke('dialog:open-file'),

  openFolderDialog: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:open-folder'),

  readFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:read-file', filePath),

  readDirectory: (dirPath: string): Promise<FileTreeNode[]> =>
    ipcRenderer.invoke('fs:read-directory', dirPath),

  // File watching
  watchFile: (filePath: string): void => {
    ipcRenderer.send('fs:watch-file', filePath)
  },

  unwatchFile: (filePath: string): void => {
    ipcRenderer.send('fs:unwatch-file', filePath)
  },

  watchDirectory: (dirPath: string): void => {
    ipcRenderer.send('fs:watch-directory', dirPath)
  },

  unwatchDirectory: (dirPath: string): void => {
    ipcRenderer.send('fs:unwatch-directory', dirPath)
  },

  onFileChanged: (callback: (filePath: string, content: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, filePath: string, content: string) => {
      callback(filePath, content)
    }
    ipcRenderer.on('fs:file-changed', handler)
    return () => ipcRenderer.removeListener('fs:file-changed', handler)
  },

  onDirectoryChanged: (callback: () => void): (() => void) => {
    const handler = () => callback()
    ipcRenderer.on('fs:directory-changed', handler)
    return () => ipcRenderer.removeListener('fs:directory-changed', handler)
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
    const handler = (_event: Electron.IpcRendererEvent, theme: 'light' | 'dark') => {
      callback(theme)
    }
    ipcRenderer.on('theme:changed', handler)
    return () => ipcRenderer.removeListener('theme:changed', handler)
  },

  // Window controls
  minimizeWindow: (): void => {
    ipcRenderer.send('window:minimize')
  },

  maximizeWindow: (): void => {
    ipcRenderer.send('window:maximize')
  },

  closeWindow: (): void => {
    ipcRenderer.send('window:close')
  },

  isMaximized: (): Promise<boolean> =>
    ipcRenderer.invoke('window:is-maximized'),

  onMaximizeChange: (callback: (isMaximized: boolean) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, isMaximized: boolean) => {
      callback(isMaximized)
    }
    ipcRenderer.on('window:maximize-change', handler)
    return () => ipcRenderer.removeListener('window:maximize-change', handler)
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
  }): Promise<{ provider: string; model: string }> =>
    ipcRenderer.invoke('agent:send-message', request),

  onAgentStream: (callback: (chunk: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, chunk: string) => {
      callback(chunk)
    }
    ipcRenderer.on('agent:stream-chunk', handler)
    return () => ipcRenderer.removeListener('agent:stream-chunk', handler)
  },

  stopAgentGeneration: (): void => {
    ipcRenderer.send('agent:stop')
  },

  testAgentConnection: (provider: string, apiKey: string): Promise<boolean> =>
    ipcRenderer.invoke('agent:test-connection', provider, apiKey),

  // Platform info
  platform: process.platform,
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
