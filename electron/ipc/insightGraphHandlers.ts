import { ipcMain } from 'electron'
import {
  testNeo4jConnection,
  ingestDocument,
  graphQuery,
  listReports,
  getReport,
  findEntities,
  getEntity,
  getEntityProfile,
  getClaimsAbout,
  getEntityMetrics,
  getMetricHistory,
  findEvidenceForClaim,
  getSubgraph,
  getEntityRelationships,
  findPath,
  compareEntityAcrossReports,
  findMetricTrend,
  findContradictions,
  entityTimeline,
  createSession,
  shutdown,
} from '../services/insightGraphService'
import { getMainWindow } from '../main'

/**
 * Small helper that wraps any graph query into the uniform
 * `{ ok: true, data } | { ok: false, error }` envelope. Using async/await at
 * the call-site (rather than a .then chain) keeps stack traces useful for
 * diagnostics while still guaranteeing no handler ever throws into Electron.
 */
async function wrap<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const data = await fn()
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function registerInsightGraphHandlers() {
  ipcMain.handle('insightgraph:test-neo4j', async (_e, uri: string, user: string, password: string) => {
    return testNeo4jConnection(uri, user, password)
  })

  ipcMain.handle('insightgraph:ingest', async (_e, filePath: string) => {
    const win = getMainWindow()
    try {
      const result = await ingestDocument(filePath, win)
      return { ok: true as const, result }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('insightgraph:query', async (_e, question: string, sessionId?: string) => {
    try {
      const result = await graphQuery(question, sessionId)
      return { ok: true as const, result }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('insightgraph:list-reports', async () => {
    try {
      const reports = await listReports()
      return { ok: true as const, reports }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('insightgraph:create-session', async () => {
    try {
      const id = await createSession()
      return { ok: true as const, sessionId: id }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Read-only graph queries. All share the same `{ ok, data | error }`
  // envelope via `wrap` so the renderer can reuse one handling code path.
  ipcMain.handle('insightgraph:get-report', (_e, reportId: string) => wrap(() => getReport(reportId)))
  ipcMain.handle('insightgraph:find-entities', (_e, query: { name?: string; type?: string; limit?: number } = {}) =>
    wrap(() => findEntities(query)),
  )
  ipcMain.handle('insightgraph:get-entity', (_e, entityId: string) => wrap(() => getEntity(entityId)))
  ipcMain.handle('insightgraph:get-entity-profile', (_e, name: string) => wrap(() => getEntityProfile(name)))
  ipcMain.handle('insightgraph:get-claims-about', (_e, name: string) => wrap(() => getClaimsAbout(name)))
  ipcMain.handle('insightgraph:get-entity-metrics', (_e, name: string) => wrap(() => getEntityMetrics(name)))
  ipcMain.handle('insightgraph:get-metric-history', (_e, metric: string, entity?: string) =>
    wrap(() => getMetricHistory(metric, entity)),
  )
  ipcMain.handle('insightgraph:find-evidence-for-claim', (_e, claimId: string) =>
    wrap(() => findEvidenceForClaim(claimId)),
  )
  ipcMain.handle('insightgraph:get-subgraph', (_e, nodeId: string, depth?: number) =>
    wrap(() => getSubgraph(nodeId, depth)),
  )
  ipcMain.handle('insightgraph:get-entity-relationships', (_e, name: string) =>
    wrap(() => getEntityRelationships(name)),
  )
  ipcMain.handle('insightgraph:find-path', (_e, a: string, b: string, maxDepth?: number) =>
    wrap(() => findPath(a, b, maxDepth)),
  )
  ipcMain.handle('insightgraph:compare-entity-across-reports', (_e, name: string) =>
    wrap(() => compareEntityAcrossReports(name)),
  )
  ipcMain.handle('insightgraph:find-metric-trend', (_e, entity: string, metric: string) =>
    wrap(() => findMetricTrend(entity, metric)),
  )
  ipcMain.handle('insightgraph:find-contradictions', (_e, name: string) =>
    wrap(() => findContradictions(name)),
  )
  ipcMain.handle('insightgraph:entity-timeline', (_e, name: string) => wrap(() => entityTimeline(name)))

  ipcMain.handle('insightgraph:shutdown', async () => {
    await shutdown()
  })
}
