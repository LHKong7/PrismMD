import { useEffect } from 'react'
import { useFileStore } from '../store/fileStore'

export function useFileWatcher() {
  const refreshFolder = useFileStore((s) => s.refreshFolder)

  // Watch for file content changes. The main process just signals "this
  // path changed" — we re-read via the store so text vs binary formats
  // both pick up the change without corrupting binary payloads.
  useEffect(() => {
    const cleanup = window.electronAPI.onFileChanged((filePath) => {
      const state = useFileStore.getState()
      if (filePath === state.currentFilePath) {
        void state.openFile(filePath)
      }
    })
    return cleanup
  }, [])

  // Watch for directory changes — refresh only the affected folder
  useEffect(() => {
    const cleanup = window.electronAPI.onDirectoryChanged((dirPath) => {
      refreshFolder(dirPath)
    })
    return cleanup
  }, [refreshFolder])
}
