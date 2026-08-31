/**
 * ReaderApp — the root of a reader window (`?mode=reader`).
 *
 * A separate React root from `App`, not a mode flag inside it. That is what
 * keeps the promise cheap: this tree never mounts the workspace store, the
 * editor, the agent sidebar or the knowledge graph, so
 * a reader window starts fast and cannot write to anything.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ThemeProvider } from '../../lib/theme/ThemeProvider'
import { useLibraryStore } from '../../store/libraryStore'
import { useSettingsStore } from '../../store/settingsStore'
import { ReaderTitleBar } from './ReaderTitleBar'
import { ReaderTabBar } from './ReaderTabBar'
import { ReaderDocument } from './ReaderDocument'
import { ReaderWelcome } from './ReaderWelcome'
import { FolderTree } from './FolderTree'
import { ResizeHandle } from '../layout/ResizeHandle'
import { initI18n } from '../../i18n'

initI18n()

/**
 * Sidebar width lives in localStorage rather than the settings file: it is a
 * per-window reading preference, and a reader window must not write to the
 * workbench's layout state.
 */
const SIDEBAR_WIDTH_KEY = 'prismmd.reader.sidebarWidth'
const DEFAULT_SIDEBAR_WIDTH = 224 // what `w-56` used to be
const MIN_SIDEBAR_WIDTH = 140
const MAX_SIDEBAR_WIDTH = 560

function clampSidebarWidth(w: number): number {
  return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, w))
}

function loadSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY)
    const parsed = raw === null ? NaN : Number.parseInt(raw, 10)
    if (Number.isFinite(parsed)) return clampSidebarWidth(parsed)
  } catch {
    // Storage unavailable — the default is fine.
  }
  return DEFAULT_SIDEBAR_WIDTH
}

function ReaderContent() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth)

  // The handle captures its callbacks at mousedown, so the persisted value has
  // to come from a ref rather than the state snapshot the drag started with.
  const widthRef = useRef(sidebarWidth)
  const handleResize = useCallback((w: number) => {
    widthRef.current = w
    setSidebarWidth(w)
  }, [])
  const handleResizeEnd = useCallback(() => {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(widthRef.current))
    } catch {
      // Quota/private mode — the width still applies for this session.
    }
  }, [])

  const root = useLibraryStore((s) => s.root)
  const ready = useLibraryStore((s) => s.ready)
  const init = useLibraryStore((s) => s.init)
  const loadSettings = useSettingsStore((s) => s.loadSettings)

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const store = useLibraryStore.getState()

      // Cmd+O / Cmd+Shift+O — open a folder / a single file
      if (e.key === 'o') {
        e.preventDefault()
        void (e.shiftKey ? store.pickFile() : store.pickFolder())
        return
      }

      // Cmd+W — close the tab, or the window once the last one is gone
      if (e.key === 'w') {
        e.preventDefault()
        if (store.activePath) store.closeTab(store.activePath)
        else window.electronAPI.closeWindow()
        return
      }

      // Cmd+1..9 — jump to a tab by position
      if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key, 10) - 1
        if (idx < store.tabs.length) {
          e.preventDefault()
          store.activate(store.tabs[idx].path)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <ReaderTitleBar sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((v) => !v)} />
      {!ready ? (
        <div className="flex-1" />
      ) : !root ? (
        <div className="flex-1 min-h-0">
          <ReaderWelcome />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex">
          {sidebarOpen && (
            <div
              className="relative shrink-0 border-r"
              style={{ width: sidebarWidth, borderColor: 'var(--border-color)' }}
            >
              <FolderTree />
              <ResizeHandle
                side="left"
                currentWidth={sidebarWidth}
                onResize={handleResize}
                onResizeEnd={handleResizeEnd}
                minWidth={MIN_SIDEBAR_WIDTH}
                maxWidth={MAX_SIDEBAR_WIDTH}
              />
            </div>
          )}
          <div className="flex-1 min-w-0 flex flex-col">
            <ReaderTabBar />
            <div className="flex-1 min-h-0">
              <ReaderDocument />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ReaderApp() {
  return (
    <ThemeProvider>
      <ReaderContent />
    </ThemeProvider>
  )
}
