/* Prism — window chrome: frameless title bar, tab bar, breadcrumb, status
 * bar, and the command palette. */
const { useState: useSc, useRef: useRc, useEffect: useEc, useMemo: useMc } = React;

const PrismMark = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ flexShrink: 0 }}>
    <path d="M50 16 L84 76 L16 76 Z" stroke="var(--ink)" strokeWidth="4" strokeLinejoin="round" />
    <path d="M50 16 L50 76" stroke="var(--accent)" strokeWidth="2.5" />
    <path d="M60 54 L88 42" stroke="#c2532f" strokeWidth="3" strokeLinecap="round" />
    <path d="M60 59 L90 56" stroke="#c9a52a" strokeWidth="3" strokeLinecap="round" />
    <path d="M60 64 L88 70" stroke="#5b8b4e" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

/* ============================ TITLE BAR ============================ */
function TitleBar({ onPalette, onTheme, theme, onToggleAgent, agentOpen, focus, onFocus, onSettings, view, onView }) {
  const T = window.PRISM_THEMES;
  const ctrl = (glyph, label, fn, danger) => (
    <button onClick={fn} data-focusable title={label} aria-label={label}
      style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontSize: 13, flexShrink: 0 }}
      onMouseEnter={(e) => { e.currentTarget.style.background = danger ? 'var(--err)' : 'var(--surface-2)'; e.currentTarget.style.color = danger ? '#fff' : 'var(--ink)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink-3)'; }}>{glyph}</button>
  );
  return (
    <div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px 0 14px', background: 'var(--titlebar)', borderBottom: '1px solid var(--line)', WebkitAppRegion: 'drag', flexShrink: 0 }}>
      <PrismMark />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: '500 13.5px var(--font-display)', color: 'var(--ink)', letterSpacing: '.01em', flexShrink: 0 }}>
        Prism <span style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-ui)', fontSize: 12 }}>·</span>
        <span style={{ font: '400 12.5px var(--font-ui)', color: 'var(--ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Research workspace</span>
        <span style={{ fontSize: 9, color: 'var(--ink-3)' }}>▾</span>
      </div>

      {/* nav arrows */}
      <div style={{ display: 'flex', gap: 2, marginLeft: 6 }}>
        <button data-focusable title="Back" style={{ width: 26, height: 26, borderRadius: 7, color: 'var(--ink-3)' }}>‹</button>
        <button data-focusable title="Forward" style={{ width: 26, height: 26, borderRadius: 7, color: 'var(--ink-3)' }}>›</button>
      </div>

      <div style={{ flex: 1 }} />

      {/* view switch */}
      <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 9, padding: 2, border: '1px solid var(--line)', flexShrink: 0 }}>
        {[['read', 'Read'], ['graph', 'Graph']].map(([id, label]) => (
          <button key={id} onClick={() => onView(id)} data-focusable
            style={{ font: '600 11.5px var(--font-ui)', padding: '4px 12px', borderRadius: 7, color: view === id ? 'var(--ink)' : 'var(--ink-3)', background: view === id ? 'var(--paper)' : 'transparent', boxShadow: view === id ? 'var(--shadow)' : 'none' }}>{label}</button>
        ))}
      </div>

      <div style={{ width: 1, height: 20, background: 'var(--line)', margin: '0 4px' }} />

      {ctrl('⌘', 'Command palette', onPalette)}
      {/* theme quick-cycle */}
      <button onClick={onTheme} data-focusable title="Cycle theme"
        style={{ display: 'flex', gap: 3, alignItems: 'center', padding: '5px 8px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-2)', flexShrink: 0 }}>
        {T[theme].swatch.map((c, i) => <span key={i} style={{ width: 9, height: 9, borderRadius: 9, background: c, border: '1px solid rgba(0,0,0,.1)' }} />)}
      </button>
      {ctrl(focus ? '◉' : '◎', 'Focus mode', onFocus)}
      {ctrl('⚙', 'Settings', onSettings)}
      <button onClick={onToggleAgent} data-focusable title="AI assistant (⌘/)"
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 8, font: '600 12px var(--font-ui)', color: agentOpen ? 'var(--accent-ink)' : 'var(--accent)', background: agentOpen ? 'var(--accent)' : 'var(--accent-soft)', flexShrink: 0, whiteSpace: 'nowrap' }}>
        ✦ Ask
      </button>

      <div style={{ width: 1, height: 20, background: 'var(--line)', margin: '0 4px', flexShrink: 0 }} />
      <div style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
        {ctrl('—', 'Minimize')}
        {ctrl('▢', 'Maximize')}
        {ctrl('✕', 'Close', null, true)}
      </div>
    </div>
  );
}

