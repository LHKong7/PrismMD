import { app, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { InsightGraph } from '@insightgraph/sdk-embedded'
import neo4j from 'neo4j-driver'
import { getActiveProvider, getInsightGraphSettings, loadSettings, type InsightGraphSettings } from './settingsStore'

// ---------------------------------------------------------------------------
// Monkey-patch: the SDK's Neo4j writer crashes with
//   "Cannot read properties of undefined (reading 'resolved')"
// when entity-resolver fails (LLM timeout), because
// `extractions.resolvedEntities` is undefined. Patch the resolver
// service to guarantee `resolvedEntities` is always an array.
// ---------------------------------------------------------------------------
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const resolverMod = require('@insightgraph/resolver')
  const ResolverService = resolverMod.ResolverService
  if (ResolverService?.prototype?.resolve) {
    const origResolve = ResolverService.prototype.resolve
    ResolverService.prototype.resolve = async function patchedResolve(
      this: unknown,
      result: Record<string, unknown>,
    ) {
      try {
        const out = await origResolve.call(this, result)
        // Ensure resolvedEntities is always an array
        if (!out.resolvedEntities) {
          out.resolvedEntities = []
        }
        return out
      } catch (err) {
        console.warn('[InsightGraph] resolver.resolve() threw, returning original extractions with empty resolvedEntities:', err instanceof Error ? err.message : err)
        return { ...result, resolvedEntities: [] }
      }
    }
  }
} catch {
  // SDK internals changed — skip patch
}

/**
 * LLM configuration supplied to InsightGraph. The SDK only understands
 * OpenAI-compatible endpoints, so Anthropic/Google providers are rejected
 * upstream (the user is told to switch providers for graph features).
 */
interface InsightGraphLlmConfig {
  model: string
  apiKey: string
  baseUrl?: string
}

interface BuiltConfig {
  settings: InsightGraphSettings
  llm: InsightGraphLlmConfig
  uploadDir: string
}

let current: { ig: InsightGraph; config: BuiltConfig } | null = null
let initPromise: Promise<InsightGraph> | null = null

export class InsightGraphConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InsightGraphConfigError'
  }
}

function resolveLlmConfig(): InsightGraphLlmConfig {
  const active = getActiveProvider()
  if (!active) {
    throw new InsightGraphConfigError(
      'No AI provider configured. Activate an OpenAI-compatible provider (OpenAI, Ollama, or Custom) in AI Settings first.',
    )
  }

  if (loadSettings().privacyMode && active.provider !== 'ollama') {
    throw new InsightGraphConfigError(
      'Privacy Mode is enabled. Only Ollama (local) can be used for Knowledge Graph operations.',
    )
  }

  switch (active.provider) {
    case 'openai':
      return {
        model: active.model,
        apiKey: active.apiKey,
        baseUrl: active.baseUrl ?? 'https://api.openai.com/v1',
      }
    case 'ollama': {
      const base = active.baseUrl ?? 'http://localhost:11434'
      return {
        model: active.model,
        apiKey: 'ollama',
        baseUrl: `${base.replace(/\/$/, '')}/v1`,
      }
    }
    case 'custom':
      if (!active.baseUrl) {
        throw new InsightGraphConfigError(
          'Custom provider is missing a base URL. Add one in AI Settings before using the Knowledge Graph.',
        )
      }
      return { model: active.model, apiKey: active.apiKey, baseUrl: active.baseUrl }
    case 'anthropic':
    case 'google':
    default:
      throw new InsightGraphConfigError(
        `Provider "${active.provider}" is not OpenAI-compatible. Switch to OpenAI, Ollama, or Custom in AI Settings to use the Knowledge Graph.`,
      )
  }
}

function resolveUploadDir(): string {
  return path.join(app.getPath('userData'), 'insightgraph', 'uploads')
}

function sameConfig(a: BuiltConfig, b: BuiltConfig): boolean {
  return (
    a.settings.neo4j.uri === b.settings.neo4j.uri &&
    a.settings.neo4j.user === b.settings.neo4j.user &&
    a.settings.neo4j.password === b.settings.neo4j.password &&
    a.settings.domain === b.settings.domain &&
    a.llm.model === b.llm.model &&
    a.llm.apiKey === b.llm.apiKey &&
    a.llm.baseUrl === b.llm.baseUrl &&
    a.uploadDir === b.uploadDir
  )
}

