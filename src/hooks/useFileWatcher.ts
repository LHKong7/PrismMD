import { useEffect } from 'react'
import { useFileStore } from '../store/fileStore'

export function useFileWatcher() {
  const currentFilePath = useFileStore((s) => s.currentFilePath)
  const setContent = useFileStore((s) => s.setContent)
  const refreshFileTree = useFileStore((s) => s.refreshFileTree)

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

  // Watch for directory changes
  useEffect(() => {
    const cleanup = window.electronAPI.onDirectoryChanged(() => {
      refreshFileTree()
    })
    return cleanup
  }, [refreshFileTree])
}
