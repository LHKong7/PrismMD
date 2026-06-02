/**
 * InsightGraph Service — direct Neo4j Cypher + internal AI extraction.
 *
 * Replaces the former @insightgraph/sdk-embedded dependency with:
 *   - Direct neo4j-driver Cypher queries for all graph operations
 *   - Internal AI service (sendOneShot) for entity extraction during ingest
 *
 * Exports the same functions the IPC handlers expect — zero renderer changes.
 */
import { BrowserWindow } from 'electron'
import crypto from 'crypto'
import neo4j, { type Driver, type Session } from 'neo4j-driver'
import { getActiveProvider, getInsightGraphSettings, loadSettings, type InsightGraphSettings } from './settingsStore'
import { agentWorker } from './agentWorkerManager'
import { getPage } from './documentService'

// ─── Error Types ────────────────────────────────────────────────────────────

class InsightGraphConfigError extends Error {
  constructor(message: string) { super(message); this.name = 'InsightGraphConfigError' }
}

// ─── Neo4j Connection ───────────────────────────────────────────────────────

let cachedDriver: Driver | null = null

function getDriver(): Driver {
  const settings = getInsightGraphSettings()
  if (!settings.enabled) throw new InsightGraphConfigError('Knowledge Graph is disabled in Settings.')
  const { uri, user, password } = settings.neo4j
  if (!uri) throw new InsightGraphConfigError('Neo4j URI is not configured.')
  if (cachedDriver) return cachedDriver
  cachedDriver = neo4j.driver(uri, neo4j.auth.basic(user, password))
  return cachedDriver
}

async function withSession<T>(fn: (session: Session) => Promise<T>): Promise<T> {
  const driver = getDriver()
  const session = driver.session()
  try {
    return await fn(session)
  } finally {
    await session.close().catch(() => {})
  }
}

// ─── Graph Types ────────────────────────────────────────────────────────────

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

export interface RelatedReport {
  reportId: string
  title?: string
  date?: string
  sourcePageId?: string
  sharedEntities: string[]
  sharedEntityCount: number
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function recordToObject(rec: neo4j.Record, key: string): Record<string, unknown> {
  const node = rec.get(key)
  if (!node) return {}
  return node.properties ? { ...node.properties, _elementId: node.elementId, _labels: node.labels } : {}
}

function coalesce(...vals: (unknown)[]): string {
  for (const v of vals) if (v != null && String(v).length > 0) return String(v)
  return ''
}

// ─── Public API: Connection ─────────────────────────────────────────────────

export async function testNeo4jConnection(
  uri: string, user: string, password: string,
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

// ─── Agent Helper (via worker thread) ──────────────────────────────────────

async function agentChat(systemPrompt: string, prompt: string): Promise<string> {
  const active = getActiveProvider()
  if (!active) throw new Error('No AI provider configured.')
  const settings = loadSettings()
  if (settings.privacyMode && active.provider !== 'ollama') {
    throw new Error('Privacy Mode is enabled. Only local models (Ollama) are allowed.')
  }
  const result = await agentWorker.chat({
    provider: active,
    systemPrompt,
    message: prompt,
  })
  return result.reply
}

async function agentChatJson<T>(systemPrompt: string, prompt: string, jsonSchema: Record<string, unknown>): Promise<T> {
  const fullSystemPrompt = [
    systemPrompt,
    'You MUST respond with a single valid JSON value and nothing else.',
    'Do not wrap the JSON in Markdown code fences. Do not add commentary.',
    'The response must conform to this shape:',
    JSON.stringify(jsonSchema, null, 2),
  ].join('\n\n')

  const reply = await agentChat(fullSystemPrompt, prompt)
  const stripped = reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
  try {
    return JSON.parse(stripped) as T
  } catch {
    throw new Error(`AI returned invalid JSON. Reply: ${reply.slice(0, 200)}...`)
  }
}

// ─── Public API: Ingest ─────────────────────────────────────────────────────

const EXTRACT_SYSTEM_PROMPT = `You are an expert knowledge graph extractor. Given a document, extract entities, relationships, claims, and events.

Return JSON with this exact shape:
{
  "title": "document title",
  "entities": [{ "name": "canonical name", "type": "Person|Organization|Concept|...", "description": "brief description" }],
  "relationships": [{ "source": "entity name", "target": "entity name", "type": "WORKS_FOR|LOCATED_IN|RELATED_TO|...", "description": "brief description" }],
  "claims": [{ "entity": "entity name", "text": "the claim text", "source_section": "section heading or context" }],
  "events": [{ "entity": "entity name", "date": "YYYY-MM-DD or approximate", "description": "event description" }]
}

Rules:
- Extract ALL significant entities (people, organizations, concepts, locations, products, technologies)
- Use canonical names (full proper names, not abbreviations)
- Deduplicate: if the same entity appears under different names, pick one canonical name
- Relationships should connect entities by name (must match entity names exactly)
- Claims are factual statements that could be verified or contradicted
- Events have dates (even approximate ones like "2024" or "early 2024")`

const EXTRACT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    entities: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string' }, description: { type: 'string' } }, required: ['name', 'type'] } },
    relationships: { type: 'array', items: { type: 'object', properties: { source: { type: 'string' }, target: { type: 'string' }, type: { type: 'string' }, description: { type: 'string' } }, required: ['source', 'target', 'type'] } },
    claims: { type: 'array', items: { type: 'object', properties: { entity: { type: 'string' }, text: { type: 'string' }, source_section: { type: 'string' } }, required: ['entity', 'text'] } },
    events: { type: 'array', items: { type: 'object', properties: { entity: { type: 'string' }, date: { type: 'string' }, description: { type: 'string' } }, required: ['entity', 'description'] } },
  },
  required: ['title', 'entities', 'relationships'],
}

