# Agent Trace — Developer Debug Panel

## Background / Context

Debugging AI prompt issues required inserting console.logs in the main process
and restarting the app. There was no way for a developer to see the full Agent
call chain (system prompt, messages sent, MCP tools attached, response text,
timing) from the renderer side.

## Design

**Dev-only** — The entire feature is gated behind development mode:
- Main process: `app.isPackaged` check in `traceEvent()` — no IPC overhead in production.
- Renderer: `import.meta.env.DEV` gates the IPC subscription in `App.tsx` and
  the Developer tab in `SettingsPanel.tsx` — the tab, component, and store
  are tree-shaken from production bundles by Vite.

**Main process instrumentation** — A `traceEvent()` helper in `aiService.ts`
emits structured trace entries via IPC (`agent:trace`) to the renderer at seven
instrumentation points: request start, system prompt built, messages sent, MCP
tools attached, response received, tool calls, and errors. Both the streaming
(`sendMessage`) and one-shot (`sendOneShot`) code paths are instrumented.
Full message bodies are sent (no truncation) so Horse Mode prompts and
responses are fully inspectable.

**Renderer** — A Zustand store (`agentTraceStore.ts`) collects trace entries
(max 500) from the IPC channel. The subscription is wired up in `App.tsx` via
`subscribeToTraceIPC()`.

**UI** — A new "Developer" tab in Settings (with `Code` icon) renders
`AgentTracePanel.tsx`: a chronological list of trace entries (newest first),
filterable by type, each expandable to show full JSON payload, with per-entry
copy and global clear buttons.

## Changes

| File | Change |
|------|--------|
| `electron/services/aiService.ts` | Added `traceEvent()` helper gated by `app.isPackaged`, `setTraceWindow()` export, trace emissions at 7 points with full (untruncated) payloads |
| `electron/ipc/agentHandlers.ts` | Import and call `setTraceWindow()` to wire up the BrowserWindow reference |
| `electron/preload.ts` | Added `onAgentTrace` IPC listener |
| `src/types/electron.d.ts` | Added `onAgentTrace` type to `ElectronAPI` |
| `src/store/agentTraceStore.ts` | New Zustand store for trace entries |
| `src/components/dev/AgentTracePanel.tsx` | New panel component with filter, expand, copy, clear |
| `src/components/settings/SettingsPanel.tsx` | Added `developer` tab gated by `import.meta.env.DEV` |
| `src/App.tsx` | Subscribed to trace IPC on mount, gated by `import.meta.env.DEV` |
| `src/i18n/locales/en.json` | Added `settings.developer.*` keys |
| `src/i18n/locales/zh.json` | Added `settings.developer.*` keys (Chinese) |

## Verification

1. `npm run typecheck` passes with zero errors.
2. Dev mode: Settings shows Developer tab; production: tab absent.
3. Send an Agent chat message → Settings → Developer → trace shows request,
   system prompt, full messages, response with timing.
4. Horse Mode → trace shows each iteration's full prompt and response.
5. Expand any entry → full JSON payload visible.
6. Copy button copies JSON to clipboard.
7. Filter dropdown narrows entries by type.
8. Clear button removes all entries.
