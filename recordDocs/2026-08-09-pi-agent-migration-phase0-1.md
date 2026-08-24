# 迁移到 pi agent toolkit —— 阶段 0（可行性）+ 阶段 1（provider 层）

## 背景 / 问题（Context）

`electron/agent/` 目前有 9,061 行自研 agent 框架，其中 1,107 行是 LLM provider 层：
`providers/{openai,anthropic,google}.ts` 各自实现一遍 HTTP 调用、SSE 解析、
指数退避重试、usage 归一化，`providers/base.ts` 维护一张「模型名 → 上下文窗口」
的硬编码表。三家 SDK（`@anthropic-ai/sdk`、`@google/generative-ai`、`openai`）
各挂一份依赖。

用户提出评估 [pi agent toolkit](https://github.com/earendil-works/pi)（`@earendil-works/*`，
MIT）能否替代。评估结论是**分两刀**：

- **阶段 1**：只换 provider 层（`pi-ai`），不碰 agent 循环 —— 本次完成。
- **阶段 2**：换 agent 循环（`pi-agent-core`）—— 未开始。

本文档记录阶段 0 + 阶段 1。

## 根因分析 / 设计决策（Analysis / Design）

### 1. 阶段 0：两个可行性问题必须先有答案

**(a) Node 版本。** pi 全线声明 `engines: { node: ">=22.19.0" }`，而
`ELECTRON_RUN_AS_NODE=1 electron -p process.versions.node` 实测本仓库是
**Node 20.18.3**（Electron 33.4.11）。

但 `engines` 只是 npm 的建议字段，不是运行时约束。而且 `pi-agent-core` 的依赖
只有 `pi-ai / pi-telemetry / diff / ignore / typebox / yaml` —— 全是纯 JS、无原生
模块，上游 README 还特意说明「core 不引入 runtime builtins，所以 SQLite session
backend 单独成包」。

所以写了一个隔离 spike（scratchpad，不入库），用 pi 自带的 `faux` provider
跑通「模块加载 → createProvider → Agent 构造 → 流式事件 → typebox 工具调用往返」，
在 Node 22.20.0 和 Electron 的 Node 20.18.3 上**各 7/7 通过**。

**结论：`>=22.19.0` 是保守声明，不构成阻塞，不需要升 Electron。**

**(b) 打包。** pi 是 ESM-only。本仓库有过两次相关事故（见
`2026-04-14-fix-borderless-agent-esm-externalize.md` 与
`2026-08-07-packaging-fix-and-reader-m4-m5.md`：`better-sqlite3` 被标
`external` 却没进 forge 白名单，打包后静默不开窗）。

选择**让 Vite 打包 pi，而不是标 external** —— pi 无原生模块，没有理由外置。
好处是 `build-config/externals.ts` 一个字都不用改，从根上绕开那类事故。

实测 Rollup 会把 pi 的 lazy API 模块拆成独立 chunk
（`anthropic-messages-*.js`、`google-generative-ai-*.js`、`openai-completions-*.js` 等），
`.vite/build/` 从 3 个文件变成 16 个。验证过这 16 个文件与 asar 内容**逐一致**，
且打包后的 app 能正常创建 BrowserWindow（`--type=renderer` helper 进程存在）。

### 2. 阶段 1 的关键选择：保留 `LLMProvider` 接口当接缝

原计划写的是「删掉 `llmProtocol.ts`」。实施时改为**保留**，理由：

`LLMProvider.chat()` 有三个调用点 —— `agentInstance.ts:1033`（主循环）、
`contextCore.ts:389`（摘要）、`toolsCore.ts:590`（子 agent）。把接口留着，
写一个 `PiLLMProvider implements LLMProvider` 的适配器，这三处**一行都不用改**，
阶段 1 就真的做到了「不碰 agent 循环」，回滚只需 revert 一个 commit。

删掉接口、让 `agentInstance` 直接对话 pi，那是阶段 2 的工作，不该混进来。

### 3. Key 从设置注入，而不是环境变量

pi 内置的 provider 工厂用 `envApiKeyAuth(name, ['OPENAI_API_KEY'])` 读环境变量，
而 PrismMD 的 key 存在 electron-store 里、由调用链一路传进来。

第一版实现是「用 `createProvider()` 把上游 provider 重建一遍、只换 auth」——
但 `Provider` 接口不暴露 `.api`，重建不了。

正确做法是上游设计好的注入点：`envApiKeyAuth` 的 resolve 逻辑是
`credential.key ?? env(...)`，所以只要给 `createModels({ credentials })` 传一个
读设置的 `CredentialStore`，**内置 provider 原封不动就能用上设置里的 key**。

### 4. ollama / custom 升格为一等 provider

迁移前，`providerUtils.mapProvider` 要把 ollama / custom **伪装成 openai**
再手工拼 `/v1` 后缀，因为老 provider 层只认三个名字。

pi 里这两个用 `createProvider()` 建成真正的 provider（这是 pi 官方文档给 Ollama
的用法），端点拼接归 `pi/models.ts` 负责。`mapProvider` 因此只剩「校验名字」
一件事，从 38 行缩到 12 行。

### 5. 未知模型不再是错误

用户可能填一个不在 pi 目录里的模型名（新发布的模型、代理商的自定义别名）。
`resolveModel` 的策略是：借同 provider 的第一个模型当模板、换掉 id，请求照发，
只有 cost / contextWindow 元数据是估的。直接抛错会让「换个新模型」这种正常
操作变成故障。

## 改动清单（Changes）

### 新增

| 文件 | 说明 |
|---|---|
| `electron/agent/pi/models.ts` | PrismMD 的 5 个 provider → pi 的 `Models`；设置驱动的 `CredentialStore`；ollama / custom 的 `createProvider` |
| `electron/agent/pi/piLLMProvider.ts` | `LLMProvider` 的 pi-ai 实现；消息 / 工具 / usage 双向转换 |
| `electron/agent/pi/models.test.ts` | 10 例：5 个 provider 解析、baseUrl 拼接、未知模型兜底、凭据注入 |
| `electron/agent/pi/piLLMProvider.test.ts` | 9 例：流式契约、消息转换（faux provider，无网络） |
| `electron/agent/pi/piLLMProvider.wire.test.ts` | 3 例：真实 HTTP 往返（本地假端点，验 URL / auth / SSE） |

### 删除（1,107 行）

```
electron/agent/providers/openai.ts       213
electron/agent/providers/anthropic.ts    349
electron/agent/providers/google.ts       303
electron/agent/providers/base.ts         159
electron/agent/providers/index.ts         24
electron/agent/llmProtocol.ts 尾部          5   （OpenAIProvider 的向后兼容 re-export）
```

依赖也少了两个：`@anthropic-ai/sdk`、`@google/generative-ai`（确认无其他引用）。
`openai` 保留 —— `providers/embeddings.ts:70` 还在动态 import 它。

### 修改

- `electron/agent/agentBuilder.ts` — `_createProvider()` 从 33 行的三分支
  switch 变成 7 行；新增 `DEFAULT_MODELS` 兜底表（ollama / custom 留空，
  强制用户在设置里填模型名）。
- `electron/agent/types.ts` / `index.ts` — `ProviderName` 从
  `'openai'|'anthropic'|'google'` 扩到 5 个，import 改指 `pi/models`。
- `electron/services/providerUtils.ts` — `mapProvider` 简化（见设计决策 4）。
- `electron/agent/llmProtocol.ts` — 去掉尾部 re-export，补注释说明它现在的
  角色是「agent 循环与 provider 之间的接缝」。

### 明确未改动

`electron/workers/agentWorker.ts` 的消息协议
（`stream|chat|run-task|test|abort|tool-result` ↔ `chunk|progress|result|error|tool-call-request`）
一个字节没动，因此以下全部零改动：整个 `src/` 渲染层、`electron/ipc/agentHandlers.ts`、
`electron/services/aiService.ts`、`electron/services/agentWorkerManager.ts`。

## 验证方式（Verification）

| 项目 | 结果 |
|---|---|
| `npm run typecheck`（web + node 两个 project） | 通过，0 错误 |
| `npm test` | 74 passed（迁移前 52，新增 22） |
| 阶段 0 spike @ Node 22.20.0 | 7/7 |
| 阶段 0 spike @ Electron 33 / Node 20.18.3 | 7/7 |
| `npm run package` | 成功 |
| `.vite/build/` 16 个 chunk vs asar 内容 | 逐一致 |
| 打包后启动 | `--type=renderer` helper 存在 → BrowserWindow 已创建 |

**流式契约**是这次最需要盯的回归点：`agentInstance.ts:902` 的 delta 拆分逻辑
按原 `providers/openai.ts` 的产出形状写死 —— 中间块是增量文本、末块是完整内容
加 usage。`piLLMProvider.test.ts` 把这个形状逐条钉住了，换实现时形状变了会当场
测试失败，而不是等到 UI 上出现乱码。

**线路层**（URL 拼接 / Authorization / SSE 解析）faux provider 测不到，所以另起了
`piLLMProvider.wire.test.ts`：本地 `127.0.0.1:0` 起一个假 OpenAI 兼容端点，
让 `PiLLMProvider` 真的发一次 HTTP 请求。ollama 和 custom 两条路径全靠这层。

### 尚未验证

对**真实**的 OpenAI / Anthropic / Google 端点没有发过请求（需要 API key）。
线路层已被本地假端点覆盖到 `chat/completions`，但三家的鉴权头和响应差异
（尤其 Anthropic 的 `x-api-key` 与 Google 的 query-param key）只有真机能确认。
合并前建议在设置里逐个激活跑一次对话。

## 后续项（Follow-ups）

1. **`agentInstance.ts:902` 的 delta 拆分有 bug（先于本次改动存在）。**
   判断条件 `cur.startsWith(cur.slice(0, prevContentLen))` 恒为真（字符串
   总是以自己的前缀开头），所以分支实际只由 `cur.length > prevContentLen` 决定。
   当某个增量比「已累计长度」还长时会走错分支、多切掉字符：
   增量 `"Hello"` → `" world"` 会被切成 `"Hello"` + `"d"`。因为 `prevContentLen`
   会快速增长，症状是**开头几个词偶发缺字**，越往后越正常 —— 很容易被忽略。
   本次刻意**没有**顺手修：阶段 1 的契约是「行为等价地换引擎」，行为修复
   应当单独成一个 commit，否则出问题时分不清是迁移还是修复引入的。

2. **SettingsPanel 的模型列表仍是硬编码。** pi 自带几十个 provider 的模型目录，
   可以改成 `models.getModels(provider)` 动态出。属于产品层改动，不在本次范围。

3. **阶段 2（`pi-agent-core`）未开始。** 届时 `toolsCore.ts` 的 13 个工具要从
   `ToolDefinition` 改写成 `AgentTool`（typebox schema + `AgentToolResult`），
   `guardrails.ts` 并入 `beforeToolCall`，`toolExecutor.ts` 整个删掉。
   skills / memory / mcpClient / sandbox 保留 —— pi 的 core 里没有这些。

4. **`note_embeddings` 仍是孤儿表**（`workspaceDb.ts:112` 建了表，无人读写）。
   与本次无关，顺手记一笔。
