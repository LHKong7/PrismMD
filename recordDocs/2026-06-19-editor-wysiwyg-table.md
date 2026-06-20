# 编辑器表格 WYSIWYG 直接编辑

## 背景 / 问题（Context）

`2026-06-14-editor-live-table-preview.md` 给富文本编辑模式加了表格**实时预览**：光标在表格外时把
`| … |` 源码渲染成漂亮的 HTML `<table>`。但那个 widget 是**只读**的（`ignoreEvent()=true`），
要编辑只能点一下表格，把光标塞回原始管道符源码，**实际编辑的仍然是 markdown 语法**——
加减行列要手动对齐 `|`、改分隔行，体验很别扭。

用户诉求：**像真实表格那样编辑**——点单元格直接打字、用句柄增删行列、设对齐，全程不碰 `|` 语法。

## 设计决策（Design）

把只读 widget 升级为**可交互的 WYSIWYG 表格 widget**，markdown 源码仍是唯一真相，
每次编辑序列化后回写进 CodeMirror 文档。

### 1. 单元格用原生 `<input>`，不用 contentEditable

CM 的 `.cm-content` 本身是 contentEditable + DOMObserver，在 widget 里再嵌 contentEditable
会与 CM 的选区/变更管理冲突。原生表单控件是"编辑孤岛"：打字只改 `value`、**不改 DOM 子树**，
MutationObserver 不触发，两者互不干扰。

### 2. 焦点保留：靠 CM 自身的 `updateSelection` 早退 + `updateDOM` 守卫

核心难点是"边打字边回写会不会让 CM 抢走焦点 / 移动光标"。读了 `@codemirror/view` 源码确认**安全**：
`DocView.updateSelection`（docview.cjs:3005-3010）在「编辑器可编辑 且 `activeElement` 不是 contentDOM 本身
且 不是 pointer 事件」时**直接 return**。单元格 input 获得焦点时 `activeElement` 是 input（非 contentDOM），
我们的回写又是纯 `changes` 事务（非 `select.pointer`）——所以 CM **不会**改写 DOM 选区、不会让 input 失焦。

在此基础上再加一道守卫：`TableWidget.updateDOM` 发现**有单元格 input 处于焦点**时直接 `return true`
（DOM 即真相，绝不重建）；只有未聚焦时才按 source 比对决定「无操作」或「外部改动→重建」。
于是：打字时去抖（150ms）把整表序列化回写文档（autosave 能拿到），而焦点/光标全程不动。

### 3. 结构操作 = 读 DOM model → 变形 → 重写整段 source

不做精细节点定位：解析 source → `{ aligns, rows }`（rows[0] 为表头）→ 增删行列 / 改对齐 →
带对齐冒号的 GFM 序列化（含列宽 padding）→ 用 `getTableRange()`（`posAtDOM` + 语法树，
带按行扫描兜底）定位当前表格区间并 `dispatch` 替换。

### 4. Notion 式句柄（方案 A）

- 列表头悬停出 `⋯` → 菜单：左/右插入列、左/中/右对齐、删除列。
- 每个正文行左侧悬停出 `⋮` → 菜单：上/下插入行、删除行。
- 右边缘 `+` 追加列、底部 `+` 追加行、右上角 `×` 删除整表。
- 句柄默认透明，表格 hover 时显现。精确「插入到某处」走菜单，避免脆弱的边界命中检测。

### 5. 键盘导航

Tab / Shift+Tab 前后移格（末格 Tab 自动追加一行）；Enter 下移（末行追加）；
方向键在格间移动（input 单行，↑↓ 直接跨行；←→ 在光标到达边界时跨格）；Esc 退回正文。

仅在 `richEditMode` 生效；纯文本模式保持原始 markdown 源码不变。

### 6. 对抗式 review 修复的三处隐患（并发/生命周期）

多 agent 对抗审查发现并修复了 3 个真实缺陷，根因都是「widget 被 CM 拆除时缺少清理 +
回写路径未防御 detached / 外部并发改动」：

