import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { GraphNode, GraphEdge } from './GraphView'

/** d3-force extends node objects with simulation fields at runtime. */
interface SimNode extends GraphNode {
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
}

/** d3-force replaces source/target strings with node references. */
interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  id: string
  type?: string
}

interface Props {
  nodes: GraphNode[]
  edges: GraphEdge[]
  width: number
  height: number
  nodeTypeColor: (type?: string) => string
  onNodeClick: (node: GraphNode) => void
}

export function D3ForceGraph({ nodes, edges, width, height, nodeTypeColor, onNodeClick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const simRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg || nodes.length === 0) return

    // Deep-copy so d3 mutation doesn't affect React state
    const simNodes: SimNode[] = nodes.map((n) => ({ ...n }))
    const nodeMap = new Map(simNodes.map((n) => [n.id, n]))
    const simLinks: SimLink[] = edges
      .filter((e) => nodeMap.has(String(e.source)) && nodeMap.has(String(e.target)))
      .map((e) => ({ ...e, source: String(e.source), target: String(e.target) }))

    const sel = d3.select(svg)

    // Clear previous render
    sel.selectAll('*').remove()

    // Arrowhead marker
    sel.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -4 8 8')
      .attr('refX', 18)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', 'var(--text-muted)')
      .attr('opacity', 0.4)

    // Zoom layer
    const g = sel.append('g').attr('class', 'zoom-layer')

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 6])
      .on('zoom', (event) => {
        g.attr('transform', event.transform.toString())
      })

    sel.call(zoom)

    // Links
    const linkGroup = g.append('g').attr('class', 'links')
    const link = linkGroup.selectAll<SVGLineElement, SimLink>('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', 'var(--border-color)')
      .attr('stroke-opacity', 0.4)
      .attr('stroke-width', 1)
      .attr('marker-end', 'url(#arrowhead)')

    // Link labels (on hover via title)
    link.append('title').text((d) => d.type ?? '')

    // Node groups
    const nodeGroup = g.append('g').attr('class', 'nodes')
    const node = nodeGroup.selectAll<SVGGElement, SimNode>('g')
      .data(simNodes)
      .join('g')
      .attr('class', 'graph-node')
      .attr('cursor', 'pointer')
      .on('click', (_event, d) => onNodeClick(d))

    // Circles
    node.append('circle')
      .attr('r', 6)
      .attr('fill', (d) => nodeTypeColor(d.type))
      .attr('stroke', 'var(--bg-primary)')
      .attr('stroke-width', 1.5)

    // Hover ring
    node.append('circle')
      .attr('r', 10)
      .attr('fill', 'none')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 2)
      .attr('class', 'hover-ring')

    // Labels
    node.append('text')
      .text((d) => d.name)
      .attr('dy', 18)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('fill', 'var(--text-secondary)')
      .attr('pointer-events', 'none')
      .attr('opacity', 0.85)

    // Tooltip
    node.append('title').text((d) => `${d.name}${d.type ? ` · ${d.type}` : ''}`)

    // Drag behavior
    const drag = d3.drag<SVGGElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event, d) => {
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0)
        d.fx = null
        d.fy = null
      })

    node.call(drag)

    // Hover effect via CSS-like approach using d3
    node
      .on('mouseenter', function () {
        d3.select(this).select('.hover-ring')
          .attr('stroke', 'var(--accent-color)')
          .attr('stroke-opacity', 0.5)
        d3.select(this).select('text').attr('opacity', 1).attr('font-weight', '600')
      })
      .on('mouseleave', function () {
        d3.select(this).select('.hover-ring')
          .attr('stroke', 'transparent')
        d3.select(this).select('text').attr('opacity', 0.85).attr('font-weight', 'normal')
      })

    // Force simulation
    const simulation = d3.forceSimulation<SimNode>(simNodes)
      .force('link', d3.forceLink<SimNode, SimLink>(simLinks).id((d) => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-150))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(20))
      .on('tick', () => {
        link
          .attr('x1', (d) => (d.source as SimNode).x ?? 0)
          .attr('y1', (d) => (d.source as SimNode).y ?? 0)
          .attr('x2', (d) => (d.target as SimNode).x ?? 0)
          .attr('y2', (d) => (d.target as SimNode).y ?? 0)

        node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
      })

    simRef.current = simulation

    return () => {
      simulation.stop()
      simRef.current = null
    }
  }, [nodes, edges, width, height, nodeTypeColor, onNodeClick])

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      style={{ display: 'block' }}
    />
  )
}
