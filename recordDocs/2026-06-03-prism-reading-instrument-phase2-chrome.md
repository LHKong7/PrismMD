# Prism "Reading Instrument" Redesign — Phase 2: Window Chrome

## Background / Context

Phase 2 of the full Prism reimagining (see
`2026-06-03-prism-reading-instrument-phase1-identity.md`). With the identity &
type foundation in place, this phase restyles the window chrome — title bar, tab
bar, breadcrumb, status bar, command palette — onto the design's tokens and
aesthetic, while preserving all existing functionality (split panes, export,
Horse Mode, edit toggle, plugin commands, agent log, etc.).

## Analysis / Design decisions

- **Restyle in place, keep behavior.** The app already has every chrome surface
  the prototype does, so this is a token + layout pass, not a rebuild. Existing
  `Button`/`Tooltip`/`cmdk` plumbing is kept for accessibility and behavior.
- **Wordmark over centered filename.** The prototype leads with the PrismMark
  logo + "Prism" wordmark on the left; the document title now lives in the
  PageHeader and Breadcrumb, so the title bar shows the wordmark + a muted
  filename hint instead of a centered title.
- **Two signature affordances** from the design: the theme button became a
  **three-dot spectrum swatch** of the active identity (bg · accent · ink), and
  the agent toggle became an **accent "Ask" pill** that fills when the assistant
  is open (driven by `agentSidebarOpen`).
- **Fixed a latent bug**: the active tab referenced `--accent-primary`, which is
  not a defined token (no accent underline ever showed). Replaced with a proper
  `--accent-color` top border + rounded-top "raised paper" tab.

## Changes

- **`src/components/layout/PrismMark.tsx`** (new) — the triangular-prism logo;
  triangle = `--text-primary`, inner ray = `--accent-color`, refracted beams use
  `--spectrum-1/3/4` so the motif reads in every identity. Reused later in
  Settings → About.
- **`TitleBar.tsx`** — `--titlebar` background, height 44; PrismMark + Newsreader
  wordmark; spectrum theme-swatch cycle button; accent "Ask" pill (reflects
  `agentSidebarOpen`); removed now-unused `Palette`/`Bot` imports.
- **`TabBar.tsx`** — rounded-top tabs, `--accent-color` top border on the active
  tab (fixes the `--accent-primary` typo), `--font-ui`.
- **`Breadcrumb.tsx`** — `/` separators, `--font-ui` 12.5px, `--line-soft`
  divider, slightly taller (30px).
- **`StatusBar.tsx`** — `--titlebar` background, `--font-ui`; added an
  active-identity label (accent dot + theme name) to the right cluster.
- **`CommandPalette.tsx`** — elevated `--bg-secondary` surface, rounded-2xl,
  `--shadow-lg`, ink-tinted blurred backdrop, a search glyph + `esc` chip in the
  input row, uppercase group headings, and `--accent-soft` selection.

## Verification

- `npx tsc --noEmit -p tsconfig.web.json` — 45 errors, **identical to baseline**;
  zero new; none in any file touched here.
- Manual: title bar shows the prism wordmark; clicking the swatch cycles themes
  and the swatch recolors; "Ask" toggles the agent sidebar and fills when open;
  active tab shows the accent top border; ⌘P palette opens with the new search
  row, blurred backdrop, and accent-soft selection.

## Follow-ups

- Add an i18n key `titlebar.ask` (currently uses the inline 'Ask' fallback).
- Phase 3 — reader blocks (callouts, runnable code, tabs, timeline, math,
  pipeline, multi-color highlights, contextual minimap, selection→AI bubble);
  wire `--prism-gradient` into ReadingProgress.
- Phase 4 — Dashboard, full Graph view, Settings appearance grid, right-rail
  Flashcards + Tasks.
