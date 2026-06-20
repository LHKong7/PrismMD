# 合并编辑/阅读为单一模式 + 实时自动保存

## 背景 / 问题（Context）

工作区文档原本有两种模式：只读阅读器（`MarkdownReader`，渲染态）与编辑器
（`CodeMirrorEditor`，富文本实时预览），靠标题栏的「编辑/阅读」按钮（及 `Cmd+E`）来回切换；
保存要 `Cmd+S` 或切换文档时弹「是否放弃未保存」。

用户诉求：**不要两种模式，合并成一种——文档始终可编辑、改动实时自动保存**（类 Notion）。

## 设计决策（Design）

经与用户确认采「够用即可，增量再补」方案：**文本文档（markdown/json/txt）始终渲染编辑器 +
实时自动保存，去掉编辑/阅读切换**；只读阅读器仅退役为「主编辑面」，分屏的非活动 pane 仍用它做预览。
保留正文上方的横幅（PageHeader / ContradictionBanner / DocSummary），并给编辑器补上
CodeMirror 内置的文件内搜索（`Cmd+F`）。本次**暂不**迁移正文级 math/Mermaid/图片渲染、实体链接、
minimap、聊天引用证据定位（后续增量补）。

### 单一缓冲 + 自动保存数据流

- 编辑器缓冲仍是 `editorStore.editorContent`；每次按键 `setEditorContent` 除更新缓冲外，
  **新增**调用 `workspaceStore.setContent(content)`：同步把内容写入活动 tab（`tab.content` 立即更新，
  故切换不丢数据）并触发 600ms 防抖的 SQLite 落盘。
- 落盘成功后 `setContent` 的防抖回调回调 `editorStore.markSaved(content)` 清除 `isDirty`
  （仅当该页仍是活动页且缓冲未再变动）。
- `editing` 不再是用户开关，而是**自动派生**：`syncForActiveTab()` 按 `ws.currentFormat`
  判断——文本则 `setEditing(true)`（把活动文档载入缓冲），非文本（pdf/csv/xlsx）则清空编辑器、走原 viewer。

### 切换 / 关闭 / 打开：先落盘再切

`openPage` / `switchTab` / `closeTab` 改为：`await flushPendingSaves()`（立即把所有待落盘的防抖写入
SQLite）→ 切换活动 tab → `syncForActiveTab()` 载入新文档。删除原「弹窗放弃未保存 + reset 回阅读态」。
`flushPendingSaves()` 为新增方法，遍历 `autosaveTimers` 立即落盘。

### 去掉切换入口

标题栏编辑/阅读按钮、`Cmd+E`、设置里的 `Cmd+E` 快捷键说明全部移除；`Cmd+E` 说明位替换为
新的 `Cmd+F`（文档内查找）。`Cmd+S` 保留为「立即保存 + toast」。

## 改动清单（Changes）

- `src/store/editorStore.ts`：`setEditorContent` 接入 `setContent` 自动保存；新增 `markSaved`、
  `syncForActiveTab`（依 `currentFormat` 自动开关 editing）；`saveFile` 简化为 `savePage`+toast；
  移除 `toggleEditing` / `discardChanges`。
- `src/store/workspaceStore.ts`：`setContent` 防抖回调接 `markSaved`；新增 `flushPendingSaves`；
  `openPage` / `switchTab` / `closeTab` 改为「flush → 切换 → syncForActiveTab」，删除放弃弹窗与 reset。
- `src/store/uiStore.ts`：`setActivePaneId` 去掉 `editor.reset()`，交给 `switchTab` 同步（空 pane 才 reset）。
- `src/components/reader/DocumentReader.tsx`：markdown 活动 pane 在编辑器上方渲染
  `PageHeader` / `ContradictionBanner` / `DocSummary`（原先在阅读器内）。
