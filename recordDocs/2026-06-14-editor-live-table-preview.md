# 编辑模式下的表格实时预览（live-preview Table）

## 背景 / 问题（Context）

富文本编辑模式（`richEditMode`，默认开启）下，编辑器已经把标题、加粗、列表等
markdown 语法隐藏并美化显示，但**表格仍然以原始 `| … |` 管道符语法呈现**，可读性很差。
用户希望在编辑模式下表格也能直接渲染成可视化的 Table。

## 设计决策（Design）

参考已有的 `editorMarkdownStyle.ts`（隐藏语法 mark 的 ViewPlugin）的「live preview」思路，
为表格新增一个块级 widget：

- **光标在表格外** → 用渲染好的 HTML `<table>` 替换整段表格源码；
- **光标 / 选区落在表格内** → 保留原始源码，方便编辑；
- 点击渲染后的表格 → 把光标移入表格（`from + 1`），自动切回源码视图编辑。

实现要点与权衡：

1. **用 `StateField` 而非 `ViewPlugin`**。块级（`block: true`）的 replace 装饰会影响
   编辑器的纵向布局，CodeMirror 需要在视口计算之前就拿到它们，因此必须由
   `StateField` 经 `EditorView.decorations.from(f)` 提供，不能依赖视口的 ViewPlugin。
2. **语法树定位**。`MarkdownEditor` 已用 `markdown({ extensions: GFM })` 加载语言，
   语法树里有 `Table` 节点。遍历时只从 `Document` 下降一层、命中 `Table` 即处理并
   `return false`，避免深入段落等无关子树。
3. **光标判定**：`sel.from <= tTo && sel.to >= tFrom` 命中则跳过 widget，显示源码。
4. **单元格内联渲染**：用一个小的正则内联解析器处理 code / 加粗 / 斜体 / 删除线 / 链接，
   其余按纯文本，避免在单元格里再次暴露 `**`、`` ` `` 等标记。
5. **样式**：`EditorView.baseTheme` 复刻 reader 的表格观感（`--border-color` 边框、
   表头 `--bg-secondary`），并把 widget 内字体切回 `--font-body`（编辑器正文是等宽字体）。

仅挂在 `editorMarkdownStyleExtension` 下，即只在富文本编辑模式生效；纯文本模式
保持原始 markdown 源码不变（符合纯文本模式的预期）。

## 改动清单（Changes）

- `src/components/editor/editorTableWidget.ts`（新增）：
  - `renderInline` —— 单元格内联 markdown → DOM 节点。
  - `splitRow` / `parseAlign` / `buildTableEl` —— GFM 表格源码 → 带对齐的 `<table>`。
  - `TableWidget`（`WidgetType`）—— 渲染 + 点击移入光标；`ignoreEvent() = true`。
  - `buildTableDecos` + `tableField`（`StateField`）—— 构建块级 replace 装饰，
    `docChanged || selection` 时重算。
  - `tableTheme`（`baseTheme`）—— 表格样式。
  - 导出 `editorTableWidgetExtension = [tableField, tableTheme]`。
- `src/components/editor/editorMarkdownStyle.ts`：
  import 并把 `editorTableWidgetExtension` 加入 `editorMarkdownStyleExtension` 数组。

## 验证方式（Verification）

- `npx tsc --noEmit` 通过，无新增类型错误。
- 手动：在含表格的文档进入编辑模式（富文本模式，默认开启）：
  - 光标在表格外 → 显示带边框的可视化表格（表头底色、对齐、内联加粗/代码/链接生效）；
  - 点击表格或把光标移入 → 还原为 `| … |` 源码即可编辑；移出后重新渲染；
  - 关闭 `richEditMode` → 全程显示原始源码，行为不变。

## 后续项（Follow-ups，可选）

- 单元格内联解析为轻量正则版，未覆盖嵌套/转义的所有边界情况；如需完全一致可改接
  remark 内联解析。
- 嵌套在 blockquote / 列表项里的表格（非顶层 `Table`）当前不渲染为 widget，保持源码。
