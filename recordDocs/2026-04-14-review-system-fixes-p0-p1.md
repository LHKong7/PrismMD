# 2026-04-14 系统审查修复（P0 + P1）

## 背景 / 问题（Context）
最近两周（多格式阅读器、插件系统、MCP、图谱兜底、自动更新）集中合并后，做了一次整体审查，发现 1 个 Critical、11 个 Major 的代码与体验问题。本次改动一次性修复 P0 与 P1，以消除"聊天假死、文件树冻结、MCP 静默失败、图谱切 scope 无反馈"等影响可用性的坑。

审查明细写在 `/root/.claude/plans/crystalline-beaming-cupcake.md`。

## 根因分析 / 设计决策（Analysis / Design）

- **AI 流式错误被吞掉**：`agent.stream()` 抛错落入 `finally`，从未通过 IPC 通知 renderer，前端 `appendStreamContent` 永不触发 → UI 永久转圈。需要外层 try/catch + `agent:stream-error` IPC 事件 + renderer 侧 error 状态。
- **取消挂死**：`for await` 阻塞在 LLM 下一个 chunk 时 `signal.aborted` 检查形同虚设。用 `Promise.race(iterator.next(), abortPromise)` 让 abort 立刻唤醒循环。
- **文件树性能**：递归渲染 + 每行独立 Zustand 订阅，1 万文件冻结 UI。方案：集中 expand 状态到父组件的 `Set<path>`，扁平化行，`@tanstack/react-virtual` 虚拟化（复用 LeftSidebar 的外层 scroll container 作为 scrollElement，避免嵌套滚动条）。
- **MCP 工具挂接失败静默**：borderless-agent API probing 失败只打 console.warn。抽取 warning，通过 `agent:mcp-warning` IPC 上报 → AgentSidebar 头部显示可关闭 banner。
- **MCP 子进程退出成孤儿**：`before-quit` 无超时，某个 server 卡住会阻塞整个 app 退出。加 `Promise.race(shutdown, timeout(5000))` 兜底。
- **图谱自动切 scope 无反馈**：`autoScopedRef` 触发时用户毫无感知。加一个 6 秒自动消失的信息条。
- **Neo4j 错误不清晰**：driver 的原始错误直接透传。新增 `classifyGraphError` 按关键词分类（认证失败 / 无法连接 / 超时 / 离线）。
- **聊天错误无重试**：原来错误消息和正常回复长一样，且无重试按钮。ChatMessage 增加 `status: 'error'` + `errorRetryPrompt`，渲染红色 variant + Retry 按钮，`retryMessage` 动作会清掉失败的对话重发原始 prompt。
- **流式强制自动滚动**：用户上划阅读历史时被流强拉回底部。改为"仅在贴底时自动滚"，否则显示"↓ 新消息"chip。
- **Neo4j URI 校验**：settings 接受任意文字，"测试连接"再失败时错误信息模糊。加正则 `^(bolt|neo4j)(\+s|\+ssc)?://` 前置校验，输入不合法时红边 + 禁用测试按钮。
- **i18n 硬编码**：`You/AI/Sources/Active/Activate` 等写死。补 `chat.*` / `common.*` / `settings.ai.active(ate)` 等 key，en+zh 同步。
- **无障碍**：缺少 `:focus-visible` 环、icon-only 按钮缺 `aria-label`。在全局 CSS 加 `:focus-visible` outline（仅在键盘驱动焦点时展现，鼠标点击不多余），补关键按钮的 `aria-label`。
- **更新器"离线"未区分**：offline 时只报泛泛的 error。store 里用 `navigator.onLine` 前置短路 + `error === 'offline'` 哨兵值，About 面板渲染本地化的"你似乎离线"提示。

## 改动清单（Changes）

### AI 流式 / 取消 / MCP 上报
- `electron/services/aiService.ts`
  - 新增 `raceAbort()` 用 AbortSignal 打断阻塞的 `for await`。
  - `attachMcpTools` 返回 `{ attached, discovered, warning }` 以便上报。
  - `buildAgent` 返回 `{ agent, mcpWarning, mcpAttached }`；更新 `sendMessage` / `sendOneShot` / `testConnection` 解构。
  - `sendMessage`：
    - 发送 `agent:mcp-warning` 事件。
    - 把 `for await` 换成手动 `iterator.next()` + `raceAbort`，中止立即跳出。
    - 外层 `try/catch` 捕获，通过 `agent:stream-error` 上报给 renderer。
- `electron/preload.ts`：新增 `onAgentStreamError` / `onAgentMcpWarning`。
- `src/types/electron.d.ts`：同步类型。
- `src/store/agentStore.ts`
  - `ChatMessage` 增 `status` / `errorRetryPrompt`。
  - 新增 `mcpWarning` + `dismissMcpWarning` + `retryMessage`。
  - 启动时 `bindGlobalAgentListeners` 订阅 `onAgentStreamError` / `onAgentMcpWarning`；stream-error 时晋升 partial、添加错误消息并附重试 prompt。
  - `sendMessage` 的 catch 也附 `status: 'error'` + `errorRetryPrompt`。
