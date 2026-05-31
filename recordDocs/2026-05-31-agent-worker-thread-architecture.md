# PrismMD Agent — Worker Thread Architecture

## Overview

PrismMD's AI agent runs in a dedicated `worker_threads` Worker, keeping the Electron main process responsive. All LLM API calls, context assembly, token estimation, and autonomous loop iterations execute off the main thread. The main thread handles only validation, IPC routing, trace events, and MCP tool execution (which requires subprocess access).

## Thread Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        RENDERER PROCESS                              │
│  AgentSidebar ─── agentStore ─── sessionStore ─── horseModeStore    │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ IPC (preload bridge)
┌───────────────────────────▼─────────────────────────────────────────┐
│                     MAIN THREAD (electron)                           │
│                                                                     │
│  agentHandlers.ts ──> aiService.ts ──> agentWorkerManager.ts        │
│       │                    │                    │                    │
│       │              (validation,          (spawn worker,            │
│       │               trace events,        route messages,           │
│       │               MCP discovery)       proxy tool calls)         │
│       │                                         │                   │
│  insightGraphHandlers.ts ──> insightGraphService.ts                  │
│       │                           │                                  │
│       │                    (Neo4j queries,                           │
│       │                     progress events)                         │
│       │                           │                                  │
│  mcpService.ts ◄──────────────────┘  (tool execution stays here)    │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ worker_threads messages
┌───────────────────────────▼─────────────────────────────────────────┐
│                     AGENT WORKER THREAD                              │
│                                                                     │
│  agentWorker.ts                                                     │
│       │                                                             │
│  AgentBuilder ──> AgentInstance                                      │
│       │               │                                             │
│       │          .stream() / .chat() / .runTask()                   │
│       │               │                                             │
│  providers/       contextCore.ts      autonomousLoop.ts             │
│  ├─ openai.ts     (token budget,     (plan → execute →             │
│  ├─ anthropic.ts   history trim)      review → evaluate)           │
│  └─ google.ts                                                       │
│                                                                     │
│  toolExecutor.ts ──> proxied tool calls (via parentPort)            │
└─────────────────────────────────────────────────────────────────────┘
```

## Message Protocol

### Main → Worker

| Message | Purpose | Payload |
|---------|---------|---------|
| `{ type: 'stream' }` | Start streaming chat | `provider, systemPrompt, message, history` |
| `{ type: 'chat' }` | Non-streaming call | `provider, systemPrompt, message, history?, toolDefs?, maxToolRounds?` |
| `{ type: 'run-task' }` | Autonomous loop | `provider, systemPrompt, task, qualityThreshold?, maxIterations?` |
| `{ type: 'test' }` | Connectivity test | `provider` |
| `{ type: 'abort' }` | Cancel current operation | (none) |
| `{ type: 'tool-result' }` | Return MCP tool result | `id, result` |

### Worker → Main

| Message | Purpose | Payload |
|---------|---------|---------|
| `{ type: 'chunk' }` | Streaming text delta | `delta` |
| `{ type: 'progress' }` | Autonomous loop phase | `iteration, phase, qualityScore?` |
| `{ type: 'result' }` | Operation complete | varies by operation |
| `{ type: 'error' }` | Operation failed | `message` |
| `{ type: 'tool-call-request' }` | Proxy MCP tool call | `id, name, args` |

## Data Flow: Streaming Chat

```
User types message
    ↓
agentStore.sendMessage()
    ├── Gather context (memory, graph, KB)
    └── electronAPI.sendAgentMessage(request)
         ↓ IPC invoke
aiService.sendMessage(mainWindow, request)
    ├── Validate provider + privacy mode
    ├── Build system prompt (structured sections)
    ├── Discover MCP tools (for system prompt hint only)
    ├── Emit trace events
    └── agentWorker.stream(config, onChunk)
         ↓ postMessage to worker
agentWorker.ts: handleStream()
    ├── Build AgentInstance via AgentBuilder
    ├── agent.stream(message, history)
    │   ├── contextCore: selectHistory (token budgeting)
    │   ├── LLM provider API call (network I/O)
    │   └── Yield StreamChunk per token
    └── For each chunk:
         parentPort.postMessage({ type: 'chunk', delta })
              ↓ received in main thread
agentWorkerManager: onChunk callback
    └── mainWindow.webContents.send('agent:stream-chunk', delta)
         ↓ IPC event
Renderer: agentStore.appendStreamContent(delta)
    └── UI re-renders with new text
```

## Data Flow: One-Shot with MCP Tools

```
horseModeStore or editor AI action
    └── electronAPI.sendAgentOneShot(request)
         ↓ IPC
aiService.sendOneShot(request)
    ├── Validate, build system prompt
    ├── Discover MCP tools → serialize definitions (no functions)
    └── agentWorker.chat({ toolDefs, ... })
         ↓ postMessage to worker
agentWorker.ts: handleChat()
    ├── Build AgentInstance with proxied tools
    │   └── Each tool's execute() sends tool-call-request, waits for result
    ├── agent.chat(prompt)
    │   ├── LLM responds with tool_call
    │   ├── ToolExecutor calls execute()
    │   │   └── parentPort.postMessage({ type: 'tool-call-request', id, name, args })
    │   │        ↓ received in main thread
    │   │   agentWorkerManager.handleToolCallRequest()
    │   │        ├── callMcpTool(serverId, toolName, args)
    │   │        └── worker.postMessage({ type: 'tool-result', id, result })
    │   │             ↓ received in worker
    │   │        execute() Promise resolves with result
    │   ├── Tool result added to conversation
    │   └── LLM called again → final reply
    └── parentPort.postMessage({ type: 'result', reply })
         ↓
