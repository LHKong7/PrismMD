# contextCore 死导出清理（pi 迁移收尾）

承接 `2026-08-09-pi-agent-migration-phase2.md` 的后续项 1。

## 背景 / 问题（Context）

阶段 2 删掉了 3,653 行不可达代码，但 `contextCore.ts`（571 行）没动 ——
它是 vendored 进来的 borderless_agent 上下文管线，里面的预算算法互相咬合，
当时判断「单独一轮清理更安全」。

清理后只剩 174 行。

## 根因分析 / 设计决策（Analysis / Design）

### 1. 先做严格的可达性分析，而不是按「外部引用数」删

第一遍统计只看了外部引用，会误伤：`getContextWindowSize` / `getMaxOutputTokens`
外部引用为 0，但 `getBudget` 内部在用。所以对每个符号同时统计
**外部引用**和 **contextCore 内部引用**，两者都为 0 才是真死；内部引用只来自
其他将死符号的（如 `MESSAGE_PRIORITIES` 只被 `prioritizeMessages` 用、
`envInt` 只被三个将死的 getter 用），随之一起死。

另有一个陷阱：`SourceRegistry` 外部有 5 处引用，但那是 `contextBuilder.ts`
**自己定义的同名类**（`contextBuilder.ts:71`），没人从 contextCore import 它。
按名字统计会把它判活。

### 2. 删除清单

| 符号 | 为什么死 |
|---|---|
| `TokenBudget` / `prioritizeMessages` / `MESSAGE_PRIORITIES` | 无调用者；历史裁剪实际走 `selectHistory` |
| `LifecycleManager` | 无调用者（会话 id 由 `sessionCore` 管） |
| `SourceRegistry` | `contextBuilder` 有自己的同名实现 |
| `assembleSystem` | 被 `ContextBuilder` 取代 |
| `summarizeRounds` / `summarizerEnabled` / `modelSummarize` | 无调用者；`modelSummarize` 还带着一个 `llm?: any` 参数，是旧 provider 层的残留 |
| `sanitizeUserInput` | 被 `guardrails.injectionDetectionGuard` 取代 |
| 回复缓存全套（`getCachedReply` / `setCachedReply` / `replyCacheEnabled` / `_replyCache` / `cacheKey`） | 从未启用（`AGENT_REPLY_CACHE` 默认 0） |
| `computeUsageStats` | 无调用者 |
| `getBashMaxOutputLength` / `getTaskMaxOutputLength` / 相关常量 | 服务已删的 builtin bash / Task 工具 |
| `getAgentMaxOutputTokens` / `envInt` | 无调用者 |
| `contextEnabled` / `replyCacheEnabled` | 无调用者（`enableContext` 走 builder 参数） |
| `FEATURES`（11 项常量表） | 只有 `CONTEXT_1M` 被用到 → 换成单个常量 `FEATURE_CONTEXT_1M` |
| `crypto` import | 只被 `LifecycleManager` 和 `cacheKey` 用 |

### 3. 内部专用的符号改为非导出

`estimateMessagesTokens` / `getContextWindowSize` / `getMaxOutputTokens` /
所有预算常量 / `OBSERVATION_MAX_CHARS` —— 只在文件内使用，去掉 `export`，
对外面收缩到 4 个：`estimateTokens` / `getBudget` / `selectHistory` /
`foldObservation`，外加给 guardrails 用的 `INJECTION_PATTERNS`。

### 4. 补测试时发现 `selectHistory` 的兜底行不可达

写测试时按注释断言「预算极小也至少留最后两条」，测试失败 —— 实际返回空数组。

原因：

```ts
for (let i = 1; i <= capped.length; i++) {
    const trimmed = capped.slice(i);            // i === length 时得到 []
    if (estimateMessagesTokens(trimmed) <= maxTokens) return trimmed;  // 0 <= n 恒真
}
return capped.length >= 2 ? capped.slice(-2) : capped;   // ← 永远到不了
```

真正的「至少留两条」保底在**调用方** `agentInstance._run`：

```ts
workingHistory = selected.length > 0 ? selected
    : workingHistory.length >= 2 ? workingHistory.slice(-2) : [...workingHistory];
```

这是先于本次改动存在的行为，**没有改**（改了等于改变裁剪语义，不属于本次范围）。
处理方式是把事实写进函数注释和测试名，并给那行不可达的 return 标注原因 ——
留着它是为了万一循环条件被改动时仍有兜底，但不能让它伪装成正在生效的保护。

## 改动清单（Changes）

- `electron/agent/contextCore.ts` — **571 → 174 行**（−397）。对外只剩 5 个导出。
- `electron/agent/contextCore.test.ts` — 新增 17 例测试（此前该文件零覆盖）。

## 验证方式（Verification）

| 项目 | 结果 |
|---|---|
| `npm run typecheck` | 0 错误 |
| `npm test` | 90 passed（清理前 73，新增 17） |
| `npm run package` + 启动 | 正常开窗 |

测试覆盖三条关键路径 —— 它们都在每轮对话上，之前完全没有覆盖：

- **`getBudget`**：各段之和不超总窗口、默认 200k、`[1m]` 模型名放宽到 1M、
  `CONTEXT_1M` feature 只对 sonnet-4 生效、显式 total 覆盖推断、
  窗口小于输出预留时不出负数
- **`selectHistory`**：装得下原样返回、装不下从最早的丢且留下的是尾部连续段、
  预算极小返回空（见上）、超 `maxTurns` 先硬截断
- **`foldObservation`**：短文本不动、超长折叠且不超上限、自定义上限、边界等值

## 后续项（Follow-ups）

1. 至此 pi 迁移三阶段全部完成，`electron/agent/` 的生产代码从 **9,061 行降到
   3,605 行**（−60%），另有 494 行测试 —— 迁移前该模块测试为 0。
2. 仍未对真实的 OpenAI / Anthropic / Google 端点发过请求；Horse Mode
   （`runTask`）也只有类型层验证。合并前建议手工各跑一次。
3. pi 的 steering 队列（工具执行途中插话）尚未接入 UI。
