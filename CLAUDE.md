# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

PrismMD is a cross-platform AI-native Markdown reader/editor: Electron 33 + React 18 + TypeScript + Tailwind, with a PixiJS pixel-art "front stage" (烛笺阁 / Inkwell Keep) layered over the reader/editor "back stage".

## Commands

- `npm run dev` (alias `start`) — Electron Forge dev server with hot reload.
- `npm run typecheck` — `tsc --noEmit` over both TS projects (renderer + electron). **This is the only quality gate** — there is no linter and no test framework in this repo.
- `npm run package` / `npm run make` — build distributables (prod profile: asar on, DMG/ZIP/Squirrel/Deb makers, output in `out/dist`).
- `scripts/build.sh` — production wrapper (`npm ci` → typecheck → make); flags `--package / --platform / --profile / --skip-typecheck / --skip-install`.
- CI (`.github/workflows/build.yml`) runs typecheck + `electron-forge make` on `v*` tags across macOS/Windows/Linux.

TypeScript is solution-style: `tsconfig.web.json` (renderer `src/**`, alias `@/*` → `src/*`) + `tsconfig.node.json` (`electron/**` + config files), referenced from root `tsconfig.json`.

## Architecture

### Process split, IPC, persistence

- **Main process** (`electron/`): `main.ts` must keep `bootstrap.ts` as its **first import** — it redirects `userData` (custom data location) before `electron-store` and `better-sqlite3` resolve their paths at import time.
- **IPC**: `electron/ipc/index.ts` is a flat registry of `register*Handlers()` modules. Channel naming is `domain:kebab-action` (e.g. `workspace:create-page`, `agent:one-shot`); `invoke/handle` for request/response, `send/on` for main→renderer push (e.g. `agent:stream-chunk`, `rag:progress`). Handlers get the window via the lazy `getMainWindow()` from `main.ts` — never capture it at registration (window can be recreated on macOS). Responses commonly use an `{ ok, error? }` envelope.
- **Preload** (`electron/preload.ts`) exposes one typed object as `window.electronAPI` (exports the `ElectronAPI` type). Gotcha: the `fs:*` / `dialog:*` methods there are legacy with **no main-process handlers** — live document data goes through `workspace:*`.
- **Persistence**: single better-sqlite3 DB `{userData}/workspace.db` (`electron/services/workspaceDb.ts`, WAL, synchronous API) holds pages, annotations, versions, page meta, embeddings. Settings via electron-store (`services/settingsStore.ts`). On quit, `before-quit` asks the renderer to flush debounced autosaves before closing the DB.

### Renderer state (zustand)

- Plain `create()` stores in `src/store/` — **no persist middleware**; persistence is manual through `window.electronAPI` calls (layout → electron-store, pages → SQLite with a 600ms-debounced autosave).
- Non-React access uses `useXStore.getState()` (all `App.tsx` keyboard shortcuts do this); cross-store calls use dynamic `import()` to avoid cycles.
- `commandRegistry.ts` and `sidebarPanelRegistry.ts` are zustand stores acting as plugin extension points: `register(pluginId, item)` (re-register wins, HMR-safe), `unregisterByPlugin(pluginId)` on deactivate.
- Boot: `src/main.tsx` activates built-in plugins **before** React mounts; `App.tsx` then hydrates settings/layout/session, and loads external plugins in an effect. Layout = `TitleBar` + `AppShell` (sidebar / tabs+reader-or-graph / agent sidebar) + `StatusBar`, with overlays (command palette, settings, zen/focus modes, `FrontStageView`) on top. Split panes read per-pane data from `src/contexts/PaneContext.ts`, falling back to the workspace store.
- i18n: i18next with bundled `src/i18n/locales/{en,zh}.json`; add strings to **both** files.

### Markdown pipeline & editor

