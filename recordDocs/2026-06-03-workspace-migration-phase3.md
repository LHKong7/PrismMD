# Workspace Migration — Phase 3 (Sidebar + Core Read/Edit Loop)

## Background / Context

Phases 1–2 built the SQLite workspace database, the document service, IPC, and
the renderer `workspaceStore` — but left the UI driven by the old filesystem
`fileStore`. Phase 3 rewires the visible application so it is **workspace-driven**:
the sidebar shows the nested page tree, opening a page renders it in a tab, and
editing autosaves to SQLite. This is the phase where PrismMD visibly becomes a
Notion-like app rather than a file viewer.

## Design

- Reuse the `workspaceStore` compatibility layer (`currentPageId`,
  `currentContent`, `currentTitle`, `currentFormat`) so the reader/editor migrate
  with minimal churn.
- `workspaceStore` also exposes legacy aliases `currentFilePath` (= page ID) and
  `currentBytes` (always null) so the long tail of identity-keyed consumers
  (agent memory, etc.) migrate with a one-line import swap — the page ID becomes
  the document identity, which is exactly the new model.
- Pages are markdown text only; binary/format branches are bypassed.
- `fileStore.ts` is left in place (inert) so untouched peripheral features keep
  compiling; it is removed in Phase 7.

## Changes

### New
- **`src/components/filetree/PageTree.tsx`** — Recursive workspace page tree:
  expand/collapse, click-to-open, active highlight, inline rename, hover
  "+ subpage", and a context menu (new subpage / rename / export / delete).

### Rewired to `workspaceStore`
- **`src/components/layout/LeftSidebar.tsx`** — Full rewrite. Workspace header
  with New Page / Import file / Import folder actions, a live page search box,
  and the `PageTree` body (folder browser + folder watching removed). (Plan 3a/3b)
- **`src/store/workspaceStore.ts`** — Added `currentFilePath`/`currentBytes`
  compat aliases to `syncFromActiveTab` and initial state.
- **`src/hooks/usePaneFileData.ts`** — Sources the active page from
  `workspaceStore`; adds `title`. `filePath` now carries the page ID.
- **`src/contexts/PaneContext.ts`** / **`src/components/layout/PaneView.tsx`** —
  Pane data sourced from workspace tabs (pageId/title/content/format).
- **`src/hooks/useMarkdown.ts`** — TOC published to `workspaceStore.setToc`.
- **`src/store/editorStore.ts`** — Reads `currentContent` from workspace; Cmd+S
  saves via `workspaceStore.setContent` + `savePage` (SQLite) instead of
  `writeFile`.
- **`src/components/layout/TabBar.tsx`** — Workspace tabs; tabs display page
  titles; "Copy Title" replaces "Copy Path".
- **`src/components/reader/DocumentReader.tsx`** — Markdown-only routing;
  drag-dropped `.md` files import as new pages.
- **`src/components/workspace/Dashboard.tsx`** — Quick actions create a page /
  import Markdown; removed filesystem "recent files".
- **`src/components/layout/Breadcrumb.tsx`** — Shows the page ancestor chain via
  `workspaceGetAncestors`; clicking an ancestor opens it.
- **`src/components/layout/TitleBar.tsx`** — Title = current page title; always
  editable.
- **`src/components/layout/StatusBar.tsx`** / **`AppShell.tsx`** — Word count and
  outline TOC read from `workspaceStore`.
- **`src/components/agent/AgentSidebar.tsx`** / **`ChatMessage.tsx`** — Document
  context + memory key sourced from the open page (pageId).
- **`src/App.tsx`** — Session restore + Cmd+N (new page), Cmd+E (edit), Cmd+W
  (close tab), Cmd+Shift+T (reopen), Cmd+1..9 / Ctrl+Tab (switch) all target
  `workspaceStore`.

## Verification

- `npx tsc --noEmit -p tsconfig.web.json` — Phase 3 introduced **no new type
  errors**; every remaining error is pre-existing (missing `insightGraph*` /
  `docSummary*` methods on `ElectronAPI`, lucide icon prop types,
  `import.meta.env`, SelectionAI/HighlightPopover `rewrite`).
- End-to-end loop now: open app → workspace session restores → sidebar page tree
  → click page → tab + reader → edit → autosave/Cmd+S to SQLite → breadcrumb /
  title / word count reflect the page.

## Follow-ups

- **Phase 4** — Migrate annotations / doc summaries / memory / KB to page IDs +
  SQLite tables (currently inert on `fileStore`).
- **Phase 5** — Horse Mode output → new page; InsightGraph ingest by page;
  entity linking; CommandPalette + diary file-open actions.
- **Phase 7** — Remove `fileStore.ts`, `fileTree.ts`, `fileWatcher.ts`,
  `DeleteConfirmDialog`, and dead filesystem IPC.