async function buildConfig(): Promise<BuiltConfig> {
  const settings = getInsightGraphSettings()
  if (!settings.enabled) {
    throw new InsightGraphConfigError('Knowledge Graph is disabled in Settings.')
  }
  if (!settings.neo4j.uri || !settings.neo4j.user) {
    throw new InsightGraphConfigError('Neo4j URI and username are required.')
  }
  const llm = resolveLlmConfig()
  const uploadDir = resolveUploadDir()
  await fs.mkdir(uploadDir, { recursive: true })
  return { settings, llm, uploadDir }
}

/**
 * Lazily resolve an initialized InsightGraph instance. Rebuilds and closes
 * the previous instance when the underlying config (Neo4j, LLM, domain)
 * changes so user edits in Settings take effect immediately.
 */
export async function getInstance(win?: BrowserWindow | null): Promise<InsightGraph> {
  const config = await buildConfig()

  if (current && !sameConfig(current.config, config)) {
    try {
      await current.ig.close()
    } catch {
      // best-effort close
    }
    current = null
    initPromise = null
  }

  if (current) return current.ig

  if (!initPromise) {
    initPromise = (async () => {
      const ig = new InsightGraph({
        neo4j: {
          uri: config.settings.neo4j.uri,
          user: config.settings.neo4j.user,
          password: config.settings.neo4j.password,
        },
        llm: config.llm,
        domain: config.settings.domain,
        uploadDir: config.uploadDir,
      })

      ig.on('progress', (ev: unknown) => {
        const mw = win ?? BrowserWindow.getAllWindows()[0]
        if (mw && !mw.isDestroyed()) {
          mw.webContents.send('insightgraph:progress', ev)
        }
      })

      await ig.initialize()
      current = { ig, config }
      return ig
    })().catch((err) => {
      initPromise = null
      throw err
    })
  }

  return initPromise
}

export async function testNeo4jConnection(
  uri: string,
  user: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!uri) return { ok: false, error: 'Neo4j URI is required.' }
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password))
  try {
    await driver.verifyConnectivity()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    await driver.close().catch(() => {})
  }
}

export async function ingestDocument(
  filePath: string,
  win?: BrowserWindow | null,
): Promise<Record<string, unknown>> {
  if (!filePath) throw new InsightGraphConfigError('No file path provided.')
  await fs.access(filePath)
  const ig = await getInstance(win)
  const result = await ig.ingest({ filePath })
  return result as unknown as Record<string, unknown>
}

export async function graphQuery(
  question: string,
  sessionId?: string,
): Promise<Record<string, unknown>> {
  const ig = await getInstance()
  const result = await ig.agentQuery(question, sessionId)
  return result as unknown as Record<string, unknown>
}

export async function listReports(): Promise<Record<string, unknown>[]> {
  const ig = await getInstance()
  return ig.listReports()
}

export async function getReport(reportId: string): Promise<Record<string, unknown> | null> {
  const ig = await getInstance()
  return ig.getReport(reportId)
}

export async function findEntities(
  query: { name?: string; type?: string; limit?: number } = {},
): Promise<Record<string, unknown>[]> {
  const ig = await getInstance()
  return ig.findEntities(query)
}

export async function getEntity(entityId: string): Promise<Record<string, unknown> | null> {
  const ig = await getInstance()
  return ig.getEntity(entityId)
}

export async function getEntityProfile(entityName: string): Promise<Record<string, unknown>> {
  const ig = await getInstance()
  return ig.getEntityProfile(entityName)
}

export async function getClaimsAbout(entityName: string): Promise<Record<string, unknown>[]> {
  const ig = await getInstance()
  return ig.getClaimsAbout(entityName)
}

export async function getEntityMetrics(entityName: string): Promise<Record<string, unknown>[]> {
  const ig = await getInstance()
  return ig.getEntityMetrics(entityName)
}

export async function getMetricHistory(
  metricName: string,
  entityName?: string,
): Promise<Record<string, unknown>[]> {
  const ig = await getInstance()
  return ig.getMetricHistory(metricName, entityName)
}

