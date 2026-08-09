# 迁移到 pi agent toolkit —— 阶段 2（agent 循环）

承接 `2026-08-09-pi-agent-migration-phase0-1.md`。阶段 1 换掉了 provider 层，
本次换掉循环本身，并清理随之暴露出来的死代码。

## 背景 / 问题（Context）

阶段 1 之后，`electron/agent/` 还剩约 8,000 行自研 agent 框架，其中循环、
工具执行、并行调度这些能力 `@earendil-works/pi-agent-core` 全都有，且做得更完整
（steering 队列、真正的 abort、per-tool 执行模式）。

## 根因分析 / 设计决策（Analysis / Design）

### 1. 决定性发现：这个模块只有一个消费者，而它把开关全关了

动手前核实调用面，结果推翻了原计划：

```
electron/agent/  ←── 只被 electron/workers/agentWorker.ts 引用（全仓库唯一）
```

而 `agentWorker.buildAgent()` 的配置是：

```ts
new AgentBuilder()
  .setProvider(...).setSystemPrompt(...)
  .setIncludeBuiltinTools(false)   // ← builtin 工具全部关闭
  .enableContext(true)
  .enableMemory(false)             // ← 记忆关闭
  .setMaxToolRounds(8)
  .addTools(createProxiedTools(toolDefs))
```

`addSkill` / `setStorage` / `setSandbox` / `addMCPServer` / `setApprovalCallback` /
`setEmbeddingProvider` **全仓库从未被调用**。

原因在 `2026-05-31-agent-architecture.md` 里：`electron/agent/` 是
**vendored 进来的 `borderless_agent` 库全量拷贝**，PrismMD 只用其中一小片。
会话、记忆、MCP 在主进程另有一套实现（`sessionService` / `memoryService` /
`mcpService`），MCP 工具是在主进程发现后**当作普通工具代理**进 worker 的 ——
所以 `agent/mcpClient.ts` 这条入口从来没通过电。

结论：原计划里「把 `toolsCore.ts` 的 13 个工具移植成 `AgentTool`」这一项
（预估工作量的一半）是在给死代码搬家。经与用户确认，改为**一并删除**。

### 2. 活路径映射到 pi 的钩子

真正在跑的只有：guardrails、ContextBuilder、历史裁剪、工具循环、
telemetry/metrics、`ask_user` 工具、AutonomousLoop（Horse Mode）。逐个落位：

| 原实现 | pi 里的位置 |
|---|---|
| `_guards.runInput()` | `agent.prompt()` 之前调用（不变） |
| `_buildSystemForTurn()` → ContextBuilder | `initialState.systemPrompt`（每轮新建 Agent，无需 `transformContext`） |
| `selectHistory()` 按预算裁剪 | 构造 `initialState.messages` 之前（不变） |
| `_executeToolBatch()` + `ToolExecutor` | pi 内置的并行工具循环 |
| guardrails 过观察 + `foldObservation()` | 注入 `toAgentTool()` 的 `transformObservation` 钩子 |
| `toolRounds >= maxToolRounds` | `shouldStopAfterTurn` |
| `_llmCallWithRetry` 手写退避 | pi-ai 内部 |
| 手写 SSE 增量拆分 | 订阅 `message_update` / `text_delta` |
| `aborted` 标志轮询 | `agent.abort()`（真正掐断请求） |

### 3. `chat()` 和 `stream()` 合并成一条实现

迁移前两者各有一份近乎重复的 ~90 行循环（`_runLoopInner` 与 `_runLoopStream`），
已经漂移出差异（流式那份多了一段 delta 拆分逻辑，且带 bug —— 见阶段 1 文档的
后续项 1）。现在 `chat()` 就是「跑 `_run()` 并丢掉中间块」，只有一份循环。

### 4. 事件转 generator 用「推入即唤醒」，不轮询

pi 的订阅者是被 `await` 的，所以增量事件可以直接驱动 generator：订阅回调把
增量推进队列并唤醒等待中的 `yield`，没有 `setTimeout` 轮询，也就没有额外延迟。

### 5. 两处判断失误，已修正

- **`sessionCore.ts` + `storage/` 不是死代码。** 它们不经 AgentBuilder，
  而是被 `electron/services/sessionService.ts` 直接引用（会话持久化、
  设置里的 AgentSessionsPanel、会话恢复都靠它）。误删后由 typecheck 抓到，已恢复。
- **`memoryCore.ts` 里有两个活函数。** `sanitizeForStorage`（会话落盘前脱敏，
  `sessionCore` 每次写盘都过）和 `loadProjectKnowledge`（读 `WORKDIR/CLAUDE.md`，
  `includeProjectKnowledge` 默认开）。分别抽成 `sanitize.ts` 和并入
  `contextBuilder.ts`，而不是为这两个函数留下 441 行。

### 6. 阶段 1 的适配器完成使命后删除

`llmProtocol.ts` + `pi/piLLMProvider.ts` 是阶段 1 刻意保留的接缝，作用是让
`agentInstance` 在换 provider 时一行不用改。阶段 2 之后 `agentInstance` 直接
用 pi 的 `Agent`，适配器成为孤儿，随本次删除。它的 12 个测试里唯一不被
新集成测试覆盖的是「ollama 端点补 `/v1`」，已移入 `agentInstance.test.ts`。