- `src/components/agent/ChatMessage.tsx`
  - 错误消息红色 variant + 图标 + Retry 按钮。
  - "You/AI/Sources" 走 i18n。
  - Hover 显现的复制按钮。
- `src/components/agent/AgentSidebar.tsx`
  - MCP warning banner（可关）。
  - 隐私 badge 加 tooltip。
  - 聪明自动滚动 + "新消息↓" chip。
  - Trash 按钮补 `aria-label`。

### 文件树虚拟化
- `src/components/filetree/FileTree.tsx`：扁平化 + 可选 `@tanstack/react-virtual` 虚拟化（>=200 行触发），接收 `scrollParentRef`。
- `src/components/filetree/FileTreeNode.tsx`：不再递归；接收 `expanded/onToggle/hasChildren` 作为 props；新增键盘右键菜单（Shift+F10 / ContextMenu）、方向键展开/折叠、焦点环。
- `src/components/layout/LeftSidebar.tsx`：外层 scroller 通过 ref 向下传递到 FileTree。

### MCP 优雅退出
- `electron/main.ts`：`before-quit` 加 `SHUTDOWN_TIMEOUT_MS = 5000` 与 `Promise.race` 超时兜底。

### 图谱提示
- `src/components/graph/GraphView.tsx`：`autoScopeNotice` 状态 + 顶部 banner 提示"已切到 Global"；`classifyGraphError` 输出分类化的失败原因（auth / unreachable / timeout / offline）。

### 设置校验 / i18n / a11y
- `src/components/settings/SettingsPanel.tsx`
  - Neo4j URI 正则校验 + 红边 + 禁用 Test。
  - "Active/Activate" 走 i18n。
  - About 面板 `error === 'offline'` 展示 `statusOffline`。
  - 新增 `isValidNeo4jUri` helper。
- `src/store/updaterStore.ts`：`checkNow` 用 `navigator.onLine` 前置短路 + offline 哨兵值。
- `src/i18n/locales/en.json`、`zh.json`：补 `chat.*`、`common.*`、`agent.privacyBadge*`、`agent.newMessages/jumpToLatest`、`graphView.errorAuth/Unreachable/Timeout/Offline/autoScopedToGlobal`、`settings.ai.active/activate`、`settings.insightgraph.uriInvalid`、`settings.about.statusOffline`。
- `src/styles/index.css`：全局 `:focus-visible` outline（只键盘出现）。

## 验证方式（Verification）

核心链路：
1. **AI 流式错误**：清空 API key 或断网发送消息 → 应该立即看到红色错误气泡 + Retry 按钮；点击 Retry 会清掉错误+原 user 消息并重新发送。
2. **AI 取消**：发消息，模型回复途中点 Stop → 应在 1-2s 内停止（而非 30s）。
3. **MCP 警告**：在 settings 启用一个 MCP server 但 borderless-agent 没有 tool API → 发送消息后 AgentSidebar 头部出现黄色 warning banner，可关闭。
4. **文件树**：打开含 1 万+ 文件的目录 → 展开后滚动顺畅，devtools Elements 面板不会出现 1 万 DOM 节点。
5. **MCP 退出**：启动多个 MCP server 后退出 app → `ps aux | grep mcp` 没有残余。卡住 5s 后强退。
6. **图谱 auto-scope**：打开一个没存过的文件 → 进入 Graph → 触发 ingest 完成后 scope 自动切到 Global，顶部出现可消失的提示条。
7. **Neo4j URI 校验**：在 settings 输入 `http://foo` → 输入框红框、错误提示、"Test Connection" 禁用。
8. **Neo4j 错误分类**：停掉 Neo4j → 进入 Graph → 错误提示"Neo4j is unreachable..."；改错密码 → "Authentication failed..."。
9. **自动滚动**：流式响应中手动上划 → 不被拉回，顶部出现"↓ 新消息"chip，点击回到底部。
10. **i18n/a11y**：切换 en/zh → 聊天 header、Sources、Retry 等都随语言切换；Tab 键遍历 → 聚焦元素出现蓝色 outline；屏幕阅读器读 "Clear chat"、"Copy message" 等。
11. **更新器离线**：断网进入 Settings → About → Check Now → 出现"You appear to be offline..."。

类型检查：
- `npm run typecheck`（web 部分在本环境无 node_modules 无法实跑，生产环境请回归确认）。

## 后续项（Follow-ups）

- **P2** 未做：`VirtualTable` 加 `React.memo`；MCP `listTools()` / `callTool` 加超时 + 退避重试；`batchIngestStore` 的 cancel 状态区分"已完成当前文件再取消"；Privacy 模式 tooltip 进一步细化被禁用的 provider 列表（已有基础 tooltip）。
- `currentAbortController` 仍是单例；并发多次 sendMessage 尚未处理（未被产品支持）。
- i18n 硬编码巡检：model picker 的 `LOCAL` / `CUSTOM` 小徽章、MCP `'Docs ↗'` 等仍是英文；后续统一扫一遍。
