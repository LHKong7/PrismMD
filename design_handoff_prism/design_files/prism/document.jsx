/* Prism — reading surface assembly: page header, reading progress, contextual
 * minimap, selection→AI bubble, and the block dispatcher. */
const { useState: useSd, useRef: useRd, useEffect: useEd, useMemo: useMd, useLayoutEffect: useLEd } = React;

function PageHeader({ doc }) {
  return (
    <header style={{ marginBottom: 26 }}>
      <div style={{ fontSize: 52, lineHeight: 1, marginBottom: 14 }}>{doc.icon}</div>
      <h1 style={{ font: '500 41px/1.12 var(--font-display)', color: 'var(--ink)', letterSpacing: '-0.012em', marginBottom: 14, textWrap: 'balance' }}>{doc.title}</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, font: '400 13px var(--font-ui)', color: 'var(--ink-3)', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 20, height: 20, borderRadius: 20, background: 'var(--accent)', color: 'var(--accent-ink)', display: 'grid', placeItems: 'center', font: '600 10px var(--font-ui)' }}>Y</span>
          {doc.meta.author}
        </span>
        <span style={{ opacity: .5 }}>·</span>
        <span>{doc.meta.read} read</span>
        <span style={{ opacity: .5 }}>·</span>
        <span>{doc.meta.words.toLocaleString()} words</span>
        <span style={{ opacity: .5 }}>·</span>
        <span>{doc.meta.edited}</span>
      </div>
      <div style={{ height: 1, background: 'var(--line)', marginTop: 20 }} />
    </header>
  );
}

function ReadingProgress({ pct }) {
  const SP = window.PRISM_SPECTRUM;
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, zIndex: 6, background: 'transparent', pointerEvents: 'none' }}>
      <div style={{ height: '100%', width: pct + '%', background: `linear-gradient(90deg, ${SP.join(',')})`, transition: 'width .12s linear' }} />
    </div>
  );
}

function Minimap({ markers, pct, scrollEl }) {
  return (
    <div style={{ position: 'absolute', right: 6, top: 70, bottom: 30, width: 14, zIndex: 5 }}>
      <div style={{ position: 'relative', height: '100%', width: '100%' }}>
        {markers.map((m, i) => (
          <button key={i} title={m.label}
            onClick={() => scrollEl.current && scrollEl.current.scrollTo({ top: m.top - 40, behavior: 'smooth' })}
            style={{ position: 'absolute', top: (m.frac * 100) + '%', right: 2,
              width: m.kind === 'hl' ? 9 : m.kind === 'h' ? 11 : 7, height: m.kind === 'hl' ? 4 : 2.5, borderRadius: 2,
              background: m.kind === 'hl' ? `var(--hl-${m.color})` : m.kind === 'code' ? 'var(--accent)' : m.kind === 'danger' ? 'var(--err)' : 'var(--ink-3)',
              border: m.kind === 'hl' ? '1px solid color-mix(in srgb, var(--ink) 18%, transparent)' : 'none',
              opacity: m.kind === 'h' ? .5 : m.kind === 'hl' ? 1 : .85, cursor: 'pointer' }} />
        ))}
        {/* viewport indicator */}
        <div style={{ position: 'absolute', top: pct + '%', right: 0, width: 3, height: 28, borderRadius: 3, background: 'var(--accent)', transform: 'translateY(-50%)', transition: 'top .12s' }} />
      </div>
    </div>
  );
}

