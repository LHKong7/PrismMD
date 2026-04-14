import { create } from 'zustand'

type UpdaterKind =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdaterState {
  /** Latest event received from the main process. */
  kind: UpdaterKind
  version: string | null
  releaseNotes: string | null
  releaseName: string | null
  releaseDate: string | null
  error: string | null
  /** Timestamp of the last event — helps "Last checked: 2m ago" UI. */
  lastEventAt: number | null
  /** Current app version, populated on mount. */
  currentVersion: string | null

  handleEvent: (ev: {
    kind: Exclude<UpdaterKind, 'idle'>
    version?: string
    releaseNotes?: string
    releaseName?: string
    releaseDate?: string
    error?: string
  }) => void
  setCurrentVersion: (v: string) => void
  /** Kick a manual check and briefly flip into `checking`. */
  checkNow: () => Promise<void>
  quitAndInstall: () => void
}

export const useUpdaterStore = create<UpdaterState>((set) => ({
  kind: 'idle',
  version: null,
  releaseNotes: null,
  releaseName: null,
  releaseDate: null,
  error: null,
  lastEventAt: null,
  currentVersion: null,

  handleEvent: (ev) => {
    set({
      kind: ev.kind,
      version: ev.version ?? null,
      releaseNotes: ev.releaseNotes ?? null,
      releaseName: ev.releaseName ?? null,
      releaseDate: ev.releaseDate ?? null,
      error: ev.error ?? null,
      lastEventAt: Date.now(),
    })
  },

  setCurrentVersion: (v) => set({ currentVersion: v }),

  checkNow: async () => {
    set({ kind: 'checking', lastEventAt: Date.now() })
    try {
      await window.electronAPI.updaterCheckNow()
    } catch (err) {
      set({
        kind: 'error',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  },

  quitAndInstall: () => {
    window.electronAPI.updaterQuitAndInstall()
  },
}))
