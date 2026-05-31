# PrismMD Agent System — Architecture Documentation

## Architecture Overview

PrismMD's agent system is built in four distinct layers:

```
┌─────────────────────────────────────────────────────┐
│          REACT RENDERER (src/store, src/components) │
│          - agentStore.ts (Zustand state)            │
│          - sessionStore.ts (Session persistence)    │
│          - AgentSidebar, ChatMessage (UI)           │
│          - Settings & Trace visualization           │
└──────────────────┬──────────────────────────────────┘
                   │ IPC (preload.ts bridge)
┌──────────────────▼──────────────────────────────────┐
│        ELECTRON MAIN (electron/services)            │
│        - aiService.ts (Agent orchestration)         │
│        - sessionService.ts (File persistence)       │
│        - memoryService.ts (Conversation memory)     │
│        - mcpService.ts (Tool server pool)           │
│        - agentHandlers.ts (IPC registration)        │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│   borderless_agent LIBRARY (borderless_agent/src)   │
│   - AgentBuilder / AgentInstance (API)              │
│   - SessionManager (Persistence)                    │
│   - ContextCore (Token budgeting)                   │
│   - Providers (OpenAI, Anthropic, Google)           │
│   - ToolExecutor (Tool invocation & retry)          │
└─────────────────────────────────────────────────────┘
```

---

## Layer 1: borderless_agent Library

Located: `borderless_agent/src/`

### AgentBuilder (Fluent API)

**File:** `agentBuilder.ts`

```typescript
new AgentBuilder()
  .setProvider('anthropic', { apiKey, model })  // OpenAI, Anthropic, Google
  .setSystemPrompt(prompt)
  .addTools([...])                              // Custom tools (e.g. MCP)
  .setIncludeBuiltinTools(false)                // Exclude bash, read_file, etc.
  .enableContext(true)                          // Token budgeting & history trimming
  .enableMemory(false)                          // Long-term memory (PrismMD uses own)
  .setMaxToolRounds(8)                          // Safety limit for tool loops
  .build()                                      // → AgentInstance
```

PrismMD configures: `includeBuiltinTools=false` (reader app, not code assistant), `enableContext=true` (intelligent history trimming), `enableMemory=false` (own memoryService).

### AgentInstance (Runtime)

**File:** `agentInstance.ts`

```typescript
// Streaming chat — yields text deltas
async *stream(userInput: string, history?: Record<string, any>[]): AsyncGenerator<StreamChunk>

// Non-streaming — returns full reply
async chat(userInput: string, history?: Record<string, any>[]): Promise<ChatResult>

// Cleanup MCP connections, etc.
async close(): Promise<void>
```

**StreamChunk:** `{ delta?: string, reply?: string, done: boolean, usage?: TokenUsage }`
**ChatResult:** `{ reply: string, history: Record<string, any>[], hadToolCalls: boolean, usage?: TokenUsage }`

### Context Management (Token Budgeting)

**File:** `contextCore.ts`

The agent intelligently manages the context window:

```
Total Tokens = model's context window (e.g. 200K for Claude, 128K for GPT-4o)
Output Reserve = 10% of total
Available Input = Total - Output Reserve

Budget Allocation:
  System prompt:  reserved (1,000 tokens)
  RAG / evidence: 40% of available
  Chat history:   50% of available
```

**Key functions:**
- `selectHistory(messages, maxTokens)` — picks the most relevant messages within budget, prioritizing recent messages
- `estimateTokens(text)` — quick `text.length / 3` estimation
- `foldObservation(toolResult, maxChars)` — truncates long tool outputs to ~3500 chars (head + tail summary)

### Tool System

**File:** `types.ts`, `toolExecutor.ts`

```typescript
interface ToolDefinition {
  name: string
  description: string
  parameters?: Record<string, { type: string; description?: string }>
  required?: string[]
  execute: (args: Record<string, any>) => Promise<string> | string
  requiresApproval?: boolean
  timeout?: number              // Default 60s
  concurrencySafe?: boolean     // Default true — can run in parallel
}
```

The `ToolExecutor` handles: argument validation, parallel execution (respecting `concurrencySafe`), timeout enforcement, and error folding back to the LLM.

### Session Manager

**File:** `sessionCore.ts`

```typescript
class SessionManager {
  async createSession(): Promise<Session>
  async restoreSession(id: string): Promise<Session | null>
  async saveSession(session: Session): Promise<void>
  async listSessionsSummary(limit?: number): Promise<SessionSummary[]>
  async archiveSession(id: string): Promise<boolean>
}
```

