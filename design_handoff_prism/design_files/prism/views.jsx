/* Prism — full-surface views: Dashboard (home), Graph view, Settings dialog. */
const { useState: useSv, useRef: useRv, useEffect: useEv } = React;

/* ============================ DASHBOARD ============================ */
function Dashboard({ onOpen, onPalette }) {
  const { RECENT, TASKS } = window.PRISM_DATA;
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const done = TASKS.filter((t) => t.status === 'done').length;
  const actions = [
    ['📝', 'New page', 'Blank document'],
    ['🗓️', 'Daily journal', '⌘⇧J'],
    ['⚡', 'Horse Mode', 'AI writes a draft'],
    ['🕸', 'Open graph', 'Knowledge map'],
  ];
  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '64px 40px 120px' }}>
        <div style={{ font: '400 13px var(--font-ui)', color: 'var(--ink-3)', letterSpacing: '.04em', marginBottom: 6 }}>{date}</div>
        <h1 style={{ font: '500 38px/1.1 var(--font-display)', color: 'var(--ink)', letterSpacing: '-0.015em', marginBottom: 30 }}>{greet}.</h1>

        {/* continue reading */}
        <button onClick={() => onOpen('graph-rag')} data-focusable
          style={{ display: 'flex', alignItems: 'center', gap: 18, width: '100%', textAlign: 'left', padding: 22, borderRadius: 16, border: '1px solid var(--line)', background: 'var(--paper)', boxShadow: 'var(--shadow)', marginBottom: 28 }}>
          <span style={{ fontSize: 38 }}>🔭</span>
          <div style={{ flex: 1 }}>
            <div style={{ font: '600 10px var(--font-ui)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 5 }}>Continue reading</div>
            <div style={{ font: '500 21px/1.2 var(--font-display)', color: 'var(--ink)', marginBottom: 5 }}>Graph-RAG: Retrieval over a Knowledge Graph</div>
            <div style={{ font: '400 13px var(--font-ui)', color: 'var(--ink-3)' }}>7 min read · 64% through · last opened just now</div>
            <div style={{ height: 4, borderRadius: 4, background: 'var(--surface-2)', marginTop: 10, overflow: 'hidden' }}><div style={{ width: '64%', height: '100%', background: 'var(--accent)' }} /></div>
          </div>
          <span style={{ fontSize: 22, color: 'var(--ink-3)' }}>→</span>
        </button>

        {/* quick actions */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 34 }}>
          {actions.map(([icon, label, sub], i) => (
            <button key={i} onClick={onPalette} data-focusable
              style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 14px', borderRadius: 13, border: '1px solid var(--line)', background: 'var(--surface)', textAlign: 'left' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.transform = 'none'; }}>
              <span style={{ fontSize: 22 }}>{icon}</span>
              <div>
                <div style={{ font: '600 13.5px var(--font-ui)', color: 'var(--ink)' }}>{label}</div>
                <div style={{ font: '400 11.5px var(--font-ui)', color: 'var(--ink-3)', marginTop: 2 }}>{sub}</div>
              </div>
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24 }}>
          {/* recent */}
          <div>
            <div style={{ font: '600 11px var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 12 }}>Recent</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {RECENT.map((r) => (
                <button key={r.id} onClick={() => onOpen(r.id)} data-focusable
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, textAlign: 'left' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ fontSize: 18 }}>{r.icon}</span>
                  <span style={{ flex: 1, font: '400 14px var(--font-ui)', color: 'var(--ink)' }}>{r.title}</span>
                  <span style={{ font: '400 12px var(--font-ui)', color: 'var(--ink-3)' }}>{r.when}</span>
                </button>
              ))}
            </div>
          </div>
          {/* tasks */}
          <div>
            <div style={{ font: '600 11px var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 12 }}>Today’s tasks · {done}/{TASKS.length}</div>
            <div style={{ border: '1px solid var(--line)', borderRadius: 13, background: 'var(--surface)', padding: 8 }}>
              {TASKS.map((t) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', font: '400 13px var(--font-ui)', color: t.status === 'done' ? 'var(--ink-3)' : 'var(--ink-2)' }}>
                  <span style={{ color: t.status === 'done' ? 'var(--ok)' : t.status === 'doing' ? 'var(--accent)' : 'var(--ink-3)' }}>{t.status === 'done' ? '●' : t.status === 'doing' ? '◐' : '○'}</span>
                  <span style={{ textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================ GRAPH VIEW (full) ============================ */
function GraphView() {
  const ref = useRv(null);
  const [size, setSize] = useSv({ w: 800, h: 600 });
  const [banner, setBanner] = useSv(true);
  const SP = window.PRISM_SPECTRUM;
  useEv(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(() => { const r = ref.current.getBoundingClientRect(); setSize({ w: Math.round(r.width), h: Math.round(r.height) }); });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const legend = [['Concepts', SP[1]], ['Documents', SP[0]], ['Entities', SP[2]], ['Methods', SP[4]], ['Conflicts', SP[5]]];
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)', position: 'relative', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px', borderBottom: '1px solid var(--line-soft)' }}>
        <div>
          <div style={{ font: '500 19px var(--font-display)', color: 'var(--ink)' }}>Knowledge Graph</div>
          <div style={{ font: '400 12px var(--font-ui)', color: 'var(--ink-3)' }}>14 entities · 18 relations · document-scoped</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {legend.map(([l, c]) => (
            <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '500 12px var(--font-ui)', color: 'var(--ink-2)' }}>
              <span style={{ width: 9, height: 9, borderRadius: 9, background: c }} />{l}
            </span>
          ))}
        </div>
      </div>
      {banner && (
        <div style={{ margin: '14px 22px 0', display: 'flex', alignItems: 'center', gap: 11, padding: '11px 15px', borderRadius: 11, background: 'var(--color-warning-bg, color-mix(in srgb, var(--warn) 9%, var(--paper)))', border: '1px solid color-mix(in srgb,var(--warn) 35%,var(--line))' }}>
          <span style={{ width: 22, height: 22, borderRadius: 7, background: 'var(--warn)', color: 'var(--paper)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 12 }}>⚠</span>
          <span style={{ font: '400 13px var(--font-ui)', color: 'var(--ink-2)' }}><strong style={{ color: 'var(--ink)', fontWeight: 600 }}>1 contradiction detected.</strong> “Contradiction” connects two documents that disagree on retrieval latency.</span>
          <button onClick={() => setBanner(false)} style={{ marginLeft: 'auto', color: 'var(--ink-3)', fontSize: 16 }}>×</button>
        </div>
      )}
      <div ref={ref} style={{ flex: 1, minHeight: 0, margin: '8px 12px 12px' }}>
        <window.KnowledgeGraph width={size.w} height={size.h} />
      </div>
    </div>
  );
}

/* ============================ SETTINGS ============================ */
function Settings({ open, onClose, theme, setTheme }) {
  const [section, setSection] = useSv('appearance');
  const T = window.PRISM_THEMES;
  if (!open) return null;
  const nav = [['appearance', '◐', 'Appearance'], ['ai', '✦', 'AI providers'], ['privacy', '⬡', 'Privacy'], ['about', 'ⓘ', 'About']];
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'color-mix(in srgb, var(--ink) 30%, transparent)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', animation: 'prismFade .12s' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(820px, 94vw)', height: 'min(560px, 88vh)', background: 'var(--surface)', borderRadius: 18, border: '1px solid var(--line)', boxShadow: 'var(--shadow-lg)', display: 'flex', overflow: 'hidden', animation: 'prismScale .14s ease' }}>
        {/* nav */}
        <div style={{ width: 200, background: 'var(--surface-2)', borderRight: '1px solid var(--line)', padding: 12, flexShrink: 0 }}>
          <div style={{ font: '500 15px var(--font-display)', color: 'var(--ink)', padding: '8px 10px 14px' }}>Settings</div>
          {nav.map(([id, icon, label]) => (
            <button key={id} onClick={() => setSection(id)} data-focusable
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 11px', borderRadius: 9, textAlign: 'left', font: '500 13.5px var(--font-ui)', color: section === id ? 'var(--ink)' : 'var(--ink-2)', background: section === id ? 'var(--accent-soft)' : 'transparent', marginBottom: 2 }}>
              <span style={{ width: 18, textAlign: 'center', color: section === id ? 'var(--accent)' : 'var(--ink-3)' }}>{icon}</span>{label}
            </button>
          ))}
        </div>
        {/* content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          <button onClick={onClose} style={{ position: 'absolute', top: 18, right: 18, width: 30, height: 30, borderRadius: 8, color: 'var(--ink-3)', fontSize: 16 }}>×</button>
          {section === 'appearance' && (
            <div>
              <h3 style={{ font: '500 20px var(--font-display)', color: 'var(--ink)', marginBottom: 4 }}>Appearance</h3>
              <p style={{ font: '400 13px var(--font-ui)', color: 'var(--ink-3)', marginBottom: 20 }}>Three warm reading identities. Pick the one your eyes want today.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 28 }}>
                {Object.entries(T).map(([id, t]) => {
                  const on = theme === id;
                  return (
                    <button key={id} onClick={() => setTheme(id)} data-focusable
                      style={{ borderRadius: 13, border: on ? '2px solid var(--accent)' : '2px solid var(--line)', overflow: 'hidden', textAlign: 'left', background: 'var(--paper)' }}>
                      <div style={{ height: 76, background: t.vars['--bg'], padding: 10, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div style={{ height: 8, width: '60%', borderRadius: 4, background: t.vars['--ink'] }} />
                        <div style={{ display: 'flex', gap: 4 }}>{t.swatch.map((c, i) => <span key={i} style={{ width: 16, height: 16, borderRadius: 9, background: c, border: '1px solid rgba(0,0,0,.12)' }} />)}</div>
                      </div>
                      <div style={{ padding: '9px 11px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: '600 13px var(--font-ui)', color: 'var(--ink)' }}>{t.label}{on && <span style={{ color: 'var(--accent)' }}>✓</span>}</div>
                        <div style={{ font: '400 11px/1.4 var(--font-ui)', color: 'var(--ink-3)', marginTop: 2 }}>{t.blurb}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <Row label="Reading font" value="Spectral" sub="A screen-tuned serif" />
              <Row label="Display font" value="Newsreader" sub="Headlines & titles" />
              <Row label="Interface font" value="Hanken Grotesk" sub="Chrome & controls" />
              <Row label="Code font" value="JetBrains Mono" sub="Editor & blocks" last />
            </div>
          )}
          {section === 'ai' && (
            <div>
              <h3 style={{ font: '500 20px var(--font-display)', color: 'var(--ink)', marginBottom: 4 }}>AI providers</h3>
              <p style={{ font: '400 13px var(--font-ui)', color: 'var(--ink-3)', marginBottom: 20 }}>Local model active — Privacy Mode blocks every cloud call.</p>
              {[['Ollama', 'llama3.1 · local', true, 'var(--ok)'], ['Anthropic', 'Claude — disabled in privacy mode', false, 'var(--ink-3)'], ['OpenAI', 'GPT-4o — disabled', false, 'var(--ink-3)'], ['Custom endpoint', 'OpenAI-compatible', false, 'var(--ink-3)']].map(([name, sub, active, dot], i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', border: '1px solid var(--line)', borderRadius: 11, marginBottom: 8, background: active ? 'var(--accent-soft)' : 'var(--paper)', opacity: active ? 1 : .7 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 8, background: dot }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ font: '600 13.5px var(--font-ui)', color: 'var(--ink)' }}>{name}</div>
                    <div style={{ font: '400 12px var(--font-ui)', color: 'var(--ink-3)' }}>{sub}</div>
                  </div>
                  {active ? <span style={{ font: '600 11px var(--font-ui)', color: 'var(--ok)' }}>ACTIVE</span> : <span style={{ font: '500 12px var(--font-ui)', color: 'var(--ink-3)' }}>Activate</span>}
                </div>
              ))}
            </div>
          )}
          {section === 'privacy' && (
            <div>
              <h3 style={{ font: '500 20px var(--font-display)', color: 'var(--ink)', marginBottom: 4 }}>Privacy</h3>
              <p style={{ font: '400 13px var(--font-ui)', color: 'var(--ink-3)', marginBottom: 20 }}>Your reading never leaves this machine.</p>
              <Toggle label="Privacy Mode" sub="Block all external API calls; force local-only models." on />
              <Toggle label="Conversation memory" sub="Remember chats per file for richer follow-ups." on />
              <Toggle label="Local knowledge graph" sub="Index saved documents into your own graph." on last />
            </div>
          )}
          {section === 'about' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', gap: 14 }}>
              <window.PrismChrome.PrismMark size={56} />
              <div>
                <div style={{ font: '500 26px var(--font-display)', color: 'var(--ink)' }}>Prism</div>
                <div style={{ font: 'italic 400 14px var(--font-read)', color: 'var(--ink-3)' }}>a reading instrument</div>
              </div>
              <div style={{ font: '400 12.5px/1.7 var(--font-ui)', color: 'var(--ink-3)', maxWidth: 360 }}>
                Markdown, refracted. Read, annotate, ask, and connect your documents into one knowledge graph — entirely on your own machine.
              </div>
              <div style={{ font: '500 11px var(--font-mono)', color: 'var(--ink-3)' }}>v2.0 · MIT</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
function Row({ label, value, sub, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '13px 2px', borderBottom: last ? 'none' : '1px solid var(--line-soft)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ font: '500 13.5px var(--font-ui)', color: 'var(--ink)' }}>{label}</div>
        {sub && <div style={{ font: '400 12px var(--font-ui)', color: 'var(--ink-3)' }}>{sub}</div>}
      </div>
      <div style={{ font: '500 13px var(--font-ui)', color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 7 }}>{value}<span style={{ fontSize: 10, color: 'var(--ink-3)' }}>▾</span></div>
    </div>
  );
}
function Toggle({ label, sub, on, last }) {
  const [v, setV] = useSv(on);
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '14px 2px', borderBottom: last ? 'none' : '1px solid var(--line-soft)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ font: '500 13.5px var(--font-ui)', color: 'var(--ink)' }}>{label}</div>
        {sub && <div style={{ font: '400 12px var(--font-ui)', color: 'var(--ink-3)', marginTop: 1 }}>{sub}</div>}
      </div>
      <button onClick={() => setV(!v)} data-focusable style={{ width: 42, height: 24, borderRadius: 20, background: v ? 'var(--accent)' : 'var(--line)', position: 'relative', transition: 'background .18s' }}>
        <span style={{ position: 'absolute', top: 2, left: v ? 20 : 2, width: 20, height: 20, borderRadius: 20, background: 'var(--paper)', transition: 'left .18s', boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} />
      </button>
    </div>
  );
}

window.PrismViews = { Dashboard, GraphView, Settings };
