/* Prism — sidebars. Left file tree, right multi-tab rail (Outline / Graph /
 * Flashcards / Tasks), and the AI agent chat with simulated streaming. */
const { useState: useSp, useRef: useRp, useEffect: useEp } = React;

/* ============================ LEFT — FILE TREE ============================ */
function TreeNode({ node, depth, activeId, onOpen }) {
  const [open, setOpen] = useSp(node.open !== false);
  if (node.type === 'folder') {
    return (
      <div>
        <button onClick={() => setOpen(!open)} data-focusable
          style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', padding: '5px 8px', paddingLeft: 8 + depth * 12, font: '600 11px var(--font-ui)', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-3)', borderRadius: 6 }}>
          <span style={{ transition: 'transform .15s', transform: open ? 'rotate(90deg)' : 'none', fontSize: 9 }}>▶</span>
          {node.name}
        </button>
        {open && node.children.map((c, i) => <TreeNode key={i} node={c} depth={depth + 1} activeId={activeId} onOpen={onOpen} />)}
      </div>
    );
  }
  const active = node.id === activeId;
  return (
    <button onClick={() => onOpen(node.id, node.type)} data-focusable
      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px', paddingLeft: 8 + depth * 12,
        font: '400 13.5px var(--font-ui)', color: active ? 'var(--ink)' : 'var(--ink-2)',
        background: active ? 'var(--accent-soft)' : 'transparent', borderRadius: 6, position: 'relative', textAlign: 'left' }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--surface-2)'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
      {active && <span style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 2.5, borderRadius: 3, background: 'var(--accent)' }} />}
      <span style={{ fontSize: node.type === 'home' ? 13 : 14, width: 16, textAlign: 'center' }}>{node.icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: active ? 500 : 400 }}>{node.name}</span>
    </button>
  );
}

function LeftSidebar({ activeId, onOpen, onPalette }) {
  const { TREE } = window.PRISM_DATA;
  const [q, setQ] = useSp('');
  return (
    <aside style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface)', borderRight: '1px solid var(--line)' }}>
      <div style={{ padding: '12px 12px 8px' }}>
        <button onClick={onPalette} data-focusable style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg)', font: '400 12.5px var(--font-ui)', color: 'var(--ink-3)' }}>
          <span style={{ fontSize: 13 }}>⌕</span> Search or jump to…
          <span style={{ marginLeft: 'auto', font: '500 10px var(--font-mono)', padding: '1px 5px', borderRadius: 4, background: 'var(--surface-2)', border: '1px solid var(--line)' }}>⌘P</span>
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
        {TREE.map((n, i) => <TreeNode key={i} node={n} depth={0} activeId={activeId} onOpen={onOpen} />)}
      </div>
      <div style={{ padding: 8, borderTop: '1px solid var(--line)' }}>
        <button data-focusable style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', font: '500 13px var(--font-ui)', color: 'var(--ink-2)', borderRadius: 6 }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
          <span style={{ color: 'var(--accent)', fontSize: 15 }}>＋</span> New page
        </button>
      </div>
    </aside>
  );
}