aiService receives reply, parses JSON if needed
    └── Returns to IPC caller
```

## Data Flow: Autonomous Loop (Horse Mode)

```
horseModeStore.start(task, dir, file, iterations)
    └── electronAPI.sendAgentTask(request)
         ↓ IPC
aiService.runTask(mainWindow, request)
    └── agentWorker.runTask(config, onProgress)
         ↓ postMessage to worker
agentWorker.ts: handleRunTask()
    ├── Build AgentInstance
    └── agent.runTask({ task, qualityThreshold, maxIterations, onProgress })
         ↓
autonomousLoop.ts: AutonomousLoop.run()
    ├── Iteration 1:
    │   ├── PLAN: agent.chat(planPrompt) → numbered subtasks
    │   │   └── parentPort.postMessage({ type: 'progress', phase: 'plan' })
    │   ├── EXECUTE: agent.chat(executePrompt) → produce output
    │   │   └── parentPort.postMessage({ type: 'progress', phase: 'execute' })
    │   ├── REVIEW: agent.chat(reviewPrompt) → critique output
    │   │   └── parentPort.postMessage({ type: 'progress', phase: 'review' })
    │   └── EVALUATE: agent.chat(evaluatePrompt) → score 1-10
    │       └── parentPort.postMessage({ type: 'progress', phase: 'evaluate', qualityScore })
    │       → if score >= threshold: exit loop ✓
    │       → else: feed review into next iteration
    ├── Iteration 2..N: improve based on previous review
    └── Return final result
         ↓
    parentPort.postMessage({ type: 'result', result, iterations, qualityScore, thresholdMet })
         ↓ received in main
aiService: emit trace, forward to IPC
    ↓
horseModeStore:
    ├── Consolidation call (sendAgentOneShot → extract clean document)
    ├── Write to file
    ├── Save session
    └── Open in PrismMD
```

## Abort Handling

```
User clicks Stop button
    ↓
agentStore.stopGeneration()
    └── electronAPI.stopAgentGeneration()
         ↓ IPC
aiService.stopGeneration()
    └── agentWorker.abort()
         └── worker.postMessage({ type: 'abort' })
              ↓ received in worker
agentWorker: aborted = true
    └── Stream loop: checks aborted flag → breaks
         └── Posts { type: 'result', done: true }
```

## Worker Lifecycle

| Event | Behavior |
|-------|----------|
| **First request** | Worker spawned lazily on demand |
| **Subsequent requests** | Same worker reused (single instance) |
| **Worker crash** | Reference cleared; next request spawns fresh worker |
| **Worker exit (non-zero)** | Pending promise rejected; worker reference cleared |
| **App quit** | `agentWorker.shutdown()` terminates worker |
| **Concurrent requests** | Rejected with "worker is busy" (one-at-a-time) |

## MCP Tool Proxy

MCP servers are subprocess pools managed by `mcpService.ts` on the main thread. They can't be moved to the worker (subprocess handles don't serialize). The solution:

1. Main thread discovers tools → serializes **definitions** (name, description, schema) to worker
2. Worker creates `ToolDefinition[]` with proxied `execute` functions
3. When LLM requests a tool call, the execute function:
   - Generates a unique request ID
   - Posts `{ type: 'tool-call-request', id, name, args }` to main thread
   - Awaits a Promise keyed by that ID
4. Main thread receives request, calls `callMcpTool(serverId, toolName, args)`
5. Main thread posts `{ type: 'tool-result', id, result }` back to worker
6. Worker resolves the matching Promise, returns result to agent loop

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Single worker instance | Avoid spawn overhead; agent is stateless per-call |
| One request at a time | Simplifies state; no concurrent tool call confusion |
| Abort via flag, not AbortController | AbortController can't cross thread boundary |
| Tool proxy via messages | MCP subprocesses can't be shared across threads |
| Settings passed per-request | Avoids shared mutable state; always reads fresh config |
| safeClose with 2s timeout | Prevents worker hang if agent cleanup stalls |

## File Reference

| File | Thread | Role |
|------|--------|------|
| `electron/workers/agentWorker.ts` | Worker | Entry point: receives messages, builds agents, runs operations |
| `electron/services/agentWorkerManager.ts` | Main | Spawns/manages worker, routes messages, proxies tool calls |
| `electron/services/aiService.ts` | Main | Validation, trace events, MCP discovery, delegates to worker |
| `electron/services/insightGraphService.ts` | Main | Neo4j queries + delegates AI calls to worker |
| `electron/services/providerUtils.ts` | Both | Shared: `mapProvider()`, `safeClose()` |
| `electron/agent/` | Worker | Full agent module (AgentBuilder, providers, context, tools) |
| `electron/services/mcpService.ts` | Main | MCP server pool (subprocess management) |
| `vite.main.config.ts` | Build | Worker format config |
| `forge.config.ts` | Build | Worker entry point registration |
