# Horse Mode: Migration to Agent Autonomous Loop

## Background / Context

Horse Mode previously used a manual iteration loop — calling `sendAgentOneShot()` N times with a hardcoded refinement prompt. There was no quality evaluation, no adaptive improvement, and no plan/review phases. Each iteration simply rewrote the previous draft.

The `electron/agent/autonomousLoop.ts` provides a much richer loop: PLAN → EXECUTE → REVIEW → EVALUATE, with self-scoring (1-10), improvement tracking, and early exit when quality threshold is met. Horse Mode was refactored to use this agent capability.

## Design Decisions

1. **New `runTask()` function in aiService.ts** — Builds an `AgentInstance`, calls `agent.runTask()`, and streams progress events to the renderer via IPC `agent:task-progress`.

2. **Single file write** — Instead of writing intermediate drafts after each iteration, the autonomous loop produces a final consolidated result. Only one file write at the end.

3. **Quality-based stopping** — Default threshold of 7/10. The loop stops early if quality is sufficient, saving API calls. `maxIterations` acts as an upper bound.

4. **Progress events** — Each phase (plan, execute, review, evaluate) emits a progress event to the renderer. The horse mode store updates `currentPhase` and `qualityScore` for UI display.

5. **Preserved UI contract** — `HorseModeDialog.tsx` was not modified. The `start()` method signature is unchanged. The iterations slider now maps to `maxIterations` in the autonomous loop.

## Changes

### `electron/services/aiService.ts`
- Added `runTask(mainWindow, request)` — Builds agent, calls `agent.runTask()`, emits `agent:task-progress` IPC events, returns `{ provider, model, result, iterations, qualityScore, thresholdMet }`

### `electron/ipc/agentHandlers.ts`
- Added `agent:run-task` IPC handler routing to `runTask()`
- Imported `runTask` from aiService

### `electron/preload.ts`
- Added `sendAgentTask(request)` — invokes `agent:run-task`
- Added `onAgentTaskProgress(callback)` — listens to `agent:task-progress` events

### `src/types/electron.d.ts`
- Added type declarations for `sendAgentTask` and `onAgentTaskProgress`

### `src/store/horseModeStore.ts`
- **Removed**: Manual iteration loop (sendAgentOneShot N times + file read/write per iteration)
- **Removed**: `REFINE_SYSTEM_PROMPT` constant
- **Added**: `currentPhase` and `qualityScore` state fields
- **Added**: Subscribes to `onAgentTaskProgress` for live phase/score updates
- **Changed**: Calls `sendAgentTask()` once with `{ task, systemPrompt, qualityThreshold: 7, maxIterations }`
- **Changed**: Single file write after autonomous loop completes
- **Changed**: Logs include quality score and threshold status

## How It Works Now

```
User clicks "Generate" in HorseModeDialog
    ↓
horseModeStore.start(task, dir, file, iterations, docContext)
    ├── Build task prompt (with optional doc context)
    ├── Subscribe to agent:task-progress events
    └── Call sendAgentTask({ task, systemPrompt, maxIterations, qualityThreshold: 7 })
         ↓ IPC
    aiService.runTask()
    ├── buildAgent(provider, systemPrompt)
    └── agent.runTask({ task, maxIterations, qualityThreshold, onProgress })
         ↓
    AutonomousLoop.run()
    ├── Iteration 1:
    │   ├── PLAN: Break task into subtasks
    │   ├── EXECUTE: Produce output
    │   ├── REVIEW: Critique output
    │   └── EVALUATE: Score 1-10
    │       → if score >= 7: return result
    │       → else: feed review into next iteration
    ├── Iteration 2..N: Improve based on review feedback
    └── Return: { result, iterations, qualityScore, thresholdMet }
         ↓ IPC
    horseModeStore receives result
    ├── Write to file (single write)
    ├── Open in PrismMD
    └── Log: "Done! (N iterations, score: X)"
```

## Verification

- TypeScript: no compilation errors in modified files
- Horse Mode dialog unchanged — same user experience for launching
- Agent log panel shows phase progression (plan → execute → review → evaluate)
- Quality score visible in logs
- Early exit when quality threshold met (saves API calls)