Sessions are stored as individual JSON files. Atomic writes via temp file + rename. Per-session mutex prevents concurrent write corruption.

### Providers

**File:** `providers/openai.ts`, `providers/anthropic.ts`, `providers/google.ts`

All implement `LLMProvider { chat(), stream() }`. The OpenAI provider also handles Ollama and custom endpoints via `baseUrl`. Built-in retry with exponential backoff for transient errors (429, 500, 502, 503).

---

## Layer 2: Electron Main Process

Located: `electron/services/`, `electron/ipc/`

### AI Service (Main Orchestrator)

**File:** `electron/services/aiService.ts`

Four exported functions matching the IPC contract:

#### `sendMessage(mainWindow, request)` — Streaming Chat

1. Load active provider from settings
2. Discover MCP tools via `mcpService.discoverAll()`
3. Build system prompt with structured sections:
   - Base instruction ("You are an intelligent reading assistant...")
   - `## Previous Knowledge` (memoryContext)
   - `## Current Document` (documentContext)
   - `## Knowledge Graph Insights` (graphContext + citation instructions)
   - MCP tool availability hint
4. Create agent via `buildAgent(active, systemPrompt)` — no tools for streaming
5. Iterate `agent.stream(lastMessage, history)`, forwarding deltas via IPC:
   ```typescript
   for await (const chunk of stream) {
     if (signal.aborted) break
     if (chunk.delta) mainWindow.webContents.send('agent:stream-chunk', chunk.delta)
   }
   ```
6. Trace events emitted for dev debugging

#### `sendOneShot(request)` — Non-Streaming with Tools

Used by Horse Mode, doc summaries, quiz generation, editor AI actions.

- MCP tools **are** attached to the agent (unlike streaming)
- Agent's internal loop handles multi-round tool calls (up to 8 rounds)
- Supports JSON schema enforcement for structured responses
- Returns `{ provider, model, reply, json? }`

#### `testConnection(provider, apiKey, baseUrl?, model?)` — Connectivity Test

Sends "hi" via `agent.chat()`, returns `true` if reply received.

#### `stopGeneration()` — Abort In-Flight Stream

Sets `AbortController.abort()`. The `for await` loop in `sendMessage` checks `signal.aborted` and breaks.

### Provider Mapping

```typescript
function mapProvider(active): { providerName, config }
```

| PrismMD Provider | borderless_agent Provider | Notes |
|-----------------|--------------------------|-------|
| `anthropic` | `'anthropic'` | Direct mapping |
| `google` | `'google'` | Direct mapping |
| `openai` | `'openai'` | Direct mapping |
| `ollama` | `'openai'` | `baseUrl: 'http://localhost:11434/v1'`, `apiKey: 'ollama'` |
| `custom` | `'openai'` | User's custom `baseUrl` |

### MCP Tool Conversion

```typescript
function mcpToolsToToolDefs(mcpTools: McpTool[]): ToolDefinition[]
```

Converts MCP's JSON Schema format (`inputSchema.properties`) to borderless_agent's `ToolDefinition.parameters` format. Wraps the MCP `execute` handler to always return `string`.

### MCP Service (Tool Server Pool)

**File:** `electron/services/mcpService.ts`

Manages MCP server subprocesses as a connection pool.

- Each server is a separate process (e.g., `python -m mcp.server.fetch`)
- Communication via `StdioClientTransport` (JSON-RPC over stdin/stdout)
- Tool names namespaced as `{serverId}__{toolName}` to avoid collisions
- Auto-restart on subprocess crash (retry once with fresh spawn)
- Configurable timeout per tool call (default 30s)

### Session Service

**File:** `electron/services/sessionService.ts`

Wraps `SessionManager` with storage in `{userData}/sessions/`.

```typescript
createSession(): Promise<string>
restoreSession(id): Promise<{ id, messages } | null>
listSessions(limit?): Promise<SessionSummary[]>
deleteSession(id): Promise<boolean>
saveSessionHistory(id, messages): Promise<void>
getSessionHistory(id): Promise<Message[] | null>
```

Only `user` and `assistant` messages are persisted (tool/system messages filtered out).

### Memory Service

**File:** `electron/services/memoryService.ts`

Stores conversation summaries (not full history) in `{userData}/memory/memory.json`.

- After each conversation, `extractSummaryFromConversation()` creates a brief summary (first user Q + last assistant A) and extracts topic keywords
- `getMemoryContext()` retrieves relevant summaries by file path or keyword matching
- Max 100 entries (FIFO overflow)

