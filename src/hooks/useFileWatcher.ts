import { useEffect } from 'react'
import { useFileStore } from '../store/fileStore'

export function useFileWatcher() {
  const setContent = useFileStore((s) => s.setContent)
  const refreshFolder = useFileStore((s) => s.refreshFolder)

  // Watch for file content changes
  useEffect(() => {
    const cleanup = window.electronAPI.onFileChanged((filePath, content) => {
      const state = useFileStore.getState()
      if (filePath === state.currentFilePath) {
        setContent(content)
      }
    })
    return cleanup
  }, [setContent])

  // Watch for directory changes — refresh only the affected folder
  useEffect(() => {
    const cleanup = window.electronAPI.onDirectoryChanged((dirPath) => {
      refreshFolder(dirPath)
    })
    return cleanup
  }, [refreshFolder])
}