/* ============================ TAB BAR ============================ */
function TabBar({ tabs, activeId, onOpen, onLeft, leftOpen }) {
  return (
    <div style={{ height: 40, display: 'flex', alignItems: 'flex-end', gap: 2, padding: '0 8px', background: 'var(--surface)', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
      <button onClick={onLeft} data-focusable title="Toggle sidebar (⌘B)" style={{ width: 30, height: 30, borderRadius: 7, color: 'var(--ink-3)', marginBottom: 5, marginRight: 2, background: leftOpen ? 'var(--surface-2)' : 'transparent' }}>⊟</button>
      {tabs.map((t) => {
        const on = t.id === activeId;
        return (
          <button key={t.id} onClick={() => onOpen(t.id)} data-focusable
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 12px', height: 32, marginBottom: -1, borderRadius: '8px 8px 0 0',
              maxWidth: 200, font: '400 12.5px var(--font-ui)', color: on ? 'var(--ink)' : 'var(--ink-3)',
              background: on ? 'var(--bg)' : 'transparent', borderTop: on ? '1px solid var(--line)' : '1px solid transparent', borderLeft: on ? '1px solid var(--line)' : '1px solid transparent', borderRight: on ? '1px solid var(--line)' : '1px solid transparent', borderBottom: on ? '1px solid var(--bg)' : 'none' }}>
            <span style={{ fontSize: 13 }}>{t.icon}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
            {t.dirty && <span style={{ width: 6, height: 6, borderRadius: 6, background: 'var(--accent)' }} />}
            <span style={{ fontSize: 13, opacity: .5, marginLeft: 2 }}>×</span>
          </button>
        );
      })}
      <button data-focusable title="New tab" style={{ width: 26, height: 26, borderRadius: 7, color: 'var(--ink-3)', marginBottom: 4, marginLeft: 2 }}>＋</button>
    </div>
  );
}

/* ============================ BREADCRUMB ============================ */
function Breadcrumb({ crumb, onRight, rightOpen }) {
  return (
    <div style={{ height: 38, display: 'flex', alignItems: 'center', gap: 5, padding: '0 14px', background: 'var(--bg)', borderBottom: '1px solid var(--line-soft)', flexShrink: 0 }}>
      {crumb.map((c, i) => (
        <React.Fragment key={i}>
          <span style={{ font: '400 12.5px var(--font-ui)', color: i === crumb.length - 1 ? 'var(--ink-2)' : 'var(--ink-3)', cursor: 'pointer' }}>{c}</span>
          {i < crumb.length - 1 && <span style={{ color: 'var(--ink-3)', opacity: .5, fontSize: 11 }}>/</span>}
        </React.Fragment>
      ))}
      <div style={{ flex: 1 }} />
      <button data-focusable title="Edit" style={{ font: '500 12px var(--font-ui)', color: 'var(--ink-3)', padding: '4px 9px', borderRadius: 7 }}>✎ Edit</button>
      <button data-focusable title="Export" style={{ font: '500 12px var(--font-ui)', color: 'var(--ink-3)', padding: '4px 9px', borderRadius: 7 }}>↧ Export</button>
      <button onClick={onRight} data-focusable title="Toggle outline (⌘⇧B)" style={{ width: 28, height: 28, borderRadius: 7, color: 'var(--ink-3)', background: rightOpen ? 'var(--surface-2)' : 'transparent' }}>⊠</button>
    </div>
  );
}