### IPC Handlers

**File:** `electron/ipc/agentHandlers.ts`

| Channel | Type | Service |
|---------|------|---------|
| `agent:send-message` | handle | `aiService.sendMessage()` |
| `agent:one-shot` | handle | `aiService.sendOneShot()` |
| `agent:test-connection` | handle | `aiService.testConnection()` |
| `agent:stop` | on | `aiService.stopGeneration()` |
| `session:create` | handle | `sessionService.createSession()` |
| `session:restore` | handle | `sessionService.restoreSession()` |
| `session:list` | handle | `sessionService.listSessions()` |
| `session:delete` | handle | `sessionService.deleteSession()` |
| `session:save-history` | handle | `sessionService.saveSessionHistory()` |
| `session:get-history` | handle | `sessionService.getSessionHistory()` |
| `memory:save` | handle | `memoryService.saveMemory()` |
| `memory:get-context` | handle | `memoryService.getMemoryContext()` |
| `memory:extract-summary` | handle | `memoryService.extractSummaryFromConversation()` |
| `memory:clear` | handle | `memoryService.clearMemory()` |

**IPC Events (main → renderer):**
- `agent:stream-chunk` — text delta during streaming
- `agent:stream-error` — error with message
- `agent:mcp-warning` — MCP tool discovery warning
- `agent:trace` — debug trace event (dev mode only)

### Trace System

```typescript
function traceEvent(type: TraceType, label: string, data: unknown, durationMs?: number)
```

Emits structured debug events via IPC in dev mode (`!app.isPackaged`). Types: `request`, `system-prompt`, `messages`, `tools`, `response`, `tool-call`, `error`.

---

## Layer 3: Preload Bridge

**File:** `electron/preload.ts`

Exposes main-process APIs to renderer via `contextBridge.exposeInMainWorld('electronAPI', ...)`.

**Agent methods:** `sendAgentMessage`, `sendAgentOneShot`, `stopAgentGeneration`, `testAgentConnection`
**Stream events:** `onAgentStream`, `onAgentStreamError`, `onAgentMcpWarning`, `onAgentTrace` (return unsubscribe functions)
**Session methods:** `sessionCreate`, `sessionRestore`, `sessionList`, `sessionDelete`, `sessionSaveHistory`, `sessionGetHistory`
**Memory methods:** `memorySave`, `memoryGetContext`, `memoryExtractSummary`, `memoryClear`

Type declarations in `src/types/electron.d.ts`.

---

## Layer 4: React Renderer

Located: `src/store/`, `src/components/`

### Agent Store (Main Chat State)

**File:** `src/store/agentStore.ts`

```typescript
interface AgentStore {
  messages: ChatMessage[]           // Full conversation transcript
  isStreaming: boolean
  streamingContent: string          // In-flight partial reply
  pendingEvidence: CitationEvidence[] // Evidence staged for current reply
  agentSidebarOpen: boolean
  mcpWarning: string | null

  sendMessage(content, documentContext?, currentFilePath?): Promise<void>
  loadSession(sessionId): Promise<void>
  retryMessage(messageId, documentContext?, currentFilePath?): Promise<void>
  stopGeneration(): void
  saveConversationMemory(filePath): Promise<void>
  // ... UI state methods
}
```

**ChatMessage:**
```typescript
interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  provider?: AIProvider
  model?: string
  timestamp: number
  evidence?: CitationEvidence[]    // Cited evidence from knowledge graph
  status?: 'ok' | 'error'
  errorRetryPrompt?: string        // For retry button
}
```

**`sendMessage()` flow:**
1. Add user message to `messages[]`
2. Gather context (memory, knowledge graph RAG, knowledge base)
3. Build history from last 100 messages
4. Subscribe to `agent:stream-chunk` events
5. Call `electronAPI.sendAgentMessage()` with assembled context
6. On completion: finalize stream, auto-save to session, save to memory

**Session integration:** After each successful exchange, messages are auto-saved to the current session. If no session exists, one is created automatically on first message.

### Session Store

**File:** `src/store/sessionStore.ts`

```typescript
interface SessionStore {
  currentSessionId: string | null
  sessions: SessionSummary[]
  loading: boolean

  createSession(): Promise<string>
  switchSession(sessionId): Promise<Message[] | null>
  deleteSession(sessionId): Promise<void>
  refreshSessions(): Promise<void>
  saveHistory(messages): Promise<void>
}
```

### Trace Store (Dev Debugging)

**File:** `src/store/agentTraceStore.ts`

Captures trace events from main process (max 500 entries). Displayed in `AgentTracePanel` component.

