/* Prism — app shell: state, layout, keyboard shortcuts, boot. */
const { useState: useSa, useRef: useRa, useEffect: useEa, useCallback: useCba } = React;
const { TitleBar, TabBar, Breadcrumb, StatusBar, CommandPalette } = window.PrismChrome;
const { LeftSidebar, RightSidebar, AgentSidebar } = window.PrismPanels;
const { DocumentReader } = window.PrismDocument;
const { Dashboard, GraphView, Settings } = window.PrismViews;

function Collapsible({ open, width, children, side }) {
  return (
    <div style={{ width: open ? width : 0, flexShrink: 0, overflow: 'hidden', transition: 'width .24s cubic-bezier(.16,1,.3,1)' }}>
      <div style={{ width, height: '100%' }}>{children}</div>
    </div>
  );
}

function Toast({ msg, onDone }) {
  useEa(() => { if (!msg) return; const t = setTimeout(onDone, 2600); return () => clearTimeout(t); }, [msg]);
  if (!msg) return null;
  return (
    <div style={{ position: 'fixed', bottom: 44, left: '50%', transform: 'translateX(-50%)', zIndex: 300, background: 'var(--ink)', color: 'var(--paper)', padding: '11px 18px', borderRadius: 11, font: '500 13px var(--font-ui)', boxShadow: 'var(--shadow-lg)', display: 'flex', alignItems: 'center', gap: 9, animation: 'prismRise .2s ease' }}>
      <span style={{ color: 'var(--accent)' }}>✦</span>{msg}
    </div>
  );
}

