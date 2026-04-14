# 2026-04-14 · 插件系统 + MCP 集成

## 背景

把 PrismMD 从"应用"升级为"平台"：给出最小三件套插件 API（命令、右侧栏
面板、markdown 渲染器）让社区能贡献；同时把 InsightGraph / borderless-
agent 已有的 tool-use 能力接到 Model Context Protocol 生态，让 AI 助手
能联网、跑 SQL、调脚本。

## 设计决策

### 插件 API 最小化

- `PluginHost` 只暴露 `registerCommand` / `registerSidebarPanel` /
  `registerMarkdownRenderer` + `notify`。新增扩展点时再加，而不是提前
  堆砌。
- 每个 registry 独立（两个 zustand store + 一个 Map）。三个扩展点之间
  没有耦合，组件各自只订阅自己需要的。
- Host 方法所有注册都记 `pluginId`；deactivate 时按 id 整体撤销，避免
  手工追踪。

### 内置 vs 外置

- **内置插件** `src/plugins/<id>/index.ts` 静态 import，vite tree-shake
  友好、HMR 工作，loader 启动时一次性激活。`hello` 和 `mermaid` 就是
  样例。Mermaid 本来硬编码在 `CodeBlock` 的 `if (language === 'mermaid')`
  分支里，现在被正式化成插件——任何第三方 diagram 插件（plantuml、d2
  …）都可以照抄。
- **外置插件**：主进程扫 `<userData>/plugins/*/{manifest.json, index.js}`，
  通过 IPC 把源码送到渲染器，渲染器用 `new Function('module','exports',
  'require','console', src)` 求值。`require` 白名单只放 `react` +
  `lucide-react`，关掉任意 Node 模块路径。这套是 v1 的**信任模式**（没
  有沙箱），设置页有醒目警告；后续可以接 `<webview>` 或 `node:vm` 做
  真沙箱。

### MCP 集成

- 用**官方 `@modelcontextprotocol/sdk`** 的 `Client` +
  `StdioClientTransport`，一台服务一对 client+进程。
- **mcpServers 格式兼容 Claude Desktop**，用户已有配置可以直接粘贴。
  设置页目前暴露裸 JSON 编辑框——足够好使，以后再做表单 UI。
- Tool 名**加前缀 `<serverId>__<toolName>`** 避免多服务器同名冲突。
- 每次 tool 调用有 `toolTimeoutMs` (默认 30s) 兜底，防止挂起的服务器
  把 agent 卡死。
- `borderless-agent` 的 `addTool` 具体签名不可见（`file:../borderless_agent`
  在本环境不存在），`attachMcpTools` 做了**软 probing**：尝试
  `addTool` / `registerTool` / `withTool`，都不匹配就 warn + skip。
  用户可以按实际 API 改 `attachMcpTools` 里的那一行注册调用。

## 改动清单（5 个 commit）

1. `69039a5` — **Plugin API core + CommandPalette**
   - `src/lib/plugins/{types,host,loader}.ts`
   - `src/store/{commandRegistry,sidebarPanelRegistry}.ts`
   - `src/lib/markdown/rendererRegistry.ts`
   - `src/components/commandpalette/CommandPalette.tsx` 接入 registry
   - `src/components/plugins/PluginNotificationHost.tsx` 轻量 toast
   - `src/plugins/hello/index.ts` 示例
   - `src/main.tsx` 启动时 `bootstrapBuiltinPlugins`

2. `22b2c56` — **Sidebar panels + markdown renderers**
   - `src/store/uiStore.ts`: `RightSidebarTab` 放宽到 string
   - `src/components/layout/RightSidebar.tsx`: 读 registry，动态追加 tab
   - `src/components/reader/components/CodeBlock.tsx`:
     `lookupMarkdownRenderer(language)` 替代 `if (language === 'mermaid')`
   - `src/plugins/mermaid/index.ts`: 把 MermaidBlock 包成插件

3. `a714b3e` — **外置插件加载**
   - `electron/services/pluginLoaderService.ts`: scan + manifest 读取
   - `electron/ipc/pluginHandlers.ts`:
     `plugins:discover` / `plugins:get-dir` / `plugins:open-dir`
   - `src/lib/plugins/externalLoader.ts`:
     `new Function` 求值 + 白名单 `require` + `reloadExternalPlugins`
   - `src/components/settings/SettingsPanel.tsx`: Plugins tab 列表 +
     信任警告 + Open folder / Reload
   - `src/App.tsx`: 挂载后 `bootstrapExternalPlugins`
   - i18n `settings.plugins.*`

