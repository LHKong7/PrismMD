# Handoff: Prism — a reading instrument

> A warm, frameless desktop application for reading, annotating, and connecting
> Markdown documents, with an embedded AI assistant and a knowledge graph.
> This package lets a developer (or Claude Code) recreate the design **exactly**
> in a real codebase.

---

## 0. How to use this package (READ FIRST)

The files in `design_files/` are **design references built in HTML/React-in-the-browser** —
working prototypes that show the intended look, motion, and behavior. They are **not**
production code to copy verbatim (they use in-browser Babel, global `window.*` wiring,
and simulated data).

**Your task:** recreate these designs in the target codebase's environment (Electron +
React + TypeScript is the natural fit; the original is an Electron app) using its
established patterns, component library, and state management — matching the visual and
interaction spec below **pixel-for-pixel**.

**To match the design, you MUST read the source files**, not just the screenshots or the
host HTML. The design lives in these modules:

| File | What it defines |
|---|---|
| `design_files/prism/theme.js` | **All design tokens** — the 3 themes as CSS-variable sets, the spectrum palette |
| `design_files/prism/content.js` | The data model (document blocks, file tree, graph, chat, cards, tasks) |
| `design_files/prism/reader.jsx` | Every rich Markdown block (callouts, math, code, tabs, timeline, table, highlights) |
| `design_files/prism/document.jsx` | Reading surface: page header, reading progress, minimap, selection bubble |
| `design_files/prism/panels.jsx` | Left file tree, right rail (Outline/Graph/Notes/Cards/Tasks), AI chat |
| `design_files/prism/graph.jsx` | Force-directed knowledge graph (physics sim) |
| `design_files/prism/chrome.jsx` | Title bar, tab bar, breadcrumb, status bar, command palette |
| `design_files/prism/views.jsx` | Dashboard, full Graph view, Settings dialog |
| `design_files/prism/app.jsx` | App shell — state, layout, keyboard shortcuts |
| `design_files/Prism.html` | Host file — fonts, global CSS, boot splash, script load order |

Open `Prism.html` in a browser to see the target. Append `?theme=campfire` or
`?theme=newsprint` to preview the other identities.

---

## 1. Fidelity

**High-fidelity.** Final colors, typography, spacing, motion, and interactions are all
specified. Reproduce them exactly; do not substitute your own styling. Where this doc
gives a hex/px value, use it.

---

## 2. The product in one paragraph

Prism is a **frameless** desktop app (custom title bar, no OS chrome). Left to right:
a **file-tree sidebar**, a **tabbed reader** showing one Markdown document, a **right
rail** (Outline / Graph / Notes / Cards / Tasks), and an **AI assistant chat**. A custom
**status bar** sits at the bottom. The whole app is themeable via **3 warm "reading
identities."** Signature surfaces: a **Dashboard** home, a full-screen **knowledge graph**,
a **command palette** (⌘P), and a **Settings** dialog.

---

## 3. Design tokens

All theming is driven by CSS custom properties set on the root element. There are **three
complete themes**. Implement them as a theme provider that swaps these variables. Values
are copied verbatim from `prism/theme.js` — treat that file as the source of truth.

### 3.1 Typography (Google Fonts)

| Role | Family | Usage |
|---|---|---|
| Display | **Newsreader** (serif, opsz 6–72) | Page titles, H2/H3, dashboard greeting, dialog headings |
| Reading body | **Spectral** (serif) | Document body text, lede, callout body, chat answers, card faces |
| Interface | **Hanken Grotesk** (sans) | All chrome, controls, labels, metadata, buttons |
| Code | **JetBrains Mono** | Code blocks, inline code, numeric badges, keycaps |

Load weights: Newsreader 400/500/600 + italic 400/500; Spectral 400/500/600 + italic;
Hanken Grotesk 400/500/600/700; JetBrains Mono 400/500/600.
`-webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;`

Type scale (reading surface): lede 20px/1.62; body (`.prose-p`) ~17px/1.7 (see
`Prism.html` `<style>`); H1 41px/1.12 weight 500 letter-spacing -0.012em; H2 27px/1.25
weight 500 letter-spacing -0.01em; H3 18px weight 600. UI text 11–14px.