interface ExtractedGraph {
  title: string
  entities: { name: string; type: string; description?: string }[]
  relationships: { source: string; target: string; type: string; description?: string }[]
  claims?: { entity: string; text: string; source_section?: string }[]
  events?: { entity: string; date?: string; description: string }[]
}

export async function ingestDocument(
  pageId: string,
  win?: BrowserWindow | null,
): Promise<Record<string, unknown>> {
  if (!pageId) throw new InsightGraphConfigError('No page ID provided.')

  const emit = (stage: string, extra?: Record<string, unknown>) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('insightgraph:progress', { stage, ...extra })
    }
  }

  // Phase 1: Parse — read the page content from the workspace DB.
  emit('parsing')
  const page = getPage(pageId)
  if (!page) throw new InsightGraphConfigError('Page not found.')
  const content = page.content
  const fileName = page.title || 'Untitled'
  const reportId = crypto.randomUUID()

  // Phase 2: Extract via AI
  emit('extracting')
  const truncated = content.slice(0, 12000) // cap to fit in context
  let extracted: ExtractedGraph
  try {
    extracted = await agentChatJson<ExtractedGraph>(
      EXTRACT_SYSTEM_PROMPT,
      `Extract a knowledge graph from this document:\n\n${truncated}`,
      EXTRACT_JSON_SCHEMA,
    )
  } catch (err) {
    emit('failed', { error: err instanceof Error ? err.message : String(err) })
    throw err
  }

  // Phase 3: Resolve (dedup is done by AI in the extraction step)
  emit('resolving')

  // Phase 4: Write to Neo4j
  emit('writing')
  try {
    await withSession(async (session) => {
      // Create report node
      await session.run(
        'CREATE (r:Report { report_id: $reportId, title: $title, source_page_id: $pageId, source_filename: $fileName, created_at: datetime() })',
        { reportId, title: extracted.title || fileName, pageId, fileName },
      )

      // Create entities + link to report
      for (const entity of extracted.entities) {
        await session.run(
          'MERGE (e:Entity { canonical_name: $name }) ' +
          'SET e.type = $type, e.description = $description ' +
          'WITH e ' +
          'MATCH (r:Report { report_id: $reportId }) ' +
          'MERGE (e)-[:SOURCED_FROM]->(r)',
          { name: entity.name, type: entity.type, description: entity.description ?? '', reportId },
        )
      }

      // Create relationships
      for (const rel of extracted.relationships) {
        await session.run(
          'MATCH (a:Entity { canonical_name: $source }) ' +
          'MATCH (b:Entity { canonical_name: $target }) ' +
          'MERGE (a)-[r:RELATES_TO { type: $type }]->(b) ' +
          'SET r.description = $description',
          { source: rel.source, target: rel.target, type: rel.type, description: rel.description ?? '' },
        )
      }

      // Create claims
      for (const claim of extracted.claims ?? []) {
        await session.run(
          'MATCH (e:Entity { canonical_name: $entity }) ' +
          'CREATE (e)-[:HAS_CLAIM]->(c:Claim { text: $text, source_section: $section, report_id: $reportId })',
          { entity: claim.entity, text: claim.text, section: claim.source_section ?? '', reportId },
        )
      }

      // Create events
      for (const event of extracted.events ?? []) {
        await session.run(
          'MATCH (e:Entity { canonical_name: $entity }) ' +
          'CREATE (e)-[:HAS_EVENT]->(ev:Event { description: $description, date: $date, report_id: $reportId })',
          { entity: event.entity, description: event.description, date: event.date ?? '', reportId },
        )
      }
    })
  } catch (err) {
    emit('failed', { error: err instanceof Error ? err.message : String(err) })
    throw err
  }

  emit('completed', { reportId })
  return {
    reportId,
    title: extracted.title,
    entities: extracted.entities.length,
    relationships: extracted.relationships.length,
    claims: (extracted.claims ?? []).length,
  }
}

