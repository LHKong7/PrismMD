# Session Restore + Editor Heading Outline

## Background / Context

1. All tab/file state was in-memory only — closing the app lost all open tabs, folders, and window position. Users had to re-open everything on each launch.
2. The right sidebar TOC (Table of Contents) worked in reader mode with click-to-scroll and active heading tracking, but was non-functional in editor mode since the reader DOM elements don't exist while editing.

## Design Decisions

### Session Restore
- Persist session data alongside existing layout data in `electron-store` under a `session` key — no new persistence infrastructure needed.
- Only save `filePath` and `scrollY` per tab, not content — content is re-read from disk on restore, keeping session data small and avoiding stale content.
- Auto-save via Zustand `subscribe` with 1-second debounce on tab/folder changes — no manual "save session" action needed.
- Window bounds validated against current displays via `screen.getDisplayMatching()` to handle monitor changes between sessions.
- Files/folders that no longer exist are silently skipped during restore.

### Editor Heading Outline
- Lightweight regex-based heading extraction (`/^(#{1,6})\s+(.+)$/gm`) instead of running the full unified pipeline — fast enough for real-time updates on every keystroke (debounced 300ms).
- Reuses the same `slugify` algorithm as `remarkToc` for consistent IDs.
- `EditorTocEntry` extends `TocEntry` with a `line` number field for scroll-to-line support.
- Editor view ref stored in `editorStore` so `scrollToLine()` can programmatically position the cursor and scroll the CodeMirror view.
- `TableOfContents.tsx` switches behavior based on `editing` state — uses `editorToc` entries and `scrollToLine()` in edit mode, existing `IntersectionObserver` + `scrollIntoView` in reader mode.

## Changes

### Feature 1: Session Restore

**`src/store/fileStore.ts`**
- Added `saveSession()`: serializes tabs (filePath + scrollY), activeTabId, openFolderPaths to settings
- Added `restoreSession()`: reads session, re-opens folders and files, restores active tab
- Added Zustand subscriber for debounced auto-save on tab/folder changes

**`electron/main.ts`**
- Added `getSavedWindowBounds()`: reads persisted bounds, validates against current displays
- Added `saveWindowBounds()`: saves `mainWindow.getBounds()` on close
- `createWindow()` now uses saved bounds instead of hardcoded 1200x800
- Added `close` event handler to save bounds before window closes

**`src/App.tsx`**
- Added `restoreSession()` call on mount (after loadSettings and loadLayout)

### Feature 2: Editor Heading Outline

**`src/lib/markdown/extractHeadings.ts`** (new)
- `extractHeadingsFromSource(source)`: regex-based heading extraction returning `EditorTocEntry[]` with line numbers

**`src/store/editorStore.ts`**
- Added `editorToc: EditorTocEntry[]` state
- Added `editorViewRef: EditorView | null` for programmatic scrolling
- `setEditing(true)` now extracts headings immediately and updates fileStore TOC
- `setEditorContent()` debounces heading re-extraction (300ms) and updates fileStore TOC
- Added `setEditorViewRef()` and `scrollToLine(line)` actions

**`src/components/editor/CodeMirrorEditor.tsx`**
- Registers/unregisters editor view ref with `editorStore.setEditorViewRef()` on mount/unmount

**`src/components/toc/TableOfContents.tsx`**
- Reads `editing`, `editorToc`, `scrollToLine` from editorStore
- In editor mode: displays `editorToc` entries, click navigates via `scrollToLine(entry.line)`
- In reader mode: existing IntersectionObserver + scrollIntoView behavior unchanged

## Verification

1. `npm run typecheck` — passes
2. `npm run dev` — builds and launches
3. **Session restore**: Open files + folders → quit → relaunch → same tabs/folders restored, window position/size preserved
4. **Editor TOC**: Cmd+E to edit → right sidebar shows headings → click heading → editor scrolls to that line → add/remove headings → TOC updates live
