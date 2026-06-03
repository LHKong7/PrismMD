# Prism "Reading Instrument" Redesign — Phase 5: i18n Pass

## Background / Context

Phases 1–4 of the Prism reimagining introduced new UI strings that rendered via
inline English fallbacks (`t('key', 'English')`), so the zh locale showed
English for those surfaces. This pass adds proper en/zh keys for every new (and
a few reused-but-missing) string so the redesigned chrome, reader, dashboard,
and settings localize fully.

## Analysis / Design decisions

- The codebase already uses `t('namespace.key', 'fallback')`; the components
  were correct — only the locale JSON lacked the keys. So this is a locale-data
  pass plus two Dashboard key renames, not a component refactor.
- Added the genuinely-new redesign keys **and** the small set of reused keys my
  new surfaces depend on that were missing from both locales (`sidebar.newPage`,
  `importFile`, `importFolder`, `searchPages`, `noPages`, `noResults`,
  `workspace`; a new `pagetree.untitled`; `commandPalette.title`). These were
  rendering via fallback across LeftSidebar/PageTree/Dashboard, so adding them
  improves zh coverage app-wide at low risk.
- Two Dashboard labels were pointing at generic keys whose values didn't match
  the design wording (`dashboard.diary` = "Diary", `dashboard.tasks` = "Tasks").
  Repointed to new dedicated keys `dailyJournal` and `todayTasks` so the design
  text appears without clobbering the existing keys (still used elsewhere).

## Changes

- **`src/i18n/locales/en.json`** & **`zh.json`** — added, in both, with full
  parity:
  - `titlebar.ask` · `highlightPopover.askPrism`
  - `settings.theme.identities` · `settings.theme.morePresets`
  - `commandPalette.title`
  - `sidebar.{workspace,newPage,importFile,importFolder,searchPages,noPages,noResults}`
  - new block `pagetree.untitled`
  - `workspace.dashboard.{night,todayTasks,noTasks,recent,dailyJournal,blankDoc,journalSub,importSub}`
- **`src/components/workspace/Dashboard.tsx`** — daily-journal action →
  `dashboard.dailyJournal`; tasks header → `dashboard.todayTasks`.

## Verification

- `node -e JSON.parse(...)` — both locale files parse cleanly.
- Parity script — all 16 added keys present in **both** en and zh.
- `npx tsc --noEmit -p tsconfig.web.json` — 45 errors, identical to baseline,
  zero new.

## Follow-ups

- A broader audit could localize other long-standing inline fallbacks across the
  app (PageTree context menu, LeftSidebar header), but those predate this
  redesign and are out of scope here.
