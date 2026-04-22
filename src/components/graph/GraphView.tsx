import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore, type GraphScope } from '../../store/uiStore'
import { useInsightGraphStore } from '../../store/insightGraphStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useFileStore } from '../../store/fileStore'
import { Network, AlertCircle, Globe, FileText, Target, BookOpen } from 'lucide-react'
import ForceGraph2D from 'react-force-graph-2d'
import { Spinner } from '../ui/Spinner'
import { graphPalette } from '../../lib/theme/tokens'
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
 *   - **Document** — entities extracted from the currently-open file only.
 *   - **Global**   — merged view of all ingested documents (opt-in).
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
  const currentFilePath = useFileStore((s) => s.currentFilePath)

  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })
  const [data, setData] = useState<GraphData | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'empty'>('idle')
  const [error, setError] = useState<string | null>(null)
  // Toggle legend off — collapsed by default so it doesn't cover canvas
  // on smaller windows, but persists in component state per session.
  const [legendOpen, setLegendOpen] = useState(true)
  // Surface "still connecting…" if a load takes unusually long. Neo4j
  // Bolt can hang on bad URIs without throwing, so without this the
  // spinner appears to spin forever.
  const [slowLoad, setSlowLoad] = useState(false)

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

    setSlowLoad(false)
    // 12s gives a healthy Neo4j a comfortable margin while still
    // catching hangs on dead Bolt endpoints. We don't abort the request
    // — just inform the user — because the underlying SDK has its own
    // timeout that eventually surfaces as an error.
    const slowTimer = window.setTimeout(() => {
      if (!cancelled) setSlowLoad(true)
    }, 12_000)

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
          // the ingest response returns). No fallback — only show this
          // document's own graph.
          const targetName = currentFilePath
            ? currentFilePath.split(/[/\\]/).pop()
            : undefined
          const matched = targetName
            ? reports.find(
                (r) => r.filename === targetName || r.filePath === currentFilePath,
              )
            : undefined
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
          // No fallback to global — document scope shows only this
          // document's graph.  The user must explicitly switch to Global.
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

    load().finally(() => {
      window.clearTimeout(slowTimer)
      if (!cancelled) setSlowLoad(false)
    })
    return () => {
      cancelled = true
      window.clearTimeout(slowTimer)
    }
  }, [scope, focusedEntity, insightGraphEnabled, reports, currentFilePath])

  // Make sure reports are fresh — helps the empty state tell the user
  // whether they've ingested anything yet.
  useEffect(() => {
    if (insightGraphEnabled) refreshReports()
  }, [insightGraphEnabled, refreshReports])

  // No auto-scope-to-global — the user stays in Document scope after
  // ingest and must explicitly click Global to see the merged graph.

  // Map the SDK's edge shape (source/target strings) to whatever
  // react-force-graph expects on `graphData.links`. Filter out any
  // links whose source/target doesn't exist in the node set — dangling
  // refs crash the force simulation.
  const graphData = useMemo(() => {
    if (!data) return { nodes: [], links: [] }
    const nodeIds = new Set(data.nodes.map((n) => n.id))
    return {
      nodes: data.nodes,
      links: data.edges
        .map((e) => ({ ...e }))
        .filter((e) => nodeIds.has(String(e.source)) && nodeIds.has(String(e.target))),
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
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        {status === 'loading' && (
          <GraphStatus
            icon={<Spinner size={14} />}
            label={slowLoad ? t('graphView.loadingSlow') : t('graphView.loading')}
          />
        )}
        {status === 'error' && (
          <GraphStatus
            icon={<AlertCircle size={14} className="text-error" />}
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
        {/* Legend — collapsible overlay so users can map node colour to
            entity type without trial-and-error hovering. */}
        {status === 'idle' && data && data.nodes.length > 0 && (
          <GraphLegend
            nodes={data.nodes}
            colorize={nodeTypeColor}
            open={legendOpen}
            onToggle={() => setLegendOpen((v) => !v)}
            label={t('graphView.legendTitle')}
            collapseLabel={t('graphView.legendHide')}
            expandLabel={t('graphView.legendShow')}
          />
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

function GraphLegend({
  nodes,
  colorize,
  open,
  onToggle,
  label,
  collapseLabel,
  expandLabel,
}: {
  nodes: GraphNode[]
  colorize: (type?: string) => string
  open: boolean
  onToggle: () => void
  label: string
  collapseLabel: string
  expandLabel: string
}) {
  // Derive unique entity types from the current dataset so the legend
  // only shows colors that actually appear on screen.
  const types = useMemo(() => {
    const set = new Set<string>()
    for (const n of nodes) if (n.type) set.add(n.type)
    return Array.from(set).sort()
  }, [nodes])

  if (types.length === 0) return null

  return (
    <div
      className="absolute bottom-3 right-3 z-10 max-w-[200px] text-[11px] rounded-md border shadow-sm"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
        borderColor: 'var(--border-color)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
        style={{ color: 'var(--text-secondary)' }}
        aria-label={open ? collapseLabel : expandLabel}
        aria-expanded={open}
      >
        <span className="font-semibold uppercase tracking-wider text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {label}
        </span>
        <span aria-hidden style={{ color: 'var(--text-muted)' }}>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <ul className="px-2.5 pb-2 space-y-1 max-h-48 overflow-y-auto">
          {types.map((type) => (
            <li key={type} className="flex items-center gap-2">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: colorize(type) }}
              />
              <span className="truncate" style={{ color: 'var(--text-secondary)' }} title={type}>
                {type}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
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
        style={{ color: tone === 'error' ? 'var(--color-error)' : 'var(--text-muted)' }}
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
  // Intentionally stable across themes — users memorize "red = conflicts"
  // etc., and swapping hues on theme change would break that mental model.
  const palette = graphPalette
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
