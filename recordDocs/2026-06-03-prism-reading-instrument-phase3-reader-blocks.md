# Prism "Reading Instrument" Redesign — Phase 3: Reader Blocks

## Background / Context

Phase 3 of the full Prism reimagining (see phase 1 & 2 docs). This phase is the
heart of the design: the reading surface's rich blocks and runtime affordances.

**Key finding:** the app already ships every rich block the prototype demos —
`Callout`, `CodeBlock`, `ExecutableBlock`, `MathBlock`, `MermaidBlock`,
`TableBlock`, `TabsBlock`, `TimelineBlock`, `TaskList` — produced by the
remark/rehype pipeline + `rendererRegistry`. So this phase is a **restyle of
existing components + CSS + runtime features**, not a rebuild. That keeps risk
low and behavior intact.

## Analysis / Design decisions

- The prototype's blocks are fed by structured demo data; in a real markdown
  reader the same visuals come from styling the pipeline's output. So I matched
  the prototype's *look* on the existing components rather than copying its data
  model.
- **Reading progress literally refracts** — the bar now uses `--prism-gradient`
  (the spectrum), the design's signature motif, with `--progress-bar` fallback.
- **Contextual minimap rides the theme** — replaced hardcoded `#9ca3af` / `#ef4444`
  / `#3b82f6` with `--accent-color` / `--color-error` / `--text-muted` so it
  works in every identity instead of fighting it.
- **Callouts** adopt the design's card: rounded-xl, `color-mix` accent border +
  tinted paper fill, and a solid colored **icon chip** with a paper glyph; title
  in Hanken Grotesk, body in Spectral. Collapsible behavior preserved.
- **Timeline** gets the design's dot-with-paper-ring on the rule, an uppercase
  accent label (Hanken Grotesk), and Spectral body copy.
- **Selection → AI bubble** (`HighlightPopover`) became the design's dark
  "instrument" pill: an accent ✦ **"Ask Prism"** lead action, the 5-color
  highlight row, translate/simplify icons, and a downward pointer. Falls back to
  a disabled state when no AI provider is configured.
- **Editorial tables** — uppercase Hanken column labels + tabular figures +
  accent-soft row hover, scoped to the three identities so other presets keep
  their table style.

## Changes

- **`reader/ReadingProgress.tsx`** — spectrum gradient fill.
- **`reader/MiniMap.tsx`** — theme-token marker/viewport colors.
- **`reader/components/Callout.tsx`** — design card + icon chip; Spectral body.
- **`reader/components/TimelineBlock.tsx`** — ringed dot, uppercase accent label,
  Spectral body.
- **`annotations/HighlightPopover.tsx`** — dark "Ask Prism" pill with color row,
  icon actions, and pointer.
- **`styles/markdown.css`** — identity-scoped editorial table treatment.

## Verification

- `npx tsc --noEmit -p tsconfig.web.json` — 45 errors, **identical to baseline**;
  zero new. (The `HighlightPopover` line-72 `rewrite` error and the
  `insightGraphEntityTimeline` error are both pre-existing baseline items,
  untouched by this phase.)
- Manual: progress bar shows the spectrum; callouts render as cards with icon
  chips; timeline dots sit cleanly on the rule; selecting text shows the dark
  "Ask Prism" pill; results tables show uppercase headers + tabular figures;
  minimap markers recolor per theme.

## Follow-ups

- Add i18n key `highlightPopover.askPrism` (currently inline 'Ask Prism'
  fallback).
- Pre-existing: add `rewrite` to the `SelectionAIAction` prompt maps, and the
  `insightGraph*` ElectronAPI declarations (out of scope for this redesign).
- Phase 4 — Dashboard, full Graph view (spectrum clusters + contradiction
  banner), Settings appearance grid with identity cards, right-rail Flashcards +
  Tasks.
