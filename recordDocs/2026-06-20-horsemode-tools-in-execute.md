# Horse Mode：把工具接进 EXECUTE 阶段(plan 先行,execute 真正调工具)

## 背景 / 问题（Context）

Horse Mode 的自治循环(`electron/agent/autonomousLoop.ts`)是 **plan → execute → review → evaluate**
四阶段、每阶段一次 `agent.chat()` 的「自评迭代」结构(类 Reflexion / Self-Refine),**不是 ReAct**。
更关键的是:run-task 这条路 `handleRunTask` 调 `buildAgent(provider, systemPrompt)` **没传任何工具**,
且 `setIncludeBuiltinTools(false)` —— 所以 EXECUTE 阶段根本没有「act / observe」,纯文本生成;
而 execute/plan 的提示词里却写着「use tools (read_file, bash, WebSearch...)」,属于**对模型撒谎的空指令**。

用户诉求:**把工具接进 EXECUTE 阶段**,并**保留「先生成计划再执行」**的顺序。

## 设计决策（Design）

复用聊天路径已有的工具链(无需新基建):
- 主进程 `sendMessage`/`sendOneShot` 早就用 `discoverMcpToolDefs()` 发现 MCP 工具并透传给 worker;
- worker `buildAgent({ toolDefs })` 会用 `createProxiedTools()` 把工具包成「跨 worker 代理」(worker 发
  `tool-call-request` → 主进程 `callMcpTool` 执行 → 回 `tool-result`),30s 超时;
- worker 管理器的消息处理对 `tool-call-request` 是**任务类型无关**的,run-task 同样适用。

因此只需把 `toolDefs` 沿 run-task 这条路透传下去即可。**工具在 build 时挂到 agent 上**(对所有阶段可见),
靠**阶段提示词**把使用边界划清:PLAN「只规划、不调工具」,EXECUTE「真正 CALL 工具」,REVIEW/EVALUATE
本就只评审打分、不会触发工具。这样既「plan 先行」,又让 execute 具备真正的 act/observe(单阶段内即 ReAct 式
tool-loop,`maxToolRounds` 默认 8)。

**范围**:只接**已配置的 MCP 工具**(安全、用户可控、已沙箱代理);**未**打开内置 `bash`/文件工具
(worker 一直刻意禁用,自治循环里跑 bash 风险高)。MCP 未启用/无工具时 `toolDefs` 为空,行为与改前一致(纯文本)。

## 改动清单（Changes）

- `electron/services/aiService.ts`(`runTask`):新增 `discoverMcpToolDefs()` 发现工具 → 透传 `toolDefs`
  给 `agentWorker.runTask`;发 `agent:mcp-warning` + `tools` trace(与 chat 路径一致)。
- `electron/services/agentWorkerManager.ts`:`RunTaskConfig` 增加 `toolDefs?: ToolDef[]`。
- `electron/workers/agentWorker.ts`(`handleRunTask`):接收 `toolDefs` 并
  `buildAgent(provider, systemPrompt, { toolDefs })`(有工具才传)。
- `electron/agent/autonomousLoop.ts`:
  - PLAN 提示词:「列出每步用到哪些可用工具;**只规划、不调工具、不干活**,执行放到下一阶段」。
  - EXECUTE 提示词:把「use tools (read_file, bash, WebSearch, WebFetch)」改为「**实际 CALL 可用工具**
    去取信息/执行动作,并使用返回结果(不要只描述工具会做什么)」——去掉那串当前并不存在的工具名。

## 验证方式（Verification）

- 类型检查:`tsc -p tsconfig.node.json` 总数 **3**(= 既有 baseline,4 个改动文件内 0 错)。
- 行为(需重启 dev 进程,改的是 `electron/` 主进程 + worker):
  - 配好一个 MCP server 后跑 Horse Mode → PLAN 先产出带步骤的计划(不调工具)→ EXECUTE 阶段会真正
    发起 `tool-call-request`(可在 Trace 面板的 `tools` / `tool-call` 事件看到)→ review/evaluate 照常。
  - 未配置 MCP 时 → `toolDefs` 为空 → 与改前完全一致(纯文本四阶段)。

> 注:改动在主进程/worker,**必须重启 `npm run start`** 才生效。

## 后续项（Follow-ups，可选）

- 目前工具对所有阶段可见、靠提示词约束只在 EXECUTE 用。若要**硬性**只在 EXECUTE 挂工具,需要给
  `AgentInstance` 增加「按调用开关工具」的能力(框架级改动),当前未做。
- 未开内置 `bash`/文件/Web 工具;如确需让自治循环联网检索或读写文件,可单独评估风险后接入(建议带白名单/确认)。
- 这仍是 plan-execute + 自评迭代,不是把整个循环换成单一 ReAct 主循环;EXECUTE 阶段内部是 ReAct 式的。
