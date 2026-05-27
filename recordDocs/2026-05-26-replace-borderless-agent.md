# Replace borderless-agent with Internal AgentService

## Background / Context

Replaced the `borderless-agent` library (v0.0.1-alpha.6) — an early-alpha third-party agent framework — with direct SDK calls using the already-installed `@anthropic-ai/sdk` and `openai` packages. This gives full control over streaming, tool use, and provider switching with zero opaque dependencies.

## Design Decisions

- **Two code paths**: Anthropic uses its native SDK (`messages.stream()`, `messages.create()`). Everything else (OpenAI, Ollama, Google, custom) uses the OpenAI SDK which supports any compatible endpoint.
- **Thin wrapper, not a framework**: No agent builder class — just standalone functions (`streamAnthropic`, `chatAnthropic`, `streamOpenAI`, `chatOpenAI`) composed by the public API functions.
- **Tool call loop**: MCP tool calls implemented as a simple loop — parse tool request from response → execute via `mcpService.callTool()` → feed result back → repeat up to `maxToolRounds`. This is exactly what borderless-agent was doing internally.
- **Zero renderer changes**: The four exported functions (`sendMessage`, `sendOneShot`, `testConnection`, `stopGeneration`) keep the same signatures. IPC handlers unchanged.

## Changes

### `electron/services/aiService.ts` (rewritten)
- Removed `AgentBuilder`, `AgentInstance`, `LLMConfig` imports from `borderless-agent`
- Added direct imports of `Anthropic` and `OpenAI` SDKs
- `streamAnthropic()` — uses `client.messages.stream()` with `content_block_delta` events
- `streamOpenAI()` — uses `client.chat.completions.create({ stream: true })`
- `chatAnthropic()` — non-streaming with tool-call loop using Anthropic's native tool format
- `chatOpenAI()` — non-streaming with tool-call loop using OpenAI's function calling format
- `discoverMcpTools()` — replaces the former `attachMcpTools(builder)` pattern
- Provider routing via `resolveBaseUrl()` and `resolveApiKey()` helpers

### `electron/services/agentEnv.ts` (deleted)
- Was setting env vars for borderless-agent's internal storage paths — no longer needed

### `vite.main.config.ts` (cleaned)
- Removed `@aws-sdk/client-s3` alias (was only needed for borderless-agent's unused AWS dep)
- Removed borderless-agent comments

### `package.json`
- Removed `borderless-agent` dependency

## Verification

1. `npm run typecheck` — passes
2. `npm run dev` — builds without borderless-agent
3. Streaming chat: Agent sidebar → send message → tokens stream
4. One-shot: AI bubble → Rewrite → returns result
5. Provider switching: Anthropic/OpenAI/Ollama all work
6. MCP tools: enabled → Agent can call tools
7. Abort: Stop button cancels mid-stream
8. Connection test: Settings → Test Connection → works
