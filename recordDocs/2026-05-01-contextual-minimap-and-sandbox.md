# Contextual Mini-Map + Block-Level Sandboxing

## Background / Context

Two new reader-mode features requested:
1. A contextual minimap that goes beyond showing document length — it highlights areas of interest with colored markers (red for broken code, blue for headings, gray for healthy code).
2. Block-level sandboxing that lets users hover over HTML/CSS/JS code blocks and run them live in an inline preview without leaving the document.

## Design Decisions

### Mini-Map
- Chose a lightweight **marker strip** (12px wide) over a full canvas-rendered document preview — simpler, more performant, and sufficient for the primary goal of highlighting areas of interest.
- Code block analysis runs at **remark AST level** during markdown processing via `remarkCodeAnalysis` plugin, not at DOM level — this is cheaper and gives accurate source positions.
- "Broken" detection is heuristic-based (empty body, invalid JSON, mismatched braces for JS) rather than full-parse — keeps analysis fast and deterministic.
- Marker positions computed via DOM queries on `data-code-block-index` attributes injected by the remark plugin into `hProperties`.
- Viewport indicator updates via `requestAnimationFrame` on scroll (same pattern as `useReadingProgress`).

### Block-Level Sandboxing
- Uses `sandbox="allow-scripts"` iframe **without** `allow-same-origin` — strongest Chromium isolation for srcdoc content. Iframe cannot access parent DOM, storage, or cookies.
- Console shim injected into iframe overrides `console.log/warn/error/info` and forwards via `postMessage`. Parent filters by `event.source`.
- Split view (code left, preview right) rather than replacement — users need to see both code and output.
- Phase 1 supports HTML, CSS, JS. JSX/TSX deferred to Phase 2 (requires @babel/standalone).
- Hover-to-reveal pattern (200ms delay) avoids cluttering the default code block view.

## Changes

### Feature 1: Contextual Mini-Map

**`src/lib/markdown/remarkCodeAnalysis.ts`** (new)
- Remark plugin that visits `code` nodes, classifies as ok/broken/empty
- Injects `data-code-block-index` via hProperties for DOM lookup
- Exports `CodeBlockMarker` type

**`src/lib/markdown/pipeline.ts`** (modified)
- Wires `remarkCodeAnalysis` into unified chain
- Extends `MarkdownResult` with `codeMarkers: CodeBlockMarker[]`

**`src/hooks/useMarkdown.ts`** (modified)
- Exposes `codeMarkers` from result

**`src/components/reader/MiniMap.tsx`** (new)
- Absolute-positioned strip on right edge of scroll container
- Computes positions via DOM queries + ResizeObserver
- Renders colored tick marks + viewport indicator
- Click-to-scroll on ticks and strip background

**`src/components/reader/MarkdownReader.tsx`** (modified)
- Mounts `<MiniMap>` inside scroll container

### Feature 2: Block-Level Sandboxing

**`src/lib/sandbox/sandboxLanguages.ts`** (new)
- `isSandboxable(language)` — checks against `html`, `css`, `javascript`, `js`

**`src/lib/sandbox/consoleShim.ts`** (new)
- JS snippet that overrides console methods and forwards via `postMessage`

**`src/lib/sandbox/buildSrcdoc.ts`** (new)
- Builds srcdoc HTML per language (html/css/js templates)

**`src/components/reader/components/SandboxConsole.tsx`** (new)
- Collapsible console output panel with level-colored entries

**`src/components/reader/components/SandboxedCodeBlock.tsx`** (new)
- Split view: code panel + sandboxed iframe + console
- Re-run/close toolbar, postMessage listener for console entries

**`src/components/reader/components/CodeBlock.tsx`** (modified)
- Adds hover overlay with play button for sandboxable languages
- Toggles to `SandboxedCodeBlock` when activated

### i18n
- Added `minimap.*` and `sandbox.*` keys to both `en.json` and `zh.json`

## Verification

1. `npm run typecheck` — passes
2. `npm run dev` — builds and launches
3. **Mini-Map**: Open markdown with code blocks → colored ticks on right edge → click to scroll → viewport indicator tracks scroll
4. **Sandbox**: Hover over HTML/JS code block → play button appears → click → split view with live preview + console output → Re-run works → Close returns to normal view