4. `b335a7f` — **MCP 客户端服务 + 设置页**
   - `electron/services/mcpService.ts`:
     `startAll` / `stop` / `listTools` / `callTool` / `discoverAll` /
     `restartAll`，带超时保护
   - `electron/ipc/mcpHandlers.ts`
   - `electron/main.ts`: whenReady 起动 pool，before-quit 并行关
     InsightGraph + MCP
   - `electron/services/settingsStore.ts` + `src/store/settingsStore.ts`:
     新增 `mcp.enabled / servers / toolTimeoutMs`；`setMcpConfig` /
     `setMcpServer` 改后自动 `mcpRestart`
   - `src/components/settings/SettingsPanel.tsx`: MCP Servers tab（JSON
     编辑 + 状态列表 + Restart all）
   - i18n `settings.mcp.*`
   - package.json 新增 `@modelcontextprotocol/sdk ^1.0.4`

5. (本次) — **MCP ↔ Agent**
   - `electron/services/aiService.ts`:
     - `attachMcpTools(builder)`：soft-probe `addTool` /
       `registerTool` / `withTool`
     - `buildAgent` 变 async，MCP 启用时 `setMaxToolRounds` 至少 5
     - 有工具时在 system prompt 里明说"你有 n 个 MCP 工具可用"
     - `testConnection` 跳过 tool attach
   - recordDocs（本文件）

## 依赖变更（需 `npm install`）

- `@modelcontextprotocol/sdk` ^1.0.4

## 验证

1. `npm install` → 类型检查 `npx tsc --noEmit -p tsconfig.web.json`
   通过（只有既有的 baseUrl deprecation 警告）。
2. 启动 app：
   - **命令面板**（Ctrl/Cmd+P）滚到底能看到 "Plugins" 组里的
     "Plugin: Say hello"。点击触发右下角绿色 toast。
   - **Mermaid 代码块**在 markdown 里仍正常渲染（mermaid 插件已接管
     ```mermaid）。
   - **设置 → Plugins**：看到 Built-in 下 `prismmd.hello` +
     `prismmd.mermaid` 两条，External 空（带引导语）。
   - **设置 → MCP Servers**：勾选 "Enable MCP tool calls"，
     粘贴 `{"fetch": {"command": "npx", "args":
     ["-y", "@modelcontextprotocol/server-fetch"]}}`，点 Save；
     Status 区出现绿点 + tool 数。
3. 在 agent 聊天里问一个需要联网的问题（例如"读一下
     https://example.com 的内容"）；模型应触发 `fetch__fetch` 之类的
     工具调用（需要 `borderless-agent` 的 addTool 签名匹配；若看到
     `[mcp] borderless-agent exposes no addTool/...` warning，把
     `attachMcpTools` 里那一行改成 builder 实际暴露的方法名即可）。
4. 外置插件测试：在 `<userData>/prismmd/plugins/` 下创建：
   ```
   mkdir -p demo/
   cat > demo/manifest.json <<'JSON'
   { "id": "demo.ping", "name": "Demo Ping", "version": "0.0.1",
     "main": "index.js" }
   JSON
   cat > demo/index.js <<'JS'
   module.exports.default = {
     id: 'demo.ping', name: 'Demo Ping', version: '0.0.1',
     activate(host) {
       host.registerCommand({
         id: 'demo.ping', title: 'Demo: Ping',
         handler: () => host.notify('pong!', 'info'),
       })
     }
   }
   JS
   ```
   点 Settings → Plugins → Reload，命令面板能找到 "Demo: Ping"。

## 已知限制 / 后续项

- **外置插件无沙箱**：`new Function` + 白名单 `require`，但插件能
  `window.*` 任意操作。v2 接 `<webview>` 或 vm。
- **`borderless-agent` tool API 未对齐**：`attachMcpTools` 的软 probing
  是个临时手段。对齐后删掉 probing、直接调就行。
- **MCP Resources / Prompts 未接**：SDK 还支持 resources 和 prompts
  两类，当前只拿 tools。
- **无插件加载进度 UI**：`bootstrapExternalPlugins` 的结果目前只在
  console + 设置页静态列表；启动 splash 可以加个"loaded N plugins"。
- **插件间通讯 / 事件总线未建**：v1 插件各玩各的。需要时再设计。