- `src/lib/markdown/pipeline.ts:processMarkdown()` is the single unified chain (remark-gfm/breaks/math + custom `remarkEnhanced` for callouts/`:::tabs`/`:::timeline` → rehype-katex/highlight → rehype-react). It also emits side-channel data (TOC, code markers) via `onExtract` callbacks.
- Custom renderers are wired in the rehype-react `components` map (`pre → CodeBlock`, `table → TableBlock`, callout/tabs/timeline in `src/components/reader/components/`).
- Fence-language renderers (mermaid, executable blocks) are **not** hardcoded: plugins register components into `src/lib/markdown/rendererRegistry.ts` (a deliberately non-reactive `Map`), which `CodeBlock` consults by language.
- **Merged edit/read mode**: there is no edit/read toggle. The active pane always renders `MarkdownEditor` (CodeMirror 6); the rendered `MarkdownReader` view only appears as the inactive split-pane preview. Markdown source is the single source of truth — "rich edit" (heading styles, WYSIWYG tables, checklists) is CodeMirror decorations/widgets that serialize back to GFM (`src/components/editor/`).
- Tab switch/close/quit must call `flushPendingSaves()` first (600ms debounce means dirty buffers).

### Plugin system

- One `Plugin` interface for built-in and external plugins (`src/lib/plugins/types.ts`): `{ id, name, version, activate(host), deactivate?() }`. The `PluginHost` API is deliberately tiny: `registerCommand`, `registerSidebarPanel`, `registerMarkdownRenderer`, `notify`.
- Built-ins live in `src/plugins/<name>/`, use id prefix `prismmd.*`, and are statically registered in `BUILTIN_PLUGINS` in `src/lib/plugins/loader.ts`. The external-plugin reload logic relies on that prefix to decide what not to unload.
- External plugins load from `{userData}/plugins/<dir>/` (`manifest.json` + CJS `index.js`), evaluated in the renderer with a whitelist `require` shim (`REQUIRE_ALIASES` in `src/lib/plugins/externalLoader.ts` — currently only `react`, `lucide-react`). They are trust-based, **not sandboxed**.
- `src/lib/sandbox/` is unrelated to plugin sandboxing — it runs user `<lang>:run` code fences in a sandboxed iframe (the `executable` plugin).

### AI, agents, RAG, knowledge graph

- Providers: OpenAI / Anthropic / Google behind the `LLMProvider` protocol (`electron/agent/llmProtocol.ts`, implementations in `electron/agent/providers/`). Internal message format is OpenAI-shaped; other providers translate. Keys are entered in-app (electron-store) — no env vars.
- Agent execution runs in a pool of up to 3 `worker_threads` (`electron/services/agentWorkerManager.ts` → `electron/workers/agentWorker.ts`) so chat, Horse Mode, and InsightGraph extraction run concurrently. Tool calls are proxied back to main via `tool-call-request` messages.
- **Two MCP directions with similar names**: `services/mcpService.ts` = PrismMD as MCP *client* (spawns external tool servers for the assistant); `services/mcpServerService.ts` = PrismMD as MCP *server* (localhost Streamable-HTTP + bearer token, read-only `search_notes` / `get_note` / `list_notes`).
- RAG/semantic search (`electron/services/ragService.ts`): chunks → embeddings via an OpenAI-compatible endpoint → Float32 BLOBs in `note_embeddings` (workspace.db) → brute-force cosine in JS. Indexing is manual/incremental (`rag:reindex`); changing the embedding model invalidates all rows.
- Knowledge graph = external Neo4j via `neo4j-driver` (`services/insightGraphService.ts`), optional, configured in-app.
- Horse Mode = autonomous document-writing: `agent:run-task` runs a PLAN→EXECUTE→REVIEW→EVALUATE loop, then a consolidation pass writes a new note.

### Front stage (烛笺阁 / Inkwell Keep)

