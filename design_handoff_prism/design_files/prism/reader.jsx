/* Prism — document reader. Page header, reading progress, contextual minimap,
 * and every rich block: callouts, math, mermaid, runnable code, tabs,
 * timeline, tables, multi-color highlights with annotations. */
const { useState: useS, useRef: useR, useEffect: useE, useMemo: useM, useCallback: useCb } = React;

/* ---------- code syntax highlight (light, themed) ---------- */
const KW = {
  python: /\b(def|return|for|in|import|from|print|open|class|if|else|elif|while|with|as|None|True|False|lambda|and|or|not)\b/,
  ts: /\b(export|function|const|let|var|for|of|return|new|class|if|else|interface|type|number|string|void|import|from)\b/,
  python_: 1,
};
function hlLine(line, lang) {
  const parts = [];
  const re = /(#[^\n]*$|\/\/[^\n]*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)/g;
  let last = 0, m;
  const kw = KW[lang] || KW.ts;
  while ((m = re.exec(line))) {
    if (m.index > last) parts.push(['t', line.slice(last, m.index)]);
    if (m[1]) parts.push(['cm', m[1]]);
    else if (m[2]) parts.push(['st', m[2]]);
    else if (m[3]) parts.push(['nu', m[3]]);
    else if (m[4]) {
      const after = line.slice(re.lastIndex, re.lastIndex + 1);
      if (kw.test(m[4])) parts.push(['kw', m[4]]);
      else if (after === '(') parts.push(['fn', m[4]]);
      else parts.push(['t', m[4]]);
    }
    last = re.lastIndex;
  }
  if (last < line.length) parts.push(['t', line.slice(last)]);
  const col = { cm: 'var(--ink-3)', st: 'var(--ok)', nu: 'var(--info)', kw: 'var(--accent)', fn: 'var(--err)', t: 'var(--code-ink)' };
  return parts.map((p, i) => <span key={i} style={{ color: col[p[0]], fontStyle: p[0] === 'cm' ? 'italic' : 'normal' }}>{p[1]}</span>);
}
function CodeBlock({ lines, lang }) {
  return (
    <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.65, color: 'var(--code-ink)', overflowX: 'auto' }}>
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'flex', minHeight: '1.65em' }}>
          <span style={{ width: 30, flexShrink: 0, textAlign: 'right', paddingRight: 14, color: 'var(--ink-3)', opacity: .55, userSelect: 'none' }}>{i + 1}</span>
          <code style={{ whiteSpace: 'pre' }}>{l.trim() === '' ? '\u00a0' : hlLine(l, lang)}</code>
        </div>
      ))}
    </pre>
  );
}

/* ---------- math ---------- */
function mathHtml(tex) {
  let s = tex.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  s = s.replace(/\^\{([^}]*)\}/g, '<sup>$1</sup>').replace(/_\{([^}]*)\}/g, '<sub>$1</sub>');
  s = s.replace(/\^(\w)/g, '<sup>$1</sup>').replace(/_(\w)/g, '<sub>$1</sub>');
  return s;
}

