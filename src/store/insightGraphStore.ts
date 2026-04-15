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

export interface GraphEntity {
  id?: string
  name: string
  type?: string
  [key: string]: unknown
}

export interface GraphEdge {
  source: string
  target: string
  type?: string
  [key: string]: unknown
}

export interface Subgraph {
  nodes: GraphEntity[]
  edges: GraphEdge[]
}

/**
 * LRU-ish cache keyed by entity name. We keep it tiny (MAX_CACHE_ENTRIES)
 * on purpose — the user typically interacts with a handful of entities at
 * a time; bounded caches avoid memory creep over long sessions.
 */
const MAX_CACHE_ENTRIES = 64

function cacheSet<V>(cache: Record<string, V>, key: string, value: V): Record<string, V> {
  const next = { ...cache, [key]: value }
  const keys = Object.keys(next)
  if (keys.length > MAX_CACHE_ENTRIES) {
    // Drop the oldest insertion (Object.keys order preserves insertion for
    // string keys), not the one we just set.
    const drop = keys.slice(0, keys.length - MAX_CACHE_ENTRIES)
    for (const k of drop) delete next[k]
  }
  return next
}

interface InsightGraphStore {
  sessionId: string | null
  reports: IngestedReport[]
  ingest: IngestStatus
  lastError: string | null

  // Read-query caches. Each is keyed by entity name (except `subgraphCache`
  // which is keyed by node id + depth). Caches are best-effort — if a cache
  // miss falls through to IPC and fails, we just surface the error.
  entityProfileCache: Record<string, Record<string, unknown>>
  claimsCache: Record<string, Record<string, unknown>[]>
  entityRelationshipsCache: Record<string, Record<string, unknown>[]>
  contradictionsCache: Record<string, Record<string, unknown>[]>
  timelineCache: Record<string, Record<string, unknown>[]>
  subgraphCache: Record<string, Subgraph>
  /**
   * Cache of entity-name lists keyed by reportId (or `__global__` for the
   * findEntities fallback). Avoids re-running the trie-fetch on every doc
   * switch — invalidated on ingest via `entityNamesCacheStamp`.
   */
  entityNamesCache: Record<string, string[]>
  entityNamesCacheStamp: number

  setEntityNames: (key: string, names: string[]) => void

  // Actions
  ingestFile: (filePath: string) => Promise<boolean>
  refreshReports: () => Promise<void>
  ensureSession: () => Promise<string | null>
  resetIngest: () => void

  // Graph queries. Every method normalizes the `{ ok, data | error }` IPC
  // envelope into `data | null` for easy consumption in React components.
  findEntities: (query?: { name?: string; type?: string; limit?: number }) => Promise<GraphEntity[]>
  getEntityProfile: (name: string, force?: boolean) => Promise<Record<string, unknown> | null>
  getClaimsAbout: (name: string, force?: boolean) => Promise<Record<string, unknown>[]>
  getEntityRelationships: (name: string, force?: boolean) => Promise<Record<string, unknown>[]>
  getContradictions: (name: string, force?: boolean) => Promise<Record<string, unknown>[]>
  getEntityTimeline: (name: string, force?: boolean) => Promise<Record<string, unknown>[]>
  getSubgraph: (nodeId: string, depth?: number, force?: boolean) => Promise<Subgraph | null>
  clearGraphCaches: () => void
}

function filenameOf(fp: string): string {
  return fp.split(/[/\\]/).pop() ?? fp
}