// ─── Public API: Query ──────────────────────────────────────────────────────

export async function graphQuery(
  question: string,
  sessionId?: string,
): Promise<Record<string, unknown>> {
  // Search for relevant entities/claims
  const context = await withSession(async (session) => {
    const result = await session.run(
      'MATCH (e:Entity) ' +
      'WHERE toLower(e.canonical_name) CONTAINS toLower($q) OR toLower(coalesce(e.description, "")) CONTAINS toLower($q) ' +
      'OPTIONAL MATCH (e)-[:HAS_CLAIM]->(c:Claim) ' +
      'RETURN e.canonical_name AS name, e.type AS type, e.description AS desc, collect(c.text)[0..3] AS claims ' +
      'LIMIT 10',
      { q: question },
    )
    return result.records.map((r) => ({
      name: r.get('name'),
      type: r.get('type'),
      description: r.get('desc'),
      claims: r.get('claims'),
    }))
  })

  if (context.length === 0) {
    return { answer: 'No relevant entities found in the knowledge graph for this query.', evidence: [], confidence: 0 }
  }

  // Build context string
  const contextStr = context.map((e, i) =>
    `[${i + 1}] ${e.name} (${e.type ?? 'Unknown'}): ${e.description ?? ''}${e.claims?.length ? '\n  Claims: ' + e.claims.join('; ') : ''}`,
  ).join('\n')

  // Ask AI
  const answer = await agentChat(
    'You are a knowledge graph assistant. Answer the question using ONLY the provided graph context. Cite evidence with bracketed numbers [N].',
    `Graph context:\n${contextStr}\n\nQuestion: ${question}`,
  )

  const evidence = context.map((e, i) => ({ index: i + 1, text: `${e.name}: ${e.description ?? ''}`, source: e.name }))
  return { answer, evidence, keyFindings: [], confidence: context.length > 3 ? 0.8 : 0.5 }
}

// ─── Public API: Read Operations ────────────────────────────────────────────

export async function listReports(): Promise<Record<string, unknown>[]> {
  return withSession(async (session) => {
    const result = await session.run(
      'MATCH (r:Report) RETURN r ORDER BY r.created_at DESC',
    )
    return result.records.map((rec) => recordToObject(rec, 'r'))
  })
}

export async function getReport(reportId: string): Promise<Record<string, unknown> | null> {
  return withSession(async (session) => {
    const result = await session.run('MATCH (r:Report { report_id: $id }) RETURN r', { id: reportId })
    return result.records.length > 0 ? recordToObject(result.records[0], 'r') : null
  })
}

export async function findEntities(
  query: { name?: string; type?: string; limit?: number } = {},
): Promise<Record<string, unknown>[]> {
  return withSession(async (session) => {
    const conditions: string[] = []
    const params: Record<string, unknown> = { limit: neo4j.int(query.limit ?? 100) }
    if (query.name) { conditions.push('e.canonical_name =~ $pattern'); params.pattern = `(?i).*${query.name}.*` }
    if (query.type) { conditions.push('e.type = $type'); params.type = query.type }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const result = await session.run(`MATCH (e:Entity) ${where} RETURN e LIMIT $limit`, params)
    return result.records.map((rec) => recordToObject(rec, 'e'))
  })
}

