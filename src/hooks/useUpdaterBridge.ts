import { useEffect } from 'react'
import { useUpdaterStore } from '../store/updaterStore'

/**
 * Mount-once bridge between the main-process auto-updater and the
 * renderer `updaterStore`. Also fetches the current app version so the
 * About section can show it even before any updater event arrives.
 */
export function useUpdaterBridge() {
  const handleEvent = useUpdaterStore((s) => s.handleEvent)
  const setCurrentVersion = useUpdaterStore((s) => s.setCurrentVersion)

  useEffect(() => {
    const cleanup = window.electronAPI.onUpdaterEvent((ev) => {
      handleEvent(ev)
    })
    // `updaterCurrentVersion` falls through to `app.getVersion()` which
    // is always safe to call — dev or packaged.
    void window.electronAPI.updaterCurrentVersion().then(setCurrentVersion)
    return cleanup
  }, [handleEvent, setCurrentVersion])
}
