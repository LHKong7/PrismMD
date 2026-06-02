# Notion-style UI/UX Refinement

## Background / Context

After the workspace migration, the reader still felt like a file viewer: the
page title lived only in the tab, headings had underlines, and there was no
page icon or inline title editing. This pass makes the core surfaces feel like
Notion.

## Changes

### Page header (the signature Notion element)
- **New `src/components/reader/PageHeader.tsx`** — a large, inline-editable page
  title plus an optional emoji icon, rendered above the document body.
  - Title is an auto-resizing textarea; commits on Enter/blur via
    `workspaceStore.renamePage` (updates tab, sidebar, breadcrumb).
  - Emoji icon button opens a compact 24-emoji popover (with Remove); persists
    via a new `workspaceStore.setIcon` → `workspaceUpdatePage({ icon })`.
  - A fresh "Untitled" empty page auto-focuses the title, so pressing **New
    page** drops you straight into naming it (Notion behaviour).
- **`DocumentReader.tsx`** renders `<PageHeader />` above the body for markdown
  pages on the active pane.
- **`workspaceStore.ts`** — added `setIcon(pageId, icon)` action.

### Reader typography (`styles/markdown.css`)
- Removed the underlines beneath `h1`/`h2` (Notion has no heading rules).
- Tightened the heading scale (`h1` 1.875em) and body line-height to 1.7.
- Reduced `.markdown-body` top padding to 0.25rem since the PageHeader now
  supplies the top space; content stays in the centered 48rem column.

### Sidebar polish (`LeftSidebar.tsx`)
- Added a persistent **"+ New page"** footer row pinned to the bottom of the
  sidebar (a standard Notion affordance), shown when pages exist and not while
  searching.

## Verification

- `npx tsc --noEmit -p tsconfig.web.json` — no new errors; the error profile is
  identical to the prior baseline (pre-existing `insightGraph*` / lucide /
  `import.meta.env` issues only).
- Manual flow: New page → title focused → type name → pick emoji → it shows in
  sidebar/tab/breadcrumb; reading view shows the big title + icon with clean,
  underline-free headings in a centered column.

## Follow-ups

- Wrap the PageHeader's literal strings ("Add icon", "Remove", placeholder) in
  i18n (`t()`) for zh locale parity.
- A true WYSIWYG/slash-command editor is out of scope; the editor remains
  CodeMirror behind the Edit toggle.
- Optional: a full emoji picker (search) instead of the fixed quick-grid.