export async function getEntity(entityId: string): Promise<Record<string, unknown> | null> {
  return withSession(async (session) => {
    const result = await session.run('MATCH (e:Entity) WHERE elementId(e) = $id RETURN e', { id: entityId })
    return result.records.length > 0 ? recordToObject(result.records[0], 'e') : null
  })
}

export async function getEntityProfile(entityName: string): Promise<Record<string, unknown>> {
  return withSession(async (session) => {
    const result = await session.run('MATCH (e:Entity { canonical_name: $name }) RETURN e', { name: entityName })
    return result.records.length > 0 ? recordToObject(result.records[0], 'e') : { name: entityName }
  })
}

export async function getClaimsAbout(entityName: string): Promise<Record<string, unknown>[]> {
  return withSession(async (session) => {
    const result = await session.run(
      'MATCH (e:Entity { canonical_name: $name })-[:HAS_CLAIM]->(c:Claim) RETURN c',
      { name: entityName },
    )
    return result.records.map((rec) => recordToObject(rec, 'c'))
  })
}

export async function getEntityMetrics(entityName: string): Promise<Record<string, unknown>[]> {
  return withSession(async (session) => {
    const result = await session.run(
      'MATCH (e:Entity { canonical_name: $name })-[:HAS_METRIC]->(m:Metric) RETURN m',
      { name: entityName },
    )
    return result.records.map((rec) => recordToObject(rec, 'm'))
  })
}

export async function getMetricHistory(metricName: string, entityName?: string): Promise<Record<string, unknown>[]> {
  return withSession(async (session) => {
    const cypher = entityName
      ? 'MATCH (e:Entity { canonical_name: $entity })-[:HAS_METRIC]->(m:Metric { name: $metric }) RETURN m ORDER BY m.date'
      : 'MATCH (m:Metric { name: $metric }) RETURN m ORDER BY m.date'
    const params: Record<string, unknown> = { metric: metricName }
    if (entityName) params.entity = entityName
    const result = await session.run(cypher, params)
    return result.records.map((rec) => recordToObject(rec, 'm'))
  })
}

export async function findEvidenceForClaim(claimId: string): Promise<Record<string, unknown>[]> {
  return withSession(async (session) => {
    const result = await session.run(
      'MATCH (c:Claim)-[:SOURCED_FROM]->(e:Evidence) WHERE elementId(c) = $id RETURN e',
      { id: claimId },
    )
    return result.records.map((rec) => recordToObject(rec, 'e'))
  })
}

export async function getSubgraph(
  nodeId: string, depth = 2,
): Promise<{ nodes: unknown[]; edges: unknown[] }> {
  return withSession(async (session) => {
    const result = await session.run(
      'MATCH (n) WHERE elementId(n) = $id MATCH p = (n)-[*0..' + depth + ']-(m) ' +
      'UNWIND nodes(p) AS node UNWIND relationships(p) AS rel ' +
      'RETURN DISTINCT node, rel',
      { id: nodeId },
    )
    const nodesMap = new Map<string, Record<string, unknown>>()
    const edgesMap = new Map<string, Record<string, unknown>>()
    for (const rec of result.records) {
      const node = rec.get('node')
      if (node?.elementId) nodesMap.set(node.elementId, { ...node.properties, elementId: node.elementId, labels: node.labels })
      const rel = rec.get('rel')
      if (rel?.elementId) edgesMap.set(rel.elementId, { ...rel.properties, elementId: rel.elementId, type: rel.type, start: rel.startNodeElementId, end: rel.endNodeElementId })
    }
    return { nodes: Array.from(nodesMap.values()), edges: Array.from(edgesMap.values()) }
  })
}

export async function getEntityRelationships(entityName: string): Promise<Record<string, unknown>[]> {
  return withSession(async (session) => {
    const result = await session.run(
      'MATCH (e:Entity { canonical_name: $name })-[rel]-(peer:Entity) ' +
      'RETURN peer.canonical_name AS relatedEntityName, coalesce(peer.type, peer.entity_type) AS relatedEntityType, ' +
      'type(rel) AS relationshipType, coalesce(rel.type, type(rel)) AS relType, rel.description AS relDesc',
      { name: entityName },
    )
    return result.records.map((rec) => ({
      relatedEntityName: rec.get('relatedEntityName'),
      relatedEntityType: rec.get('relatedEntityType'),
      relationshipType: rec.get('relationshipType'),
      type: rec.get('relType'),
      description: rec.get('relDesc'),
    }))
  })
}

