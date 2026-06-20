/* Prism — content model. A real technical document plus all the workspace
 * data the prototype renders. Pure data, no JSX. */
(function () {
  // ---- Inline token helpers (used in rich paragraphs) -------------------
  const T = (s) => ({ t: 'plain', s });
  const B = (s) => ({ t: 'b', s });
  const I = (s) => ({ t: 'i', s });
  const C = (s) => ({ t: 'code', s });
  const HL = (s, color, note) => ({ t: 'hl', s, color, note });
  const E = (s, id) => ({ t: 'entity', s, id });
  const M = (s) => ({ t: 'math', s });

  // ---- The document, as structured blocks --------------------------------
  const DOC = {
    id: 'graph-rag',
    icon: '🔭',
    title: 'Graph-RAG: Retrieval over a Knowledge Graph',
    crumb: ['Workspace', 'Research', 'graph-rag.md'],
    meta: { words: 1480, read: '7 min', edited: 'Edited 2h ago', author: 'You' },
    blocks: [
      { type: 'lede', text: [
        T('Retrieval-augmented generation is only as good as what it can retrieve. Flat vector search returns passages that '),
        I('look'), T(' similar; it rarely understands how ideas '), B('connect'),
        T('. This note works through a retrieval layer that walks a knowledge graph instead of a vector list — the approach that powers Prism’s own '),
        E('knowledge graph', 'kg'), T(' feature.'),
      ]},
      { type: 'callout', variant: 'note', title: 'Working definition', text: [
        T('A '), B('knowledge graph'), T(' stores claims as nodes and relations as typed edges. '),
        T('“Retrieval” becomes a traversal problem: start at the entities a question mentions, then expand outward along the edges most likely to carry an answer.'),
      ]},
      { type: 'h2', id: 'why-graphs', text: 'Why graphs beat flat lists' },
      { type: 'p', text: [
        T('Vector RAG embeds every chunk into a high-dimensional space and ranks by cosine similarity. It is fast and it is shallow. Two passages about '),
        HL('the same entity under different names', 'yellow', 'Coreference: “the Bolt protocol” vs “Neo4j’s wire format”.'),
        T(' never meet, because their embeddings drift apart. A graph resolves them to one node, so a single hop reaches both.'),
      ]},
      { type: 'p', text: [
        T('The similarity score itself is unchanged — we still compare embeddings to seed the walk:'),
      ]},
      { type: 'math', tex: 'sim(q, d) = cos(θ) = ( q · d ) / ( ‖q‖ ‖d‖ )', caption: 'Cosine similarity seeds the entry points; the graph does the rest.' },
      { type: 'p', text: [
        T('From those seeds we run a short, bounded walk. The relevance of a candidate node '), M('v'),
        T(' blends its seed similarity with how reachable it is from the question’s entities — a personalized PageRank with restart probability '),
        M('α'), T(':'),
      ]},
      { type: 'math', tex: 'r(v) = α · s(v) + (1 − α) · Σ_{u→v}  r(u) / deg(u)', caption: 'Personalized PageRank — α≈0.15 keeps the walk anchored to the query.' },
      { type: 'callout', variant: 'tip', title: 'Rule of thumb', text: [
        T('Two hops is usually enough. Beyond that, precision falls off a cliff and you start retrieving the entire graph. Bound the frontier early.'),
      ]},
      { type: 'h2', id: 'pipeline', text: 'The retrieval pipeline' },
      { type: 'p', text: [
        T('End to end, a query flows through five stages. Each is independently swappable — the extractor, the store, and the ranker are all behind interfaces.'),
      ]},
      { type: 'mermaid' },
      { type: 'h2', id: 'extraction', text: 'Extracting entities from a document' },
      { type: 'p', text: [
        T('When you save a file to the graph, Prism asks the active model to pull out '),
        E('entities', 'ent'), T(' and the '), E('relations', 'rel'),
        T(' between them, then upserts both into '), E('Neo4j', 'neo4j'),
        T('. The prompt is deliberately strict — JSON only, typed edges, no prose.'),
      ]},
      { type: 'runcode', lang: 'python', label: 'extract.py',
        code: [
          'from prism import graph, llm',
          '',
          'PROMPT = "Extract (entity, relation, entity) triples as JSON."',
          '',
          'def index(doc: str) -> int:',
          '    triples = llm.json(PROMPT, doc)',
          '    for s, rel, o in triples:',
          '        graph.upsert(s); graph.upsert(o)',
          '        graph.link(s, o, type=rel)',
          '    return len(triples)',
          '',
          'print("indexed", index(open("graph-rag.md").read()), "triples")',
        ],
        output: { kind: 'lines', lines: [
          'indexed 23 triples',
        ]},
      },
      { type: 'p', text: [
        T('The model returns triples; the loop is plain. The interesting work is in '),
        C('graph.upsert'), T(' — it resolves coreferences so '), I('“PPR”'),
        T(' and '), I('“personalized PageRank”'), T(' collapse to the same node.'),
      ]},
      { type: 'h2', id: 'ranking', text: 'Ranking the frontier' },
      { type: 'p', text: [
        T('Two languages, one algorithm. The walk is small enough to run in the renderer for previews, and on the worker thread for real queries.'),
      ]},
      { type: 'tabs', tabs: [
        { label: 'TypeScript', lang: 'ts', code: [
          'export function pprank(seed: Map<Id, number>, hops = 2) {',
          '  let frontier = new Map(seed);',
          '  const score = new Map(seed);',
          '  for (let h = 0; h < hops; h++) {',
          '    const next = new Map<Id, number>();',
          '    for (const [u, r] of frontier)',
          '      for (const v of graph.neighbors(u))',
          '        next.set(v, (next.get(v) ?? 0) + r / graph.deg(u));',
          '    for (const [v, r] of next)',
          '      score.set(v, (score.get(v) ?? 0) + 0.85 * r);',
          '    frontier = next;',
          '  }',
          '  return rank(score);',
          '}',
        ]},
        { label: 'Python', lang: 'python', code: [
          'def pprank(seed, hops=2, decay=0.85):',
          '    frontier, score = dict(seed), dict(seed)',
          '    for _ in range(hops):',
          '        nxt = defaultdict(float)',
          '        for u, r in frontier.items():',
          '            for v in graph.neighbors(u):',
          '                nxt[v] += r / graph.deg(u)',
          '        for v, r in nxt.items():',
          '            score[v] = score.get(v, 0) + decay * r',
          '        frontier = nxt',
          '    return rank(score)',
        ]},
      ]},
      { type: 'callout', variant: 'warning', title: 'Watch the fan-out', text: [
        T('Hub nodes — a date, a common verb — have enormous degree. Cap '),
        C('neighbors(u)'), T(' or a single celebrity node will dominate every walk and flatten your results.'),
      ]},
      { type: 'h2', id: 'results', text: 'Does it actually help?' },
      { type: 'p', text: [
        T('Measured on an internal set of 200 cross-document questions, graph traversal lifts answer accuracy most where flat search is weakest: multi-hop questions that span two or more files.'),
      ]},
      { type: 'table',
        head: ['Retriever', 'Single-hop', 'Multi-hop', 'Latency'],
        rows: [
          ['Vector only', '0.81', '0.46', '120 ms'],
          ['Graph only', '0.74', '0.71', '180 ms'],
          ['Hybrid (ours)', '0.86', '0.78', '210 ms'],
        ],
        emphRow: 2,
      },
      { type: 'p', text: [
        T('Hybrid wins on both axes for a modest latency cost. The graph carries the multi-hop questions; the vector seeds keep single-hop recall high. Status: '),
        { t: 'badge', s: 'shipping', color: 'green' }, T('  '),
        { t: 'badge', s: 'v2 planned', color: 'blue' },
      ]},
      { type: 'h2', id: 'roadmap', text: 'Where this goes next' },
      { type: 'timeline', steps: [
        { when: 'Now', text: 'Document-scoped traversal, 2-hop frontier, hybrid seeds.' },
        { when: 'Q3', text: 'Edge-type weighting learned from which relations answered past questions.' },
        { when: 'Q4', text: 'Cross-workspace federation — query graphs you don’t own, read-only.' },
      ]},
      { type: 'callout', variant: 'danger', title: 'Open problem', text: [
        T('Contradiction. When two documents disagree, the graph happily stores both. Surfacing the conflict — instead of silently averaging it — is unsolved.'),
      ]},
      { type: 'p', text: [
        T('That tension is the whole point of reading across sources. A good instrument shouldn’t resolve it for you; it should '),
        HL('show you exactly where your sources collide', 'pink', 'This is what the Contradiction banner does in the graph view.'),
        T(' and let you decide.'),
      ]},
    ],
  };

  // Table of contents derived from H2s
  const TOC = DOC.blocks
    .filter((b) => b.type === 'h2')
    .map((b) => ({ id: b.id, text: b.text, level: 2 }));

  // ---- File tree ---------------------------------------------------------
  const TREE = [
    { id: 'dash', name: 'Dashboard', type: 'home', icon: '◈' },
    { type: 'folder', name: 'Research', open: true, children: [
      { id: 'graph-rag', type: 'file', icon: '🔭', name: 'Graph-RAG', active: true },
      { id: 'embeddings', type: 'file', icon: '🧬', name: 'Embedding spaces' },
      { id: 'rerank', type: 'file', icon: '⚖️', name: 'Cross-encoders & rerank' },
    ]},
    { type: 'folder', name: 'Reading queue', open: true, children: [
      { id: 'attention', type: 'file', icon: '📄', name: 'Attention is all you need' },
      { id: 'rwkv', type: 'file', icon: '📄', name: 'Linear attention notes' },
    ]},
    { type: 'folder', name: 'diary', open: false, children: [
      { id: 'd1', type: 'file', icon: '🗓️', name: '2026-06-03' },
      { id: 'd2', type: 'file', icon: '🗓️', name: '2026-06-02' },
    ]},
    { id: 'ideas', type: 'file', icon: '💡', name: 'Inbox & ideas' },
  ];

  const TABS = [
    { id: 'graph-rag', icon: '🔭', title: 'Graph-RAG', dirty: true },
    { id: 'attention', icon: '📄', title: 'Attention is all you…' },
    { id: 'embeddings', icon: '🧬', title: 'Embedding spaces' },
  ];

  // ---- Knowledge graph ---------------------------------------------------
  // cluster index maps to PRISM_SPECTRUM
  const GRAPH = {
    nodes: [
      { id: 'kg', label: 'Knowledge Graph', cluster: 0, r: 26, kind: 'concept' },
      { id: 'rag', label: 'Graph-RAG', cluster: 0, r: 22, kind: 'doc' },
      { id: 'ppr', label: 'Personalized PageRank', cluster: 1, r: 20, kind: 'concept' },
      { id: 'cos', label: 'Cosine similarity', cluster: 1, r: 16, kind: 'concept' },
      { id: 'embed', label: 'Embeddings', cluster: 1, r: 18, kind: 'doc' },
      { id: 'neo4j', label: 'Neo4j', cluster: 2, r: 18, kind: 'entity' },
      { id: 'cypher', label: 'Cypher', cluster: 2, r: 14, kind: 'entity' },
      { id: 'ent', label: 'Entity extraction', cluster: 3, r: 17, kind: 'concept' },
      { id: 'rel', label: 'Relations', cluster: 3, r: 14, kind: 'concept' },
      { id: 'coref', label: 'Coreference', cluster: 3, r: 13, kind: 'concept' },
      { id: 'rerank', label: 'Reranking', cluster: 4, r: 15, kind: 'doc' },
      { id: 'hop', label: 'Multi-hop QA', cluster: 4, r: 16, kind: 'concept' },
      { id: 'contra', label: 'Contradiction', cluster: 5, r: 15, kind: 'concept' },
      { id: 'attn', label: 'Attention', cluster: 1, r: 14, kind: 'doc' },
    ],
    links: [
      ['kg', 'rag'], ['rag', 'ppr'], ['ppr', 'cos'], ['rag', 'embed'], ['embed', 'cos'],
      ['kg', 'neo4j'], ['neo4j', 'cypher'], ['kg', 'ent'], ['ent', 'rel'], ['ent', 'coref'],
      ['rag', 'rerank'], ['rag', 'hop'], ['hop', 'ppr'], ['kg', 'contra'], ['contra', 'hop'],
      ['embed', 'attn'], ['rel', 'kg'], ['rerank', 'cos'],
    ],
  };

  // ---- AI chat seed ------------------------------------------------------
  const CHAT = [
    { role: 'assistant', kind: 'summary', content:
      'This document argues that graph traversal beats flat vector search for multi-hop retrieval. Key claims: coreference resolution merges duplicate entities, a 2-hop personalized PageRank bounds the frontier, and a hybrid retriever wins on both single- and multi-hop accuracy.',
      suggestions: [
        'Why is two hops the sweet spot?',
        'Summarize the results table',
        'What’s the open problem here?',
      ],
    },
    { role: 'user', content: 'What makes the hybrid retriever better than graph-only?' },
    { role: 'assistant', content:
      'The hybrid keeps vector seeds for single-hop recall (0.86 vs graph-only’s 0.74) while letting the graph walk carry multi-hop questions (0.78). Pure graph traversal loses easy lookups that don’t need a hop; pure vectors miss the connections. Combining them costs ~30ms of extra latency.',
      cite: 'results',
    },
  ];

  // ---- Flashcards --------------------------------------------------------
  const CARDS = [
    { q: 'What does the restart probability α control in personalized PageRank?', a: 'How tightly the walk stays anchored to the query’s seed entities. Low α (≈0.15) keeps results focused; high α lets the walk wander the whole graph.', status: 'learning' },
    { q: 'Why merge coreferent entities before traversal?', a: 'So passages naming the same thing differently resolve to one node — a single hop then reaches both, instead of their embeddings drifting apart.', status: 'new' },
    { q: 'What is the danger of high-degree hub nodes?', a: 'They dominate every walk and flatten results. Cap the neighbor fan-out so a date or common verb can’t hijack retrieval.', status: 'mastered' },
    { q: 'Single-hop vs multi-hop: which retriever wins each?', a: 'Vector is strongest single-hop, graph strongest multi-hop. Hybrid leads both (0.86 / 0.78).', status: 'new' },
  ];

  // ---- Tasks -------------------------------------------------------------
  const TASKS = [
    { id: 't1', title: 'Cap neighbor fan-out on hub nodes', status: 'doing' },
    { id: 't2', title: 'Wire contradiction banner to graph view', status: 'todo' },
    { id: 't3', title: 'Learned edge-type weights (Q3)', status: 'todo' },
    { id: 't4', title: 'Ship hybrid retriever default', status: 'done' },
    { id: 't5', title: 'Benchmark 200-question set', status: 'done' },
  ];

  // ---- Dashboard ---------------------------------------------------------
  const RECENT = [
    { id: 'graph-rag', icon: '🔭', title: 'Graph-RAG', when: 'now' },
    { id: 'attention', icon: '📄', title: 'Attention is all you need', when: '2h ago' },
    { id: 'embeddings', icon: '🧬', title: 'Embedding spaces', when: 'yesterday' },
    { id: 'rerank', icon: '⚖️', title: 'Cross-encoders & rerank', when: '2 days ago' },
  ];

  // ---- Command palette items --------------------------------------------
  const COMMANDS = [
    { group: 'Pages', icon: '🔭', label: 'Graph-RAG', hint: 'Research', kind: 'open', target: 'graph-rag' },
    { group: 'Pages', icon: '🧬', label: 'Embedding spaces', hint: 'Research', kind: 'open', target: 'embeddings' },
    { group: 'Pages', icon: '📄', label: 'Attention is all you need', hint: 'Reading queue', kind: 'open', target: 'attention' },
    { group: 'Actions', icon: '⚡', label: 'Horse Mode — autonomous writing', hint: '', kind: 'toast' },
    { group: 'Actions', icon: '🃏', label: 'Generate flashcards from this page', hint: '', kind: 'panel', target: 'cards' },
    { group: 'Actions', icon: '🕸', label: 'Open knowledge graph', hint: '', kind: 'graph' },
    { group: 'Actions', icon: '📊', label: 'Generate weekly summary', hint: '', kind: 'toast' },
    { group: 'Theme', icon: '◐', label: 'Parchment', hint: 'warm daylight', kind: 'theme', target: 'parchment' },
    { group: 'Theme', icon: '●', label: 'Campfire', hint: 'espresso dark', kind: 'theme', target: 'campfire' },
    { group: 'Theme', icon: '◓', label: 'Newsprint', hint: 'editorial', kind: 'theme', target: 'newsprint' },
    { group: 'Settings', icon: '⚙', label: 'Open settings', hint: '⌘,', kind: 'settings' },
  ];

  // ---- Flatten the document to plain text for AI grounding --------------
  function tokensToText(tokens) {
    if (typeof tokens === 'string') return tokens;
    if (!Array.isArray(tokens)) return '';
    return tokens.map((tk) => (tk && tk.s) ? tk.s : '').join('');
  }
  function docToText(doc) {
    const out = [doc.title, ''];
    doc.blocks.forEach((b) => {
      if (b.type === 'h2' || b.type === 'h3') out.push('\n## ' + b.text);
      else if (b.type === 'lede' || b.type === 'p') out.push(tokensToText(b.text));
      else if (b.type === 'callout') out.push('[' + b.title + '] ' + tokensToText(b.text));
      else if (b.type === 'math') out.push('Formula: ' + b.tex + (b.caption ? ' — ' + b.caption : ''));
      else if (b.type === 'table') out.push('Table ' + b.head.join(' | ') + '; ' + b.rows.map((r) => r.join(' ')).join('; '));
      else if (b.type === 'timeline') out.push('Roadmap: ' + b.steps.map((s) => s.when + ': ' + s.text).join(' '));
      else if (b.type === 'runcode') out.push('Code (' + b.label + '): ' + b.code.join(' ').slice(0, 200));
    });
    return out.join('\n');
  }
  const DOC_TEXT = docToText(DOC);

  window.PRISM_DATA = { DOC, DOC_TEXT, TOC, TREE, TABS, GRAPH, CHAT, CARDS, TASKS, RECENT, COMMANDS };
})();
