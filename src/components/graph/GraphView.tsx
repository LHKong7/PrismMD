import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore, type GraphScope } from '../../store/uiStore'
import { useInsightGraphStore } from '../../store/insightGraphStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useFileStore } from '../../store/fileStore'
import { Loader2, Network, AlertCircle, Globe, FileText, Target, BookOpen } from 'lucide-react'
import ForceGraph2D from 'react-force-graph-2d'
// NOTE: the force-graph library extends the node objects with simulation
// fields (x, y, vx, …) at runtime — we keep our schema wide (any extra
// props allowed) to play nice with that.

export interface GraphNode {
  id: string
  name: string
  type?: string
  [key: string]: unknown
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  type?: string
  [key: string]: unknown
}

interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/**
 * GraphView — a force-directed canvas that visualises the InsightGraph
 * knowledge graph. Fills the center of AppShell whenever
 * `uiStore.mainViewMode === 'graph'`.
 *
 * Scope selector:
 *   - **Global**   — top N entities + their immediate neighborhoods.
 *   - **Document** — reserved (needs report→entities mapping; currently
 *                    falls back to "recent reports" → entities).
 *   - **Entity**   — ego-network around `uiStore.focusedEntityName`.
 *
 * Clicking a node pins it as the focused entity, which also flips the
 * right sidebar to the Entity tab (handled in uiStore.focusEntity).
 */
