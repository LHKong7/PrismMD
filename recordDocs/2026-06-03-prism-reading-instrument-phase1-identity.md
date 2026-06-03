# Prism "Reading Instrument" Redesign — Phase 1: Identity & Type System

## Background / Context

A Claude Design handoff bundle (`claude.ai/design`) reimagines PrismMD as
**"Prism — a reading instrument"**: a warm, editorial reading app with three
switchable identities (Parchment / Campfire / Newsprint), a four-font type
system, and a refracted-spectrum accent motif. The user opted for a **full
reimagining**, executed in staged phases. This document covers **Phase 1 — the
visual foundation** that every later phase builds on.

The design prototype lives in HTML/CSS/JS (`prism/project/prism/*.jsx`,
`theme.js`); our job is to recreate it in the real Electron + React + TS app,
not copy the prototype's structure. The prototype uses its own CSS-variable
namespace (`--ink`, `--paper`, `--surface`, `--line`, `--accent`, …); our app
uses a legacy namespace (`--bg-primary`, `--text-primary`, …) consumed by ~all
components.

## Analysis / Design decisions

- **Dual token namespace.** Rather than rename ~37 consumers at once, each
  Prism identity now sets **both** the design's native tokens (source of truth)
  **and** the legacy `--bg-primary` aliases derived from them. New/restyled
  components use the design tokens directly; un-migrated components keep working
  via the aliases. This is what makes a staged migration safe.
- **Type system is theme-independent**, so the four font stacks live once in
  `:root` (`index.css`) as `--font-display` (Newsreader), `--font-read`
  (Spectral), `--font-ui` (Hanken Grotesk), `--font-mono` (JetBrains Mono), each
  with CJK fallbacks. Only `--font-body` (the legacy alias, → Hanken Grotesk for
  UI chrome) is set per Prism theme.
- **Reading surface scoped by identity.** Spectral prose + Newsreader headings
  apply only under `[data-identity='parchment'|'campfire'|'newsprint']`, so the
  other nine presets keep their existing fonts. `applyTheme` now sets
  `data-identity` / `data-kind` on `<html>`.
- **Newsprint signature.** A drop cap on the opening paragraph and `§` heading
  rules under every `h2`, scoped to `[data-identity='newsprint']` — a genuine
  identity, not just a palette swap.
- **Fixed a prototype typo**: Newsprint `--line-soft` was `#e2daccb` (7 hex
  digits, invalid) → corrected to `#e2dacc`.

## Changes

- **`index.html`** — added Newsreader, Spectral, Hanken Grotesk, JetBrains Mono
  to the Google Fonts request.
- **`src/lib/theme/tokens.ts`** — added `prismSpectrum` (ember·amber·gold·sage·
  slate·iris), the design's signature accent ramp.
- **`src/lib/theme/themes.ts`** — retuned `parchment` and `campfire` to the
  design's exact palettes and **added `newsprint`**; each carries design tokens
  + legacy aliases + semantic colors derived from `--ok/warn/err/info`.
  `applyTheme` now sets `data-identity` / `data-kind`.
- **`src/styles/index.css`** — `:root` gains the four `--font-*` stacks, the
  `--spectrum-1..6` ramp, and `--prism-gradient` (used by the reading-progress
  bar in a later phase).
- **`src/styles/markdown.css`** — reading surface uses `--font-read` /
  `--font-display` under the three identities; Newsprint drop cap + `§` rules.
- **`src/components/reader/PageHeader.tsx`** — page title now uses
  `--font-display` (Newsreader, 500, 2.5rem, -0.012em) for the editorial look.

## Verification

- `npx tsc --noEmit -p tsconfig.web.json` — 45 errors, **identical to the
  pre-existing baseline** (`insightGraph*`, lucide `RightSidebar`,
  `App.tsx import.meta.env`, `rewrite` in SelectionAI/HighlightPopover). Zero new
  errors; none in any file touched here.
- Manual: switching to Parchment/Campfire/Newsprint in Settings applies the new
  palettes; reading view renders in Spectral with Newsreader headings; Newsprint
  shows the drop cap + § rules; legacy themes (Light/Dark/Nord/…) are unchanged.

## Follow-ups (later phases)

- Phase 2 — chrome: TitleBar / TabBar / Breadcrumb / StatusBar / Command palette
  restyle to design tokens (frameless title bar, spectrum theme-swatch button).
- Phase 3 — reader blocks: callouts, runnable code, tabs, timeline, math,
  pipeline diagram, multi-color highlights, contextual minimap spectrum, the
  selection→AI bubble; wire `--prism-gradient` into ReadingProgress.
- Phase 4 — views: Dashboard, full Graph view (spectrum clusters + contradiction
  banner), Settings appearance grid with identity cards; right-rail Flashcards +
  Tasks.
- Consider exposing the three identities as a quick-cycle swatch in the title bar
  (design affordance).
