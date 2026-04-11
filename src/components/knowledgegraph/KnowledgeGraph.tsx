import { useState, useEffect, useRef, useMemo } from 'react'
import { X, Maximize2, Minimize2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useFileStore } from '../../store/fileStore'
import type { FileTreeNode } from '../../types/electron'

interface GraphNode {
  id: string
  label: string
  x: number
  y: number
  isActive: boolean
}

interface GraphEdge {
  source: string
  target: string
}

/**
 * Knowledge Graph: visualizes links between documents in the workspace.
 * Extracts [[wikilinks]] and [markdown](links) to build a node graph.
 */

interface KnowledgeGraphProps {
  open: boolean
  onClose: () => void
}

function extractLinks(content: string): string[] {
  const links: string[] = []

  // Match [[wikilinks]]
  const wikiLinkRegex = /\[\[([^\]]+)\]\]/g
  let match
  while ((match = wikiLinkRegex.exec(content)) !== null) {
    links.push(match[1])
  }

  // Match [text](relative-link.md)
  const mdLinkRegex = /\[(?:[^\]]+)\]\(([^)]+\.(?:md|markdown))\)/g
  while ((match = mdLinkRegex.exec(content)) !== null) {
    links.push(match[1].split('/').pop()?.replace(/\.md$|\.markdown$/, '') ?? match[1])
  }

  return links
}

function flattenTree(nodes: FileTreeNode[]): FileTreeNode[] {
  const result: FileTreeNode[] = []
  for (const node of nodes) {
    if (node.type === 'file') result.push(node)
    if (node.children) result.push(...flattenTree(node.children))
  }
  return result
}

export function KnowledgeGraph({ open, onClose }: KnowledgeGraphProps) {
  const { t } = useTranslation()
  const svgRef = useRef<SVGSVGElement>(null)
  const fileTree = useFileStore((s) => s.fileTree)
  const currentFilePath = useFileStore((s) => s.currentFilePath)
  const currentContent = useFileStore((s) => s.currentContent)
  const openFile = useFileStore((s) => s.openFile)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] })

  // Build graph from file tree and current content
  useEffect(() => {
    if (!open || !fileTree) return

    const files = flattenTree(fileTree)
    const nodeMap = new Map<string, GraphNode>()

    // Create nodes from files
    files.forEach((file, i) => {
      const label = file.name.replace(/\.(md|markdown|mdx)$/, '')
      const angle = (2 * Math.PI * i) / files.length
      const radius = Math.min(200, files.length * 20)
      nodeMap.set(label.toLowerCase(), {
        id: file.path,
        label,
        x: 300 + radius * Math.cos(angle),
        y: 250 + radius * Math.sin(angle),
        isActive: file.path === currentFilePath,
      })
    })

    // Extract edges from current document
    const edges: GraphEdge[] = []
    if (currentContent && currentFilePath) {
      const links = extractLinks(currentContent)
      for (const link of links) {
        const linkLower = link.toLowerCase()
        const target = nodeMap.get(linkLower)
        if (target) {
          edges.push({ source: currentFilePath, target: target.id })
        }
      }
    }

    setGraphData({ nodes: Array.from(nodeMap.values()), edges })
  }, [open, fileTree, currentFilePath, currentContent])

  if (!open) return null

  const containerClass = isFullscreen
    ? 'fixed inset-0 z-50'
    : 'fixed bottom-10 right-4 z-50 w-[600px] h-[400px] rounded-xl overflow-hidden shadow-2xl border'

  return (
    <div
      className={containerClass}
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-sidebar)' }}
      >
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Knowledge Graph
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10"
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button onClick={onClose} className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10">
            <X size={14} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>

      {/* Graph SVG */}
      <svg
        ref={svgRef}
        className="w-full h-full"
        viewBox="0 0 600 500"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        {/* Edges */}
        {graphData.edges.map((edge, i) => {
          const source = graphData.nodes.find((n) => n.id === edge.source)
          const target = graphData.nodes.find((n) => n.id === edge.target)
          if (!source || !target) return null
          return (
            <line
              key={`edge-${i}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke="var(--accent-color)"
              strokeWidth={1.5}
              strokeOpacity={0.4}
            />
          )
        })}

        {/* Nodes */}
        {graphData.nodes.map((node) => (
          <g
            key={node.id}
            transform={`translate(${node.x}, ${node.y})`}
            onClick={() => { openFile(node.id); onClose() }}
            className="cursor-pointer"
          >
            <circle
              r={node.isActive ? 8 : 5}
              fill={node.isActive ? 'var(--accent-color)' : 'var(--text-muted)'}
              opacity={node.isActive ? 1 : 0.6}
            />
            <text
              dy={-12}
              textAnchor="middle"
              fontSize={10}
              fill="var(--text-secondary)"
              fontFamily="Inter, sans-serif"
            >
              {node.label}
            </text>
          </g>
        ))}

        {/* Empty state */}
        {graphData.nodes.length === 0 && (
          <text x={300} y={250} textAnchor="middle" fontSize={13} fill="var(--text-muted)">
            Open a folder to visualize document connections
          </text>
        )}
      </svg>
    </div>
  )
}
