# Knowledge Base — Mark Documents as Reusable Agent Knowledge

## Background / Context

Users wanted to mark documents as persistent knowledge that the AI Agent can reference during conversations. Previously, the Agent only had access to the current document, conversation memory, and optional InsightGraph context. The Knowledge Base adds a user-curated layer of reference documents.

## Design Decisions

- **Snapshot storage**: When a document is added to the KB, its content is copied to `~/.prismmd/knowledge/docs/`. This ensures KB remains functional even if the original file is moved/deleted.
- **Lightweight index**: `index.json` stores metadata (title, tags, summary, timestamps) — fast to search without reading full documents.
- **Keyword search**: Simple keyword matching on title + tags + summary. No embedding/vector search — keeps it dependency-free and fast.
- **Agent integration**: KB context is injected into `agentStore.sendMessage()` alongside existing memoryContext and graphContext. Top-3 relevant documents are included automatically based on the user's message.
- **Plugin pattern**: Follows the existing IPC service pattern from `memoryService.ts`.

## Changes

### New files
- `electron/services/knowledgeBaseService.ts` — Backend: add/remove/list/search/getContext, manages `~/.prismmd/knowledge/`
- `electron/ipc/knowledgeBaseHandlers.ts` — IPC handlers for 6 KB operations
- `src/store/knowledgeBaseStore.ts` — Zustand store with addDocument, removeDocument, refresh, search

### Modified files
- `electron/ipc/index.ts` — Register KB handlers
- `electron/preload.ts` — Expose 5 KB APIs (kbAdd, kbRemove, kbList, kbSearch, kbGetContext)
- `src/types/electron.d.ts` — KBEntry type + API declarations
- `src/store/agentStore.ts` — Inject KB context into sendMessage() alongside memoryContext
- `src/components/filetree/FileTreeNode.tsx` — "Add to Knowledge Base" in file context menu
- `src/components/editor/editorSlashCommands.ts` — `/knowledge` slash command
- `src/i18n/locales/en.json` + `zh.json` — i18n keys

## Verification

1. `npm run typecheck` — passes
2. `npm run dev` — builds
3. Right-click file → "Add to Knowledge Base" → toast success → entry in `~/.prismmd/knowledge/index.json`
4. Open Agent → ask question → Agent receives relevant KB docs as context
5. `/knowledge` slash command inserts reference marker