/* ============================ STATUS BAR ============================ */
function StatusBar({ theme, pct, activity }) {
  const item = (children, opts = {}) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, ...opts }}>{children}</span>;
  return (
    <div style={{ height: 26, display: 'flex', alignItems: 'center', gap: 16, padding: '0 14px', background: 'var(--titlebar)', borderTop: '1px solid var(--line)', font: '500 11px var(--font-ui)', color: 'var(--ink-3)', flexShrink: 0 }}>
      {item(<><span style={{ color: 'var(--ok)' }}>●</span> Indexed</>)}
      {item(<>Graph: 14 nodes</>)}
      {item(<>1,480 words</>)}
      <div style={{ flex: 1 }} />
      {activity && item(<><span style={{ color: 'var(--accent)' }}>✦</span> {activity}</>, { color: 'var(--ink-2)' })}
      {item(<>{Math.round(pct)}% read</>)}
      {item(<><span style={{ width: 7, height: 7, borderRadius: 7, background: 'var(--accent)' }} /> {window.PRISM_THEMES[theme].label}</>)}
      {item(<span style={{ color: 'var(--ok)' }}>⬡ Privacy on</span>)}
    </div>
  );
}

/* ============================ COMMAND PALETTE ============================ */
function CommandPalette({ open, onClose, onRun }) {
  const { COMMANDS } = window.PRISM_DATA;
  const [q, setQ] = useSc('');
  const [sel, setSel] = useSc(0);
  const inputRef = useRc(null);
  useEc(() => { if (open) { setQ(''); setSel(0); setTimeout(() => inputRef.current && inputRef.current.focus(), 30); } }, [open]);
  const filtered = useMc(() => {
    const s = q.toLowerCase().trim();
    return COMMANDS.filter((c) => !s || c.label.toLowerCase().includes(s) || c.group.toLowerCase().includes(s));
  }, [q]);
  useEc(() => { if (sel >= filtered.length) setSel(0); }, [filtered.length]);
  if (!open) return null;
  const groups = [];
  filtered.forEach((c) => { let g = groups.find((x) => x.name === c.group); if (!g) { g = { name: c.group, items: [] }; groups.push(g); } g.items.push(c); });
  let flat = []; groups.forEach((g) => g.items.forEach((it) => flat.push(it)));
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (flat[sel]) { onRun(flat[sel]); onClose(); } }
    else if (e.key === 'Escape') { onClose(); }
  };
  let idx = -1;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'color-mix(in srgb, var(--ink) 28%, transparent)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh', animation: 'prismFade .12s' }}>
      <div onClick={(e) => e.stopPropagation()} onKeyDown={onKey}
        style={{ width: 'min(560px, 92vw)', background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--line)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', animation: 'prismScale .14s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '15px 18px', borderBottom: '1px solid var(--line)' }}>
          <span style={{ fontSize: 16, color: 'var(--ink-3)' }}>⌕</span>
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} placeholder="Search pages, run commands, switch theme…"
            style={{ flex: 1, border: 'none', background: 'transparent', font: '400 16px var(--font-ui)', color: 'var(--ink)' }} />
          <span style={{ font: '500 10px var(--font-mono)', padding: '2px 6px', borderRadius: 5, background: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--ink-3)' }}>esc</span>
        </div>
        <div style={{ maxHeight: 'min(420px, 56vh)', overflowY: 'auto', padding: 8 }}>
          {flat.length === 0 && <div style={{ padding: 24, textAlign: 'center', font: '400 13px var(--font-ui)', color: 'var(--ink-3)' }}>No matches</div>}
          {groups.map((g) => (
            <div key={g.name} style={{ marginBottom: 4 }}>
              <div style={{ font: '600 10px var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-3)', padding: '8px 10px 4px' }}>{g.name}</div>
              {g.items.map((c) => { idx++; const on = idx === sel; const myIdx = idx; return (
                <button key={c.label} onMouseEnter={() => setSel(myIdx)} onClick={() => { onRun(c); onClose(); }} data-focusable
                  style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '9px 11px', borderRadius: 9, textAlign: 'left', background: on ? 'var(--accent-soft)' : 'transparent' }}>
                  <span style={{ width: 22, textAlign: 'center', fontSize: 14 }}>{c.icon}</span>
                  <span style={{ font: '400 13.5px var(--font-ui)', color: 'var(--ink)' }}>{c.label}</span>
                  {c.hint && <span style={{ marginLeft: 'auto', font: '400 11.5px var(--font-ui)', color: 'var(--ink-3)' }}>{c.hint}</span>}
                </button>
              ); })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

window.PrismChrome = { TitleBar, TabBar, Breadcrumb, StatusBar, CommandPalette, PrismMark };