/* ---------- inline token renderer ---------- */
function Inline({ tokens, onEntity }) {
  const [openNote, setOpenNote] = useS(null);
  if (typeof tokens === 'string') return tokens;
  return tokens.map((tk, i) => {
    if (tk.t === 'plain') return <React.Fragment key={i}>{tk.s}</React.Fragment>;
    if (tk.t === 'b') return <strong key={i} style={{ fontWeight: 600, color: 'var(--ink)' }}>{tk.s}</strong>;
    if (tk.t === 'i') return <em key={i}>{tk.s}</em>;
    if (tk.t === 'code') return <code key={i} className="prose-code">{tk.s}</code>;
    if (tk.t === 'math') return <span key={i} style={{ fontFamily: 'var(--font-read)', fontStyle: 'italic' }} dangerouslySetInnerHTML={{ __html: mathHtml(tk.s) }} />;
    if (tk.t === 'badge') return <Badge key={i} label={tk.s} color={tk.color} />;
    if (tk.t === 'entity') return (
      <span key={i} onClick={() => onEntity && onEntity(tk.id)} data-focusable tabIndex={0}
        style={{ color: 'var(--accent)', borderBottom: '1px solid var(--accent-soft)', cursor: 'pointer', fontWeight: 500 }}
        title="Open in knowledge graph">{tk.s}<sup style={{ fontSize: '.62em', opacity: .7 }}>◆</sup></span>
    );
    if (tk.t === 'hl') return (
      <span key={i} style={{ position: 'relative' }}>
        <mark data-hlmark={tk.color} data-uid={tk.uid || ''} onClick={() => setOpenNote(openNote === i ? null : i)}
          style={{ background: `var(--hl-${tk.color})`, color: 'var(--ink)', padding: '0 .12em', borderRadius: 2, cursor: (tk.note || tk.uid) ? 'pointer' : 'auto', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}>
          {tk.s}
        </mark>
        {(tk.note || tk.uid) && openNote === i && (
          <span style={{ position: 'absolute', left: 0, top: '1.7em', zIndex: 40, width: 240, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 11px', font: '400 12.5px/1.5 var(--font-ui)', color: 'var(--ink-2)', boxShadow: 'var(--shadow)', animation: 'prismScale .14s ease' }}>
            <span style={{ display: 'block', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 4 }}>{tk.note ? 'Annotation' : 'Highlight'}</span>
            {tk.note || 'No note yet — add one in the Notes panel.'}
          </span>
        )}
      </span>
    );
    return null;
  });
}

/* ---------- inject user highlights into a token array ---------- */
function injectHighlights(tokens, hls) {
  if (!hls || !hls.length || !Array.isArray(tokens)) return tokens;
  let out = tokens;
  hls.forEach((h) => {
    const next = [];
    let placed = false;
    out.forEach((tk) => {
      if (!placed && tk.t === 'plain' && h.text && tk.s.includes(h.text)) {
        const idx = tk.s.indexOf(h.text);
        const before = tk.s.slice(0, idx);
        const after = tk.s.slice(idx + h.text.length);
        if (before) next.push({ t: 'plain', s: before });
        next.push({ t: 'hl', s: h.text, color: h.color, note: h.note, uid: h.id });
        if (after) next.push({ t: 'plain', s: after });
        placed = true;
      } else { next.push(tk); }
    });
    out = next;
  });
  return out;
}

/* ---------- badge ---------- */
function Badge({ label, color }) {
  const map = { green: 'var(--ok)', blue: 'var(--info)', amber: 'var(--warn)', red: 'var(--err)' };
  const c = map[color] || 'var(--accent)';
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '600 11px var(--font-ui)', color: c, background: 'color-mix(in srgb, ' + c + ' 13%, transparent)', padding: '2px 9px', borderRadius: 20, letterSpacing: '.01em', verticalAlign: 'middle' }}>
    <span style={{ width: 5, height: 5, borderRadius: 9, background: c }} />{label}
  </span>;
}

/* ---------- callout ---------- */
const CALLOUT = {
  note: { icon: 'ℹ', c: 'var(--info)' },
  tip: { icon: '✓', c: 'var(--ok)' },
  warning: { icon: '⚠', c: 'var(--warn)' },
  danger: { icon: '✕', c: 'var(--err)' },
};
function Callout({ variant, title, text, onEntity }) {
  const cfg = CALLOUT[variant] || CALLOUT.note;
  return (
    <div style={{ margin: '26px 0', borderRadius: 12, border: '1px solid color-mix(in srgb,' + cfg.c + ' 30%, var(--line))', background: 'color-mix(in srgb,' + cfg.c + ' 7%, var(--paper))', padding: '16px 18px', display: 'flex', gap: 13 }}>
      <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 7, background: cfg.c, color: 'var(--paper)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700 }}>{cfg.icon}</span>
      <div>
        <div style={{ font: '600 13.5px var(--font-ui)', color: 'var(--ink)', marginBottom: 3, letterSpacing: '.01em' }}>{title}</div>
        <div style={{ font: '400 15.5px/1.6 var(--font-read)', color: 'var(--ink-2)' }}><Inline tokens={text} onEntity={onEntity} /></div>
      </div>
    </div>
  );
}

/* ---------- mermaid-style pipeline ---------- */
function Pipeline() {
  const SP = window.PRISM_SPECTRUM;
  const stages = ['Query', 'Embed seeds', 'Walk graph', 'Rank frontier', 'Answer'];
  return (
    <figure style={{ margin: '28px 0' }}>
      <div style={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface-2)', padding: '26px 20px' }}>
        <svg viewBox="0 0 720 120" width="100%" style={{ display: 'block' }}>
          {stages.map((s, i) => {
            const x = 14 + i * 142, w = 116, y = 38, h = 44;
            const c = SP[i % SP.length];
            return (
              <g key={i}>
                <rect x={x} y={y} width={w} height={h} rx={9} fill={'color-mix(in srgb,' + c + ' 13%, var(--paper))'} stroke={c} strokeWidth="1.4" />
                <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" style={{ font: '600 13px var(--font-ui)', fill: 'var(--ink)' }}>{s}</text>
                {i < stages.length - 1 && (
                  <g stroke="var(--ink-3)" strokeWidth="1.4" fill="none">
                    <line x1={x + w + 4} y1={y + h / 2} x2={x + w + 22} y2={y + h / 2} />
                    <path d={`M ${x + w + 18} ${y + h / 2 - 4} L ${x + w + 24} ${y + h / 2} L ${x + w + 18} ${y + h / 2 + 4}`} />
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption style={{ textAlign: 'center', font: 'italic 400 13px var(--font-read)', color: 'var(--ink-3)', marginTop: 9 }}>Figure 1 — the five-stage retrieval pipeline.</figcaption>
    </figure>
  );
}

/* ---------- runnable code ---------- */
function RunCode({ block }) {
  const [state, setState] = useS('idle'); // idle | running | done
  const run = () => {
    setState('running');
    setTimeout(() => setState('done'), 850);
  };
  return (
    <div style={{ margin: '26px 0', borderRadius: 12, border: '1px solid var(--line)', overflow: 'hidden', background: 'var(--code-bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--line)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: '500 12px var(--font-mono)', color: 'var(--ink-3)' }}>
          <span style={{ display: 'flex', gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 9, background: 'var(--err)', opacity: .6 }} />
            <span style={{ width: 9, height: 9, borderRadius: 9, background: 'var(--warn)', opacity: .6 }} />
            <span style={{ width: 9, height: 9, borderRadius: 9, background: 'var(--ok)', opacity: .6 }} />
          </span>
          {block.label}
        </div>
        <button onClick={run} data-focusable style={{ display: 'flex', alignItems: 'center', gap: 6, font: '600 11.5px var(--font-ui)', color: state === 'running' ? 'var(--ink-3)' : 'var(--accent-ink)', background: state === 'running' ? 'transparent' : 'var(--accent)', padding: '5px 12px', borderRadius: 7, letterSpacing: '.02em' }}>
          {state === 'running' ? '● running…' : state === 'done' ? '↻ run again' : '▶ run'}
        </button>
      </div>
      <div style={{ padding: '14px 14px 12px' }}><CodeBlock lines={block.code} lang={block.lang} /></div>
      {state !== 'idle' && (
        <div style={{ borderTop: '1px solid var(--line)', background: 'var(--surface-2)', padding: '11px 16px', font: '400 12.5px var(--font-mono)', animation: 'prismFade .2s' }}>
          <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 7 }}>Output</div>
          {state === 'running'
            ? <span style={{ color: 'var(--ink-3)' }}>executing in sandbox…</span>
            : block.output.lines.map((l, i) => <div key={i} style={{ color: 'var(--ink-2)' }}><span style={{ color: 'var(--ok)' }}>›</span> {l}</div>)}
        </div>
      )}
    </div>
  );
}

/* ---------- tabs ---------- */
function TabsBlock({ tabs }) {
  const [act, setAct] = useS(0);
  return (
    <div style={{ margin: '26px 0', borderRadius: 12, border: '1px solid var(--line)', overflow: 'hidden', background: 'var(--code-bg)' }}>
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--line)', background: 'var(--surface)', padding: '0 6px' }}>
        {tabs.map((t, i) => (
          <button key={i} onClick={() => setAct(i)} data-focusable style={{ font: '600 12px var(--font-ui)', padding: '10px 14px', color: act === i ? 'var(--ink)' : 'var(--ink-3)', borderBottom: act === i ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: -1 }}>{t.label}</button>
        ))}
      </div>
      <div style={{ padding: '14px' }}><CodeBlock lines={tabs[act].code} lang={tabs[act].lang} /></div>
    </div>
  );
}

/* ---------- timeline ---------- */
function Timeline({ steps }) {
  return (
    <div style={{ margin: '26px 0 26px 6px', position: 'relative', paddingLeft: 26 }}>
      <div style={{ position: 'absolute', left: 5, top: 6, bottom: 6, width: 2, background: 'var(--line)' }} />
      {steps.map((s, i) => (
        <div key={i} style={{ position: 'relative', paddingBottom: i < steps.length - 1 ? 22 : 0 }}>
          <span style={{ position: 'absolute', left: -26, top: 2, width: 12, height: 12, borderRadius: 9, background: 'var(--accent)', boxShadow: '0 0 0 4px var(--paper)' }} />
          <div style={{ font: '600 11px var(--font-ui)', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 3 }}>{s.when}</div>
          <div style={{ font: '400 15.5px/1.55 var(--font-read)', color: 'var(--ink-2)' }}>{s.text}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------- table ---------- */
function DataTable({ head, rows, emphRow }) {
  return (
    <div style={{ margin: '26px 0', overflowX: 'auto', borderRadius: 10, border: '1px solid var(--line)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', font: '400 14px var(--font-ui)' }}>
        <thead><tr>{head.map((h, i) => (
          <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '11px 16px', font: '600 12px var(--font-ui)', letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--ink-3)', background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>{h}</th>
        ))}</tr></thead>
        <tbody>{rows.map((r, ri) => (
          <tr key={ri} style={{ background: ri === emphRow ? 'var(--accent-soft)' : 'transparent' }}>
            {r.map((c, ci) => (
              <td key={ci} style={{ textAlign: ci === 0 ? 'left' : 'right', padding: '10px 16px', color: ci === 0 ? 'var(--ink)' : 'var(--ink-2)', fontWeight: ri === emphRow && ci === 0 ? 600 : 400, fontVariantNumeric: 'tabular-nums', borderBottom: ri < rows.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
                {ri === emphRow && ci === 0 ? <span style={{ color: 'var(--accent)' }}>★ </span> : null}{c}
              </td>
            ))}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/* ---------- math block ---------- */
function MathBlock({ tex, caption }) {
  return (
    <figure style={{ margin: '24px 0', textAlign: 'center' }}>
      <div style={{ display: 'inline-block', padding: '14px 30px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--line)', font: 'italic 400 19px/1 var(--font-read)', color: 'var(--ink)', letterSpacing: '.01em' }}
        dangerouslySetInnerHTML={{ __html: mathHtml(tex) }} />
      {caption && <figcaption style={{ font: 'italic 400 13px var(--font-read)', color: 'var(--ink-3)', marginTop: 9 }}>{caption}</figcaption>}
    </figure>
  );
}

window.PrismReaderBlocks = { CodeBlock, Inline, Badge, Callout, Pipeline, RunCode, TabsBlock, Timeline, DataTable, MathBlock, injectHighlights };
