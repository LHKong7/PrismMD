# Workspace Migration — Phase 4 (Metadata Services → Page IDs)

## Background / Context

After Phase 3 the app is workspace-driven, but the per-document metadata
services (annotations, doc summaries, memory, knowledge base) were still keyed
by filesystem paths and stored as loose JSON/hash files under userData. With the
new model, documents are workspace pages identified by UUID. Phase 4 rekeys all
metadata to page IDs and moves the page-scoped stores into the SQLite workspace
DB so they cascade-delete with their page.

## Changes

### Annotations → SQLite (`electron/services/annotationStore.ts`)
- Rewritten from per-file `sha256(path).json` blobs to the `annotations` table
  (FK → `pages`, `ON DELETE CASCADE`). Keyed by `page_id`.
- `loadAnnotations(pageId)` reads rows; `saveAnnotations(pageId, items)` does a
  delete + re-insert in a transaction (renderer always saves the full set).
- The `Annotation.filePath` field now carries the page ID (renderer-compatible).
- `src/hooks/useAnnotations.ts` sources the page ID from `workspaceStore`.

### Doc summaries → SQLite (`electron/services/docSummaryService.ts`)
- Rewritten from a single `docSummaries.json` map to the `doc_summaries` table
  (FK → `pages`, `ON DELETE CASCADE`). `getDocSummary(pageId)` /
  `setDocSummary(pageId, …)` use an UPSERT; `questions` stored as JSON text.
- Added the long-missing `docSummaryGet` / `docSummarySet` / `docSummaryClear`
  type declarations to `electron.d.ts` (they existed in preload but were never
  typed — this also cleared 2 pre-existing compile errors).
- `DocSummary.tsx` already read its data via `usePaneFileData` (page ID) — only
  removed a dead `useFileStore` import.

### Memory → page-keyed (`electron/services/memoryService.ts`)
- Renamed the entry field and params `filePath → pageId`. Storage stays a bounded
  JSON list (it's a flat scored list, not per-page files). The agent already
  passes the page ID (via `workspaceStore.currentFilePath` alias), so memory is
  keyed by page end-to-end with no handler changes.

### Knowledge Base → page source (`electron/services/knowledgeBaseService.ts`)
- `KBEntry.originalPath` is now optional; added `sourcePageId`.
- New `addPage(pageId, tags?)` reads page content via `documentService.getPage`
  and stores a copy, deduping by `sourcePageId`.
- New IPC `kb:add-page`, preload `kbAddPage`, type decl, and
  `knowledgeBaseStore.addPage`. The old `FileTreeNode` "add to KB" entry point is
  gone, so a **"Add to Knowledge Base"** item was added to the `PageTree`
  context menu — restoring KB functionality in the workspace model.

## Verification

- `npx tsc --noEmit` (node + web): all Phase 4 files compile; **net −2 errors**
  (DocSummary types fixed). Every remaining error is pre-existing
  (`insightGraph*` not in `electron.d.ts`, lucide prop types, `import.meta.env`,
  SelectionAI/HighlightPopover `rewrite`).
- Deleting a page now cascades to its annotations and doc summary via SQLite FK.

## Follow-ups (Phase 5)

- Horse Mode output → create a page instead of writing a file.
- InsightGraph: ingest by page ID (read content from DB), entity-linking keyed by
  page; add missing `insightGraph*` methods to `electron.d.ts`.
- CommandPalette / diary file-open actions → workspace pages.
- Phase 7: delete `fileStore.ts`, `fileTree.ts`, `fileWatcher.ts`, and dead
  filesystem IPC.
