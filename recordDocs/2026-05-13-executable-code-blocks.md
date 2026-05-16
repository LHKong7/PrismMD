# Executable Code Blocks — Notebook-Style Markdown

## Background / Context

Added a notebook-like feature: fenced code blocks tagged with `:run` become executable with inline result display. Brings computational notebook capabilities into the markdown reader.

## Markdown Syntax

````markdown
```python:run
data = {'Name': ['Alice', 'Bob'], 'Score': [95, 87]}
for name, score in zip(data['Name'], data['Score']):
    print(f"{name}: {score}")
```
````

The `:run` suffix on the language tag activates the executable UI.

## Design Decisions

- **Two execution paths**: JS/HTML/CSS run in the existing sandboxed iframe; Python and other languages go through the AI Agent via `sendAgentOneShot` with a structured JSON schema for results.
- **Structured output**: The Agent returns `{ stdout, stderr, exitCode, result: { type, data } }` where `type` can be `text`, `table`, or `chart`, enabling rich inline rendering.
- **Plugin architecture**: Follows the Mermaid plugin pattern — registers `:run` language variants in the renderer registry. Supports 14 languages out of the box.
- **Charts**: Simple SVG bar/line/pie charts rendered directly — no external charting library needed.

## Changes

### New files
- `src/components/reader/components/ExecutableBlock.tsx` — main component with Run/Re-run/Clear toolbar, dual execution paths (iframe vs Agent), result display
- `src/components/reader/components/ExecutableResult.tsx` — renders structured results: text `<pre>`, HTML tables, SVG charts (bar/line/pie)
- `src/plugins/executable/index.ts` — plugin that registers 14 `:run` language variants

### Modified files
- `src/lib/sandbox/sandboxLanguages.ts` — added `isRunnable()` and `baseLanguage()` helpers
- `src/lib/plugins/loader.ts` — registered executable plugin in builtin list

## Verification

1. `npm run typecheck` — passes
2. `npm run dev` — builds
3. `python:run` block → Run → Agent returns stdout → displayed inline
4. `python:run` with tabular data → Agent returns table → rendered as HTML table
5. `python:run` with chart data → Agent returns chart spec → rendered as SVG
6. `js:run` block → runs in iframe sandbox → console output captured
7. Re-run and Clear buttons work
8. Error state displays stderr in red
