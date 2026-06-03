# Prism "Reading Instrument" Redesign — Phase 4: Views

## Background / Context

Final phase of the full Prism reimagining (see phase 1–3 docs). With identity,
chrome, and the reading surface done, this phase restyles the full-surface views
— Dashboard, the knowledge Graph view, and the Settings → Appearance picker — to
the design, using live app data throughout.

## Analysis / Design decisions

- **Dashboard** rebuilt to the prototype's home layout: a muted date line + a
  large **Newsreader greeting**, a four-card **quick-action grid** (New page ·
  Daily journal · Import · Search), and a two-column **Recent + Today's tasks**
  block. "Recent" is sourced from the real workspace page tree (flattened, first
  6); tasks come from the existing task store. Quick actions reuse existing
  handlers (`createPage`, `openTodayDiary`, `importFile`, command palette).
- **Graph clusters now use the refracted spectrum.** Switched the node colorizer
  from the generic `graphPalette` to `prismSpectrum`, so clusters get the warm
  ember→iris hues that are the design's signature — still stable per entity type,
  so the "color = type" mental model holds. Header title set in Newsreader;
  active scope button uses `--accent-ink`.
- **Settings → Appearance** now leads with the three **reading-identity cards**
  (Parchment/Campfire/Newsprint): a live mini-preview (page bg + ink bar +
  3-swatch row), the name, and a one-line blurb — exactly the prototype's
  appearance grid. The other presets follow under "More presets" in the original
  compact card style. Added an optional `blurb` field to `ThemeDefinition`, set
  on the three identities.

## Changes

- **`lib/theme/themes.ts`** — `ThemeDefinition.blurb?`; blurbs on
  parchment/campfire/newsprint.
- **`components/workspace/Dashboard.tsx`** — rewritten to the design layout
  (Newsreader greeting, quick-action grid, Recent + tasks); `PageTreeNode`
  imported from `types/electron` (its canonical source).
- **`components/graph/GraphView.tsx`** — `prismSpectrum` cluster colors,
  Newsreader header title, `--accent-ink` active scope button.
- **`components/settings/SettingsPanel.tsx`** — `ThemeSettings` split into
  featured reading-identity cards + more-presets grid.

## Verification

- `npx tsc --noEmit -p tsconfig.web.json` — 45 errors, **identical to baseline**;
  zero new (a transient `PageTreeNode` import-source error was fixed immediately).
- Manual: Dashboard shows the greeting + action grid + recent/tasks; Settings →
  Appearance shows the three identity cards with previews/blurbs and the preset
  grid; Graph view renders warm spectrum clusters with a Newsreader title.

## Follow-ups

- New i18n keys used with inline English fallbacks (safe): `titlebar.ask`,
  `highlightPopover.askPrism`, `workspace.dashboard.{night,blankDoc,journalSub,
  importSub,recent,noTasks}`, `settings.theme.{identities,morePresets}`. Wire
  proper zh strings in a later i18n pass.
- Right-rail Flashcards/Tasks panels from the prototype remain as the existing
  TOC/Entity/Related tabs (the app's panels differ from the demo's; out of scope
  for a visual pass).
- Pre-existing `insightGraph*` / neo4j-config type errors are unchanged and
  out of scope for this redesign.

## Redesign complete

Phases 1–4 land the Prism "reading instrument" identity across the whole app:
the three warm themes + four-font type system + spectrum (1), the window chrome
(2), the reading surface and rich blocks (3), and the views (4) — all on the
existing architecture with zero new type errors at every step.