export async function findEvidenceForClaim(claimId: string): Promise<Record<string, unknown>[]> {
  const ig = await getInstance()
  return ig.findEvidenceForClaim(claimId)
}

export async function getSubgraph(
  nodeId: string,
  depth?: number,
): Promise<{ nodes: unknown[]; edges: unknown[] }> {
  const ig = await getInstance()
  return ig.getSubgraph(nodeId, depth)
}

export async function getEntityRelationships(
  entityName: string,
): Promise<Record<string, unknown>[]> {
  const ig = await getInstance()
  return ig.getEntityRelationships(entityName)
}

export async function findPath(
  entityA: string,
  entityB: string,
  maxDepth?: number,
): Promise<{ nodes: unknown[]; edges: unknown[]; found: boolean }> {
  const ig = await getInstance()
  return ig.findPath(entityA, entityB, maxDepth)
}

export async function compareEntityAcrossReports(
  entityName: string,
): Promise<Record<string, unknown>> {
  const ig = await getInstance()
  return ig.compareEntityAcrossReports(entityName)
}

export async function findMetricTrend(
  entityName: string,
  metricName: string,
): Promise<Record<string, unknown>> {
  const ig = await getInstance()
  return ig.findMetricTrend(entityName, metricName)
}

export async function findContradictions(
  entityName: string,
): Promise<Record<string, unknown>[]> {
  const ig = await getInstance()
  return ig.findContradictions(entityName)
}

export async function entityTimeline(entityName: string): Promise<Record<string, unknown>[]> {
  const ig = await getInstance()
  return ig.entityTimeline(entityName)
}

/**
 * Normalized graph shape consumed by GraphView. The SDK's raw `node` /
 * `relationship` records are Neo4j-ish and vary shape-to-shape; we collapse
 * them here to a predictable `{ nodes, edges }` so the renderer only has
 * to handle one schema.
 */
export interface RenderedGraphNode {
  id: string
  name: string
  type?: string
  [key: string]: unknown
}

export interface RenderedGraphEdge {
  id: string
  source: string
  target: string
  type?: string
  [key: string]: unknown
}

export interface RenderedGraph {
  nodes: RenderedGraphNode[]
  edges: RenderedGraphEdge[]
}

/**
 * Best-effort extraction of a stable identifier, label and type from an
 * arbitrary record returned by the Neo4j-backed SDK. The SDK emits three
 * slightly different shapes depending on whether an item was returned via
 * `findEntities`, part of a `getSubgraph` result, or nested in a
 * relationship payload; this helper hides that variation from callers.
 */
function normalizeEntity(raw: Record<string, unknown> | unknown): RenderedGraphNode | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const props = (r.properties as Record<string, unknown> | undefined) ?? r
  const name =
    (props.canonical_name as string | undefined) ??
    (props.name as string | undefined) ??
    (props.entityName as string | undefined) ??
    (r.canonical_name as string | undefined) ??
    (r.name as string | undefined)
  const id =
    (r.elementId as string | undefined) ??
    (r.id as string | number | undefined)?.toString() ??
    (r.identity as { toString(): string } | undefined)?.toString() ??
    (props.id as string | number | undefined)?.toString() ??
    (props.entity_id as string | undefined) ??
    (props.entityId as string | undefined) ??
    (name ? `name:${name}` : undefined)
  if (!id || !name) return null
  const type =
    (props.type as string | undefined) ??
    (props.entity_type as string | undefined) ??
    (r.type as string | undefined) ??
    (Array.isArray(r.labels) ? (r.labels as string[])[0] : undefined)
  return { id, name, type, ...props }
}

