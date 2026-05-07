# Replace Graph Visualization with D3.js

## Background / Context

The knowledge graph view previously used `react-force-graph-2d` (canvas-based). Replaced with a custom d3.js SVG-based force-directed graph for better styling control, per-element CSS theming, and native DOM events.

## Design Decisions

- **SVG over Canvas**: SVG elements are individually styleable with CSS variables (`:hover` effects, theme-aware colors), have native DOM events per node/link (no hit-testing), and match PrismMD's CSS variable theming system.
- **React ↔ D3 boundary**: React owns the `<svg>` element via ref; d3 owns all SVG children inside it. React doesn't re-render SVG children — d3 manages the DOM directly. Simulation is cleaned up on unmount.
- **Same data flow**: All IPC calls, stores, scope selectors, legend, error handling, and entity panel integration are unchanged. Only the rendering layer was replaced.

## Changes

### New file: `src/components/graph/D3ForceGraph.tsx`
- SVG-based force-directed graph using d3-force, d3-zoom, d3-drag, d3-selection
- Force simulation: link (distance 80), charge (strength -150), center, collision (radius 20)
- Zoom/pan via d3.zoom on SVG, transforms inner `<g>` layer
- Node drag: pins fx/fy during drag, releases on end
- Hover: accent color ring + bold label on mouseenter/mouseleave
- Directional arrowheads via SVG `<marker>` definition
- Theme-aware: labels use `--text-secondary`, links use `--border-color`, node stroke uses `--bg-primary`

### Modified: `src/components/graph/GraphView.tsx`
- Removed `ForceGraph2D` import, added `D3ForceGraph` import
- Replaced `graphData` memo (force-graph's `links` format) with `safeEdges` memo (filtered edges)
- Replaced `<ForceGraph2D>` with `<D3ForceGraph>` passing same props
- All other sections unchanged: scope selector, legend, loading/error/empty states, data fetching

### Dependencies
- Removed: `react-force-graph-2d`
- Added: `d3`, `@types/d3`

## Verification

1. `npm run typecheck` — passes
2. `npm run dev` — builds successfully
3. Graph view: TitleBar toggle → SVG force-directed graph renders
4. Zoom (mouse wheel), pan (drag background), drag nodes (pin during drag)
5. Click node → right sidebar EntityPanel opens
6. Scope switch (Global/Document/Entity) → different graphs load
7. Theme switch → labels and links adapt to CSS variables
