# UI 设计系统建设与视觉/可访问性打磨

## 背景 / 问题

PrismMD 已有 6 个主题预设和 CSS 变量系统，但随着功能累积出现了几个结构性 UI 问题：

1. **硬编码语义色到处散落** — `#ef4444` / `#f59e0b` / `#facc15` / `#22c55e` 等
   在 ChatMessage、AgentSidebar、ContradictionBanner、SettingsPanel、GraphView、
   LeftSidebar、StatusBar、TitleBar 等 14+ 个文件里直接写死。用户切换主题
   （比如从 Light 到 Dracula）后，错误横幅、警告提示、搜索高亮的颜色不变，
   观感很跳。
2. **Design token 只有颜色** — 间距、圆角、阴影、z-index 没有单一来源。
   特别是 z-index 值 10/20/30/40/50/60 遍布 AppShell/SettingsPanel/
   CommandPalette/PluginNotificationHost，浮层顺序靠巧合维护。
3. **UI 基础组件稀缺** — `src/components/ui/` 只有 Button + Spinner。
   Dialog 逻辑在 SettingsPanel 和 CommandPalette 各写一份；Tooltip 靠 `title`
   属性，键盘用户看不到提示；ContextMenu 逻辑硬编码在 FileTreeNode。
4. **窄窗口布局崩坏** — AppShell 用硬编码 260 + 220 + 340 = 820px 侧栏宽度，
   窗口 <900px 时主内容区被挤到无法使用。
5. **可访问性缺口** — 全局只有 2 处 `prefers-reduced-motion`；Agent 流式消息
   没有 `aria-live` 声明；`#facc15` 搜索高亮在亮色主题下对比度 ≈2.5:1（低于
   WCAG AA）。

## 根因分析 / 设计决策

- **token 层分离**：颜色是主题相关的 → 继续用 CSS 变量（运行时切主题必须的
  机制）；间距/圆角/阴影/z-index/动效时长是主题无关的 → 新建 TS 常量文件
  `src/lib/theme/tokens.ts`。Tailwind 配置把两边都映射成工具类，组件代码
  就不用内联 hex 或 px 了。
- **z-index 命名层级**：保留现有数值（10/20/30/40/50/60/70）不变，只给它们
  起语义名字（sticky/overlay/sidebar/progress/modal/toast/tooltip），迁移
  成本极小。
- **语义色覆盖 6 个主题**：每个预设补齐 `--color-error/warning/success/info`
  及 `-bg/-border` 三种变体。每个颜色在 themes.ts 里手工挑选以匹配该主题
  的调性（Nord 用 `#bf616a`，Dracula 用 `#ff5555`，Solarized 用 `#dc322f`），
  而不是粗暴地全部复用同一个红。
- **图表配色独立对待**：GraphView 的 cluster 色板故意保持主题无关（用户会
  记住"红色=冲突簇"之类的映射），但从组件内部搬到 `tokens.ts` 的
  `graphPalette` 常量，方便将来扩展。
- **组件库先构建、不强行迁移**：新增 Input/Select/Dialog/Tooltip/Toast/
  ContextMenu/Badge 组件后，不立刻把 SettingsPanel 重构掉（那是 1252 行、
  另一个 PR）——让后续代码直接用新组件，老代码渐进式迁移。
- **窄窗口折叠而不是全响应式**：PrismMD 是桌面 Electron 应用，不需要适配
  移动端。只处理 `< 900px` / `900-1099px` / `>= 1100px` 三档，状态变化
  在 AppShell 渲染层消费，`uiStore.leftSidebarPinned` 等用户偏好完全不动。

## 改动清单

### 新建文件

- **`src/lib/theme/tokens.ts`** — spacing/radius/shadow/zIndex/motion 常量，
  以及 `graphPalette` 图表配色。
- **`src/lib/hooks/useWindowBreakpoint.ts`** — 订阅 `window.resize`，返回
  `'wide' | 'narrow' | 'compact'`。
- **`src/components/ui/Input.tsx`** — 统一文本输入，含 `invalid` 态自动
  设置 `aria-invalid` 和错误色边框。
- **`src/components/ui/Select.tsx`** — 原生 `<select>` 薄包装，token 边框/
  focus 样式。
- **`src/components/ui/Dialog.tsx`** — 复用 `useFocusTrap`，统一 backdrop +
  Esc 关闭 + fade/scale 入场动效 + `role=dialog` / `aria-modal`。
- **`src/components/ui/Tooltip.tsx`** — 支持 hover + focus 触发（键盘
  可见），portal 定位，Escape 关闭。
- **`src/components/ui/Toast.tsx`** — `ToastHost` 展示组件，不自带 store，
  挂在 `z-toast` 层；`aria-live=polite`。
- **`src/components/ui/ContextMenu.tsx`** — portal + outside click + Escape +
  ArrowUp/Down/Home/End 键盘导航。
- **`src/components/ui/Badge.tsx`** — 6 个 tone 的状态徽章。

### 修改文件

- **`src/lib/theme/themes.ts`** — 6 个预设补齐 14 个语义色 CSS 变量。
- **`src/styles/index.css`** — `:root` / `.dark` 加语义色和 motion token；
  新增全局 `prefers-reduced-motion` 规则（一次性搞定整个应用）；
  加 `prism-fade-in` / `prism-fade-scale-in` keyframes。