function normalizeEdge(
  raw: Record<string, unknown> | unknown,
  fallbackSource?: string,
): RenderedGraphEdge | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  // Shape 1: `getSubgraph` returns proper Neo4j edge objects with `start` /
  // `end` numeric ids. Shape 2: `getEntityRelationships` returns rows where
  // the current entity is implicit and the peer is in a named field.
  const src =
    (r.source as string | number | undefined)?.toString() ??
    (r.start as string | number | undefined)?.toString() ??
    (r.startNodeId as string | number | undefined)?.toString() ??
    fallbackSource
  const tgt =
    (r.target as string | number | undefined)?.toString() ??
    (r.end as string | number | undefined)?.toString() ??
    (r.endNodeId as string | number | undefined)?.toString() ??
    (r.relatedEntityId as string | undefined) ??
    (typeof r.relatedEntity === 'string' ? (r.relatedEntity as string) : undefined) ??
    (typeof r.relatedEntityName === 'string' ? `name:${r.relatedEntityName}` : undefined)
  if (!src || !tgt) return null
  const type =
    (r.type as string | undefined) ??
    (r.relationshipType as string | undefined) ??
    (r.label as string | undefined)
  const id =
    (r.id as string | number | undefined)?.toString() ??
    `${src}→${tgt}:${type ?? ''}`
  return { id, source: src, target: tgt, type, ...r }
}

/**
 * Build a unified graph by unioning `getEntityRelationships` results for
 * every name in `entityNames`. Used by both the **Global** scope (walks the
 * top-N entities by findEntities) and a downstream "Document" scope once
 * we can map a report to its entities.
 *
 * The SDK has no "all edges" endpoint, so we take the per-entity
 * neighborhoods and deduplicate. This caps at `maxEntities` to keep the
 * canvas responsive — a 1000-node force layout tanks in an Electron
 * window.
 */
export async function buildSubgraphFromEntities(
  entityNames: string[],
  opts: { maxEntities?: number } = {},
): Promise<RenderedGraph> {
  const cap = opts.maxEntities ?? 120
  const names = Array.from(new Set(entityNames)).slice(0, cap)

  // Use entity name as the canonical ID so nodes and edges always share
  // the same key space. Neo4j elementIds vary across sessions and don't
  // match what the SDK returns, which causes dangling links that crash
  // react-force-graph-2d.
  const nodesByName = new Map<string, RenderedGraphNode>()
  const edges = new Map<string, RenderedGraphEdge>()

  /** Ensure a node with this name exists and return its stable ID. */
  function ensureNode(name: string, type?: string): string {
    const id = `name:${name}`
    if (!nodesByName.has(name)) {
      nodesByName.set(name, { id, name, type })
    }
    return id
  }

  const ig = await getInstance()

  // Seed nodes from the SDK. We normalize and re-key by name.
  try {
    const entities = await ig.findEntities({ limit: Math.max(cap, names.length) })
    for (const e of entities) {
      const node = normalizeEntity(e)
      if (node && names.includes(node.name)) {
        ensureNode(node.name, node.type)
      }
    }
  } catch {
    // SDK findEntities failed — will seed below
  }

  // If the SDK didn't give us usable seed nodes, query Neo4j directly.
  if (nodesByName.size === 0 && names.length > 0) {
    try {
      await withUserNeo4jSession(async (session) => {
        const result = await session.run(
          'MATCH (e:Entity) WHERE coalesce(e.canonical_name, e.name) IN $names ' +
            'RETURN coalesce(e.canonical_name, e.name) AS name, ' +
            'coalesce(e.type, e.entity_type) AS type LIMIT $limit',
          { names, limit: neo4j.int(cap) },
        )
        for (const rec of result.records) {
          const name = String(rec.get('name') ?? '')
          const type = (rec.get('type') as string | null) ?? undefined
          if (name) ensureNode(name, type)
        }
      })
    } catch {
      // best-effort
    }
  }

  // Ensure every requested name has at least a placeholder node.
  for (const name of names) {
    ensureNode(name)
  }

  // Fetch relationships via the SDK.
  for (const name of names) {
    let rows: Record<string, unknown>[] = []
    try {
      rows = await ig.getEntityRelationships(name)
    } catch {
      continue
    }
    const sourceId = ensureNode(name)

    for (const row of rows) {
      const peer = normalizeEntity(row.relatedEntity ?? row.peer ?? row)
      if (peer) {
        const peerId = ensureNode(peer.name, peer.type)
        const edge = normalizeEdge(row, sourceId)
        if (edge) {
          // Re-point source/target to our stable name-based IDs.
          edge.source = sourceId
          edge.target = peerId
          edges.set(edge.id, edge)
        }
      }
    }
  }

  // If we still have zero edges, try a direct Cypher query as fallback.
  if (edges.size === 0 && nodesByName.size > 0) {
    try {
      await withUserNeo4jSession(async (session) => {
        const nodeNames = Array.from(nodesByName.keys())
        const result = await session.run(
          'MATCH (a:Entity)-[rel]->(b:Entity) ' +
            'WHERE coalesce(a.canonical_name, a.name) IN $names ' +
            'OR coalesce(b.canonical_name, b.name) IN $names ' +
            'RETURN coalesce(a.canonical_name, a.name) AS src, ' +
            'coalesce(b.canonical_name, b.name) AS tgt, type(rel) AS relType ' +
            'LIMIT 500',
          { names: nodeNames },
        )
        for (const rec of result.records) {
          const src = String(rec.get('src') ?? '')
          const tgt = String(rec.get('tgt') ?? '')
          const relType = (rec.get('relType') as string | null) ?? undefined
          if (!src || !tgt) continue
          const srcId = ensureNode(src)
          const tgtId = ensureNode(tgt)
          const edgeId = `${src}→${tgt}:${relType ?? ''}`
          edges.set(edgeId, { id: edgeId, source: srcId, target: tgtId, type: relType })
        }
      })
    } catch {
      // best-effort
    }
  }

  const nodes = Array.from(nodesByName.values())
  return { nodes, edges: Array.from(edges.values()) }
}

