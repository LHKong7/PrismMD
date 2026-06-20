# 编辑器交互式 Checklist（GFM 任务列表复选框）

## 背景 / 问题（Context）

编辑器已支持 GFM 任务列表（`/task` 斜杠命令插入 `- [ ] `），lezer 也用 GFM 语法解析。
但在富文本编辑模式（`richEditMode`）下，任务项渲染得很难看：列表标记 `-` 被 bullet 插件替换成 `•`，
而 `[ ]` / `[x]` 仍是**字面文本**——于是显示成「• [ ] 待办」，复选框不可点。

用户诉求：**新增一个 checklist 组件**——让任务项渲染成真正可点击的复选框，点一下即在
`[ ]` / `[x]` 之间切换，无需手改 markdown。延续刚做完的表格 widget 思路（编辑器内 WYSIWYG）。

## 设计决策（Design）

新增 `editorChecklistWidget.ts`，与表格 widget 平行，但复选框是**行内**元素，故用 `ViewPlugin`
（按 `visibleRanges` 扫描）而非块级 `StateField`。

### 1. lezer 结构定位

GFM `TaskList` 扩展产出：`ListItem → [ListMark, Task → TaskMarker]`，其中 `TaskMarker` 正好是
3 个字符的 `[ ]` / `[x]`（`@lezer/markdown` index.js:2160）。遍历命中 `TaskMarker` 即处理。

### 2. 复选框 widget

- 用 `Decoration.replace` 把 `[ListMark.from .. TaskMarker.to]`（即 `- [ ]`）整体替换为一个
  `TaskCheckboxWidget`（`<span role=checkbox>`，CSS 画对勾），**连列表 bullet 一起吞掉**，只剩复选框。
- `TaskMarker → Task → ListItem → getChild('ListMark')` 拿到 bullet 起点；拿不到时退化为只替换 `[ ]`。
- 点击：`mousedown` 时 `preventDefault`（不把光标移到该行）+ 读 `sliceDoc(from, from+3)`，
  在 `[ ]` / `[x]` 间切换并 `dispatch` 一个 3 字符替换。markdown 源码仍是唯一真相。
- 已完成项（`[x]`）：对 `[TaskMarker.to .. Task.to]` 加 `Decoration.mark('cm-task-done')` 做删除线 + 变灰。

### 3. live-preview：光标在该行 → 还原源码

与编辑器其余「光标在当前行则显示原始语法」一致：选区落在任务行时 `return`（跳过 widget），
显示原始 `- [ ]` 便于直接编辑；移开后重新渲染为复选框。点击复选框不移动光标，故切换后仍保持渲染态。

### 4. 与 bullet 插件协调（关键，避免装饰重叠）

`editorMarkdownStyle.ts` 的 bullet 插件原本把 `-`/`*` 的 `ListMark` 替换成 `•`。若它和 checklist 的
replace 都覆盖 `ListMark`，会造成**装饰区间重叠**。因此让 bullet 插件在
`node.node.parent?.getChild('Task')` 命中（即该 `ListItem` 含 `Task`）时直接跳过，不再画 bullet——
ListMark 区间只由 checklist 的 replace 接管，互不重叠。`syntaxHidingPlugin` 的隐藏标记
（HeaderMark/EmphasisMark/LinkMark…）都不在 `- [ ]` 区间内；已完成项文本范围内的 inline 隐藏与
`cm-task-done` 的 mark 装饰可共存（mark 叠加、replace 隐藏，类型不同）。

仅在 `richEditMode` 生效；纯文本模式保持原始 `- [ ]` 源码不变。

## 改动清单（Changes）

- `src/components/editor/editorChecklistWidget.ts`（**新增**）：
  - `TaskCheckboxWidget`（`WidgetType`）：渲染复选框、`mousedown` 切换 `[ ]`/`[x]`、`ignoreEvent`。
  - `buildChecklistDecos`：扫 `TaskMarker`，活动行跳过；replace 吞掉 `- [ ]` + 已完成项删除线 mark。
  - `checklistPlugin`（`ViewPlugin`，docChanged/selectionSet/viewportChanged 重算）+ `checklistTheme`。
  - 导出 `editorChecklistExtension`。
- `src/components/editor/editorMarkdownStyle.ts`：
  - import 并把 `editorChecklistExtension` 加入 `editorMarkdownStyleExtension`。
  - bullet 插件在 `ListMark` 的父 `ListItem` 含 `Task` 时跳过（避免与 checklist replace 重叠）。
- `src/i18n/locales/{en,zh}.json`：新增 `editorTask.toggle`（复选框 aria-label），en/zh 同步。

## 验证方式（Verification）

- 类型检查：`tsc -p tsconfig.web.json --noEmit` 在改动文件上零报错；两 locale JSON 合法、`editorTask` 键 en/zh 一致。
- 对抗式多 agent review（装饰重叠/排序、切换位置稳定性、活动行还原等维度）。
- 手动（富文本模式）：
  - `- [ ] x` 渲染为空心复选框、`- [x] x` 为打勾 + 文本删除线；点击在两者间切换、光标不跳。
  - 光标移到任务行 → 还原 `- [ ]` 源码可编辑；移开重新渲染。
  - 普通无序列表仍显示 `•`（bullet 未受影响）；表格 widget 共存正常。
  - 关闭 `richEditMode` → 全程原始 `- [ ]` 源码。

## 后续项（Follow-ups，可选）

- 阅读器（`MarkdownPreview` / `MarkdownReader`，remark-gfm）目前任务项是只读复选框；如需在阅读态也可点击切换，需另接回写。
- 仅识别顶层 GFM `TaskMarker`；个别畸形/深度嵌套结构退化为只替换 `[ ]`、不吞 bullet。
- 复选框样式为 CSS 像素值，跨主题/字号下可能需细调。
