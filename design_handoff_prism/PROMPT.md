# Kickoff prompt — paste this into Claude Code

Copy everything in the box below into Claude Code as your first message, with this
`design_handoff_prism/` folder present in the repo.

---

```
You are implementing a desktop application UI called **Prism — "a reading instrument"**
from a design handoff package located in `design_handoff_prism/`.

## Before writing ANY code
1. Read `design_handoff_prism/README.md` in full — it is the source of truth.
2. Then read EVERY file in `design_handoff_prism/design_files/prism/` (theme.js,
   content.js, reader.jsx, document.jsx, panels.jsx, graph.jsx, chrome.jsx, views.jsx,
   app.jsx) and `design_files/Prism.html`. The design lives in these modules — do not
   skip them or work from the host HTML alone.
3. Open `design_files/Prism.html` in a browser as your visual target. Append
   `?theme=campfire` and `?theme=newsprint` to see the other two themes.

## What this is
The files in `design_files/` are a working HTML/React-in-the-browser PROTOTYPE — a
visual + interaction reference, NOT production code to copy verbatim (it uses in-browser
Babel, global window.* wiring, and simulated data).

## Your task
Recreate this design **faithfully, pixel-for-pixel**, in THIS codebase using its existing
framework, component patterns, state management, and conventions. If the project has no UI
yet, use Electron + React + TypeScript (the original is an Electron app). This is a port,
not a redesign — do NOT simplify, restyle, or "improve" anything. Where the README gives a
hex or px value, use that exact value.

## Build order (follow this)
1. Theme provider + the 3 token sets (Parchment / Campfire / Newsprint) + Google Fonts
   (Newsreader, Spectral, Hanken Grotesk, JetBrains Mono) + global resets. Get the FEEL
   right first, then STOP and show me a screenshot before continuing.
2. App shell: frameless title bar, the 4 bars (title/tab/breadcrumb/status), collapsible
   panels, keyboard shortcuts.
3. The reader and ALL block types (callouts, math, runnable code, tabs, timeline, table,
   badges, entity links, highlights) — this is the bulk of the visual identity.
4. Right rail tabs (Outline / Graph / Notes / Cards / Tasks) + left file tree.
5. AI assistant chat (start with the canned fallback, then wire to our model provider).
6. Selection → AI bubble + persistent multi-color highlights (localStorage) + Notes panel
   + minimap markers.
7. Knowledge graph (the force simulation — real physics, draggable nodes, hover isolation).
8. Command palette (⌘P, grouped, full arrow-key nav), Settings dialog, Dashboard, Graph view.
9. Newsprint editorial flourishes (drop cap + § heading rules) + motion polish +
   prefers-reduced-motion.

## Non-negotiable details (these are what make it "Prism")
- THREE full themes, swappable live — not just light/dark.
- Editorial SERIF type for body copy (Spectral) and titles (Newsreader) — not a UI sans.
- The 6-color "prism spectrum" in the reading-progress bar, graph clusters, and pipeline.
- Frameless custom title bar with the Read/Graph segmented switch + spectrum logo.
- Force-directed graph with drag + hover-isolation.
- Selection → AI bubble; persistent highlights that show in text + minimap + Notes.
- Streaming chat with the bouncing-dots "thinking" state + citation chips.
- Runnable code blocks with a run → output transition.
- Warm, paper-tinted surfaces (no pure white / generic gray) + the two-shadow elevation system.
- Content must be visible at rest — never rely on an entrance animation to reveal it; respect
  prefers-reduced-motion.

## When done
Work through the Acceptance Checklist in README.md §9 and confirm each item explicitly.
Show me screenshots of: the reader in all 3 themes, the knowledge graph, the command
palette, and the dashboard.

## Rules
- Read the referenced source files before implementing each section; match them exactly.
- Ask me before substituting any library, simplifying any interaction, or changing any value.
- Swap the prototype's simulated data (content.js) for real data, but keep the structure.
```

---

### Tips while it works
- After step 1, if the colors/fonts look right, the rest will fall into place — hold it
  to that checkpoint.
- If a screen drifts, say: *"Re-read `design_files/prism/<file>` and match it exactly."*
- If it tries to ship the prototype as-is, remind it: *"That's the reference prototype —
  port it into our stack, don't copy the in-browser Babel setup."*
```
