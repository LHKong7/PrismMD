# Agent Trace — Developer Debug Panel

## Background / Context

为了在开发时排查 Prompt 与上下文注入问题，需要一个能查看 Agent 完整调用链路的面板：
构建出的 system prompt、发送给模型运营商的消息、返回内容、耗时，以及 MCP 工具的
挂载与逐次调用情况（用户原话：「我想知道当前 Agent 调用的全链路，包括发送到模型运营商
的信息」）。

本功能的大部分骨架在更早的会话中已经落地（store / 面板 UI / IPC 通道 / aiService 的
request·system-prompt·messages·response·error 埋点），但存在三处缺口导致它实际不可用 /
不完整：

1. **面板从未被渲染** —— `AgentTracePanel` 组件存在，但 `SettingsPanel` 的
   `AgentCombinedSettings` 只渲染了 AI / Prompts / PromptLibrary / Sessions 四个区块，
   注释里写了 "Developer" 却没有对应的 JSX，面板在 UI 上无入口。
2. **`tools` 埋点只有 UI 没有发射** —— `TraceType` 的 `'tools'` 有颜色、标签、筛选项，
   但 `aiService` 发现了 MCP `toolDefs` 后从未 `traceEvent('tools', …)`。
3. **`tool-call` 埋点只有 UI 没有发射** —— `'tool-call'` 同理；逐次工具调用发生在
   worker 线程内，主进程层从未上报。

## Analysis / Design decisions

- **面板挂载**：复用既有的 `CollapsibleSection`，在 `AgentCombinedSettings` 末尾追加一个
  「Developer」折叠区，默认收起。无需新增顶层 Tab，符合「开发用、平时收起」的定位。

- **`tool-call` 上报点的选择**：worker（`agentWorker.chat`）只把最终 `reply` 回传主进程，
  worker 内部并不直接知道渲染端的 trace window。但 MCP 工具的**实际执行**是 worker 通过
  `tool-call-request` 消息委托回主进程的 `AgentWorkerManager.handleToolCallRequest` 完成的
  —— 这里同时拥有工具名、入参、结果与耗时，是上报 `tool-call` 的天然位置，无需改动 worker
  协议。

- **避免循环依赖（关键设计点）**：`traceEvent` 原本是 `aiService.ts` 的模块私有函数，而
  `aiService` 又 `import { agentWorker } from './agentWorkerManager'`。若让 worker manager
  反向 import `aiService` 的 `traceEvent`，会形成
  `aiService → agentWorkerManager → aiService` 的环。
  因此把 trace 原语抽到**独立无依赖模块** `electron/services/agentTrace.ts`，由 aiService 与
  agentWorkerManager 各自 import。`aiService` 通过 `export { setTraceWindow } from './agentTrace'`
  再导出，使 `agentHandlers.ts` 的既有 import 路径保持不变，零改动。

- **截断策略**：`tool-call` 的 `result` 超过 2000 字符时截断并追加省略号，避免超长工具输出
  撑爆 trace store / IPC。

## Changes

- **`electron/services/agentTrace.ts`（新增）** —— 抽出 `TraceType`、`setTraceWindow`、
  `traceEvent`（含 `app.isPackaged` 开发期守卫 + `traceWindow.isDestroyed()` 守卫）。

- **`electron/services/aiService.ts`（重构 + 补埋点）**
  - 删除本地 trace 定义，改为 `import { traceEvent } from './agentTrace'`，并
    `export { setTraceWindow } from './agentTrace'`；移除不再使用的 `app` import。
  - `sendMessage`：在 system-prompt 之后，当 `toolDefs.length > 0` 时发射 `tools` 事件
    （工具名 + 数量）。
  - `sendOneShot`：补发 `system-prompt` 事件（此前 one-shot 路径构建了 system prompt 却从未
    上报）；同样在有工具时发射 `tools` 事件。

- **`electron/services/agentWorkerManager.ts`** —— `import { traceEvent }`；在
  `handleToolCallRequest` 中记录 `startMs`，工具执行结束后发射
  `traceEvent('tool-call', '<server> → <tool>', { tool, server, args, result(截断) }, 耗时)`
  （见 `agentWorkerManager.ts` `handleToolCallRequest`）。

- **`src/components/settings/SettingsPanel.tsx`** —— `import { AgentTracePanel } from '../dev/AgentTracePanel'`；
  在 `AgentCombinedSettings` 末尾新增 `CollapsibleSection title={t('settings.developer.title')}`
  包裹 `<AgentTracePanel />`。

> 既有且本次确认无需改动的部分：`src/store/agentTraceStore.ts`（含 `subscribeToTraceIPC`，
> 已在 `App.tsx` 的 `useEffect` 中订阅）、`src/components/dev/AgentTracePanel.tsx`、
> `electron/preload.ts` 与 `src/types/electron.d.ts` 的 `onAgentTrace`、`agentHandlers.ts` 的
> `setTraceWindow` 接线、`en.json`/`zh.json` 的 `settings.developer.*` 文案、
> `--color-success` CSS 变量。

## Verification

- `tsc -b --force` 全量类型检查：本次改动涉及的文件
  （`agentTrace.ts` / `aiService.ts` / `agentWorkerManager.ts` / `SettingsPanel.tsx` 我的新增行）
  **零新增类型错误**。仓库存在的既有错误（`electron.d.ts` 的 InsightGraph 方法缺失漂移、
  `neo4j` 命名空间、`AppSettings` 强转等）均与本功能无关、且预先存在。
  > 注：项目的 `npm run typecheck` = `tsc --noEmit`，作用于 references-only 的根 tsconfig，
  > 实际上是空操作；要真正类型检查须用 `tsc -b`。Vite 转译不做类型检查，故应用照常运行。
- 端到端数据流人工核验：`agent:trace` 通道名在 aiService（发射）、preload（桥接）、
  electron.d.ts（类型）、agentTraceStore（订阅）四处一致；`TraceType` 七个取值四处一致。
- 手动验收路径：发送一次 Agent 对话 → Settings → Agent → Developer，可见
  request / system-prompt / (tools) / messages / response / 耗时；含 MCP 工具的 one-shot 调用
  额外出现 `tool-call` 条目；展开任意条目可见完整 JSON，支持复制与清空。

## Follow-ups（本次未处理）

- **`electron.d.ts` 与 `preload.ts` 漂移**：`ElectronAPI` 接口缺失大量 `insightGraph*` 方法、
  `onInsightGraphProgress`，且 `sendAgentMessage` 类型缺 `graphContext` 字段——这是 `tsc -b`
  报错的主要来源，属 InsightGraph 子系统的既有问题，与本功能无关，留待单独修复。
- **流式聊天的 `tools` 语义**：`sendMessage` 的流式路径在 system prompt 中声明了「你有 N 个 MCP
  工具」，但 `agentWorker.stream` 当前并未把 `toolDefs` 接给模型，故流式下工具实际不可调用。
  本次 `tools` 埋点如实反映 system prompt 内容；是否为流式补全工具调用属产品决策，另议。
