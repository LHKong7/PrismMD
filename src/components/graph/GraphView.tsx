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
  const currentFilePath = useFileStore((s) => s.currentFilePath)

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
          const storeReports = useInsightGraphStore.getState().reports
          const targetName = currentFilePath
            ? currentFilePath.split(/[/\\]/).pop()
            : undefined
          const matched =
            (targetName &&
              storeReports.find(
                (r) => r.filename === targetName || r.filePath === currentFilePath,
              )) ||
            storeReports[0]
          if (matched?.reportId) {
            const entitiesRes = await window.electronAPI.insightGraphEntitiesForReport(
              matched.reportId,
            )
            if (entitiesRes.ok && entitiesRes.data.length > 0) {
              result = (await window.electronAPI.insightGraphBuildSubgraphFromEntities(
                entitiesRes.data,
                { maxEntities: 120 },
              )) as typeof result
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
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        {status === 'loading' && <GraphStatus icon={<Loader2 size={14} className="animate-spin" />} label={t('graphView.loading')} />}
        {status === 'error' && (
          <GraphStatus
            icon={<AlertCircle size={14} className="text-red-500" />}
            label={`${t('graphView.error')}${error ? `: ${error}` : ''}`}
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
        {status === 'idle' && data && data.nodes.length > 0 && (
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
