# aiService.ts: Migration from Direct SDK to borderless-agent

## Background / Context

PrismMD's AI service (`electron/services/aiService.ts`) previously made direct calls to the Anthropic and OpenAI SDKs, maintaining separate code paths for each provider (~200 lines of duplicated streaming/chat logic). The `borderless_agent/` library already existed in the repo as a standalone package providing unified multi-provider support, context management, tool execution, and retry logic — but was unused by the main app.

The goal was to replace direct SDK calls with the borderless-agent library and leverage its full feature set: context management (token budgeting, history selection), tool system, observation folding, input sanitization, and exponential backoff retry.

## Analysis / Design

**Key decisions:**

1. **Per-call AgentInstance** — Provider, model, and system prompt change between calls. Building is cheap (no network at construction). Avoids stale-config bugs from singleton reuse.

2. **`enableContext(true)`** — Delegates token budgeting and history selection to the agent's `selectHistory()` (token-aware) instead of the naive `slice(-40)` in the renderer. The renderer now sends up to 100 messages and lets the agent trim intelligently.

3. **`setIncludeBuiltinTools(false)`** — PrismMD is a reader app; agent's built-in tools (bash, file ops) are inappropriate.

4. **Provider mapping** — The 5 PrismMD providers map to borderless-agent's 3 provider types: `ollama` and `custom` both use the OpenAI provider with custom `baseUrl`.

5. **Tool split** — `sendMessage()` (streaming) does not pass tools (only system prompt hints, matching prior behavior). `sendOneShot()` passes MCP tools for multi-round tool execution.

6. **Trace events preserved** — Kept PrismMD's own `traceEvent()` system rather than using borderless-agent's Telemetry, since the dev tools UI depends on the IPC-based trace format.

## Changes

### `electron/services/aiService.ts`
- **Removed** imports: `@anthropic-ai/sdk`, `openai`
- **Added** imports: `AgentBuilder`, `AgentInstance`, `ToolDefinition`, `StreamChunk`, `ProviderName` from `../../borderless_agent/src`
- **Deleted** (~200 lines): `resolveBaseUrl()`, `resolveApiKey()`, `raceAbort()`, `streamAnthropic()`, `streamOpenAI()`, `chatAnthropic()`, `chatOpenAI()`
- **Added** (~60 lines): `mapProvider()`, `mcpToolsToToolDefs()`, `buildAgent()`
- **Rewritten**: `sendMessage()` uses `agent.stream()` with `for await` loop; `sendOneShot()` uses `agent.chat()`; `testConnection()` uses `agent.chat()`
- **Preserved**: `stopGeneration()`, `setTraceWindow()`, `traceEvent()`, `discoverMcpTools()`, all types

### `src/store/agentStore.ts`
- `MAX_CONTEXT_MESSAGES`: `40` → `100` — lets borderless-agent's `selectHistory()` do token-budget-aware trimming instead of naive message count slicing

## Verification

- TypeScript compilation: `npx tsc --noEmit -p tsconfig.node.json` — no errors in `aiService.ts`
- Pre-existing type errors in other files (main.ts, fileWatcher.ts, insightGraphService.ts) confirmed unrelated
- IPC handler signatures unchanged — `agentHandlers.ts` requires no modification
- Renderer-side stores (`agentStore.ts`, `horseModeStore.ts`) use the same IPC channels

## Follow-ups

- The borderless-agent's `AgentInstance.stream()` does not accept an `AbortSignal`. Abort works by breaking the `for await` loop, which triggers generator cleanup. However, the underlying HTTP request continues to completion in the background. A future enhancement could thread an abort signal through to the LLM provider.
- Consider enabling borderless-agent's `GuardPipeline` telemetry to surface input sanitization events in the trace panel.