function SelectionBubble({ rect, onAsk, onHighlight, onClose }) {
  if (!rect) return null;
  const colors = ['yellow', 'green', 'blue', 'pink', 'purple'];
  return (
    <div style={{ position: 'absolute', left: rect.x, top: rect.y - 8, transform: 'translate(-50%,-100%)', zIndex: 50, animation: 'prismScale .13s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--ink)', borderRadius: 10, padding: 5, boxShadow: 'var(--shadow-lg)' }}>
        <button onClick={onAsk} data-focusable style={{ display: 'flex', alignItems: 'center', gap: 6, font: '600 12px var(--font-ui)', color: 'var(--paper)', padding: '5px 11px', borderRadius: 7 }}>
          <span style={{ color: 'var(--accent)' }}>✦</span> Ask Prism
        </button>
        <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,.16)' }} />
        <div style={{ display: 'flex', gap: 3, padding: '0 5px' }}>
          {colors.map((c) => (
            <button key={c} onClick={() => onHighlight(c)} title={'Highlight ' + c} data-focusable
              style={{ width: 16, height: 16, borderRadius: 9, background: `var(--hl-${c})`, border: '1px solid rgba(0,0,0,.12)' }} />
          ))}
        </div>
        <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,.16)' }} />
        <button onClick={onClose} data-focusable title="Copy" style={{ font: '500 12px var(--font-ui)', color: 'var(--paper)', padding: '5px 9px', opacity: .8 }}>⧉</button>
      </div>
      <div style={{ width: 10, height: 10, background: 'var(--ink)', position: 'absolute', left: '50%', bottom: -4, transform: 'translateX(-50%) rotate(45deg)' }} />
    </div>
  );
}

