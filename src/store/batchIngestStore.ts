import { create } from 'zustand'
import { useInsightGraphStore } from './insightGraphStore'

export interface BatchFailure {
  path: string
  error: string
}

interface BatchIngestStore {
  /** Files still waiting to be ingested. */
  queue: string[]
  /** File currently being processed (or null between items). */
  active: string | null
  /** Paths that completed successfully during this batch. */
  done: string[]
  failed: BatchFailure[]
  /** Snapshot of the total size of the batch when it was started. */
  total: number
  status: 'idle' | 'running' | 'done'
  /** Set by `cancel()`; the loop checks this between files. */
  cancelRequested: boolean

  /**
   * Kick off (or append to) a batch. If a batch is already running, the
   * new paths are queued behind it — the user never has to wait for one
   * batch to finish to start another.
   */
  startBatchIngest: (filePaths: string[]) => Promise<void>
  cancel: () => void
  /** Clear the completed/failed report after the user has seen it. */
  reset: () => void
}

export const useBatchIngestStore = create<BatchIngestStore>((set, get) => ({
  queue: [],
  active: null,
  done: [],
  failed: [],
  total: 0,
  status: 'idle',
  cancelRequested: false,

  startBatchIngest: async (filePaths: string[]) => {
    if (filePaths.length === 0) return

    // If a batch is already running, append to its queue and return —
    // the live loop will pick them up.
    const state = get()
    if (state.status === 'running') {
      set({
        queue: [...state.queue, ...filePaths],
        total: state.total + filePaths.length,
      })
      return
    }

    // Fresh batch: start the processing loop.
    set({
      queue: filePaths.slice(1),
      active: filePaths[0] ?? null,
      done: [],
      failed: [],
      total: filePaths.length,
      status: 'running',
      cancelRequested: false,
    })

    const ingestFile = useInsightGraphStore.getState().ingestFile
    let currentPath: string | null = filePaths[0] ?? null

    while (currentPath) {
      if (get().cancelRequested) break

      try {
        const ok = await ingestFile(currentPath)
        if (ok) {
          set((s) => ({ done: [...s.done, currentPath as string] }))
        } else {
          // `ingestFile` wrote the specific error to
          // `insightGraphStore.lastError`; surface that in the batch
          // report so the user doesn't have to hunt for it.
          const err = useInsightGraphStore.getState().lastError ?? 'Unknown error'
          set((s) => ({
            failed: [...s.failed, { path: currentPath as string, error: err }],
          }))
        }
      } catch (err) {
        set((s) => ({
          failed: [
            ...s.failed,
            {
              path: currentPath as string,
              error: err instanceof Error ? err.message : String(err),
            },
          ],
        }))
      }

      // Pull the next path off the queue (new files may have been
      // appended while we were ingesting the last one).
      const next = get().queue[0] ?? null
      set((s) => ({
        queue: s.queue.slice(1),
        active: next,
      }))
      currentPath = next
    }

    set({ status: 'done', active: null })
  },

  cancel: () => {
    // The in-flight file still completes — cancellation is cooperative
    // at the file boundary, not mid-ingest. That's the right trade-off
    // since a half-ingested document would otherwise leave the graph
    // in a messy state.
    set({ cancelRequested: true, queue: [] })
  },

  reset: () =>
    set({
      queue: [],
      active: null,
      done: [],
      failed: [],
      total: 0,
      status: 'idle',
      cancelRequested: false,
    }),
}))