### 3.2 Theme — **Parchment** (light, default; "warm sand, copper ink")

```
--bg: #e7ded0          --surface: #f1ebdf      --surface-2: #e9e1d2
--paper: #faf6ee       --ink: #2c2620          --ink-2: #5b5346
--ink-3: #938974       --line: #ddd2c0         --line-soft: #e7ddcc
--accent: #b06a2c      --accent-2: #955620     --accent-soft: rgba(176,106,44,0.13)
--accent-ink: #faf6ee  --scroll: #cdc1ad       --code-bg: #f2ebdd
--code-ink: #4a4236    --titlebar: #e2d8c8
--ok: #5b8b4e   --warn: #b7791f   --err: #b4452f   --info: #3a7196
--shadow:    0 1px 2px rgba(60,46,28,.05), 0 8px 24px -10px rgba(60,46,28,.18)
--shadow-lg: 0 24px 64px -18px rgba(50,38,22,.34)
```

### 3.3 Theme — **Campfire** (dark; "espresso, ember glow")

```
--bg: #17130f          --surface: #201b16      --surface-2: #1a1511
--paper: #241e18       --ink: #ece2d2          --ink-2: #b6aa96
--ink-3: #7d7263       --line: #352e26         --line-soft: #2a241e
--accent: #e08a3c      --accent-2: #f0a052     --accent-soft: rgba(224,138,60,0.16)
--accent-ink: #1a140e  --scroll: #3c342b       --code-bg: #1b1611
--code-ink: #cdbfa8    --titlebar: #1d1813
--ok: #85b06a   --warn: #e0a040   --err: #e0715a   --info: #69a8cc
--shadow:    0 1px 2px rgba(0,0,0,.3), 0 10px 30px -12px rgba(0,0,0,.6)
--shadow-lg: 0 30px 70px -20px rgba(0,0,0,.7)
```

### 3.4 Theme — **Newsprint** (light, high-contrast editorial; "oxblood, rules & drop caps")

```
--bg: #e4e0d7          --surface: #ede9e0      --surface-2: #e6e1d6
--paper: #f8f5ef       --ink: #211e19          --ink-2: #4c473e
--ink-3: #857d6f       --line: #d6cfbf         --line-soft: #e2dacc
--accent: #8c3a2b      --accent-2: #742f22     --accent-soft: rgba(140,58,43,0.10)
--accent-ink: #f8f5ef  --scroll: #cabfa9       --code-bg: #efebe1
--code-ink: #433d33    --titlebar: #ddd7cb
--ok: #4f7a45   --warn: #9c6a14   --err: #8c3a2b   --info: #356085
```

**Newsprint has an editorial signature** (only in this theme):
- The lede paragraph gets a **drop cap**: `::first-letter` in Newsreader 500, font-size 3.5em,
  float left, line-height 0.78, padding `6px 12px 2px 0`, color `--accent`.
- Every reader **H2 gets a bottom rule** (`1.5px solid --ink`, padding-bottom 7px) and a
  `§ ` prefix in `--accent` (Hanken Grotesk 700).

### 3.5 Highlight colors (multi-color annotations)

Light themes: `--hl-yellow:#f6e6a6  --hl-green:#cfe2b2  --hl-blue:#bcd6e8
--hl-pink:#eecbd4  --hl-purple:#dccfe6`
Dark (Campfire): `--hl-yellow:#5b4a1e  --hl-green:#37512c  --hl-blue:#274a63
--hl-pink:#5d2840  --hl-purple:#432a5c`

### 3.6 The "prism" spectrum (signature motif)

```
SPECTRUM = ['#c2532f', '#cf7a2a', '#c9a52a', '#5b8b4e', '#3a7196', '#6a5aa0']
```
Used for: the **reading-progress bar** (a left-to-right linear-gradient across all 6),
**knowledge-graph clusters** (node color = `SPECTRUM[cluster % 6]`), and the **pipeline
diagram** stages. This refracted-light motif is core to the brand — keep it.

### 3.7 Radii, spacing, motion

