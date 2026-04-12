import { create } from 'zustand'

export interface IngestedReport {
  reportId: string
  filePath?: string
  filename?: string
  entities?: number
  claims?: number
  relationships?: number
  ingestedAt: number
}

export type IngestStage =
  | 'idle'
  | 'parsing'
  | 'extracting'
  | 'resolving'
  | 'writing'
  | 'completed'
  | 'failed'

interface IngestStatus {
  filePath: string | null
  stage: IngestStage
  error?: string
  reportId?: string
}

interface InsightGraphStore {
  sessionId: string | null
  reports: IngestedReport[]
  ingest: IngestStatus
  lastError: string | null

  // Actions
  ingestFile: (filePath: string) => Promise<boolean>
  refreshReports: () => Promise<void>
  ensureSession: () => Promise<string | null>
  resetIngest: () => void
}

function filenameOf(fp: string): string {
  return fp.split(/[/\\]/).pop() ?? fp
}

export const useInsightGraphStore = create<InsightGraphStore>((set, get) => {
  // Subscribe to progress events from the main process.
  let subscribed = false
  const ensureProgressListener = () => {
    if (subscribed) return
    subscribed = true
    window.electronAPI.onInsightGraphProgress?.((ev) => {
      const stage = ev.stage as IngestStage
      set((state) => ({
        ingest: {
          ...state.ingest,
          stage,
          reportId: (ev.reportId as string | undefined) ?? state.ingest.reportId,
        },
      }))
    })
  }

  return {
    sessionId: null,
    reports: [],
    ingest: { filePath: null, stage: 'idle' },
    lastError: null,

    ingestFile: async (filePath) => {
      ensureProgressListener()
      set({
        ingest: { filePath, stage: 'parsing' },
        lastError: null,
      })
      try {
        const res = await window.electronAPI.insightGraphIngest(filePath)
        if (!res.ok) {
          set({
            ingest: { filePath, stage: 'failed', error: res.error },
            lastError: res.error,
          })
          return false
        }
        const result = res.result as Record<string, unknown>
        const report: IngestedReport = {
          reportId: String(result.reportId ?? ''),
          filePath,
          filename: filenameOf(filePath),
          entities: Number(result.entities ?? 0),
          claims: Number(result.claims ?? 0),
          relationships: Number(result.relationships ?? 0),
          ingestedAt: Date.now(),
        }
        set((state) => ({
          reports: [report, ...state.reports.filter((r) => r.reportId !== report.reportId)],
          ingest: { filePath, stage: 'completed', reportId: report.reportId },
        }))
        return true
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        set({ ingest: { filePath, stage: 'failed', error: msg }, lastError: msg })
        return false
      }
    },

    refreshReports: async () => {
      try {
        const res = await window.electronAPI.insightGraphListReports()
        if (!res.ok) {
          set({ lastError: res.error })
          return
        }
        const reports: IngestedReport[] = res.reports.map((r) => ({
          reportId: String(r.reportId ?? r.id ?? ''),
          filePath: (r.source_path as string | undefined) ?? (r.filePath as string | undefined),
          filename:
            (r.filename as string | undefined) ??
            (r.source_path ? filenameOf(String(r.source_path)) : undefined),
          entities: Number(r.entities ?? 0),
          claims: Number(r.claims ?? 0),
          relationships: Number(r.relationships ?? 0),
          ingestedAt: Number(r.created_at ?? Date.now()),
        }))
        set({ reports })
      } catch (err) {
        set({ lastError: err instanceof Error ? err.message : String(err) })
      }
    },

    ensureSession: async () => {
      const existing = get().sessionId
      if (existing) return existing
      try {
        const res = await window.electronAPI.insightGraphCreateSession()
        if (!res.ok) return null
        set({ sessionId: res.sessionId })
        return res.sessionId
      } catch {
        return null
      }
    },

    resetIngest: () => set({ ingest: { filePath: null, stage: 'idle' } }),
  }
})