export function GraphView() {
  const { t } = useTranslation()
  const scope = useUIStore((s) => s.graphScope)
  const setScope = useUIStore((s) => s.setGraphScope)
  const focusedEntity = useUIStore((s) => s.focusedEntityName)
  const focusEntity = useUIStore((s) => s.focusEntity)
  const insightGraphEnabled = useSettingsStore((s) => s.insightGraph.enabled)
  const reports = useInsightGraphStore((s) => s.reports)
  const refreshReports = useInsightGraphStore((s) => s.refreshReports)
  const ingestStage = useInsightGraphStore((s) => s.ingest.stage)
  const currentFilePath = useFileStore((s) => s.currentFilePath)

  // One-shot guard: right after an ingest completes, if the user hasn't
  // manually chosen a scope and we can't match the current file to a report,
  // auto-switch to Global so the newly-built graph is visible instead of
  // an empty Document view.
  const autoScopedRef = useRef(false)
  // When autoScopedRef fires we also flip this so the user sees a
  // dismissible banner — otherwise the scope change happens silently
  // and the user has no idea why they're suddenly in Global.
  const [autoScopeNotice, setAutoScopeNotice] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })
  const [data, setData] = useState<GraphData | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'empty'>('idle')
  const [error, setError] = useState<string | null>(null)

  // Track container size so the canvas always fills the available space.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Load graph data whenever scope or focus changes.
  useEffect(() => {
    let cancelled = false
    if (!insightGraphEnabled) {
      setStatus('empty')
      setData(null)
      return
    }

    const load = async () => {
      setStatus('loading')
      setError(null)
      try {
        let result:
          | { ok: true; data: GraphData }
          | { ok: false; error: string }
          | null = null

        if (scope === 'global') {
          result = (await window.electronAPI.insightGraphGlobalGraph(120)) as typeof result
        } else if (scope === 'entity' && focusedEntity) {
          result = (await window.electronAPI.insightGraphEntityEgoGraph(
            focusedEntity,
            2,
          )) as typeof result
        } else if (scope === 'document') {
          // Resolve the Neo4j report matching the currently-open file (by
          // filename — Neo4j stores `Report.source_filename`, and the SDK
          // writes its own `report_id` that doesn't line up with the UUID
          // the ingest response returns). Fall back to the most recent
          // report, then to the bounded global graph.
          //
          // NOTE: we read from the reactive `reports` (captured by the
          // effect's deps below) so the effect re-runs when ingest finishes
          // and this branch sees the freshly-loaded reports.
          const targetName = currentFilePath
            ? currentFilePath.split(/[/\\]/).pop()
            : undefined
          const matched =
            (targetName &&
              reports.find(
                (r) => r.filename === targetName || r.filePath === currentFilePath,
              )) ||
            reports[0]
          if (matched?.reportId) {
            const entitiesRes = await window.electronAPI.insightGraphEntitiesForReport(
              matched.reportId,
            )
            if (entitiesRes.ok && entitiesRes.data.length > 0) {
              const sub = (await window.electronAPI.insightGraphBuildSubgraphFromEntities(
                entitiesRes.data,
                { maxEntities: 120 },
              )) as typeof result
              // Only accept the subgraph if it actually has nodes; a matched
              // report with zero returned entity-nodes (e.g. stale Cypher
              // names, SDK dedup edge-cases) shouldn't blank out the canvas
              // — fall through to the global fallback below.
              if (sub && sub.ok && sub.data.nodes.length > 0) {
                result = sub
              }
            } else if (!entitiesRes.ok) {
              result = entitiesRes as typeof result
            }
          }
          if (!result) {
            result = (await window.electronAPI.insightGraphGlobalGraph(60)) as typeof result
          }
        }

        if (cancelled) return

        if (!result) {
          setStatus('empty')
          setData(null)
          return
        }
        if (!result.ok) {
          setError(result.error)
          setStatus('error')
          return
        }
        const payload = result.data
        if (!payload.nodes.length) {
          setStatus('empty')
          setData({ nodes: [], edges: [] })
          return
        }
        setData(payload)
        setStatus('idle')
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setStatus('error')
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [scope, focusedEntity, insightGraphEnabled, reports, currentFilePath])

  // Make sure reports are fresh — helps the empty state tell the user
  // whether they've ingested anything yet.
  useEffect(() => {
    if (insightGraphEnabled) refreshReports()
  }, [insightGraphEnabled, refreshReports])

  // Right after a successful ingest, if the user is sitting in Document
  // scope with no file open that matches a report, pop them into Global so
  // they actually see the graph that was just built. One-shot — we never
  // override the user's subsequent scope choice.
  useEffect(() => {
    if (autoScopedRef.current) return
    if (ingestStage !== 'completed') return
    if (scope !== 'document') return
    const targetName = currentFilePath
      ? currentFilePath.split(/[/\\]/).pop()
      : undefined
    const matched =
      targetName &&
      reports.find(
        (r) => r.filename === targetName || r.filePath === currentFilePath,
      )
    if (!matched && reports.length > 0) {
      autoScopedRef.current = true
      setScope('global')
      setAutoScopeNotice(true)
      // Auto-dismiss the notice so the user isn't left with stale chrome.
      window.setTimeout(() => setAutoScopeNotice(false), 6000)
    }
  }, [ingestStage, scope, reports, currentFilePath, setScope])

  // Map the SDK's edge shape (source/target strings) to whatever
  // react-force-graph expects on `graphData.links`.
  const graphData = useMemo(() => {
    if (!data) return { nodes: [], links: [] }
    return {
      nodes: data.nodes,
      links: data.edges.map((e) => ({ ...e })),
    }
  }, [data])

  const nodeTypeColor = useMemo(
    () => makeNodeTypeColorizer(data?.nodes ?? []),
    [data],
  )

  const handleNodeClick = (node: unknown) => {
    const n = node as GraphNode
    if (!n?.name) return
    focusEntity(n.name)
    // Don't flip scope automatically — the user may be in Global and
    // still want to see the wider graph.
  }

  return (
    <div
      className="h-full flex flex-col"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {/* Scope switcher */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <Network size={14} style={{ color: 'var(--accent-color)' }} />
        <span className="text-xs font-semibold uppercase tracking-wider mr-3" style={{ color: 'var(--text-muted)' }}>
          {t('graphView.title')}
        </span>

        <ScopeButton active={scope === 'global'} onClick={() => setScope('global')} icon={<Globe size={12} />}>
          {t('graphView.scope.global')}
        </ScopeButton>
        <ScopeButton active={scope === 'document'} onClick={() => setScope('document')} icon={<FileText size={12} />}>
          {t('graphView.scope.document')}
        </ScopeButton>
        <ScopeButton
          active={scope === 'entity'}
          disabled={!focusedEntity}
          onClick={() => focusedEntity && setScope('entity')}
          icon={<Target size={12} />}
        >
          {focusedEntity ? `${t('graphView.scope.entity')}: ${focusedEntity}` : t('graphView.scope.entity')}
        </ScopeButton>

        <div className="flex-1" />
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {data ? t('graphView.counts', { nodes: data.nodes.length, edges: data.edges.length }) : ''}
        </span>
      </div>

      {/* Canvas */}
      {autoScopeNotice && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 text-[11px] border-b"
          style={{
            borderColor: 'var(--border-color)',
            backgroundColor: 'color-mix(in srgb, var(--accent-color) 10%, transparent)',
            color: 'var(--text-primary)',
          }}
          role="status"
        >
          <Globe size={11} style={{ color: 'var(--accent-color)' }} />
          <span className="flex-1">{t('graphView.autoScopedToGlobal')}</span>
          <button
            onClick={() => setAutoScopeNotice(false)}
            className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
            aria-label={t('common.dismiss')}
            title={t('common.dismiss')}
          >
            <span aria-hidden>×</span>
          </button>
        </div>
      )}

      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        {status === 'loading' && <GraphStatus icon={<Loader2 size={14} className="animate-spin" />} label={t('graphView.loading')} />}
        {status === 'error' && (
          <GraphStatus
            icon={<AlertCircle size={14} className="text-red-500" />}
            label={classifyGraphError(error, t)}
            tone="error"
          />
        )}
        {status === 'empty' && (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center">
            <div className="max-w-md">
              <BookOpen
                size={32}
                className="mx-auto mb-3"
                style={{ color: 'var(--text-muted)' }}
              />
              <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                {insightGraphEnabled ? t('graphView.empty.title') : t('graphView.disabled.title')}
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {insightGraphEnabled
                  ? reports.length > 0
                    ? t('graphView.empty.body')
                    : t('graphView.empty.noReports')
                  : t('graphView.disabled.body')}
              </p>
            </div>
          </div>
        )}
        {status === 'idle' && data && data.nodes.length > 0 && size.width > 0 && size.height > 0 && (
          <ForceGraph2D
            width={size.width}
            height={size.height}
            graphData={graphData}
            backgroundColor="transparent"
            nodeId="id"
            nodeLabel={(n) => `${(n as GraphNode).name}${(n as GraphNode).type ? ` · ${(n as GraphNode).type}` : ''}`}
            nodeRelSize={5}
            nodeColor={(n) => nodeTypeColor((n as GraphNode).type)}
            linkColor={() => 'rgba(128,128,128,0.35)'}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={1}
            linkLabel={(l) => String((l as GraphEdge).type ?? '')}
            onNodeClick={handleNodeClick}
            cooldownTicks={80}
            nodeCanvasObjectMode={() => 'after'}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const n = node as GraphNode & { x?: number; y?: number }
              if (n.x === undefined || n.y === undefined) return
              const label = n.name
              const fontSize = 12 / globalScale
              ctx.font = `${fontSize}px sans-serif`
              ctx.textAlign = 'center'
              ctx.textBaseline = 'top'
              ctx.fillStyle = 'rgba(128,128,128,0.95)'
              ctx.fillText(label, n.x, n.y + 8)
            }}
          />
        )}
      </div>
    </div>
  )
}