export async function findPath(
  entityA: string, entityB: string, maxDepth = 5,
): Promise<{ nodes: unknown[]; edges: unknown[]; found: boolean }> {
  return withSession(async (session) => {
    const result = await session.run(
      'MATCH (a:Entity { canonical_name: $a }), (b:Entity { canonical_name: $b }) ' +
      'MATCH p = shortestPath((a)-[*..${maxDepth}]-(b)) RETURN p',
      { a: entityA, b: entityB },
    )
    if (result.records.length === 0) return { nodes: [], edges: [], found: false }
    const p = result.records[0].get('p')
    const nodes = p.segments.map((s: { start: unknown }) => s.start).concat(p.end)
    const edges = p.segments.map((s: { relationship: unknown }) => s.relationship)
    return { nodes, edges, found: true }
  })
}

export async function compareEntityAcrossReports(entityName: string): Promise<Record<string, unknown>> {
  return withSession(async (session) => {
    const result = await session.run(
      'MATCH (e:Entity { canonical_name: $name })-[:SOURCED_FROM]->(r:Report) ' +
      'OPTIONAL MATCH (e)-[:HAS_CLAIM]->(c:Claim { report_id: r.report_id }) ' +
      'RETURN r.report_id AS reportId, r.title AS title, collect(c.text) AS claims',
      { name: entityName },
    )
    const reports = result.records.map((rec) => ({
      reportId: rec.get('reportId'),
      title: rec.get('title'),
      claims: rec.get('claims'),
    }))
    return { entity: entityName, reports }
  })
}

export async function findMetricTrend(entityName: string, metricName: string): Promise<Record<string, unknown>> {
  return withSession(async (session) => {
    const result = await session.run(
      'MATCH (e:Entity { canonical_name: $entity })-[:HAS_METRIC]->(m:Metric { name: $metric }) ' +
      'RETURN m ORDER BY m.date',
      { entity: entityName, metric: metricName },
    )
    return { entity: entityName, metric: metricName, dataPoints: result.records.map((rec) => recordToObject(rec, 'm')) }
  })
}

export async function findContradictions(entityName: string): Promise<Record<string, unknown>[]> {
  return withSession(async (session) => {
    const result = await session.run(
      'MATCH (e:Entity { canonical_name: $name })-[:HAS_CLAIM]->(c:Claim) ' +
      'WHERE c.contradicts IS NOT NULL ' +
      'RETURN c',
      { name: entityName },
    )
    return result.records.map((rec) => recordToObject(rec, 'c'))
  })
}

export async function entityTimeline(entityName: string): Promise<Record<string, unknown>[]> {
  return withSession(async (session) => {
    const result = await session.run(
      'MATCH (e:Entity { canonical_name: $name })-[:HAS_EVENT]->(ev:Event) RETURN ev ORDER BY ev.date',
      { name: entityName },
    )
    return result.records.map((rec) => recordToObject(rec, 'ev'))
  })
}

// ─── Public API: Composite Graph Queries ────────────────────────────────────

function normalizeEntity(raw: Record<string, unknown> | unknown): RenderedGraphNode | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const props = (r.properties as Record<string, unknown> | undefined) ?? r
  const name = coalesce(props.canonical_name, props.name, props.entityName, r.canonical_name, r.name)
  const id = coalesce(r.elementId, r.id, r.identity, props.id, props.entity_id, props.entityId, name ? `name:${name}` : '')
  if (!id || !name) return null
  const type = coalesce(props.type, props.entity_type, r.type, Array.isArray(r.labels) ? r.labels[0] : '') || undefined
  return { id, name, type, ...props }
}

