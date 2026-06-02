# Workspace Migration — Phases 5 & 7 (Agent Integrations + Filesystem Removal)

## Background / Context

Phases 1–4 built the SQLite workspace, the page-tree UI, and migrated the
per-page metadata. Phase 5 cuts the remaining feature integrations over from
file paths to workspace page IDs; Phase 7 deletes the now-dead filesystem layer.
After this, PrismMD is fully workspace-only — there is no filesystem browsing,
file watching, or path-keyed state anywhere in the app.

## Phase 5 — Remaining integrations → page IDs

### Horse Mode (`horseModeStore.ts`, `HorseModeDialog.tsx`)
- Output now **creates a workspace page** instead of writing a file:
  `createPage(title) → savePage(content) → openPage`. The session record (Agent
  panel) references the page title rather than a file path.
- Store signature `start(task, title, iterations?, docContent?)` — `targetDir` /
  `fileName` removed. Dialog now has a single **Page title** input (auto-derived
  from the task) and reads document context from `workspaceStore`.

### InsightGraph (`insightGraphService.ts`, handler, store, 4 consumers)
- `ingestDocument(pageId)` reads content via `documentService.getPage` instead of
  `fs.readFile`; Neo4j `Report` now stores `source_page_id` + `source_filename`
  (page title) instead of `source_path`. `RelatedReport.sourcePageId` replaces
  `sourcePath`. Removed now-unused `fs`/`path`/`app` imports.
- `insightGraphStore`: reports carry the page ID (kept in the legacy `filePath`
  field) + page title; ingest/match by page ID; removed `filenameOf`.
- `GraphView`, `ContradictionBanner`, `useEntityLinking`, `RelatedRail` source the
  current page ID from `workspaceStore`; RelatedRail opens related pages via
  `openPage(sourcePageId)`.

### CommandPalette
- Rewritten for the workspace: page search via `workspaceSearch` (replaces the
  filesystem MiniSearch index), **New Page**, page-based KG ingest, and
  template → new page. Removed all file CRUD commands (rename/duplicate/delete/
  reveal/new-folder) and recent-files/all-files groups.

### Diary / Weekly Summary
- `diaryService`: a root **Diary** page with one child page per day (`YYYY-MM-DD`),
  created from the Daily Journal template. `getRecentDiaryPageIds` reads the tree.
- `weeklySummary`: reads recent diary pages via `workspaceGetPage` and creates a
  **Weekly Review** page instead of writing a file.

### Export / Flashcard / uiStore
- `exportActions` uses `workspaceStore.currentContent` + `currentTitle`.
- Flashcard plugin + panel read content/key from `workspaceStore`.
- `uiStore` split-pane `switchTab` calls repointed to `workspaceStore`.

## Phase 7 — Filesystem code removed

**Deleted files:**
`src/store/fileStore.ts`, `src/store/searchIndexStore.ts`, `src/lib/fileTree.ts`,
`src/hooks/useFileWatcher.ts`, `src/components/filetree/{FileTree,FileTreeNode,
DeleteConfirmDialog}.tsx`, `electron/services/{fileTree,fileWatcher}.ts`,
`electron/ipc/fileHandlers.ts`.

**Rewired:**
- `App.tsx` — removed `useFileWatcher()`.
- `AppShell.tsx` — removed `DeleteConfirmDialog`.
- `PdfViewer.tsx` — removed dead `useFileStore` import.
- `workspaceStore` — `invalidateSearchIndex()` is now a no-op (search is served
  directly by SQLite `workspaceSearch`).
- `electron/ipc/index.ts` — `registerFileHandlers()` removed.

## Verification

- `npx tsc --noEmit` (node + web): no new errors. The web error profile is
  identical to the Phase 4 baseline; every remaining error is pre-existing and
  unrelated to the migration:
  - the long-standing gap where `insightGraph*` / `onInsightGraphProgress`
    preload methods were never added to `electron.d.ts` (drives the
    insightGraphStore/GraphView/RelatedRail/useEntityLinking/ContradictionBanner
    cluster),
  - `neo4j` namespace type, lucide icon prop types, `import.meta.env`,
    SelectionAI/HighlightPopover `rewrite`.
- No dangling imports to any deleted module (verified by grep).

## Follow-ups (pre-existing, out of migration scope)

- Add the `insightGraph*` method declarations to `electron.d.ts` to clear the
  ~30 pre-existing InsightGraph type errors.
- Optional cleanup: remove the now-unused file IPC methods (`readFile`,
  `writeFile`, `openFolderDialog`, `watchFile`, …) from `preload.ts` /
  `electron.d.ts` — currently dead but harmless (no handlers, no callers).
