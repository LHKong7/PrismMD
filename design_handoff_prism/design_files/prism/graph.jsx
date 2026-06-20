/* Prism — knowledge graph. A small spring/charge force sim over SVG.
 * Draggable nodes, hover highlight, spectrum-colored clusters. */
const { useState: useStateG, useRef: useRefG, useEffect: useEffectG, useMemo: useMemoG } = React;

function KnowledgeGraph({ width, height, compact }) {
  const data = window.PRISM_DATA.GRAPH;
  const SPECTRUM = window.PRISM_SPECTRUM;
  const svgRef = useRefG(null);
  const simRef = useRefG(null);
  const dragRef = useRefG(null);
  const [, force] = useStateG(0);
  const [hover, setHover] = useStateG(null);

  // adjacency for highlight
  const adj = useMemoG(() => {
    const m = {};
    data.nodes.forEach((n) => (m[n.id] = new Set([n.id])));
    data.links.forEach(([a, b]) => { m[a].add(b); m[b].add(a); });
    return m;
  }, [data]);

  // init positions once
  if (!simRef.current) {
    const cx = width / 2, cy = height / 2;
    const nodes = {};
    data.nodes.forEach((n, i) => {
      const ang = (i / data.nodes.length) * Math.PI * 2;
      const rad = Math.min(width, height) * 0.28;
      nodes[n.id] = { ...n, x: cx + Math.cos(ang) * rad + (Math.random() - .5) * 30,
        y: cy + Math.sin(ang) * rad + (Math.random() - .5) * 30, vx: 0, vy: 0 };
    });
    simRef.current = { nodes, alpha: 1 };
  }

  useEffectG(() => {
    let raf;
    const cx = width / 2, cy = height / 2;
    const links = data.links;
    const step = () => {
      const sim = simRef.current;
      const ns = sim.nodes;
      const ids = Object.keys(ns);
      sim.alpha *= 0.98;
      // charge repulsion
      for (let i = 0; i < ids.length; i++) {
        const a = ns[ids[i]];
        for (let j = i + 1; j < ids.length; j++) {
          const b = ns[ids[j]];
          let dx = a.x - b.x, dy = a.y - b.y;
          let d2 = dx * dx + dy * dy || 1;
          const d = Math.sqrt(d2);
          const rep = (compact ? 2600 : 4200) / d2;
          const fx = (dx / d) * rep, fy = (dy / d) * rep;
          a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
        }
      }
      // spring links
      const target = compact ? 64 : 92;
      links.forEach(([sa, sb]) => {
        const a = ns[sa], b = ns[sb];
        let dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (d - target) * 0.02;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      });
      // gravity to center + integrate
      ids.forEach((id) => {
        const n = ns[id];
        if (dragRef.current === id) { n.vx = 0; n.vy = 0; return; }
        n.vx += (cx - n.x) * 0.006;
        n.vy += (cy - n.y) * 0.006;
        n.vx *= 0.86; n.vy *= 0.86;
        n.x += n.vx * (0.4 + sim.alpha); n.y += n.vy * (0.4 + sim.alpha);
        const pad = n.r + 6;
        n.x = Math.max(pad, Math.min(width - pad, n.x));
        n.y = Math.max(pad, Math.min(height - pad, n.y));
      });
      force((v) => (v + 1) % 1000000);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [width, height, compact]);

  // pointer drag
  const onDown = (id) => (e) => {
    e.preventDefault();
    dragRef.current = id;
    simRef.current.alpha = Math.max(simRef.current.alpha, 0.4);
    const move = (ev) => {
      const rect = svgRef.current.getBoundingClientRect();
      const px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
      const py = (ev.touches ? ev.touches[0].clientY : ev.clientY) - rect.top;
      const n = simRef.current.nodes[id];
      n.x = px * (width / rect.width); n.y = py * (height / rect.height);
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const ns = simRef.current.nodes;
  const hl = hover ? adj[hover] : null;
  const isLit = (id) => !hl || hl.has(id);

  return (
    <svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', cursor: dragRef.current ? 'grabbing' : 'default', touchAction: 'none' }}>
      <g>
        {data.links.map(([a, b], i) => {
          const na = ns[a], nb = ns[b];
          if (!na || !nb) return null;
          const lit = !hl || (hl.has(a) && hl.has(b));
          return (
            <line key={i} x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
              stroke="var(--ink)" strokeOpacity={lit ? 0.22 : 0.05}
              strokeWidth={lit ? 1.4 : 1} />
          );
        })}
      </g>
      <g>
        {data.nodes.map((node) => {
          const n = ns[node.id];
          if (!n) return null;
          const color = SPECTRUM[node.cluster % SPECTRUM.length];
          const lit = isLit(node.id);
          const isH = hover === node.id;
          return (
            <g key={node.id} transform={`translate(${n.x},${n.y})`}
              style={{ cursor: 'grab', opacity: lit ? 1 : 0.28, transition: 'opacity .18s' }}
              onPointerDown={onDown(node.id)}
              onMouseEnter={() => setHover(node.id)}
              onMouseLeave={() => setHover(null)}>
              <circle r={n.r + (isH ? 4 : 0)} fill={color}
                fillOpacity={node.kind === 'doc' ? 0.9 : 0.16}
                stroke={color} strokeWidth={node.kind === 'doc' ? 0 : 2}
                style={{ transition: 'r .18s' }} />
              {node.kind === 'concept' && <circle r={3} fill={color} />}
              <text textAnchor="middle" y={n.r + 14}
                style={{ font: `500 ${compact ? 10 : 11.5}px var(--font-ui)`, fill: 'var(--ink-2)',
                  pointerEvents: 'none', letterSpacing: '.01em' }}>
                {node.label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

window.KnowledgeGraph = KnowledgeGraph;