- **去抖定时器在 widget 拆除后触发、把过期表格写到错误区间（数据损坏，high）**：
  CM 整文替换（`CodeMirrorEditor.tsx` 的外部/agent 内容同步）会丢弃旧 widget；旧 `wrap` detach 后
  `posAtDOM` **不抛错**而返回 0 / `doc.length`（@codemirror/view index.js:3127 已核实），原 try/catch 拦不住。
  → 修复：`TableWidget.destroy()` 清掉待触发的 flush 定时器；`getTableRange` 开头加
  `if (!view.contentDOM.contains(wrap)) return null` detach 守卫（回写全部经此函数，双保险）。
- **聚焦单元格的回写覆盖外部并发改动（lost update，medium）**：聚焦时 `updateDOM` 守卫不重建 DOM，
  之后 flush 会用过期 DOM 值盖掉外部已改的表格。
  → 修复：`commit` 改为 **compare-and-swap**——`render` 用 `renderBaseline` WeakMap 记录该 DOM 对应的源码；
  写回前若当前文档区间 ≠ baseline（被外部改过）则不覆盖，改为按当前文档重渲染（丢弃在编辑的格内输入，
  保住外部改动这一更优先项）。
- **菜单打开时 widget 被拆除会泄漏 document mousedown 监听 + detached 菜单节点（medium）**：
  → 修复：`destroy()` 调 `closeMenu()` 统一回收。

## 改动清单（Changes）

- `src/components/editor/editorTableWidget.ts`（**重写**）：
  - 解析/序列化：`parseTable` / `serializeTable` / `escapeCell` / `alignDelim`（替代旧的只读 `buildTableEl`）。
  - `readModelFromDom` —— 从 inputs + `th.dataset.align` 读回实时 model。
  - `getTableRange` —— `posAtDOM`+语法树定位表格区间（行扫描兜底），回写不受别处编辑位移影响。
  - `render` —— 构建可编辑 DOM 并挂全部交互：`commit`/`flush`/去抖、`focusCell`、
    `insertCol`/`deleteCol`/`insertRow`/`deleteRow`/`setAlign`/`deleteTable`、列/行浮动菜单、追加/删除句柄、键盘导航。
  - `TableWidget`：`toDOM` 渲染、`updateDOM`（聚焦守卫 + source 比对协调）、`eq`（按 source）、`ignoreEvent`。
  - `tableTheme` —— input 单元格、句柄 hover、浮动菜单样式。
  - 仍导出 `editorTableWidgetExtension`（`editorMarkdownStyle.ts` 的引用不变）。
- `src/i18n/locales/{en,zh}.json`：新增 `editorTable.*`（列/行选项、增删、对齐、删表等），en/zh 同步（各 14 键）。

## 验证方式（Verification）

- 类型检查：`tsc -p tsconfig.web.json --noEmit` 在 `editorTableWidget.ts` 上零报错；
  两个 locale JSON 合法、`editorTable` 键集合 en/zh 完全一致。
- CM 焦点行为依据 `@codemirror/view` 源码确认（见设计 2）。
- 手动（富文本模式，含表格的文档）：
  - 点单元格直接打字、连续输入光标不丢；去抖回写后内容正确、autosave 生效。
  - Tab/Enter/方向键在格间导航；末格 Tab、末行 Enter 自动加行。
  - `⋯`/`⋮` 菜单增删行列、设对齐；右/底 `+` 追加；`×` 删表。
  - 含 `|`、inline `**`/`` ` `` 的单元格回写后 round-trip 正确（`\|` 转义）。
  - 外部改文档（如 AI 改写）后表格 DOM 同步；关闭 `richEditMode` 退回源码。

## 后续项（Follow-ups，可选）

- 单元格为单行 `<input>`：含换行的多行单元格内容会被压成一行（换行→空格）。需要多行可换 auto-grow `<textarea>`。
- 单元格内 inline markdown（`**bold**`/链接）按**字面文本**编辑，不做格内 WYSIWYG 渲染；如需可接 remark 内联解析。
- 句柄/菜单为像素定位，跨主题/缩放下可能需要细调。
- 嵌套在引用 / 列表项里的表格（非顶层 `Table` 节点）仍保持源码，与现状一致。
- 暂未做行/列拖拽重排；增删通过菜单与追加句柄完成。
