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
      const tab = state.tabs.find((t) => t.filePath === filePath)
      if (!tab) return

      // Active tab — check for unsaved editor conflict.
      if (tab.id === state.activeTabId) {
        const editorState = useEditorStore.getState()
        if (editorState.editing && editorState.isDirty) {
          const reload = window.confirm(
            'This file was modified externally. Discard your changes and reload?',
          )
          if (!reload) return
          editorState.discardChanges()
        }
      }

      // Re-read the file. For the active tab, openFile detects the
      // existing tab and switches to it (which triggers a re-read if
      // needed). For background tabs we need to close and re-open to
      // pick up the new content — but since openFile checks for existing
      // tabs by filePath, we remove the stale tab first so the fresh
      // content is loaded.
      const wasActive = tab.id === state.activeTabId
      // Remove the stale tab so openFile creates a fresh one.
      useFileStore.setState((s) => ({
        tabs: s.tabs.filter((t) => t.id !== tab.id),
        activeTabId: wasActive ? null : s.activeTabId,
      }))
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
