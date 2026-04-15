# 2026-04-15 — UX 优化 Batch 1（反馈 / 引导 / 无障碍 / 一致性）

## 背景 / 问题（Context）

在 2026-04-14 完成了一轮 P0/P1 review 修复（流式错误重试、智能滚动、文件树
虚拟化、Neo4j URI 校验、多格式文件支持等）后，仍有一组系统性的 UX 痛点
没有处理：

1. 大文件（PDF / CSV / XLSX）打开后 UI 看似"卡死"——没有 skeleton/进度
   反馈；
2. 首次使用 AI 的引导路径过深，新用户不知道去 Settings 配置 Provider；
3. 知识图谱视图：节点颜色没有图例、Bolt 连接挂起时无超时降级；
4. 多个 icon-only 按钮缺少 `aria-label`，屏幕阅读器无法读出；
5. Settings / CommandPalette 等模态没有 focus trap，Tab 能跳出 modal；
6. 暗色模式下 5 种 highlight 颜色与正文文字对比度低于 WCAG AA；
7. Settings 面板右侧滚动溢出无视觉提示；
8. 侧栏只能 hover 触发，对触控板/触屏用户不友好；
9. 聊天历史无法整段导出，只能逐条复制。

本次按 `recordDocs` 中已记录的优先级清单做了一次集中打磨。

## 设计决策（Analysis / Design）

- **UI 状态共享**：把原来散在 `App.tsx` 局部 `useState` 的 `settingsOpen`
  下放到 `uiStore`，并新增 `pendingSettingsTab`，让欢迎屏 / AgentSidebar /
  CommandPalette 等组件都能 `openSettings('ai')` 直接打开 AI 分页。这避
  免了 prop drilling，也保留了原有的全局 Esc / Cmd+, 行为。
- **大文件解析**：选择 `setTimeout(0)` 让出一帧 + skeleton 占位，而不是
  上 Web Worker。原因：worker 需要专门的 bundle，且当前文档体量（~10MB
  以内）单独让出一帧已经能保证 skeleton 先 paint。Worker 留给后续真正
  超大文件场景。
- **Focus Trap**：抽出 `useFocusTrap` Hook 复用，处理 Tab/Shift+Tab 循环
  以及 Esc 关闭。每次 Tab 时重新查询可聚焦元素，保持模态内容动态变化时
  仍正确。