export async function buildSubgraphFromEntities(
  entityNames: string[],
  opts: { maxEntities?: number } = {},
): Promise<RenderedGraph> {
  const cap = opts.maxEntities ?? 120
  const names = Array.from(new Set(entityNames)).slice(0, cap)
  const nodesByName = new Map<string, RenderedGraphNode>()
  const edges = new Map<string, RenderedGraphEdge>()

  function ensureNode(name: string, type?: string): string {
    const id = `name:${name}`
    if (!nodesByName.has(name)) nodesByName.set(name, { id, name, type })
    return id
  }

  // Seed nodes from Neo4j
  await withSession(async (session) => {
    const result = await session.run(
      'MATCH (e:Entity) WHERE coalesce(e.canonical_name, e.name) IN $names ' +
      'RETURN coalesce(e.canonical_name, e.name) AS name, coalesce(e.type, e.entity_type) AS type LIMIT $limit',
      { names, limit: neo4j.int(cap) },
    )
    for (const rec of result.records) {
      const name = String(rec.get('name') ?? '')
      const type = (rec.get('type') as string | null) ?? undefined
      if (name) ensureNode(name, type)
    }
  }).catch(() => {})

  // Ensure all requested names have a node
  for (const name of names) ensureNode(name)

  // Fetch relationships
  await withSession(async (session) => {
    const nodeNames = Array.from(nodesByName.keys())
    const result = await session.run(
      'MATCH (a:Entity)-[rel]->(b:Entity) ' +
      'WHERE coalesce(a.canonical_name, a.name) IN $names ' +
      'OR coalesce(b.canonical_name, b.name) IN $names ' +
      'RETURN coalesce(a.canonical_name, a.name) AS src, coalesce(b.canonical_name, b.name) AS tgt, type(rel) AS relType ' +
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
  }).catch(() => {})

  return { nodes: Array.from(nodesByName.values()), edges: Array.from(edges.values()) }
}

export async function getEntityEgoGraph(entityName: string, depth = 2): Promise<RenderedGraph> {
  return buildSubgraphFromEntities([entityName])
}

export async function getGlobalGraph(maxEntities = 80): Promise<RenderedGraph> {
  const names = await withSession(async (session) => {
    const result = await session.run(
      'MATCH (e:Entity) RETURN coalesce(e.canonical_name, e.name) AS name LIMIT $limit',
      { limit: neo4j.int(maxEntities) },
    )
    return result.records.map((rec) => String(rec.get('name') ?? '')).filter((n) => n.length > 0)
  })
  return buildSubgraphFromEntities(names, { maxEntities })
}

export async function getEntitiesForReport(reportId: string): Promise<string[]> {
  return withSession(async (session) => {
    const result = await session.run(
      'MATCH (r:Report { report_id: $reportId })-[*1]-(e:Entity) ' +
      'RETURN DISTINCT coalesce(e.canonical_name, e.name) AS name',
      { reportId },
    )
    return result.records.map((r) => String(r.get('name') ?? '')).filter((n) => n.length > 0)
  })
}

export async function getRelatedReports(reportId: string, limit = 20): Promise<RelatedReport[]> {
  return withSession(async (session) => {
    const result = await session.run(
      'MATCH (r1:Report { report_id: $reportId })<-[:SOURCED_FROM]-(e:Entity)-[:SOURCED_FROM]->(r2:Report) ' +
      'WHERE r1 <> r2 ' +
      'WITH r2, collect(DISTINCT coalesce(e.canonical_name, e.name)) AS names ' +
      'RETURN r2.report_id AS reportId, r2.title AS title, r2.date AS date, ' +
      'r2.source_page_id AS sourcePageId, names AS sharedEntities, size(names) AS sharedEntityCount ' +
      'ORDER BY sharedEntityCount DESC LIMIT $limit',
      { reportId, limit: neo4j.int(limit) },
    )
    return result.records.map((r) => ({
      reportId: String(r.get('reportId')),
      title: (r.get('title') as string | null) ?? undefined,
      date: (r.get('date') as string | null) ?? undefined,
      sourcePageId: (r.get('sourcePageId') as string | null) ?? undefined,
      sharedEntities: (r.get('sharedEntities') as string[]).filter(Boolean),
      sharedEntityCount: Number(r.get('sharedEntityCount') ?? 0),
    }))
  })
}

// ─── Public API: Session & Lifecycle ────────────────────────────────────────

const sessions = new Map<string, string[]>()

export function createSession(): Promise<string> {
  const id = crypto.randomUUID()
  sessions.set(id, [])
  return Promise.resolve(id)
}

export async function shutdown(): Promise<void> {
  if (cachedDriver) {
    try { await cachedDriver.close() } catch { /* ignore */ }
    cachedDriver = null
  }
  sessions.clear()
}