- `src/components/editor/CodeMirrorEditor.tsx`：接入 `@codemirror/search`（`search({top:true})` + `searchKeymap`），`Cmd+F` 文档内搜索。
- `src/components/layout/TitleBar.tsx`：删除编辑/阅读切换按钮及相关 selector / `Pencil` 图标。
- `src/App.tsx`：删除 `Cmd+E`；`beforeunload` 增加 `flushPendingSaves()` 兜底。
- `src/components/settings/SettingsPanel.tsx` + `i18n/{en,zh}.json`：快捷键说明 `Cmd+E` 改为 `Cmd+F`（`settings.shortcuts.find`）。
- `package.json`：新增依赖 `@codemirror/search`。

## 验证方式（Verification）

- 类型检查：`tsc -p tsconfig.web.json --noEmit` 总错误数 47→45（修复了本次引入的 2 个，
  其余为既有 baseline：`import.meta.env` / neo4j 设置类型，均非本次改动文件）。
- 对抗式多 agent review（数据丢失/自动保存竞态、缓冲同步/外部写入/分屏/editing 时序维度）。
- 手动：
  - 打开任意文档即可直接编辑；停止输入约 0.6s 自动落盘，状态栏圆点由「未保存」转「已保存」。
  - 快速切换/关闭 tab、退出应用 → 不弹「放弃未保存」、内容不丢。
  - `Cmd+F` 在编辑器内打开搜索面板；`Cmd+S` 立即保存并提示。
  - 打开 pdf/csv → 仍是各自 viewer（无编辑器）。分屏非活动 pane 仍为只读渲染预览。

## 对抗式 review 修复（3 处，含 1 处高危数据丢失）

多 agent 对抗审查发现并修复了 3 个真实缺陷：

1. **（高危·数据丢失）外部 `savePage` 写入正在打开的当前页后，编辑器缓冲仍是旧值，下次按键把写入内容覆盖掉。**
   编辑器渲染的是 `editorStore.editorContent`（非 `tab.content`），而 `savePage` 只更新了 `tab.content`。
   Horse Mode / 周报 / 命令面板模板插入都是「createPage→savePage→openPage」写入活动页，编辑器缓冲停在空串，
   首次按键即用空缓冲落盘、销毁生成的整篇文档。
   → 修复：新增 `editorStore.loadExternalContent(content)`；`savePage` 在「写入的是当前活动页 且 编辑器
   `editing && !isDirty && editorContent !== content`」时调用它刷新缓冲。`!isDirty` 守卫既避开编辑器自身的
   自动保存写入（保存期间恒为 dirty），又不打断正在打字的用户。
2. **（中危·数据丢失）退出应用丢失最后 ≤600ms 的编辑。** `beforeunload` 的 flush 是异步 fire-and-forget，
   且主进程 `before-quit` 会先同步 `closeDb()`。
   → 修复：`before-quit` 改为先向渲染层发 `app:flush-before-quit`、`await` 渲染层 flush 完成的
   `workspace:flush-complete` 回执（带 1.5s 超时）再 `closeDb()`；渲染层（`App.tsx`）收到信号即
   `flushPendingSaves()` 后回执。新增 preload 桥 `onFlushBeforeQuit` / `notifyFlushComplete`。
3. **（中危·分屏 UX）分屏时非活动 pane 的阅读器 `Cmd+F` 与活动编辑器的 CodeMirror 搜索同时弹出。**
   → 修复：`MarkdownReader` 的 window 级 `Cmd+F` 监听加 `if (!isActivePane) return` 守卫。

> 注：修复 #1/#3 为渲染层（热重载）；修复 #2 改动 `electron/`（main.ts / preload.ts），需重启 dev 进程生效。

## 后续项（Follow-ups，可选）

- 正文级 **math / Mermaid / 图片渲染**、**实体链接**、**minimap**、**聊天引用证据定位** 尚未迁移进编辑器
  （仅分屏非活动 pane 的阅读器保留这些）；后续可逐步在编辑器内补 widget。
- **边编辑边被 agent 写同页**（用户正在打字、`isDirty=true` 时外部 `savePage` 同页）：按守卫策略保留用户在编辑的内容、
  不刷新缓冲，外部写入会被下次自动保存覆盖——属固有并发冲突，保留用户输入是合理取舍。