function App() {
  const params = new URLSearchParams(location.search);
  const forcedTheme = params.get('theme');
  const compact = params.has('compact'); // tighter chrome for compare tiles
  if (params.has('compare') || forcedTheme) window.PRISM_NO_PERSIST = true;
  const stored = (() => { try { return localStorage.getItem('prism.theme'); } catch (e) { return null; } })();
  const initial = (forcedTheme && window.PRISM_THEMES[forcedTheme]) ? forcedTheme : (stored && window.PRISM_THEMES[stored] ? stored : 'parchment');
  const [theme, setThemeState] = useSa(initial);
  const [activeId, setActiveId] = useSa('graph-rag');
  const [view, setView] = useSa('read');
  const [leftOpen, setLeftOpen] = useSa(!compact);
  const [rightOpen, setRightOpen] = useSa(true);
  const [rightTab, setRightTab] = useSa('outline');
  const [agentOpen, setAgentOpen] = useSa(!compact);
  const [focus, setFocus] = useSa(false);
  const [palette, setPalette] = useSa(false);
  const [settings, setSettings] = useSa(false);
  const [inject, setInject] = useSa(null);
  const [active, setActive] = useSa(null);
  const [pct, setPct] = useSa(0);
  const [activity, setActivity] = useSa('');
  const [toast, setToast] = useSa(''); 
  const [highlights, setHighlights] = useSa(() => { try { return JSON.parse(localStorage.getItem('prism.highlights') || '[]'); } catch (e) { return []; } });
  const scrollRef = useRa(null);

  useEa(() => { try { localStorage.setItem('prism.highlights', JSON.stringify(highlights)); } catch (e) {} }, [highlights]);
  const addHighlight = (h) => setHighlights((hs) => [...hs, { ...h, id: 'h' + Date.now() + Math.random().toString(36).slice(2, 6), note: '', createdAt: Date.now() }]);
  const removeHighlight = (id) => setHighlights((hs) => hs.filter((x) => x.id !== id));
  const updateNote = (id, note) => setHighlights((hs) => hs.map((x) => x.id === id ? { ...x, note } : x));

  const setTheme = useCba((id) => { window.applyPrismTheme(id); setThemeState(id); }, []);
  useEa(() => { window.applyPrismTheme(theme); const b = document.getElementById('boot'); if (b) { b.style.opacity = '0'; setTimeout(() => b.remove(), 420); } }, []);

  const cycleTheme = () => { const ids = Object.keys(window.PRISM_THEMES); setTheme(ids[(ids.indexOf(theme) + 1) % ids.length]); };

  const openDoc = (id) => {
    if (id === 'dash') { setActiveId('dash'); setView('read'); return; }
    setActiveId(id); setView('read');
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const scrollToSec = (id) => {
    const el = scrollRef.current; if (!el) return;
    const target = el.querySelector('#sec-' + id);
    if (target) el.scrollTo({ top: target.offsetTop - 64, behavior: 'smooth' });
  };

  const scrollToBlock = (pid) => {
    const el = scrollRef.current; if (!el || pid == null) return;
    const target = el.querySelector('[data-pid="' + pid + '"]');
    if (target) {
      el.scrollTo({ top: target.offsetTop - 90, behavior: 'smooth' });
      target.style.transition = 'background .3s'; target.style.background = 'var(--accent-soft)';
      setTimeout(() => { target.style.background = ''; }, 1100);
    }
  };

  const ask = (text) => { setAgentOpen(true); setInject({ text, n: (inject ? inject.n : 0) + 1 }); };

  const runCommand = (c) => {
    if (c.kind === 'open') openDoc(c.target);
    else if (c.kind === 'theme') setTheme(c.target);
    else if (c.kind === 'graph') setView('graph');
    else if (c.kind === 'settings') setSettings(true);
    else if (c.kind === 'panel') { setRightOpen(true); setRightTab(c.target); }
    else if (c.kind === 'toast') { setToast(c.label.split('—')[0].trim() + ' started…'); setActivity('Horse Mode · drafting'); setTimeout(() => setActivity(''), 4000); }
  };

  // keyboard shortcuts
  useEa(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); setPalette((p) => !p); }
      else if (mod && e.key === '/') { e.preventDefault(); setAgentOpen((a) => !a); }
      else if (mod && e.key.toLowerCase() === 'b' && !e.shiftKey) { e.preventDefault(); setLeftOpen((l) => !l); }
      else if (mod && e.key.toLowerCase() === 'b' && e.shiftKey) { e.preventDefault(); setRightOpen((r) => !r); }
      else if (mod && e.key === ',') { e.preventDefault(); setSettings((s) => !s); }
      else if (e.key === 'Escape') { setPalette(false); setSettings(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inject]);

  const isDash = activeId === 'dash';
  const crumb = isDash ? ['Workspace', 'Dashboard'] : window.PRISM_DATA.DOC.crumb;

  return (
    <React.Fragment>
      <TitleBar onPalette={() => setPalette(true)} onTheme={cycleTheme} theme={theme}
        onToggleAgent={() => setAgentOpen((a) => !a)} agentOpen={agentOpen}
        focus={focus} onFocus={() => setFocus((f) => !f)} onSettings={() => setSettings(true)}
        view={view} onView={setView} />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {!focus && <Collapsible open={leftOpen} width={248} side="left"><LeftSidebar activeId={activeId} onOpen={openDoc} onPalette={() => setPalette(true)} /></Collapsible>}

        {/* center */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg)' }}>
          {!focus && <TabBar tabs={window.PRISM_DATA.TABS} activeId={isDash ? null : activeId} onOpen={openDoc} onLeft={() => setLeftOpen((l) => !l)} leftOpen={leftOpen} />}
          {!isDash && view === 'read' && !focus && <Breadcrumb crumb={crumb} onRight={() => setRightOpen((r) => !r)} rightOpen={rightOpen} />}
          <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
            {isDash ? <Dashboard onOpen={openDoc} onPalette={() => setPalette(true)} />
              : view === 'graph' ? <GraphView />
              : <DocumentReader scrollRef={scrollRef} onEntity={() => setView('graph')} onAsk={ask}
                  highlights={highlights} onAddHighlight={(h) => { addHighlight(h); setRightOpen(true); setRightTab('notes'); }}
                  onScrollInfo={({ pct, active }) => { setPct(pct); setActive(active); }} />}
          </div>
        </div>

        {!focus && !isDash && view === 'read' && <Collapsible open={rightOpen} width={284} side="right"><RightSidebar tab={rightTab} setTab={setRightTab} active={active} onTocClick={scrollToSec} highlights={highlights} onRemoveHl={removeHighlight} onUpdateNote={updateNote} onJump={scrollToBlock} /></Collapsible>}
        {!focus && <Collapsible open={agentOpen} width={344} side="agent"><AgentSidebar injectQuery={inject} onCite={scrollToSec} /></Collapsible>}
      </div>

      <StatusBar theme={theme} pct={pct} activity={activity} />

      <CommandPalette open={palette} onClose={() => setPalette(false)} onRun={runCommand} />
      <Settings open={settings} onClose={() => setSettings(false)} theme={theme} setTheme={setTheme} />
      <Toast msg={toast} onDone={() => setToast('')} />

      {focus && (
        <button onClick={() => setFocus(false)} data-focusable
          style={{ position: 'fixed', top: 52, right: 16, zIndex: 120, font: '600 12px var(--font-ui)', color: 'var(--ink-2)', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 9, padding: '7px 13px', boxShadow: 'var(--shadow)' }}>
          ◉ Exit focus
        </button>
      )}
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