- Radii: chips/pills 20px; cards/dialogs 11–18px; buttons 6–9px; code/callout blocks 12px;
  inputs 8–12px.
- Shadows: only the two `--shadow` / `--shadow-lg` per theme. No other drop shadows.
- Scrollbars: 9px, thumb `--scroll` rounded with 2px transparent padding-box border.
- Motion: entrances 120–300ms `cubic-bezier(.16,1,.3,1)` (ease-out). Panel collapse
  `width .24s cubic-bezier(.16,1,.3,1)`. Progress bar `width .12s linear`. Keyframes:
  `prismFade` (opacity), `prismRise` (8px up + fade), `prismScale` (0.97→1 + fade),
  `prismThink` (3 dots, translateY bounce). **Respect `prefers-reduced-motion`.**
  ⚠️ Persistent content must be visible at rest — never depend on an entrance animation
  to reveal it (base state visible, animate *from* hidden).

---

## 4. Screens & components

Coordinates/sizes below are the design defaults. Fixed panel widths:
**left 248px · right rail 284px · agent 344px.** Bars: title 44px, tab 40px,
breadcrumb 38px, status 26px (all full-width, `flex-shrink:0`).

### 4.1 Title bar (44px, frameless, `-webkit-app-region: drag`)
Left → right: **Prism logo** (SVG triangle + refracted spectrum lines) · wordmark
"Prism · Research workspace ▾" (Newsreader 13.5px) · back/forward arrows · `flex:1` ·
**view switch** segmented control [Read | Graph] (active = `--paper` pill with `--shadow`) ·
divider · command (⌘) button · **theme swatch button** (3 dots = current theme's swatch;
click cycles theme) · focus-mode toggle (◎/◉) · settings (⚙) · **"✦ Ask" button**
(accent-filled when agent open, `--accent-soft` when closed) · divider · window controls
[— ▢ ✕] (✕ hover = `--err` bg, white). All control buttons 30px, `flex-shrink:0`,
hover bg `--surface-2`.

### 4.2 Tab bar (40px)
Sidebar-toggle button (⊟) then document tabs. Active tab: `--bg` fill, top/left/right
`--line` border, bottom border = `--bg` (merges into content), 32px tall, radius
`8px 8px 0 0`. Each tab: emoji icon + title (ellipsis, max 200px) + optional **dirty dot**
(`--accent`, 6px) + ✕. Trailing "＋" new-tab button.

### 4.3 Breadcrumb (38px, only in Read view)
`Workspace / Research / graph-rag.md` (last segment `--ink-2`, rest `--ink-3`, "/"
separators) · `flex:1` · "✎ Edit" · "↧ Export" · right-rail toggle (⊠).

### 4.4 Left sidebar — file tree (248px, bg `--surface`)
Top: **search button** "⌕ Search or jump to…" + "⌘P" keycap (opens command palette).
Tree: folders are uppercase 11px `--ink-3` labels with a rotating ▶ caret (rotate 90° when
open); files are 13.5px rows with emoji icon. **Active file**: `--accent-soft` bg + a 2.5px
`--accent` left bar + ink text. Hover (inactive): `--surface-2`. Indent 12px per depth.
Bottom: "＋ New page". Tree data + active state in `content.js` `TREE`.

### 4.5 Reader (the centerpiece) — `document.jsx` + `reader.jsx`
Scroll container, bg `--bg`. Content column **max-width 720px, centered**, padding
`56px 40px 200px`.

- **Reading progress bar** — absolute top, 3px, width = % scrolled, fill = the 6-color
  spectrum gradient. `z-index:6`, `pointer-events:none`.
- **Page header** — big emoji (52px), H1 (Newsreader 500, 41px, balanced wrap), then a meta
  row: author avatar chip (20px accent circle "Y") · "7 min read" · "1,480 words" ·
  "Edited 2h ago", separated by faint "·". Hairline rule under.