/**
 * Convenience wrapper for the Entity scope: find the focused entity's id
 * and call `getSubgraph` at the requested depth. Falls back to the
 * relationships-union path when the entity isn't yet indexed with a
 * dedicated id (common on fresh ingests).
 */
export async function getEntityEgoGraph(
  entityName: string,
  depth = 2,
): Promise<RenderedGraph> {
  const ig = await getInstance()
  let entities: Record<string, unknown>[] = []
  try {
    entities = await ig.findEntities({ name: entityName, limit: 1 })
  } catch {
    // SDK lookup failed — fall through to buildSubgraph
  }
  const first = entities[0] ? normalizeEntity(entities[0]) : null

  if (first?.id && !first.id.startsWith('name:')) {
    try {
      const sg = await ig.getSubgraph(first.id, depth)
      const rawNodes = (sg.nodes as unknown[])
        .map(normalizeEntity)
        .filter((n): n is RenderedGraphNode => n !== null)
      if (rawNodes.length > 0) {
        // Re-key by name for consistent IDs across the graph
        const nodeMap = new Map<string, RenderedGraphNode>()
        for (const n of rawNodes) {
          const stableId = `name:${n.name}`
          nodeMap.set(n.id, { ...n, id: stableId })
        }
        const nodes = Array.from(nodeMap.values())
        const edges = (sg.edges as unknown[])
          .map((e) => normalizeEdge(e))
          .filter((e): e is RenderedGraphEdge => e !== null)
          .map((e) => ({
            ...e,
            source: nodeMap.get(String(e.source))?.id ?? `name:${e.source}`,
            target: nodeMap.get(String(e.target))?.id ?? `name:${e.target}`,
          }))
        return { nodes, edges }
      }
    } catch {
      // fall through to the union path
    }
  }

  return buildSubgraphFromEntities([entityName])
}

/**
 * Global scope — the top-N most referenced entities and their immediate
 * neighborhoods. Bounded so we don't freeze the renderer.
 */
export async function getGlobalGraph(maxEntities = 80): Promise<RenderedGraph> {
  const ig = await getInstance()
  const all = await ig.findEntities({ limit: maxEntities })
  let names = all
    .map(normalizeEntity)
    .filter((n): n is RenderedGraphNode => n !== null)
    .map((n) => n.name)

  // Fallback: if the SDK's findEntities returned nothing usable, query
  // Neo4j directly. This covers cases where entity-resolver failed (LLM
  // timeout) or the SDK returns a shape normalizeEntity doesn't handle.
  if (names.length === 0) {
    console.log('[InsightGraph] getGlobalGraph: SDK findEntities yielded 0 usable names, trying direct Cypher fallback')
    try {
      names = await withUserNeo4jSession(async (session) => {
        const result = await session.run(
          'MATCH (e:Entity) RETURN coalesce(e.canonical_name, e.name) AS name, ' +
            'e.type AS type, elementId(e) AS eid LIMIT $limit',
          { limit: neo4j.int(maxEntities) },
        )
        return result.records
          .map((rec) => String(rec.get('name') ?? ''))
          .filter((n) => n.length > 0)
      })
      console.log('[InsightGraph] getGlobalGraph: Cypher fallback found', names.length, 'entities')
    } catch (err) {
      console.warn('[InsightGraph] getGlobalGraph: Cypher fallback failed:', err instanceof Error ? err.message : err)
    }
  }

  return buildSubgraphFromEntities(names, { maxEntities })
}

