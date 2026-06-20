# AI 修改预览：把 markdown 表格渲染成可视化 Table

## 背景 / 问题（Context）

AI 改写 / 选区问答返回的内容里若包含 markdown 表格，预览区直接以纯文本
（`whitespace-pre-wrap`）显示，用户看到的是 `| 列 | 列 |` 这样的原始管道符语法，
可读性很差。需求：预览里不要出现 markdown 表格语法，直接渲染成可视化的表格。

## 设计决策（Design）

复用已有的 `MarkdownPreview` 组件（`remark-parse` + `remark-gfm` + `remark-rehype` +
`rehype-react`）。`remark-gfm` 会把 GFM 表格解析成真正的 `<table>`，外层 `prose`
（`@tailwindcss/typography`，已在 `tailwind.config.ts` 启用）负责给 `th/td` 加边框样式，
因此无需自己写表格渲染逻辑。

为不破坏各调用点原有的文字颜色/字号，给 `MarkdownPreview` 增加可选 `style` prop，
合并在默认样式之后，调用方可覆写 `color` / `fontSize`。

## 改动清单（Changes）

- `src/components/ui/MarkdownPreview.tsx`：新增可选 `style?: React.CSSProperties`，
  以 `...style` 合并到默认内联样式之后。
- `src/components/editor/EditorAIBubble.tsx`：`done` 阶段的修改预览由
  `whitespace-pre-wrap` 纯文本 `{result}` 改为
  `<MarkdownPreview content={result} style={{ color: 'var(--text-primary)' }} />`，
  外层 div 保留内边距与滚动。
- `src/components/annotations/SelectionAIBubble.tsx`：`done` 回复同样改用
  `MarkdownPreview`。原来是 `<p>`，而 `<p>` 不能合法包含 `<table>`，故改为 `div` 包裹，
  并通过 `style` 保留 `--text-primary` 颜色与 `0.875rem` 字号。

## 验证方式（Verification）

- `npx tsc --noEmit` 通过，无新增类型错误。
- 手动：选中文本触发 AI 改写 / 选区问答，让模型返回含表格的内容，预览区现在显示
  带边框的可视化表格，而非原始 `|...|` 语法；普通段落 / 列表 / 代码块照常渲染。

## 后续项（Follow-ups，可选）

- 其他以纯文本展示模型输出的位置（如可执行块结果）暂未改动，若同样需要表格可视化
  可按相同方式复用 `MarkdownPreview`。