- **`src/styles/markdown.css`** — `mark.in-file-match` 用 `--color-search-
  highlight`，深色主题下不再刺眼。
- **`tailwind.config.ts`** — 映射语义色为 `text-error` / `bg-warning-bg` 等
  工具类；映射 token `zIndex`、`borderRadius`、`boxShadow`、
  `transitionDuration`。
- **`src/components/ui/Button.tsx`** — `danger` variant 改用 `--color-error-*`
  token；加 `active:opacity-80` 交互态；用 `duration-fast` token。
- **`src/components/layout/AppShell.tsx`** — 接入 `useWindowBreakpoint`；
  narrow/compact 时忽略 pinned 偏好；compact 时展开侧栏显示 backdrop
  （点击关闭）；z-index 用语义类；侧栏最大宽度按视口裁剪。
- **`src/components/agent/AgentSidebar.tsx`** — 消息容器加 `aria-live=polite`
  `aria-atomic=false` `aria-relevant="additions text"`；隐私徽章和 MCP
  警告改用 token 色。
- **业务组件清除硬编码颜色**：
  - `src/components/agent/ChatMessage.tsx`（错误头像、错误文字、重试按钮）
  - `src/components/graph/ContradictionBanner.tsx`（警告背景/边框/图标）
  - `src/components/graph/GraphView.tsx`（tone=error 状态 + cluster 色板
    迁到 tokens）
  - `src/components/layout/LeftSidebar.tsx`（索引失败计数）
  - `src/components/layout/StatusBar.tsx`（批处理状态、索引状态、LOCAL 徽章）
  - `src/components/layout/TitleBar.tsx`（关闭按钮 hover 背景）
  - `src/components/settings/SettingsPanel.tsx`（privacy / memory clear /
    provider warning / Neo4j URI invalid / MCP JSON draft error / 服务
    运行状态点、LOCAL 徽章等 10+ 处）
  - `src/components/reader/JsonViewer.tsx`、`PdfViewer.tsx`、
    `CsvViewer.tsx`、`DocSummary.tsx`、`components/ErrorBanner.tsx`
  - `src/components/annotations/SelectionAIBubble.tsx`
  - `src/components/plugins/PluginNotificationHost.tsx`（token 色 + z-toast 类）
  - `src/components/graph/EntityPanel.tsx`、`RelatedRail.tsx`

共约 18 个文件的硬编码颜色或 Tailwind 直写色（`text-red-500` /
`text-green-500` / `text-amber-500`）被替换为 token 工具类。

## 验证方式

### 本地验证

1. `npm run typecheck` — TypeScript 全通过（已执行，0 error）
2. `npm run dev` 启动 Electron，依次切换 6 个主题预设，确认以下场景
   颜色跟随主题变化：
   - Agent 聊天发送错误消息（比如断网时）
   - 打开 Settings → Privacy，`Clear Memory` 按钮颜色、点击后成功态
   - 打开 Settings → InsightGraph，输入无效 Neo4j URI
   - 打开 Settings → MCP，输入错误 JSON
   - 打开一个 Markdown 文件，Cmd/Ctrl+F 搜索，确认高亮在亮/暗主题都清晰
   - Graph 视图矛盾横幅（如有）
3. 键盘导航：
   - Cmd/Ctrl+, 打开设置，Tab 循环在 Dialog 内、Esc 关闭、焦点回到原位
   - Tab 到带 `title` 的按钮（Agent 侧栏按钮等），焦点环可见
4. 窄窗口：
   - 缩到 1000px 宽 → 侧栏变 floating（pinned 偏好自动忽略）
   - 缩到 700px 宽 → 打开左侧栏显示 backdrop，点击 backdrop 关闭
   - 恢复到 1400px → pinned 偏好再次生效
5. 动效偏好：macOS 系统偏好 → 辅助功能 → 显示 → 勾选"减少动态效果"，
   重启应用，确认侧栏切换、Dialog/Tooltip 入场、脉冲动画全部瞬时完成
6. a11y：Chrome DevTools → Lighthouse → Accessibility ≥ 90（目标）

### 类型检查

`npm run typecheck` → 0 error（tsconfig 严格模式，包含 noImplicitAny 等）

## 后续项 (Follow-ups)

- **SettingsPanel 重构**：1252 行，可以拆分为多个子面板 + Dialog 复用新
  `Dialog` 组件。本次未做，避免 PR 过大。
- **CommandPalette 迁 Dialog**：`CommandPalette.tsx:106` 的 fixed inset-0
  结构可以迁到新的 Dialog 组件。
- **PluginNotificationHost → ToastHost**：新建的 `ToastHost` API 已对齐
  PluginNotificationHost 的数据模型，迁移一行改动即可。
- **FileTreeNode → ContextMenu**：`FileTreeNode.tsx:170` 的 fixed 菜单可
  迁到新 `ContextMenu` 组件，键盘导航自动变完整。
- **Storybook/Ladle**：组件库已初具规模，可以考虑引入组件预览。
- **SettingsPanel `<fieldset><legend>`**：长表单语义化，本次未做。
