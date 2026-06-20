# AI 聊天回复支持 Markdown 渲染（保留引用上标）

## 背景 / 问题（Context）

AI 助手侧栏（`AgentSidebar` / `ChatMessage`）里，助手回复一直以**纯文本**渲染
（`whitespace-pre-wrap`），模型输出的标题、列表、表格、加粗、代码块、链接等 Markdown 语法
全部以源码字面显示，可读性差。用户要求：**AI 回复应支持 Markdown 语法渲染**。

约束：现有的 `[N]` **引用上标**功能（把回复里的 `[N]` 标记渲染成可点击的来源上标，点击滚动到
文档证据处）必须保留，不能因为切到 Markdown 渲染而退化成纯文本 `[N]`。

## 设计决策（Design）

复用仓库已有的 unified 工具链（`MarkdownPreview` 用的 remark/rehype，依赖均已安装：
`remark-parse/gfm/breaks/rehype`、`rehype-react`），新建一个聊天专用渲染组件，并用一个**微型
rehype 插件**把引用重新织回渲染树：

- **管线**：`remarkParse → remarkGfm → remarkBreaks → remarkRehype → rehypeCitations → rehypeReact`。
  - `remarkGfm`：表格、删除线、任务列表、自动链接。
  - `remarkBreaks`：软换行转 `<br>`（贴合聊天逐行输出的习惯）。
  - **不**引入 `rehype-raw`：模型输出中的裸 HTML 被当作字面文本丢弃，**天然防 XSS**。
- **`rehypeCitations(indices)`（自写）**：遍历 hast 文本节点，把 `[N]`（仅限已知证据下标）拆成
  `<cite>N</cite>` 元素；**跳过 `code`/`pre` 内文本**（避免把 `arr[0]` 误判为引用）；未知下标
  保留为字面 `[N]`。
- **`rehypeReact` 的 `components`**：把 `cite` 映射到既有的 `CitationSuperscript`（上标按钮，点击
  回调 `scrollToEvidence`）；把 `a` 映射为「拦截点击、`http(s)` 链接走 `electronAPI.openExternal`
  在系统浏览器打开」，不在应用窗口内导航。
- **主题适配**：不用 Tailwind `prose`（其灰阶不跟随 14 套主题），改用专属 `.chat-md` 样式表，
  所有颜色走 CSS 变量（`--text-primary/secondary/muted`、`--accent-color`、`--code-bg`、
  `--border-color` 等），并随 `ChatMarkdown` 直接 `import`（不依赖只在阅读器里加载的 `markdown.css`）。

**只渲染已完成的回复**：流式过程中的预览（`AgentSidebar` 里的 `streamingContent`）仍用
`renderWithCitations` 纯文本渲染（避免逐 token 重解析 Markdown 的抖动与开销）；回复落定进入
transcript 后由 `ChatMessage` 用 `ChatMarkdown` 渲染。用户消息与错误消息仍为纯文本。

## 改动清单（Changes）

- `src/components/agent/ChatMarkdown.tsx`（新增）：`ChatMarkdown` 组件（`useMemo` 缓存解析）、
  `rehypeCitations` 插件、`CitationSuperscript`（从 `ChatMessage` 迁来并导出）、外链 `a` 处理。
- `src/components/agent/chatMarkdown.css`（新增）：`.chat-md` 主题感知样式（标题/列表/代码/表格/
  引用块/链接/任务列表等）。
- `src/components/agent/ChatMessage.tsx`：助手（非错误）消息改用 `<ChatMarkdown>`；用户/错误消息保留
  `whitespace-pre-wrap` 纯文本；删除本地 `CitationSuperscript`（改为从 `ChatMarkdown` 导入）；
  `body` 的 `useMemo` 改为稳定的 `onCitationClick`（`useCallback`）。`renderWithCitations` 仍保留导出
  （`AgentSidebar` 流式预览继续使用）。

## 验证方式（Verification）

- 类型检查：`tsc -p tsconfig.web.json --noEmit` 总错误数 **45**（= 既有 baseline，新增/改动文件内 0）。
- 管线实测（rehype-stringify 跑通完整管线）：
  - 标题/加粗/列表/带语言的代码块/表格/链接均正确渲染；
  - 正文 `[1]` `[2]` → `<cite>1</cite>`/`<cite>2</cite>`（再由 rehype-react 映射为可点上标）；
  - 行内 `arr[1]` 与代码块内 `a[1]` **不**被转换（code 跳过生效）；
  - 未知 `[9]` 保留字面。
- 安全：未启用 `rehype-raw`，裸 HTML 不执行。
- 手动：打开 AI 侧栏发消息，回复以富文本显示；有证据时 `[N]` 仍是可点上标并定位；链接在系统浏览器打开。

## 后续项（Follow-ups，可选）

- 代码块暂未接 `rehype-highlight` 语法高亮（依赖已装），如需更佳代码可读性可后续增量加（需引入高亮主题）。
- 流式预览仍为纯文本；如需「边流边渲染 Markdown」，可在节流后对 `streamingContent` 复用
  `ChatMarkdown`，但要权衡逐帧重解析的开销与半截 Markdown 的闪烁。
