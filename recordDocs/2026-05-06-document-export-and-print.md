# Document Export (HTML / PDF / DOCX) + Print

## Background / Context

Users needed to export their markdown documents for sharing, printing, or archiving. PrismMD previously could only save back to the original `.md` file — no way to produce HTML, PDF, or DOCX output.

## Design Decisions

- **HTML export**: Created an alternate unified pipeline using `rehype-stringify` (instead of `rehype-react`) to produce raw HTML. The standalone HTML file inlines all CSS variables from the current theme, the full `markdown.css`, and KaTeX CSS — making it completely self-contained.
- **PDF export**: Uses Electron's built-in `BrowserWindow.webContents.printToPDF()` — zero extra dependencies. A hidden off-screen window renders the same styled HTML, then exports to A4 PDF with print-friendly styles.
- **DOCX export**: Uses the `docx` npm package. A custom HAST-to-DOCX converter walks the rehype AST and maps HTML elements to Word document structures (headings, paragraphs, tables, lists, code blocks, etc.).
- **Print**: Same hidden-window approach as PDF, but calls `webContents.print()` which opens the native OS print dialog.
- **UI**: Export dropdown button in the TitleBar (Download icon) with four options. Uses lazy `import()` so export code is only loaded when needed.

## Changes

### New files
- `src/lib/export/exportPipeline.ts` — `markdownToHtml()` and `markdownToHast()` functions
- `src/lib/export/buildStandaloneHtml.ts` — wraps HTML in complete document with inlined CSS
- `src/lib/export/hastToDocx.ts` — HAST tree → DOCX buffer converter
- `src/lib/export/exportActions.ts` — orchestration: `exportToHtml()`, `exportToPdf()`, `exportToDocx()`, `printDocument()`
- `electron/ipc/exportHandlers.ts` — IPC handlers for save dialogs, PDF rendering, printing

### Modified files
- `electron/ipc/index.ts` — registers export handlers
- `electron/preload.ts` — exposes `exportHtml`, `exportPdf`, `exportDocx`, `printDocument`
- `src/types/electron.d.ts` — type declarations for new APIs
- `src/components/layout/TitleBar.tsx` — added `ExportDropdown` component
- `src/i18n/locales/en.json` + `zh.json` — export i18n keys

### Dependencies added
- `rehype-stringify` — HTML serialization
- `docx` — DOCX generation

## Verification

1. `npm run typecheck` — passes
2. `npm run dev` — builds successfully
3. **HTML**: TitleBar → Export → "Export as HTML" → save dialog → standalone HTML opens in browser with correct styling
4. **PDF**: TitleBar → Export → "Export as PDF" → save dialog → A4 PDF with print-friendly layout
5. **DOCX**: TitleBar → Export → "Export as Word" → opens in Word with headings, tables, code blocks
6. **Print**: TitleBar → Export → "Print" → OS print dialog appears