```typescript
interface TraceEntry {
  id: string
  timestamp: number
  type: 'request' | 'system-prompt' | 'messages' | 'tools' | 'response' | 'tool-call' | 'error'
  label: string
  data: unknown
  durationMs?: number
}
```

### Log Store (Structured Activity Log)

**File:** `src/store/agentLogStore.ts`

Multi-source activity logging (max 200 entries).

```typescript
type LogSource = 'horse-mode' | 'agent-chat' | 'graph-ingest' | 'editor-ai' | 'flashcard' | 'knowledge-base' | 'export' | 'system'
type LogLevel = 'info' | 'success' | 'error' | 'warning'
```

### Horse Mode Store (Iterative Document Generation)

**File:** `src/store/horseModeStore.ts`

Autonomous document generation with iterative refinement:

1. **Iteration 1:** Call `sendAgentOneShot()` with task + optional doc context
2. **Iterations 2..N:** Read previous draft → call `sendAgentOneShot()` with refinement prompt → write improved version
3. **Final:** Open file in PrismMD

System prompts loaded from `promptConfigStore` (`horse-mode` or `horse-mode-with-context`). All progress logged to `agentLogStore` with source `'horse-mode'`.

### Prompt Config Store (Customizable Prompts)

**File:** `src/store/promptConfigStore.ts`

Users can override default system prompts per feature:

| Mode | Usage |
|------|-------|
| `agent-chat` | Sidebar assistant |
| `horse-mode` | Autonomous writing from scratch |
| `horse-mode-with-context` | Writing with reference document |
| `editor-rewrite` | Selection AI: rewrite |
| `editor-shorten` | Selection AI: condense |
| `editor-expand` | Selection AI: elaborate |
| `editor-fix-grammar` | Selection AI: grammar fix |
| `editor-custom` | Selection AI: custom instruction |
| `weekly-summary` | Diary weekly review |
| `flashcard` | Study aid generation |
| `graph-extract` | Knowledge graph entity extraction |

Stored in `localStorage`. `getPrompt(mode)` returns user override or default.

---

## Data Flows

### Streaming Chat Flow

```
User types message → AgentSidebar
    ↓
agentStore.sendMessage(prompt, docContext, filePath)
    ├── Gather memoryContext (memoryService)
    ├── Gather graphContext (insightGraphService) + citation evidence
    ├── Gather kbContext (knowledgeBaseService)
    ├── Build history (last 100 messages)
    ├── Subscribe to stream chunks via IPC
    └── electronAPI.sendAgentMessage({ messages, docContext, memoryContext, graphContext })
         ↓ IPC
aiService.sendMessage(mainWindow, request)
    ├── Load provider settings
    ├── Discover MCP tools
    ├── Assemble system prompt (structured sections)
    ├── buildAgent(provider, systemPrompt)
    │   └── AgentBuilder → AgentInstance
    └── agent.stream(lastMessage, history)
         ├── borderless_agent: selectHistory (token budgeting)
         ├── LLM provider API call
         └── Yield chunks
              ↓ IPC: 'agent:stream-chunk'
agentStore.appendStreamContent(chunk) → UI updates
    ↓ Stream complete
agentStore.finalizeStream(provider, model)
    ├── Extract cited evidence indexes from reply
    ├── Attach cited evidence to message
    ├── Auto-save to session (sessionStore.saveHistory)
    └── Save conversation memory (memoryService)
```

### One-Shot Flow (Horse Mode, Doc Summaries)

```
horseModeStore.start(task, dir, file, iterations)
    ↓
electronAPI.sendAgentOneShot({ systemPrompt, prompt })
    ↓ IPC
aiService.sendOneShot(request)
    ├── Discover MCP tools
    ├── buildAgent(provider, systemPrompt, { mcpTools })
    └── agent.chat(prompt)
         ├── LLM call → may invoke tools → loop up to 8 rounds
         └── Return final reply
    ↓ IPC
Horse Mode receives reply
    ├── Write to file
    ├── If more iterations: read draft → refine → write
    └── Open final document in PrismMD
```

### Citation Flow (Knowledge Graph)

```
insightGraphQuery(prompt) → { answer, evidence[] }
    ↓
Normalize evidence: [{ index: 1, text, source }, ...]
    ↓
System prompt includes numbered evidence block:
  [1] Q3 revenue was $2.1B — report_Q3
  [2] Operating margins improved — report_Q3
    ↓
LLM responds with inline citations: "Revenue grew 15% [1]"
    ↓
finalizeStream() extracts cited indexes via regex /\[(\d{1,3})\]/g
    ├── Filter: only keep evidence entries the model actually cited
    └── Attach to ChatMessage.evidence
         ↓
ChatMessage component renders [1] as clickable superscripts
    └── Hover: shows evidence text + source
    └── Click: scrolls to evidence in document
```