- **Contextual minimap** — absolute right edge (right:6px, top:70 bottom:30, width 14px).
  Markers map document features to vertical position: headings (faint 11×2.5px bars),
  code/figures (`--accent`), danger callout (`--err`), and **user highlights** (colored
  4px bars in the highlight's color). A 3px `--accent` viewport indicator tracks scroll.
  Clicking a marker smooth-scrolls to it.
- **Block types** (render each exactly — see `reader.jsx`):
  - **lede** — 20px Spectral `--ink-2` (drop cap in Newsprint).
  - **paragraph** — `.prose-p`. Inline tokens: bold, italic, inline `code`, inline math
    (italic Spectral), **entity links** (accent text + `◆` superscript; click → opens graph),
    **badges** (pill: colored dot + label), and **highlights** (`<mark>` with `--hl-*` bg;
    click opens an annotation popover).
  - **H2** — id'd for TOC + `data-sec`; minimap heading marker.
  - **callout** — 4 variants note/tip/warning/danger → colored icon chip (info/ok/warn/err) +
    title (Hanken 600 13.5) + body (Spectral 15.5). Border + tinted bg via `color-mix` of the
    variant color into `--paper`. Radius 12.
  - **math block** — centered inline-block, `--surface-2` bg, italic Spectral 19px, optional
    italic caption. (Superscripts/subscripts via a tiny `^{}`/`_{}` → `<sup>/<sub>` transform.)
  - **pipeline (mermaid-style)** — inline SVG, 5 rounded stage boxes connected by arrows,
    each box tinted with a spectrum color. Caption "Figure 1 — …".
  - **runnable code** — window-chrome header (3 traffic-light dots + filename) + **"▶ run"**
    button (accent). Click → "● running…" ~850ms → an **Output** panel appears with the
    result lines (green "›" prompt). Line-numbered, syntax-highlighted code.
  - **tabs** — segmented header (e.g. TypeScript | Python); active tab underlined `--accent`;
    switches the code body.
  - **timeline** — vertical line with accent dots; each step has an uppercase accent "when"
    label + Spectral text.
  - **table** — header row uppercase 12px `--ink-3` on `--surface`; one **emphasized row**
    gets `--accent-soft` bg + a "★" + accent first cell; tabular-nums.
  - **syntax highlighting** — comments italic `--ink-3`, strings `--ok`, numbers `--info`,
    keywords `--accent`, function-calls `--err`, plain `--code-ink`.
- **Selection → AI bubble** — on text selection inside the reader, a dark floating toolbar
  appears above the selection: **"✦ Ask Prism"** · 5 highlight color swatches · copy (⧉),
  with a little downward arrow. Picking a color **creates a persistent highlight**; "Ask
  Prism" sends the passage to the assistant.

### 4.6 Right rail (284px) — 5 tabs, `panels.jsx`
Tab strip: **Outline · Graph · Notes · Cards · Tasks** (icon-only, active underlined accent).
- **Outline** — "On this page" TOC from H2s; active section highlighted (accent bar + soft bg);
  click scrolls.
- **Graph** — the knowledge graph at rail size (compact), "drag to explore".
- **Notes** — list of all user highlights: colored left bar + quoted passage (italic Spectral,
  click to jump to the passage) + editable note ("+ Add note" / inline textarea + Save/Cancel) +
  delete (×, hover red). Empty state: pencil glyph + "No highlights yet" + instructions.
  Tab shows a **count badge** when > 0.
- **Cards** — flashcard study: progress dots, a flip card (question/answer, status pill
  new/learning/mastered), "✕ Again" / "✓ Got it".
- **Tasks** — a board grouped To Do / Doing / Done; click the status glyph (○ ◐ ●) to cycle;
  done items strike through.

### 4.7 AI assistant (344px) — `panels.jsx` `AgentSidebar`
Header: ✦ avatar + "Prism Assistant / reading Graph-RAG.md" + a **LIVE/LOCAL pill**.
Body: a **document-summary card** (accent-soft, "✦ Document summary") + clickable suggested
questions; then the conversation. **User** messages = accent bubble, right-aligned, tail
bottom-right. **Assistant** = plain Spectral text; may carry a "jump to section" citation chip.
While answering: a **thinking indicator** (3 bouncing accent dots + "reading the document…"),
then the answer **streams in word-by-word** with a blinking caret.
Composer: rounded textarea ("Ask about this document…"), "⌘/ to toggle" hint, accent ↑ send
(disabled while busy). Enter sends, Shift+Enter newlines.
**AI wiring:** answers are produced by a model call grounded in the full document text
(see §6), with a canned fallback (`answerFor`) if no model is available.

### 4.8 Status bar (26px, bg `--titlebar`)
Left: "● Indexed" (ok dot) · "Graph: 14 nodes" · "1,480 words". Right: optional activity
("✦ Horse Mode · drafting") · "{n}% read" · current theme (dot + name) · "⬡ Privacy on".

### 4.9 Dashboard (home view) — `views.jsx`
Centered 860px column. Date + **time-aware greeting** ("Good morning." etc., Newsreader 38px).
A big **"Continue reading"** card (icon, kicker, title, "7 min read · 64% through", a progress
bar). A **4-up quick-action grid** (New page / Daily journal / Horse Mode / Open graph) with
hover lift. Two columns: **Recent** list + **Today's tasks** card with done count.

### 4.10 Knowledge graph (full view) — `graph.jsx` + `views.jsx`
Header: "Knowledge Graph / 14 entities · 18 relations · document-scoped" + a **legend**
(Concepts/Documents/Entities/Methods/Conflicts → spectrum dots). A dismissible **contradiction
banner** (warn-tinted). The graph: a custom **force simulation** (charge repulsion + spring
links + center gravity, integrated each rAF). Nodes colored by cluster; **document** nodes are
filled discs, **concept/entity** nodes are ringed with a center dot. **Drag** a node to move it;
**hover** isolates its neighborhood (dims the rest, thickens incident links). Labels in Hanken
below each node. (Compact mode for the rail uses smaller forces.)

### 4.11 Command palette (⌘P) — `chrome.jsx`
Centered modal over a blurred scrim (`backdrop-filter: blur(3px)`, ink-tinted). Search input
(⌕ + "esc" keycap). Results **grouped** (Pages / Actions / Theme / Settings), each row =
icon + label + optional hint. **Full keyboard nav**: ↑/↓ move, Enter runs, Esc closes; the
selected row gets `--accent-soft`. Hover also selects. Commands: open page, switch theme,
open graph, open settings, open a rail panel, fire a toast (data in `content.js` `COMMANDS`).

### 4.12 Settings dialog (⌘,) — `views.jsx`
820×560 modal, left nav (Appearance / AI providers / Privacy / About) + content pane.
- **Appearance** — 3 **theme preview cards** (mini wallpaper + swatch dots + name + blurb;
  selected = 2px accent border + ✓), then font rows (Reading/Display/Interface/Code).
- **AI providers** — list (Ollama local = ACTIVE accent-soft; others disabled in privacy mode).
- **Privacy** — toggles (Privacy Mode / Conversation memory / Local knowledge graph), pill switches.
- **About** — logo, "Prism — a reading instrument", blurb, version.

---

## 5. Interactions & keyboard shortcuts

| Shortcut | Action |
|---|---|
| ⌘P / Ctrl+P | Toggle command palette |
| ⌘/ | Toggle AI assistant |
| ⌘B | Toggle left sidebar |
| ⌘⇧B | Toggle right rail |
| ⌘, | Toggle settings |
| Esc | Close palette / settings / focus |

Other behaviors: clicking an **entity link** or a graph node opens the Graph view; **selecting
text** shows the AI bubble; **picking a highlight color** adds a highlight that appears in the
text, the minimap, and the Notes tab (and **persists** — see §6); the **theme swatch** cycles
Parchment → Campfire → Newsprint; **focus mode** hides all chrome except the reader (with an
"Exit focus" button); toasts auto-dismiss after ~2.6s; panels **collapse by animating width**
to 0 (content stays mounted at full width inside, clipped).

---

## 6. State & persistence

App-level state (see `app.jsx`): `theme`, `activeId` (open doc / 'dash'), `view` ('read' |
'graph'), panel open flags (`leftOpen`, `rightOpen`, `agentOpen`, `focus`), `rightTab`,
`palette`, `settings`, `activeSection`, scroll `pct`, `activity`, `toast`, and **`highlights`**.

- **Highlights** are an array of `{ id, blockIndex, text, color, note, createdAt }`,
  **persisted to `localStorage['prism.highlights']`** and re-applied on load by splitting the
  matching text run in that block. Adding/removing/note-editing all update this store.
- **Theme** persists to `localStorage['prism.theme']` (unless URL-forced — the prototype
  accepts `?theme=` for the compare view; your app can drop that).
- **AI chat**: build a grounding prompt = a system/preamble containing the **full document as
  text** (`content.js` derives `DOC_TEXT` from the blocks) + the prior turns + the new
  question; call the model; stream the response. Fall back to `answerFor(q)` (canned, keyword-
  matched) on any error or when no model is configured. In a real app, wire this to your
  model provider (the original targets a **local** model — hence the "LOCAL"/privacy framing).

---

## 7. The details most likely to get dropped (don't!)

These are what make it "Prism" rather than a generic Notion clone. Verify each:

1. **Three full themes**, swappable live — not just light/dark. Newsprint's **drop cap + §
   heading rules** are theme-specific.
2. The **spectrum** in the progress bar, graph clusters, and pipeline.
3. **Editorial serif type system** (Newsreader + Spectral), not a UI sans for body copy.
4. **Frameless** custom title bar with the segmented Read/Graph switch and the spectrum logo.
5. The **force-directed graph** with drag + hover-isolation (real physics, not a static SVG).
6. **Selection → AI bubble** and **persistent multi-color highlights** that show up in text +
   minimap + Notes.
7. **Streaming** chat with the bouncing-dots thinking state + citation chips.
8. **Runnable** code blocks with a run→output transition.
9. The **contextual minimap** with feature + highlight markers.
10. **Command palette** with grouped results and full keyboard nav.
11. **Time-aware Dashboard** greeting + continue-reading card.
12. Warm, paper-tinted surfaces and the **two-shadow** elevation system — no pure white,
    no generic gray.

---

## 8. Suggested implementation order

1. Theme provider + the 3 token sets + fonts + global resets (get the *feel* first).
2. App shell: frameless title bar, the 4 bars, collapsible panels, keyboard shortcuts.
3. Reader + all block types (this is the bulk of the visual identity).
4. Right rail tabs + left file tree.
5. AI assistant (start with canned, then wire the model).
6. Selection bubble + persistent highlights + Notes + minimap markers.
7. Knowledge graph (force sim).
8. Command palette, Settings, Dashboard, Graph view.
9. Newsprint editorial flourishes + motion polish + reduced-motion.

## 9. Acceptance checklist

- [ ] All three themes match the hexes in §3 and switch live.
- [ ] Body copy is Spectral; titles are Newsreader.
- [ ] Newsprint shows the drop cap and § heading rules; others don't.
- [ ] Progress bar and graph clusters use the 6-color spectrum.
- [ ] Every reader block in §4.5 renders and the runnable block produces output.
- [ ] Selecting text shows the bubble; a color creates a highlight visible in text + minimap +
      Notes; highlights survive reload.
- [ ] Graph nodes drag and hover-isolate.
- [ ] Chat streams with the thinking indicator; citation chip scrolls to the section.
- [ ] All keyboard shortcuts in §5 work; palette has full arrow-key nav.
- [ ] Frameless title bar with working Read/Graph switch, theme cycle, focus mode.

---

## 10. Files in this package

```
design_handoff_prism/
├── README.md            ← this spec (implement from this)
├── PROMPT.md            ← ready-to-paste kickoff prompt for Claude Code
└── design_files/        ← the working HTML/React prototype (visual reference)
    ├── Prism.html               (host: fonts, global CSS, boot, load order)
    ├── Prism — Compare.html     (the 3 identities side-by-side on a canvas)
    └── prism/
        ├── theme.js      ├── content.js   ├── reader.jsx    ├── document.jsx
        ├── panels.jsx    ├── graph.jsx    ├── chrome.jsx    ├── views.jsx
        └── app.jsx
```

Open `design_files/Prism.html` in a browser as your visual target. The prototype's
data (document text, tree, graph, chat) lives in `content.js` — swap for real data in
your app; keep the structure.