## 改动清单（Changes）

净变化 **+730 / −5,214**，agent 模块从 9,061 行降到 4,367 行（含 371 行测试）。

### 删除（3,653 行生产代码）

| 文件 | 行数 | 为什么是死的 |
|---|---|---|
| `toolsCore.ts` | 958 | 13 个 builtin 工具，`includeBuiltinTools` 永远 false |
| `sandbox.ts` | 759 | 只服务 builtin 的 bash/exec |
| `memoryCore.ts` | 441 | `enableMemory(false)`；两个活函数已抽出 |
| `toolExecutor.ts` | 356 | 由 pi 内置工具循环取代 |
| `pi/piLLMProvider.ts` | 293 | 阶段 1 的接缝，已完成使命 |
| `mcpClient.ts` | 240 | `addMCPServer` 从未调用；MCP 走主进程代理 |
| `skillsCore/Registry/Lifecycle` | 426 | `addSkill` 从未调用，registry 恒空 |
| `harness.ts` | 129 | 组合根，成员已全部删除 |
| `providers/embeddings.ts` | 89 | 只被 memoryCore 引用 |
| `llmProtocol.ts` | 58 | 同 piLLMProvider |

### 重写

- `agentInstance.ts` — **1,075 → 417 行**，跑在 pi 的 `Agent` 上。
  公共 API（`chat` / `stream` / `runTask` / `close` / `tools` / `telemetry` /
  `getMetrics`）保持不变，新增 `abort()`。
- `agentBuilder.ts` — 266 → 145 行，删掉 8 个无人调用的 setter。
- `types.ts` / `index.ts` — 去掉指向已删模块的类型和导出。

### 新增

- `pi/tools.ts`（68）— `ToolDefinition` → `AgentTool`。刻意**不**把工具错误
  改成抛异常：保持「错误也是一段观察文本」的既有行为，否则工具失败会中断
  整个循环，而现在是让模型看到错误自己决定下一步。
- `sanitize.ts`（35）— 从 memoryCore 抽出的落盘脱敏。
- `agentInstance.test.ts`（271）— 11 例集成测试。

### 修改

- `workers/agentWorker.ts` — 去掉两个已删的 builder 调用；`abort` 从「置位标志
  让消费方 break」升级成同时调 `agent.abort()`，真正掐断在飞的请求。
- `contextBuilder.ts` — 并入 `loadProjectKnowledge`，删掉 RAG 分支。

### 未改动

worker 的消息协议（`stream|chat|run-task|test|abort|tool-result` ↔
`chunk|progress|result|error|tool-call-request`）一个字节没动，所以整个 `src/`
渲染层、`agentHandlers.ts`、`aiService.ts`、`agentWorkerManager.ts` 零改动。

## 验证方式（Verification）

| 项目 | 结果 |
|---|---|
| `npm run typecheck` | 0 错误 |
| `npm test` | 73 passed |
| `npm run package` + 启动 | `--type=renderer` helper 存在 → 正常开窗 |

新增的 11 例集成测试走完整链路（`AgentBuilder` → `AgentInstance` → pi `Agent`
→ HTTP → 工具循环），端点是本地 `127.0.0.1:0` 起的假 OpenAI 兼容服务，
按脚本逐个返回预设响应。覆盖：

- 基本对话、usage 归一、system prompt 入体、历史顺序
- 流式增量分块 + 末块 `done=true` 带完整 reply
- **工具循环**：执行 → 观察回灌 → 最终回复
- **工具抛异常不中断循环**（错误作为观察回给模型）
- **`maxToolRounds` 到顶后停止**（脚本一直回工具调用，靠上限刹车）
- `ask_user` 无回调时的降级观察
- custom / ollama 两种端点形态（路径、鉴权头、模型名）
- LLM 不可达时返回面向用户的错误文案而非抛出

### 尚未验证

同阶段 1：没有对真实的 OpenAI / Anthropic / Google 端点发过请求。
Horse Mode（`runTask` → `AutonomousLoop`）只做了类型层验证，没有端到端跑过一轮
——它内部只调 `agent.chat()`，风险低，但合并前值得手工触发一次。

## 后续项（Follow-ups）

1. **`contextCore.ts` 里有 8 个导出已无人引用**：`TokenBudget`、
   `prioritizeMessages`、`LifecycleManager`、`assembleSystem`、`summarizeRounds`、
   `getCachedReply` / `setCachedReply`、`computeUsageStats`、`getContextWindowSize`。
   本次没动它 —— 571 行里的预算算法互相咬合，单独一轮清理更安全。
2. **steering 队列没接 UI。** pi 支持在工具执行途中插话（`agent.steer()`），
   这是现在没有的能力，对 Horse Mode 尤其有用。
3. **阶段 1 遗留的 delta 拆分 bug 已随本次重写消失** ——
   `_runLoopStream` 整个被删，新实现直接转发 pi 的 `text_delta`，不再自己拆分。
   已开的那张修复单子可以关掉。
4. `note_embeddings` 仍是孤儿表（`workspaceDb.ts:112`），与本次无关。