function DocumentReader({ scrollRef, onEntity, onAsk, onScrollInfo, highlights, onAddHighlight }) {
  const { DOC } = window.PRISM_DATA;
  const B = window.PrismReaderBlocks;
  const [markers, setMarkers] = useSd([]);
  const [pct, setPct] = useSd(0);
  const [sel, setSel] = useSd(null);
  const bodyRef = useRd(null);

  const measure = () => {
    const el = scrollRef.current, body = bodyRef.current;
    if (!el || !body) return;
    const ms = [];
    body.querySelectorAll('[data-mark]').forEach((node) => {
      const top = node.offsetTop;
      ms.push({ top, frac: el.scrollHeight ? top / el.scrollHeight : 0, kind: node.getAttribute('data-mark'), label: node.getAttribute('data-label') || '' });
    });
    body.querySelectorAll('[data-hlmark][data-uid]').forEach((node) => {
      if (!node.getAttribute('data-uid')) return;
      const top = node.offsetTop;
      ms.push({ top, frac: el.scrollHeight ? top / el.scrollHeight : 0, kind: 'hl', color: node.getAttribute('data-hlmark'), label: node.textContent.slice(0, 50) });
    });
    setMarkers(ms);
  };
  useLEd(() => { measure(); }, []);
  useEd(() => {
    const onR = () => measure();
    window.addEventListener('resize', onR);
    const t = setTimeout(measure, 400); // after fonts settle
    return () => { window.removeEventListener('resize', onR); clearTimeout(t); };
  }, []);
  useEd(() => { measure(); }, [highlights]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const total = el.scrollHeight - el.clientHeight;
    const p = total > 0 ? (el.scrollTop / total) * 100 : 0;
    setPct(p);
    // active heading
    let active = null;
    bodyRef.current.querySelectorAll('[data-sec]').forEach((node) => {
      if (node.offsetTop - el.scrollTop <= 120) active = node.getAttribute('data-sec');
    });
    onScrollInfo && onScrollInfo({ pct: p, active });
  };

  const handleMouseUp = () => {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.toString().trim()) { setSel(null); return; }
    const range = s.getRangeAt(0);
    if (!bodyRef.current.contains(range.commonAncestorContainer)) { setSel(null); return; }
    // find the block this selection started in
    let node = range.startContainer;
    if (node.nodeType === 3) node = node.parentNode;
    let pidEl = node;
    while (pidEl && pidEl !== bodyRef.current && !(pidEl.hasAttribute && pidEl.hasAttribute('data-pid'))) pidEl = pidEl.parentElement;
    const blockIndex = pidEl && pidEl.getAttribute ? parseInt(pidEl.getAttribute('data-pid')) : null;
    const rb = range.getBoundingClientRect();
    const host = scrollRef.current.getBoundingClientRect();
    setSel({ x: rb.left - host.left + rb.width / 2, y: rb.top - host.top + scrollRef.current.scrollTop, text: s.toString().trim(), blockIndex });
  };

  const makeHighlight = (color) => {
    if (sel && sel.blockIndex != null && !Number.isNaN(sel.blockIndex)) {
      onAddHighlight && onAddHighlight({ blockIndex: sel.blockIndex, text: sel.text, color });
    }
    setSel(null);
    window.getSelection().removeAllRanges();
  };

  const hlFor = (i) => (highlights || []).filter((h) => h.blockIndex === i);

  const renderBlock = (blk, i) => {
    switch (blk.type) {
      case 'lede': return <p key={i} data-pid={i} className="prism-lede" style={{ font: '400 20px/1.62 var(--font-read)', color: 'var(--ink-2)', margin: '0 0 22px' }}><B.Inline tokens={B.injectHighlights(blk.text, hlFor(i))} onEntity={onEntity} /></p>;
      case 'p': return <p key={i} data-pid={i} className="prose-p"><B.Inline tokens={B.injectHighlights(blk.text, hlFor(i))} onEntity={onEntity} /></p>;
      case 'h2': return <h2 key={i} data-sec={blk.id} data-mark="h" data-label={blk.text} id={'sec-' + blk.id} style={{ font: '500 27px/1.25 var(--font-display)', color: 'var(--ink)', letterSpacing: '-0.01em', margin: '38px 0 14px' }}>{blk.text}</h2>;
      case 'h3': return <h3 key={i} style={{ font: '600 18px var(--font-ui)', color: 'var(--ink)', margin: '26px 0 10px' }}>{blk.text}</h3>;
      case 'callout': return <div key={i} data-mark={blk.variant === 'danger' ? 'danger' : 'c'} data-label={blk.title}><B.Callout {...blk} onEntity={onEntity} /></div>;
      case 'math': return <B.MathBlock key={i} tex={blk.tex} caption={blk.caption} />;
      case 'mermaid': return <div key={i} data-mark="code" data-label="Pipeline diagram"><B.Pipeline /></div>;
      case 'runcode': return <div key={i} data-mark="code" data-label={blk.label}><B.RunCode block={blk} /></div>;
      case 'tabs': return <div key={i} data-mark="code" data-label="Code tabs"><B.TabsBlock tabs={blk.tabs} /></div>;
      case 'timeline': return <B.Timeline key={i} steps={blk.steps} />;
      case 'table': return <div key={i} data-mark="c" data-label="Results"><B.DataTable {...blk} /></div>;
      default: return null;
    }
  };

  return (
    <div ref={scrollRef} onScroll={onScroll} onMouseUp={handleMouseUp}
      style={{ position: 'relative', flex: 1, overflowY: 'auto', overflowX: 'hidden', background: 'var(--bg)' }}>
      <ReadingProgress pct={pct} />
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '56px 40px 200px', position: 'relative' }} ref={bodyRef} className="prism-prose">
        <PageHeader doc={DOC} />
        {DOC.blocks.map(renderBlock)}
        <div style={{ marginTop: 60, paddingTop: 22, borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', font: '400 13px var(--font-ui)', color: 'var(--ink-3)' }}>
          <span>End of document</span>
          <span style={{ display: 'flex', gap: 14 }}>
            <span style={{ cursor: 'pointer' }}>↑ Back to top</span>
          </span>
        </div>
      </div>
      <Minimap markers={markers} pct={pct} scrollEl={scrollRef} />
      <SelectionBubble rect={sel} onAsk={() => { onAsk && onAsk(sel.text); setSel(null); window.getSelection().removeAllRanges(); }} onHighlight={makeHighlight} onClose={() => { setSel(null); window.getSelection().removeAllRanges(); }} />
    </div>
  );
}

window.PrismDocument = { DocumentReader };
