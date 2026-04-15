# 2026-04-15 — UX 优化 Batch 2（Button / Spinner 统一组件）

## 背景 / 问题（Context）

Batch 1（`2026-04-15-ux-optimization-batch-1.md`）落地后，还剩下一条
plan 项没做：**P1-7 统一 Button / Spinner 组件**。

背景数据：全仓有 21 个文件、59 处使用 `hover:bg-black/10 dark:hover:bg-white/10`
这类 ghost-button 样式拼装；12 个文件、26 处 `animate-spin` / `animate-pulse`
加载指示器，且混用 `<Loader2>`、`<Bot>`、`<Brain>` 作为 spinner。

这带来的问题：
1. 视觉节奏不统一——不同页面 hover 反馈 / spinner 节奏看起来是两个应用；
2. 给每个按钮重复写一串 `rounded hover:... focus-visible:...` 模板容易漏
   掉无障碍（Batch 1 里补 `aria-label` 时发现很多按钮连 `focus-visible` 都没有）；
3. 后续新增 UI 没有规范样板。

## 设计决策（Analysis / Design）

- **不做全仓替换**：只改高频/高价值位置（TitleBar、AgentSidebar、
  SettingsPanel、DocSummary、DocumentReader welcome、GraphView、
  PdfViewer）。FileTree、EntityPanel、ContradictionBanner 等本次不动——
  它们有较多定制样式（active state、尺寸特殊），强行套 Button 会丢语义。
- **Button 4 个 variant**：
  - `ghost`：透明背景 + `hover:bg-black/10 dark:hover:bg-white/10`。覆盖 95% 的 icon-only 工具栏按钮。
  - `primary`：`bg-[var(--accent-color)]` + 白字。用于 Send / Configure AI 等主 CTA。
  - `outline`：边框 + 透明背景。欢迎屏的 "Open Folder" 二级 CTA。
  - `danger`：红色边框 + 淡红背景。预留给 retry / delete 等破坏性操作。
- **Button 3 个 size**：`icon` / `sm` / `md`，分别对应 `p-1 rounded` /
  `px-2 py-1 rounded text-xs` / `px-3 py-1.5 rounded-md text-sm`。
- **内建 a11y**：`focus-visible:ring-2` + `disabled:opacity-40 disabled:cursor-not-allowed`
  写进组件，无法通过外部 className 被无意丢掉；`type` 默认 `button`，
  避免在 form 里被意外提交。
- **Spinner 只负责 spin**：原来混用 `animate-pulse` 的地方保持 pulse
  语义（例如 skeleton 填充），只把 `<Loader2 animate-spin>` 这种
  "loading" 语义的统一成 `<Spinner>`。新增 `label` prop 以便屏幕阅读器读出。

## 改动清单（Changes）

### 新增

- `src/components/ui/Button.tsx`：`<Button variant size />`，4 × 3 组合。
- `src/components/ui/Spinner.tsx`：`<Spinner size label />`，包装 `Loader2`
  + `animate-spin` 统一节奏。

### 重构高频按钮

- `src/components/layout/TitleBar.tsx`：全部 6 个 icon 按钮（侧栏/AI/
  outline/theme/settings）+ 3 个 Windows 窗口控件替换为 `<Button variant="ghost" size="icon">`。
  关闭按钮通过 `className="hover:!bg-red-500/20"` 保留原先的红色 hover。
- `src/components/agent/AgentSidebar.tsx`：
  - 头部 export / clear 按钮 → `ghost icon`；
  - 空状态 "Configure AI provider" → `primary md`；
  - 底部 send / stop → `primary icon`。
- `src/components/reader/DocSummary.tsx`：
  - build graph / regenerate / dismiss 三个按钮 → `ghost icon`；
  - 2 处 `<Loader2 animate-spin>` → `<Spinner>`。
- `src/components/settings/SettingsPanel.tsx`：
  - 右上角 close → `ghost icon`；
  - 6 处 `<Loader2 size={12|14} animate-spin>` → `<Spinner>`；
  - 从 `lucide-react` import 中移除 `Loader2`。
- `src/components/reader/DocumentReader.tsx`：欢迎屏 Open File
  （`primary md`）/ Open Folder（`outline md`）/ Configure AI（`outline sm`）
  三个 CTA 统一。
- `src/components/graph/GraphView.tsx`：loading 图标 → `<Spinner>`，
  从 import 移除 `Loader2`。
- `src/components/reader/PdfViewer.tsx`：toolbar loading 图标 → `<Spinner>`。

### 不动的

- FileTree 节点按钮、EntityPanel、ContradictionBanner、HighlightPopover、
  SelectionAIBubble、LeftSidebar 等：它们的按钮通常有定制的 active/
  hover 配色或 inline style 表达状态，硬套 Button 会丢语义。后续需要
  再迭代。
- `animate-pulse` 保留：这是 skeleton / placeholder 语义，与 spinner
  是两回事。

## 验证方式（Verification）

1. **类型检查**：`npm run typecheck` 通过。
2. **视觉回归**：
   - TitleBar 所有按钮 hover 反馈一致（不再有的用 `bg-black/10`、有
     的用 `bg-black/5`）；
   - 切换暗色模式后 hover 同样正确。
3. **键盘**：Tab 到任何 Button，焦点环与全局 `:focus-visible` 一致；
   `disabled` 时不再吞焦点事件。
4. **屏幕阅读器**：Spinner 在 loading 期间会被 VoiceOver 读出（带 label 时）。
5. **功能冒烟**：
   - 欢迎屏 Open File / Open Folder 仍能弹出对话框；
   - Settings 打开/关闭、AI 测试连接 spinner、MCP 重启 spinner 正常；
   - AgentSidebar Send / Stop / Clear / Export 行为不变。

## 后续项（Follow-ups）

- 剩余 14 个组件的按钮迁移（FileTree、EntityPanel、各种 banner 等），
  建议跟随下一轮样式迭代一起处理。
- 若出现更复杂的变体（loading state、leading icon、trailing badge 等），
  再在 Button 上按需加 prop，不要让每个调用点自己拼接。
- i18n 新增 key 本次无（文案未变）。