/* ============================ RIGHT — RAIL ============================ */
function Outline({ active, onClick }) {
  const { TOC } = window.PRISM_DATA;
  return (
    <div style={{ padding: '14px 14px' }}>
      <div style={{ font: '600 11px var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 12 }}>On this page</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {TOC.map((t) => {
          const on = active === t.id;
          return (
            <button key={t.id} onClick={() => onClick(t.id)} data-focusable
              style={{ display: 'flex', gap: 9, alignItems: 'baseline', textAlign: 'left', padding: '5px 8px', borderRadius: 6, font: `${on ? 500 : 400} 13px var(--font-ui)`, color: on ? 'var(--ink)' : 'var(--ink-3)', background: on ? 'var(--accent-soft)' : 'transparent' }}>
              <span style={{ width: 2, alignSelf: 'stretch', borderRadius: 2, background: on ? 'var(--accent)' : 'transparent' }} />
              {t.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FlashCards() {
  const { CARDS } = window.PRISM_DATA;
  const [i, setI] = useSp(0);
  const [flip, setFlip] = useSp(false);
  const card = CARDS[i];
  const statusColor = { new: 'var(--info)', learning: 'var(--warn)', mastered: 'var(--ok)' }[card.status];
  const next = (d) => { setFlip(false); setI((p) => (p + d + CARDS.length) % CARDS.length); };
  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ font: '600 11px var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>Flashcards</span>
        <span style={{ font: '500 11px var(--font-mono)', color: 'var(--ink-3)' }}>{i + 1}/{CARDS.length}</span>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {CARDS.map((c, k) => <span key={k} style={{ flex: 1, height: 3, borderRadius: 3, background: k === i ? 'var(--accent)' : 'var(--line)' }} />)}
      </div>
      <button onClick={() => setFlip(!flip)} data-focusable
        style={{ flex: 1, minHeight: 190, border: '1px solid var(--line)', borderRadius: 14, background: 'var(--paper)', padding: 20, textAlign: 'left', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow)', cursor: 'pointer' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '600 10px var(--font-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: statusColor, marginBottom: 14 }}>
          <span style={{ width: 6, height: 6, borderRadius: 6, background: statusColor }} />{card.status} · {flip ? 'answer' : 'question'}
        </span>
        <span style={{ font: `400 ${flip ? 16 : 19}px/1.5 var(--font-read)`, color: flip ? 'var(--ink-2)' : 'var(--ink)' }}>{flip ? card.a : card.q}</span>
        <span style={{ marginTop: 'auto', font: '400 11px var(--font-ui)', color: 'var(--ink-3)', paddingTop: 14 }}>tap to flip ↺</span>
      </button>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={() => next(1)} data-focusable style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid var(--line)', font: '600 12px var(--font-ui)', color: 'var(--err)' }}>✕ Again</button>
        <button onClick={() => next(1)} data-focusable style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid var(--line)', font: '600 12px var(--font-ui)', color: 'var(--ok)' }}>✓ Got it</button>
      </div>
    </div>
  );
}

function Tasks() {
  const { TASKS } = window.PRISM_DATA;
  const [tasks, setTasks] = useSp(TASKS);
  const cols = [['todo', 'To Do', 'var(--ink-3)'], ['doing', 'Doing', 'var(--accent)'], ['done', 'Done', 'var(--ok)']];
  const cycle = (id) => setTasks((ts) => ts.map((t) => t.id === id ? { ...t, status: t.status === 'todo' ? 'doing' : t.status === 'doing' ? 'done' : 'todo' } : t));
  const mark = { todo: '○', doing: '◐', done: '●' };
  return (
    <div style={{ padding: 14, overflowY: 'auto' }}>
      <div style={{ font: '600 11px var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 14 }}>Task board</div>
      {cols.map(([key, label, color]) => {
        const items = tasks.filter((t) => t.status === key);
        return (
          <div key={key} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: '600 11px var(--font-ui)', color, marginBottom: 7 }}>
              <span>{mark[key]}</span>{label}<span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>· {items.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((t) => (
                <div key={t.id} style={{ display: 'flex', gap: 9, padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--paper)', font: '400 13px/1.4 var(--font-ui)', color: 'var(--ink-2)' }}>
                  <button onClick={() => cycle(t.id)} data-focusable title="cycle status" style={{ color, flexShrink: 0, fontSize: 13 }}>{mark[t.status]}</button>
                  <span style={{ textDecoration: key === 'done' ? 'line-through' : 'none', opacity: key === 'done' ? .6 : 1 }}>{t.title}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RightSidebar({ tab, setTab, active, onTocClick, highlights, onRemoveHl, onUpdateNote, onJump }) {
  const tabs = [['outline', '☰', 'Outline'], ['graph', '🕸', 'Graph'], ['notes', '✎', 'Notes'], ['cards', '🃏', 'Cards'], ['tasks', '✓', 'Tasks']];
  const noteCount = (highlights || []).length;
  return (
    <aside style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface)', borderLeft: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', padding: '8px 8px 0', gap: 2, borderBottom: '1px solid var(--line)' }}>
        {tabs.map(([id, icon, label]) => (
          <button key={id} onClick={() => setTab(id)} data-focusable title={label}
            style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '8px 4px', font: '600 11.5px var(--font-ui)', color: tab === id ? 'var(--ink)' : 'var(--ink-3)', borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: -1 }}>
            <span style={{ fontSize: 13 }}>{icon}</span>
            {id === 'notes' && noteCount > 0 && <span style={{ position: 'absolute', top: 3, right: '50%', marginRight: -16, minWidth: 14, height: 14, padding: '0 3px', borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-ink)', font: '700 9px var(--font-ui)', display: 'grid', placeItems: 'center' }}>{noteCount}</span>}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {tab === 'outline' && <Outline active={active} onClick={onTocClick} />}
        {tab === 'graph' && <RailGraph />}
        {tab === 'notes' && <NotesPanel highlights={highlights} onRemove={onRemoveHl} onUpdateNote={onUpdateNote} onJump={onJump} />}
        {tab === 'cards' && <FlashCards />}
        {tab === 'tasks' && <Tasks />}
      </div>
    </aside>
  );
}

function NotesPanel({ highlights, onRemove, onUpdateNote, onJump }) {
  const hls = highlights || [];
  const [editing, setEditing] = useSp(null);
  const [draft, setDraft] = useSp('');
  if (hls.length === 0) {
    return (
      <div style={{ padding: '40px 22px', textAlign: 'center' }}>
        <div style={{ fontSize: 30, marginBottom: 12, opacity: .5 }}>✎</div>
        <div style={{ font: '500 14px var(--font-ui)', color: 'var(--ink-2)', marginBottom: 6 }}>No highlights yet</div>
        <div style={{ font: '400 12.5px/1.6 var(--font-ui)', color: 'var(--ink-3)' }}>Select any text in the document, then pick a color from the bubble. Your highlights and notes collect here.</div>
      </div>
    );
  }
  return (
    <div style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ font: '600 11px var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>Highlights & notes</span>
        <span style={{ font: '500 11px var(--font-mono)', color: 'var(--ink-3)' }}>{hls.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {hls.map((h) => (
          <div key={h.id} style={{ border: '1px solid var(--line)', borderRadius: 11, background: 'var(--paper)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 9, padding: '11px 12px' }}>
              <span style={{ flexShrink: 0, width: 4, alignSelf: 'stretch', borderRadius: 3, background: `var(--hl-${h.color})` }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <button onClick={() => onJump(h.blockIndex)} data-focusable title="Jump to passage"
                  style={{ textAlign: 'left', font: 'italic 400 13.5px/1.5 var(--font-read)', color: 'var(--ink)', display: 'block' }}>
                  “{h.text.length > 120 ? h.text.slice(0, 120) + '…' : h.text}”
                </button>
                {editing === h.id ? (
                  <div style={{ marginTop: 8 }}>
                    <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
                      placeholder="Write a note…"
                      style={{ width: '100%', resize: 'none', border: '1px solid var(--line)', borderRadius: 7, background: 'var(--surface-2)', padding: '6px 8px', font: '400 12.5px/1.5 var(--font-ui)', color: 'var(--ink)' }} />
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button onClick={() => { onUpdateNote(h.id, draft.trim()); setEditing(null); }} data-focusable style={{ font: '600 11px var(--font-ui)', color: 'var(--accent-ink)', background: 'var(--accent)', padding: '4px 10px', borderRadius: 6 }}>Save</button>
                      <button onClick={() => setEditing(null)} data-focusable style={{ font: '600 11px var(--font-ui)', color: 'var(--ink-3)', padding: '4px 8px' }}>Cancel</button>
                    </div>
                  </div>
                ) : h.note ? (
                  <button onClick={() => { setEditing(h.id); setDraft(h.note); }} data-focusable
                    style={{ textAlign: 'left', marginTop: 7, font: '400 12.5px/1.5 var(--font-ui)', color: 'var(--ink-2)', display: 'flex', gap: 6 }}>
                    <span style={{ color: 'var(--accent)' }}>✎</span>{h.note}
                  </button>
                ) : (
                  <button onClick={() => { setEditing(h.id); setDraft(''); }} data-focusable
                    style={{ marginTop: 7, font: '500 11.5px var(--font-ui)', color: 'var(--ink-3)' }}>+ Add note</button>
                )}
              </div>
              <button onClick={() => onRemove(h.id)} data-focusable title="Delete highlight"
                style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, color: 'var(--ink-3)', fontSize: 13, alignSelf: 'flex-start' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--err) 14%, transparent)'; e.currentTarget.style.color = 'var(--err)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink-3)'; }}>×</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RailGraph() {
  const ref = useRp(null);
  const [size, setSize] = useSp({ w: 280, h: 300 });
  useEp(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(() => {
      const r = ref.current.getBoundingClientRect();
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 14px 6px', font: '600 11px var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>This document’s graph</div>
      <div ref={ref} style={{ flex: 1, minHeight: 0 }}>
        <window.KnowledgeGraph width={size.w} height={size.h} compact />
      </div>
      <div style={{ padding: '8px 14px 14px', font: '400 11.5px var(--font-ui)', color: 'var(--ink-3)', borderTop: '1px solid var(--line)' }}>
        {window.PRISM_DATA.GRAPH.nodes.length} entities · drag to explore
      </div>
    </div>
  );
}

/* ============================ AGENT — AI CHAT ============================ */
function answerFor(q) {
  const s = q.toLowerCase();
  if (s.includes('two hop') || s.includes('2 hop') || s.includes('sweet spot'))
    return 'Two hops covers most reasoning chains — a question about A that depends on B, which depends on C. Past two hops the frontier explodes: degree compounds, precision collapses, and you start retrieving the whole graph. The note recommends bounding the frontier early rather than chasing deeper paths.';
  if (s.includes('result') || s.includes('table') || s.includes('accuracy'))
    return 'On 200 cross-document questions: vector-only scores 0.81 single-hop / 0.46 multi-hop; graph-only 0.74 / 0.71; the hybrid 0.86 / 0.78 at ~210ms. The graph carries multi-hop questions while vector seeds keep single-hop recall high.';
  if (s.includes('open problem') || s.includes('contradiction'))
    return 'The unsolved problem is contradiction. When two documents disagree, the graph stores both claims without flagging the conflict. The author argues a good instrument should surface exactly where sources collide rather than silently averaging them.';
  return 'Grounding in this document: it argues graph traversal beats flat vector search for multi-hop retrieval. Coreference resolution merges duplicate entities into one node, a 2-hop personalized PageRank (α≈0.15) bounds the walk, and a hybrid retriever wins on both single- and multi-hop accuracy.';
}

function ThinkingDots() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, font: '400 12.5px var(--font-ui)', color: 'var(--ink-3)' }}>
      <span style={{ display: 'inline-flex', gap: 3 }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 6, height: 6, borderRadius: 6, background: 'var(--accent)', animation: `prismThink 1s ease-in-out ${i * 0.16}s infinite` }} />
        ))}
      </span>
      reading the document…
    </div>
  );
}

function AgentSidebar({ injectQuery, onCite }) {
  const { CHAT } = window.PRISM_DATA;
  const [msgs, setMsgs] = useSp(CHAT);
  const [input, setInput] = useSp('');
  const [streaming, setStreaming] = useSp(null);
  const [thinking, setThinking] = useSp(false);
  const scrollRef = useRp(null);
  const lastInject = useRp(0);
  const live = !!(window.claude && window.claude.complete);

  const scrollDown = () => { requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }); };

  const reveal = (full) => {
    const words = full.split(' ');
    let n = 0;
    setStreaming('');
    const iv = setInterval(() => {
      n++;
      setStreaming(words.slice(0, n).join(' '));
      scrollDown();
      if (n >= words.length) {
        clearInterval(iv);
        setMsgs((m) => [...m, { role: 'assistant', content: full }]);
        setStreaming(null);
        scrollDown();
      }
    }, 20);
  };

  const send = async (text) => {
    const q = (text != null ? text : input).trim();
    if (!q || streaming || thinking) return;
    const history = msgs.filter((m) => m.kind !== 'summary');
    setMsgs((m) => [...m, { role: 'user', content: q }]);
    setInput('');
    scrollDown();
    setThinking(true);
    let full;
    try {
      if (window.claude && window.claude.complete) {
        const preamble = "You are Prism's reading assistant, embedded beside a document the reader is viewing. Answer ONLY from the document below. Be concise — 2 to 4 sentences — and cite specific numbers when they're relevant. If the answer isn't in the document, say so plainly.\n\n=== DOCUMENT ===\n" + window.PRISM_DATA.DOC_TEXT + "\n=== END DOCUMENT ===";
        const convo = history.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
        const messages = [
          { role: 'user', content: preamble },
          { role: 'assistant', content: 'Understood — I will answer strictly from this document.' },
          ...convo,
          { role: 'user', content: q },
        ];
        full = await window.claude.complete({ messages });
        if (!full || !full.trim()) full = answerFor(q);
      } else {
        await new Promise((r) => setTimeout(r, 450));
        full = answerFor(q);
      }
    } catch (e) {
      full = answerFor(q);
    }
    setThinking(false);
    reveal(full);
  };

  useEp(() => {
    if (injectQuery && injectQuery.n !== lastInject.current) {
      lastInject.current = injectQuery.n;
      send('Explain this passage: “' + injectQuery.text.slice(0, 90) + (injectQuery.text.length > 90 ? '…' : '') + '”');
    }
  }, [injectQuery]);

  return (
    <aside style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface)', borderLeft: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '13px 15px', borderBottom: '1px solid var(--line)' }}>
        <span style={{ width: 24, height: 24, borderRadius: 7, background: 'var(--accent)', color: 'var(--accent-ink)', display: 'grid', placeItems: 'center', fontSize: 13 }}>✦</span>
        <div style={{ lineHeight: 1.1 }}>
          <div style={{ font: '600 13.5px var(--font-ui)', color: 'var(--ink)' }}>Prism Assistant</div>
          <div style={{ font: '400 11px var(--font-ui)', color: 'var(--ink-3)' }}>reading Graph-RAG.md</div>
        </div>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, font: '600 10px var(--font-ui)', letterSpacing: '.04em', color: live ? 'var(--accent)' : 'var(--ok)', border: '1px solid color-mix(in srgb,' + (live ? 'var(--accent)' : 'var(--ok)') + ' 40%,transparent)', borderRadius: 20, padding: '2px 8px' }} title={live ? 'Connected to a live model' : 'Local model'}>
          <span style={{ width: 5, height: 5, borderRadius: 5, background: live ? 'var(--accent)' : 'var(--ok)' }} />{live ? 'LIVE' : 'LOCAL'}
        </span>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 15px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {msgs.map((m, i) => <ChatMsg key={i} m={m} onCite={onCite} onSuggest={send} />)}
        {thinking && <ThinkingDots />}
        {streaming !== null && <ChatMsg m={{ role: 'assistant', content: streaming }} streaming onCite={onCite} />}
      </div>

      <div style={{ padding: 12, borderTop: '1px solid var(--line)' }}>
        <div style={{ border: '1px solid var(--line)', borderRadius: 12, background: 'var(--paper)', padding: 8, boxShadow: 'var(--shadow)' }}>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask about this document…"
            style={{ width: '100%', resize: 'none', border: 'none', background: 'transparent', font: '400 13.5px/1.5 var(--font-ui)', color: 'var(--ink)', maxHeight: 100 }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ font: '400 11px var(--font-ui)', color: 'var(--ink-3)' }}>⌘/ to toggle</span>
            <button onClick={() => send()} data-focusable disabled={!!streaming || thinking}
              style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-ink)', display: 'grid', placeItems: 'center', fontSize: 14, opacity: (streaming || thinking) ? .5 : 1 }}>↑</button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function ChatMsg({ m, streaming, onCite, onSuggest }) {
  if (m.kind === 'summary') {
    return (
      <div>
        <div style={{ border: '1px solid var(--line)', borderRadius: 12, background: 'var(--accent-soft)', padding: '13px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: '600 11px var(--font-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 8 }}>✦ Document summary</div>
          <div style={{ font: '400 13.5px/1.6 var(--font-read)', color: 'var(--ink-2)' }}>{m.content}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {m.suggestions.map((s, i) => (
            <button key={i} onClick={() => onSuggest(s)} data-focusable
              style={{ textAlign: 'left', font: '400 12.5px var(--font-ui)', color: 'var(--ink-2)', border: '1px solid var(--line)', borderRadius: 9, padding: '8px 11px', background: 'var(--paper)' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--ink)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.color = 'var(--ink-2)'; }}>
              <span style={{ color: 'var(--accent)', marginRight: 6 }}>→</span>{s}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (m.role === 'user') {
    return <div style={{ alignSelf: 'flex-end', maxWidth: '88%', background: 'var(--accent)', color: 'var(--accent-ink)', padding: '8px 13px', borderRadius: '13px 13px 3px 13px', font: '400 13.5px/1.5 var(--font-ui)' }}>{m.content}</div>;
  }
  return (
    <div style={{ maxWidth: '94%' }}>
      <div style={{ font: '400 13.5px/1.62 var(--font-read)', color: 'var(--ink)' }}>
        {m.content}{streaming && <span style={{ display: 'inline-block', width: 7, height: 14, background: 'var(--accent)', marginLeft: 2, verticalAlign: 'text-bottom', animation: 'prismFade .6s steps(2) infinite alternate' }} />}
      </div>
      {m.cite && !streaming && (
        <button onClick={() => onCite && onCite(m.cite)} data-focusable style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 5, font: '500 11px var(--font-ui)', color: 'var(--accent)', border: '1px solid var(--accent-soft)', background: 'var(--accent-soft)', borderRadius: 7, padding: '3px 9px' }}>
          ⧉ Jump to “Does it actually help?”
        </button>
      )}
    </div>
  );
}

window.PrismPanels = { LeftSidebar, RightSidebar, AgentSidebar };