- **暗色 highlight 对比度**：保持背景较暗（不破坏暗色阅读体验），只提升
  色相饱和度，让 `--text-primary` (#c0caf5) 在其上至少达到 WCAG AA。
- **侧栏拉手**：保留原 8px 隐形 hover 区，并在中间高度叠加一个 14×48px
  半透明拉手按钮（hover/focus 时不透明）。这样既不破坏视觉简洁，又能
  让触控板/键盘用户有明确的目标。
- **Graph Legend**：根据当前数据集动态收集出现的节点类型，避免冗余的
  全局图例。可折叠以应对较小窗口。
- **聊天导出**：直接生成 Markdown blob 下载，不引入新依赖；导出格式
  PrismMD 自身可以重新打开（dogfooding）。
- **跳过项**：原计划 P2-11（合并 Privacy badge + MCP warning banner）
  实际影响有限——前者是常驻状态，后者本就可关闭；保留现状。

## 改动清单（Changes）

### 新增文件

- `src/hooks/useFocusTrap.ts`：可复用的 modal focus trap Hook。
- `src/components/reader/TableSkeleton.tsx`：CSV/XLSX 解析中显示的占位
  骨架，行宽错落以读起来像表格。

### 状态管理

- `src/store/uiStore.ts`：新增 `settingsOpen` / `pendingSettingsTab` 与
  `openSettings(tab?)` / `closeSettings` / `consumePendingSettingsTab`。

### 应用根

- `src/App.tsx`：去掉局部 `settingsOpen` state，改用 `uiStore`，让任意
  组件都能从 store 打开 Settings。

### 反馈状态（P0-1）

- `src/components/reader/PdfViewer.tsx`：新增 `pageRendering` 状态，初
  始加载 / 首页 rasterize 期间显示 `PdfSkeleton`。i18n 加 `reader.pdf.loading`。
- `src/components/reader/CsvViewer.tsx`：把同步 `useMemo` 改成大文件
  （≥1MB）`setTimeout(0)` 异步解析 + `TableSkeleton`。
- `src/components/reader/XlsxViewer.tsx`：同上，阈值 512KB（XLSX 更密）。
- i18n 新增 `reader.loading` / `reader.parsing`。

### 首次使用引导（P0-2）

- `src/components/reader/DocumentReader.tsx`：欢迎屏底部根据
  `activeProvider` 动态显示 "Configure AI provider" 按钮。
- `src/components/agent/AgentSidebar.tsx`：空状态根据 `hasApiKey` 替换
  文案并显示主 CTA。
- i18n 新增 `app.welcome.configureAI`、`agent.onboardingHint`、
  `agent.configureProvider`。

### 知识图谱（P0-3）

- `src/components/graph/GraphView.tsx`：
  - 新增 `slowLoad` 12s 超时，loading 文案变成 "Still connecting…"。
  - 新增 `GraphLegend` 角落浮层，按当前数据集动态收集 entity types。
- i18n 新增 `graphView.loadingSlow` / `graphView.legendTitle` / `legendShow` /
  `legendHide`。

### 无障碍（P1-4）

- `src/components/layout/TitleBar.tsx`：所有 icon 按钮（侧栏切换、AI、
  outline、theme、settings、min/max/close）补 `aria-label`。
- `src/components/reader/DocSummary.tsx`：build/refresh/dismiss 三个按
  钮补 `aria-label`。
- `src/components/settings/SettingsPanel.tsx`：close 按钮补 `aria-label`。
- i18n 新增 `titlebar.toggleAgent` / `minimize` / `maximize` / `restore` /
  `close`。

### Focus Trap（P1-5）

- `src/components/settings/SettingsPanel.tsx`：套 `useFocusTrap`，加
  `role=dialog` / `aria-modal` / Esc 关闭。
- `src/components/commandpalette/CommandPalette.tsx`：同上。

### 暗色高亮对比度（P1-6）

- `src/styles/index.css`：5 种 `--highlight-*` 暗色取值提升饱和度（如
  紫色 `#2a1a3a` → `#4a2670`），保证 `--text-primary` 在其上 ≥ 4.5:1。

### 信息密度（P2-8）

- `src/components/settings/SettingsPanel.tsx`：右侧滚动区抽出
  `ScrollPaneWithFade`，溢出时底部加渐变遮罩，滚到底自动消失。

### 侧栏拉手（P2-9）

- `src/components/layout/AppShell.tsx`：左右侧栏各加一个 14×48px 半透
  明拉手按钮，hover/focus 时不透明，复用现有快捷键作为 tooltip。

### 聊天导出（P2-10）

- `src/components/agent/AgentSidebar.tsx`：头部新增 Download 按钮，调
  用 `exportConversationAsMarkdown` 生成 Markdown blob 下载。导出文件
  PrismMD 自身可重新打开。
- i18n 新增 `agent.exportConversation`。

## 验证方式（Verification）

1. **类型检查**：`npm run typecheck` 通过。
2. **大文件加载**：用 50MB CSV / 200 页 PDF 测，加载期间应能看到
   skeleton/loading 文案，UI 不再显示空白。
3. **AI onboarding**：新装/清空 store，欢迎屏与 AgentSidebar 空状态
   均应出现 "Configure AI provider" 按钮，点击直接打开 Settings → AI。
4. **Graph 超时与图例**：
   - 配错 Bolt URI（如不可达地址），应在 12s 后 loading 文案变为
     "Still connecting to Neo4j…"。
   - 正常加载图谱后，右下角应出现可折叠 Legend 列出所有出现的 type
     与对应颜色。
5. **aria-label**：用 macOS VoiceOver 走 TitleBar 主流程，所有图标按
   钮可被读出含义。
6. **Focus Trap**：Cmd+, 打开 Settings，疯狂 Tab/Shift-Tab 应循环在
   modal 内；Esc 关闭。CommandPalette 同理。
7. **暗色高亮**：浏览器 DevTools 计算 `--text-primary` 与每种
   `--highlight-*` 的对比度，应 ≥ 4.5:1。
8. **Settings 滚动**：打开 AI/MCP 这种长 tab，底部应可见渐变 fade，滚
   到底后消失。
9. **侧栏拉手**：用触控板，左/右屏幕边缘中部应可点击拉手呼出侧栏。
10. **聊天导出**：发几条消息后点 Download 按钮，应下载 `.md` 文件，
    用 PrismMD 重新打开应能正确渲染。

## 后续项（Follow-ups）

- 真正超大文件（> 100MB CSV）仍建议走 Web Worker 解析，可在新增需求
  时再做。
- `aria-label` 还可以做一次更系统的全仓库 audit（FileTreeNode、
  HighlightPopover、SelectionAIBubble 等次高频组件）。
- `Button` / `Spinner` 的统一组件库（plan 中的 P1-7）本次未做，避免
  大范围视觉回归；可在后续主题/视觉迭代中再统一。
- AgentSidebar 多 banner 拥挤（plan P2-11）实际影响有限，暂不处理。
