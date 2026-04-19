import { useEffect } from 'react'
import { useFileStore } from '../store/fileStore'
import { useEditorStore } from '../store/editorStore'

export function useFileWatcher() {
  const refreshFolder = useFileStore((s) => s.refreshFolder)

  // Watch for file content changes. The main process just signals "this
  // path changed" — we re-read via the store so text vs binary formats
  // both pick up the change without corrupting binary payloads.
  //
  // When the user is editing with unsaved changes, an external modification
  // triggers a conflict dialog instead of silently overwriting.
  useEffect(() => {
    const cleanup = window.electronAPI.onFileChanged((filePath) => {
      const state = useFileStore.getState()
      if (filePath !== state.currentFilePath) return

      const editorState = useEditorStore.getState()
      if (editorState.editing && editorState.isDirty) {
        const reload = window.confirm(
          'This file was modified externally. Discard your changes and reload?',
        )
        if (!reload) return // keep the user's edits
        editorState.discardChanges()
      }

      void state.openFile(filePath)
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