- `FrontStageView` (`src/components/frontstage/`) is a fixed full-screen overlay toggled by `uiStore.frontStageActive` (default true); the back stage stays mounted underneath. While active it owns all keyboard input — `App.tsx` global shortcuts early-return.
- Pixi/React split: everything in-world is procedural `Graphics` driven by `PixiWorld.ts`'s ticker; heavy interaction is React DOM overlays (`overlays/`) which call `world.setEnabled(false)` while open. Logical 960×600 stage scaled via CSS transform.
- Rooms are data in `sceneConfig.ts` (`ROOMS`: bounds/obstacles/hotspots/npcs/spawn) plus a `DRAW[roomId]` function in `pixi/draw*.ts`. When adding a room, use the `roomBuild.ts` toolkit and **always** the shared `PALETTE` + a `nightWash()` layer so rooms stay visually unified. `travel` hotspots are handled inside PixiWorld; other hotspot kinds route to React overlays.
- Shelf books derive from real workspace pages (`pageTree` + `page_meta`); spine thickness/color/material/badges map from length/genre/quality/status via `bookSkin.ts` (shared with the DOM Stacks overlay).
- NPC scribes = personas in `npcs.ts` (system prompt + color) calling `sendAgentOneShot`; the Round Table fans out concurrent one-shots and merges via a chair/editor agent. recordDocs `2026-06-23-frontstage-*` document the design milestone by milestone.

### Build wiring

- Electron Forge 7 + Vite plugin; three Vite configs → four builds: `vite.main.config.ts` (used for both `electron/main.ts` **and** `electron/workers/agentWorker.ts`), `vite.preload.config.ts`, `vite.renderer.config.ts`.
- `fsevents`, `neo4j-driver`, `better-sqlite3` are rollup externals in the main config. `forge.config.ts` copies externals + transitive deps into packages via an `externalSeeds` whitelist — `better-sqlite3` is external but currently **not** in `externalSeeds`; verify packaged builds when touching native/external deps.
- App identity (name, bundleId, icon) lives in `app.config.ts`; dev/prod packaging profiles in `build-config/profiles.ts` (resolved from `APP_PROFILE` env or npm lifecycle event).

## 工作流约定

### 完成复杂功能后写入 recordDocs

每次完成一个**复杂功能**（bug 修复链路、跨多个文件的 feature、重构、性能优化等），
必须在仓库根目录的 `recordDocs/` 目录下新增一个 Markdown 文档，描述本次改动。

- **目录**：`recordDocs/`（若不存在则创建）。
- **文件名**：`YYYY-MM-DD-<kebab-case-slug>.md`，例如
  `2026-04-14-fix-graph-preview-display.md`。
- **内容结构**：
  1. **背景 / 问题（Context）** — 为什么要做这件事、用户遇到的现象或需求。
  2. **根因分析 / 设计决策（Analysis / Design）** — 关键的判断依据、
     权衡过的替代方案（如有）。
  3. **改动清单（Changes）** — 列出修改的文件和每处改动的意图；
     贴关键代码片段或引用 `path:line` 方便回溯。
  4. **验证方式（Verification）** — 如何本地复现问题、如何验证修复生效、
     跑过的测试/类型检查。
  5. **后续项（Follow-ups，可选）** — 已识别但本次未处理的相关问题。
- **何时跳过**：纯 typo、单行修改、文档/注释微调等琐碎改动不必记录。
- **提交**：记录文档与功能改动放在**同一个 commit** 或同一 PR 内，
  不要延后补交，避免实现与文档失联。

### 推送与分支

- 始终在用户指定的分支上开发；若未指定，询问用户后再动手。
- 按仓库已有习惯写 commit message（当前仓库以 `feat:` / `fix:` 前缀为主）。
- `git push` 使用 `-u origin <branch>`；网络失败按指数退避重试。

### 默认禁止

- 不创建用户未要求的 PR。
- 不往 `main` / `master` 强推。
- 不跳过 pre-commit hooks（除非用户明确要求）。