export interface RelatedReport {
  reportId: string
  title?: string
  date?: string
  sourcePath?: string
  sharedEntities: string[]
  sharedEntityCount: number
}

/**
 * Entities belonging to a given report, fetched via a single Cypher
 * round-trip. The SDK doesn't expose a "report → entities" index so we
 * reach for a short-lived Neo4j driver using the same credentials the
 * main `InsightGraph` instance would have configured.
 *
 * Using a side driver keeps concurrency safe — the live InsightGraph
 * session stays dedicated to the pipeline — and avoids reaching into
 * the SDK's private Neo4jConnection.
 */
async function withUserNeo4jSession<T>(fn: (session: ReturnType<ReturnType<typeof neo4j.driver>['session']>) => Promise<T>): Promise<T> {
  const settings = getInsightGraphSettings()
  if (!settings.enabled) {
    throw new InsightGraphConfigError('Knowledge Graph is disabled in Settings.')
  }
  const driver = neo4j.driver(
    settings.neo4j.uri,
    neo4j.auth.basic(settings.neo4j.user, settings.neo4j.password),
  )
  const session = driver.session()
  try {
    return await fn(session)
  } finally {
    await session.close().catch(() => {})
    await driver.close().catch(() => {})
  }
}

export async function getEntitiesForReport(reportId: string): Promise<string[]> {
  return withUserNeo4jSession(async (session) => {
    // Try the standard relationship first, then a broader match using
    // any relationship between Entity and Report (SDK versions differ
    // in the exact relationship type they write).
    const result = await session.run(
      'MATCH (r:Report {report_id: $reportId})-[*1]-(e:Entity) ' +
        'RETURN DISTINCT coalesce(e.canonical_name, e.name) AS name',
      { reportId },
    )
    return result.records
      .map((r) => String(r.get('name') ?? ''))
      .filter((n) => n.length > 0)
  })
}

/**
 * Reports that share at least one entity with the given report, sorted by
 * overlap count. Powers the Related Rail (B4). Capped at 20 to keep the
 * UI snappy — shared-entity overlap is the important signal, not a long
 * tail.
 */
export async function getRelatedReports(reportId: string, limit = 20): Promise<RelatedReport[]> {
  return withUserNeo4jSession(async (session) => {
    const result = await session.run(
      'MATCH (r1:Report {report_id: $reportId})<-[:SOURCED_FROM]-(e:Entity)-[:SOURCED_FROM]->(r2:Report) ' +
        'WHERE r1 <> r2 ' +
        'WITH r2, collect(DISTINCT coalesce(e.canonical_name, e.name)) AS names ' +
        'RETURN r2.report_id AS reportId, r2.title AS title, r2.date AS date, ' +
        '       r2.source_path AS sourcePath, names AS sharedEntities, ' +
        '       size(names) AS sharedEntityCount ' +
        'ORDER BY sharedEntityCount DESC ' +
        'LIMIT $limit',
      { reportId, limit: neo4j.int(limit) },
    )
    return result.records.map((r) => ({
      reportId: String(r.get('reportId')),
      title: (r.get('title') as string | null) ?? undefined,
      date: (r.get('date') as string | null) ?? undefined,
      sourcePath: (r.get('sourcePath') as string | null) ?? undefined,
      sharedEntities: (r.get('sharedEntities') as string[]).filter(Boolean),
      sharedEntityCount: Number(r.get('sharedEntityCount') ?? 0),
    }))
  })
}

export function createSession(): Promise<string> {
  return getInstance().then((ig) => ig.createSession())
}

export async function shutdown(): Promise<void> {
  if (current) {
    try {
      await current.ig.close()
    } catch {
      // ignore
    }
    current = null
    initPromise = null
  }
}