### MCP Tool Execution Flow

```
discoverMcpTools() → McpTool[] (from all running MCP servers)
    ↓
mcpToolsToToolDefs(tools) → ToolDefinition[] (for borderless_agent)
    ↓
buildAgent(provider, prompt, { mcpTools }) → AgentInstance with tools
    ↓
agent.chat(prompt)
    ├── LLM decides to call tool: { name: "server__toolName", args: {...} }
    ├── ToolExecutor validates args, runs execute()
    │   └── callMcpTool(serverId, toolName, args)
    │       ├── Ensure server subprocess is running
    │       ├── Send JSON-RPC via StdioClientTransport
    │       ├── Timeout: 30s (configurable)
    │       └── On crash: retry once with fresh spawn
    ├── foldObservation(result) — truncate if > 3500 chars
    ├── Add tool result to conversation
    └── Loop back to LLM (up to maxToolRounds)
```

---

## Error Handling

### Streaming Errors

```
Error during stream
    ↓
aiService sends 'agent:stream-error' via IPC
    ↓
Global listener in agentStore:
    ├── Promote partial streamingContent to a message
    ├── Add error message with status: 'error' and errorRetryPrompt
    └── User clicks Retry → retryMessage() re-sends the original prompt
```

### LLM Retry (borderless_agent)

Exponential backoff for transient errors:
- Status 429 (rate limit): respect `Retry-After` header
- Status 500, 502, 503: retry with 1s → 2s → 4s delay
- Max 3 attempts
- Auth errors (401, 403): fail immediately

### MCP Tool Failure

- On subprocess crash: discard stale pool entry, spawn fresh, retry once
- On timeout: report error to LLM (may self-correct in next round)
- Tool execution errors are folded into the conversation as observation

---

## Privacy Mode

When `privacyMode: true`:
- Blocks all external API calls (OpenAI, Anthropic, Google)
- Only allows Ollama (local model server)
- Enforced in `aiService.sendMessage()` and `sendOneShot()`:
  ```typescript
  if (settings.privacyMode && active.provider !== 'ollama')
    throw new Error('Privacy Mode is enabled. Only local models (Ollama) are allowed.')
  ```

---

## Data Persistence

| Data | Storage Location | Format | Limit |
|------|-----------------|--------|-------|
| Chat sessions | `{userData}/sessions/{uuid}.json` | JSON | Unlimited |
| Memory summaries | `{userData}/memory/memory.json` | JSON | 100 entries |
| Provider settings | `{userData}/prismmd-settings.json` | JSON | — |
| Prompt overrides | `localStorage` | JSON | — |
| Doc summaries | `{userData}/doc-summaries.json` | JSON | — |

---

## File Reference

| File | Purpose |
|------|---------|
| `borderless_agent/src/agentBuilder.ts` | Fluent agent configuration API |
| `borderless_agent/src/agentInstance.ts` | Runtime chat & stream + tool loop |
| `borderless_agent/src/contextCore.ts` | Token budgeting, history selection |
| `borderless_agent/src/sessionCore.ts` | Session persistence manager |
| `borderless_agent/src/providers/*.ts` | LLM provider implementations |
| `electron/services/aiService.ts` | Chat orchestration, system prompt assembly |
| `electron/services/sessionService.ts` | Session file I/O wrapper |
| `electron/services/memoryService.ts` | Conversation summary persistence |
| `electron/services/mcpService.ts` | MCP server pool + tool execution |
| `electron/services/settingsStore.ts` | Persistent app settings |
| `electron/ipc/agentHandlers.ts` | IPC handler registration |
| `electron/preload.ts` | Secure API bridge to renderer |
| `src/store/agentStore.ts` | Chat UI state, message flow, session integration |
| `src/store/sessionStore.ts` | Session lifecycle management |
| `src/store/agentTraceStore.ts` | Debug trace event capture |
| `src/store/agentLogStore.ts` | Multi-source structured logging |
| `src/store/horseModeStore.ts` | Iterative document generation |
| `src/store/promptConfigStore.ts` | Customizable system prompts |
| `src/store/settingsStore.ts` | Provider & MCP settings (renderer) |
| `src/types/electron.d.ts` | ElectronAPI type declarations |
