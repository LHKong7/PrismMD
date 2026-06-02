# Workspace Migration — Phases 1 & 2 (SQLite Foundation + Workspace Store)

## Background / Context

PrismMD was a filesystem-based Markdown viewer/editor: every document was an
on-disk file, and all metadata (tabs, annotations, summaries, memory, KB) was
keyed by absolute file path. The goal is to transform it into a **Notion-like
workspace app** where notes live in an internal SQLite database (not visible on
disk), are organized as nested pages, and Markdown is brought in/out only via
explicit import/export.

Decisions (confirmed with user): **SQLite in userData**, **workspace-only**
(remove filesystem browsing in later phases), **pages + nested pages**.

This document covers the first two phases — the data foundation and the renderer
store. UI rewiring (sidebar, reader, editor) is deferred to Phase 3+.

## Design

- **Single SQLite DB** at `{userData}/workspace.db` via `better-sqlite3`
  (synchronous, fast, single-file). WAL mode + foreign keys on.
- **Pages table** is the core: `id` (UUID), `title`, `content`, `format`,
  `parent_id` (nullable → root), `position`, timestamps, `is_deleted` (soft
  delete), `icon`. Self-referential FK forms the page tree.
- `annotations` and `doc_summaries` tables are created now (FK → pages,
  `ON DELETE CASCADE`) but their services migrate in Phase 4.
- The renderer `workspaceStore` mirrors `fileStore`'s shape (tabs +
  compatibility layer) so the eventual component migration is mechanical.
- Content autosaves to SQLite on a 600ms debounce per page.

## Changes

### Phase 1 — Database + Document Service (main process)

- **`electron/services/workspaceDb.ts`** (new) — `getDb()` opens/initializes the
  SQLite DB and creates tables/indexes idempotently; `closeDb()` for shutdown.
- **`electron/services/documentService.ts`** (new) — Page CRUD (`createPage`,
  `getPage`, `updatePage`, `deletePage` (recursive soft-delete), `restorePage`),
  tree queries (`getChildren`, `getPageTree`, `movePage`, `getAncestors`),
  `searchPages` (LIKE on title+content), import/export (`importMarkdown`,
  `importFolder` recursive, `exportMarkdown`), and `ensureWelcomePage()` seed.
- **`electron/ipc/workspaceHandlers.ts`** (new) — 15 IPC handlers under the
  `workspace:*` namespace, including native dialogs for import-file,
  import-folder, and export-page. Seeds the welcome page on registration.
- **`electron/ipc/index.ts`** — registers `registerWorkspaceHandlers()`.
- **`electron/main.ts`** — `closeDb()` on `before-quit`.
- **`electron/preload.ts`** + **`src/types/electron.d.ts`** — exposed all 15
  `workspace*` methods and added `WorkspacePage` / `PageTreeNode` types.
- **`vite.main.config.ts`** — added `better-sqlite3` to Rollup externals (native
  module must not be bundled).
- **`package.json`** — `better-sqlite3` + `@types/better-sqlite3`.

### Phase 2 — Workspace Store (renderer)

- **`src/store/workspaceStore.ts`** (new) — Zustand store replacing `fileStore`
  responsibilities:
  - Page tree state (`pageTree`, `expandedIds`) + `loadTree`, expand toggles.
  - Tabs (`WorkspaceTab` keyed by `pageId`) + full tab actions (open, close,
    switch, move, close-others/to-right, reopen-closed).
  - Compatibility layer: `currentPageId` / `currentTitle` / `currentFormat` /
    `currentContent`, plus `setContent` (debounced autosave) and `setToc`.
  - Page actions: `createPage`, `openPage`, `savePage`, `deletePage`,
    `movePage`, `renamePage`.
  - Import/export passthroughs and session persistence (`workspaceSession` in
    settings: open page IDs, active page, expanded IDs).

`fileStore.ts` is intentionally left untouched so the app keeps compiling and
running; components are migrated off it in Phase 3+.

## Verification

- `npx tsc --noEmit` (both `tsconfig.node.json` and `tsconfig.web.json`) — no new
  errors in any added/modified file (only pre-existing errors in main.ts,
  fileWatcher.ts, insightGraphService.ts remain).
- DB schema is created idempotently (`CREATE TABLE IF NOT EXISTS`), so repeated
  launches are safe.
- Welcome page seeds only when `getPageCount() === 0`.

## Follow-ups (next phases)

- **Phase 3** — Rewire sidebar (`FileTree` → page tree), reader, `editorStore`
  (save via `workspaceStore.savePage`), `TabBar`, and App.tsx shortcuts to use
  `workspaceStore`. This is where the app visibly becomes workspace-driven.
- **Phase 4** — Migrate annotations / doc summaries / memory / KB to page IDs
  and the new SQLite tables.
- **Phase 5** — Agent + Horse Mode + InsightGraph keyed by `pageId`; Horse Mode
  output creates a page instead of writing a file.
- **Phase 7** — Remove `fileStore.ts`, `fileTree.ts`, `fileWatcher.ts`, and dead
  filesystem IPC.