export const useInsightGraphStore = create<InsightGraphStore>((set, get) => {
  // Subscribe to progress events from the main process at store creation so
  // that stage transitions (including `'completed'`) are never missed even if
  // ingest was kicked off through a code path that doesn't go through
  // `ingestFile` (restored sessions, background workers, etc.). The
  // `window.electronAPI` guard keeps us safe in non-Electron test harnesses.
  if (typeof window !== 'undefined' && window.electronAPI?.onInsightGraphProgress) {
    window.electronAPI.onInsightGraphProgress((ev) => {
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

    entityProfileCache: {},
    claimsCache: {},
    entityRelationshipsCache: {},
    contradictionsCache: {},
    timelineCache: {},
    subgraphCache: {},
    entityNamesCache: {},
    entityNamesCacheStamp: 0,

    setEntityNames: (key, names) =>
      set((state) => ({
        entityNamesCache: { ...state.entityNamesCache, [key]: names },
      })),

    ingestFile: async (filePath) => {
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
        // NOTE: the SDK's `reportId` in the ingest response is a stage-token
        // (randomUUID), NOT the `report_id` property written into Neo4j —
        // the writer sets `Report.report_id` to `doc.id`, a different UUID.
        // So we rehydrate the canonical reports from Neo4j and match by
        // source filename instead of trusting the ingest-response id.
        await get().refreshReports()
        const match = get().reports.find((r) => r.filePath === filePath || r.filename === filenameOf(filePath))
        const reportId = match?.reportId ?? ''
        set((state) => ({
          ingest: {
            filePath,
            stage: 'completed',
            reportId,
          },
          // Newly ingested data invalidates the entity-name cache so the
          // next doc open re-fetches.
          entityNamesCache: {},
          entityNamesCacheStamp: state.entityNamesCacheStamp + 1,
        }))
        void result
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
        const reports: IngestedReport[] = res.reports.map((r) => {
          const sourcePath =
            (r.source_path as string | undefined) ?? (r.filePath as string | undefined)
          const sourceFilename = r.source_filename as string | undefined
          return {
            // Neo4j stores the property as snake_case `report_id`; the SDK
            // surfaces raw properties, so check that first.
            reportId: String(r.report_id ?? r.reportId ?? r.id ?? ''),
            filePath: sourcePath,
            filename:
              (r.filename as string | undefined) ??
              sourceFilename ??
              (sourcePath ? filenameOf(sourcePath) : undefined),
            entities: Number(r.entities ?? 0),
            claims: Number(r.claims ?? 0),
            relationships: Number(r.relationships ?? 0),
            ingestedAt: Number(r.created_at ?? Date.now()),
          }
        })
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

    findEntities: async (query) => {
      try {
        const res = await window.electronAPI.insightGraphFindEntities(query)
        if (!res.ok) {
          set({ lastError: res.error })
          return []
        }
        return (res.data ?? []).map((raw) => ({
          ...raw,
          id: (raw.id as string | undefined) ?? (raw.entityId as string | undefined),
          name: String(raw.name ?? ''),
          type: raw.type as string | undefined,
        })) as GraphEntity[]
      } catch (err) {
        set({ lastError: err instanceof Error ? err.message : String(err) })
        return []
      }
    },

    getEntityProfile: async (name, force) => {
      const cache = get().entityProfileCache
      if (!force && cache[name]) return cache[name]
      try {
        const res = await window.electronAPI.insightGraphGetEntityProfile(name)
        if (!res.ok) {
          set({ lastError: res.error })
          return null
        }
        set({ entityProfileCache: cacheSet(cache, name, res.data) })
        return res.data
      } catch (err) {
        set({ lastError: err instanceof Error ? err.message : String(err) })
        return null
      }
    },

    getClaimsAbout: async (name, force) => {
      const cache = get().claimsCache
      if (!force && cache[name]) return cache[name]
      try {
        const res = await window.electronAPI.insightGraphGetClaimsAbout(name)
        if (!res.ok) {
          set({ lastError: res.error })
          return []
        }
        set({ claimsCache: cacheSet(cache, name, res.data) })
        return res.data
      } catch (err) {
        set({ lastError: err instanceof Error ? err.message : String(err) })
        return []
      }
    },

    getEntityRelationships: async (name, force) => {
      const cache = get().entityRelationshipsCache
      if (!force && cache[name]) return cache[name]
      try {
        const res = await window.electronAPI.insightGraphGetEntityRelationships(name)
        if (!res.ok) {
          set({ lastError: res.error })
          return []
        }
        set({ entityRelationshipsCache: cacheSet(cache, name, res.data) })
        return res.data
      } catch (err) {
        set({ lastError: err instanceof Error ? err.message : String(err) })
        return []
      }
    },

    getContradictions: async (name, force) => {
      const cache = get().contradictionsCache
      if (!force && cache[name]) return cache[name]
      try {
        const res = await window.electronAPI.insightGraphFindContradictions(name)
        if (!res.ok) {
          set({ lastError: res.error })
          return []
        }
        set({ contradictionsCache: cacheSet(cache, name, res.data) })
        return res.data
      } catch (err) {
        set({ lastError: err instanceof Error ? err.message : String(err) })
        return []
      }
    },

    getEntityTimeline: async (name, force) => {
      const cache = get().timelineCache
      if (!force && cache[name]) return cache[name]
      try {
        const res = await window.electronAPI.insightGraphEntityTimeline(name)
        if (!res.ok) {
          set({ lastError: res.error })
          return []
        }
        set({ timelineCache: cacheSet(cache, name, res.data) })
        return res.data
      } catch (err) {
        set({ lastError: err instanceof Error ? err.message : String(err) })
        return []
      }
    },

    getSubgraph: async (nodeId, depth, force) => {
      const key = `${nodeId}::${depth ?? 'default'}`
      const cache = get().subgraphCache
      if (!force && cache[key]) return cache[key]
      try {
        const res = await window.electronAPI.insightGraphGetSubgraph(nodeId, depth)
        if (!res.ok) {
          set({ lastError: res.error })
          return null
        }
        const data = res.data as unknown as Subgraph
        set({ subgraphCache: cacheSet(cache, key, data) })
        return data
      } catch (err) {
        set({ lastError: err instanceof Error ? err.message : String(err) })
        return null
      }
    },

    clearGraphCaches: () =>
      set((state) => ({
        entityProfileCache: {},
        claimsCache: {},
        entityRelationshipsCache: {},
        contradictionsCache: {},
        timelineCache: {},
        subgraphCache: {},
        entityNamesCache: {},
        entityNamesCacheStamp: state.entityNamesCacheStamp + 1,
      })),
  }
})