function ScopeButton({
  active,
  disabled,
  onClick,
  icon,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        backgroundColor: active ? 'var(--accent-color)' : 'transparent',
        color: active ? '#fff' : 'var(--text-secondary)',
        border: '1px solid var(--border-color)',
      }}
    >
      {icon}
      {children}
    </button>
  )
}

function GraphStatus({
  icon,
  label,
  tone,
}: {
  icon: React.ReactNode
  label: string
  tone?: 'error'
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div
        className="flex items-center gap-2 text-xs"
        style={{ color: tone === 'error' ? '#ef4444' : 'var(--text-muted)' }}
      >
        {icon}
        <span>{label}</span>
      </div>
    </div>
  )
}

/**
 * Turn a raw Neo4j / SDK error string into an actionable, translated
 * message. Keeps the original as a fallback so power users can still
 * see the underlying cause.
 */
function classifyGraphError(raw: string | null, t: (key: string, vars?: Record<string, unknown>) => string): string {
  const base = t('graphView.error')
  if (!raw) return base
  const msg = raw.toLowerCase()
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return `${base}: ${t('graphView.errorOffline')}`
  }
  if (
    msg.includes('authentication') ||
    msg.includes('unauthorized') ||
    msg.includes('neo.clienterror.security')
  ) {
    return `${base}: ${t('graphView.errorAuth')}`
  }
  if (
    msg.includes('econnrefused') ||
    msg.includes('connection refused') ||
    msg.includes('could not perform discovery') ||
    msg.includes('service unavailable') ||
    msg.includes('routing')
  ) {
    return `${base}: ${t('graphView.errorUnreachable')}`
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return `${base}: ${t('graphView.errorTimeout')}`
  }
  return `${base}: ${raw}`
}

/**
 * Stable palette keyed by entity type. A deterministic hash keeps the
 * same entity type the same color across renders without requiring the
 * user to pre-register types.
 */
function makeNodeTypeColorizer(nodes: GraphNode[]) {
  const palette = [
    '#6366f1', // indigo
    '#10b981', // emerald
    '#f59e0b', // amber
    '#ef4444', // red
    '#0ea5e9', // sky
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#14b8a6', // teal
  ]
  const fallback = '#94a3b8'
  const seen = new Set<string>()
  for (const n of nodes) if (n.type) seen.add(n.type)
  const types = Array.from(seen)
  return (type?: string): string => {
    if (!type) return fallback
    const idx = types.indexOf(type)
    if (idx < 0) return fallback
    return palette[idx % palette.length]
  }
}
