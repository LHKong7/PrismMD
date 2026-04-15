# 2026-04-16 — 当前文件搜索（Cmd/Ctrl+F, Markdown）

## 背景 / 问题（Context）

完成全局全文搜索后，用户仍缺少最常见的 "在当前文档内查找" 能力。Electron 的原生 `find-in-page` 只能匹配可视区文本且与我们的自定义 DOM（entity-linking 包装、虚拟滚动等）配合差。

## 设计决策（Design）

- **范围**：v1 仅 MarkdownReader（最高频场景）。CSV/XLSX/PDF 留待后续。
- **匹配方式**：DOM 文本节点 TreeWalker。理由：源 markdown 含语法（链接、围栏、HTML），按源做正则会高亮到看不到的内容。直接走渲染后的 text node 才能"所见即所匹"。
- **DOM 安全**：每次重算前先 unwrap 旧 `<mark.in-file-match>` 并 `parent.normalize()`；过滤 SCRIPT/STYLE 与已在 mark 内的节点。entity-linking 的 `.ig-entity` 包装内部仍是 text node，会被正常匹配。
- **导航**：当前匹配额外加 `.current` 类（橙色高亮），`scrollIntoView({ block: 'center' })`。Enter / Shift+Enter 切换上下，Esc 关闭。
- **快捷键作用域**：`window` 监听 Cmd/Ctrl+F，但只有 MarkdownReader 挂载时才生效（hook 在组件内）。其他视图不会被劫持系统/浏览器查找。

## 改动清单（Changes）

**新增**
- `src/hooks/useInFileSearch.ts` — 状态机 + DOM mutation。导出 `{ open, setOpen, query, setQuery, matchCount, currentIdx, next, prev }`。
- `src/components/reader/InFileSearchBar.tsx` — 右上角悬浮搜索条（输入 / 计数 / 上下 / 关闭）。
- `recordDocs/2026-04-16-in-file-search.md` — 本文档。

**修改**
- `src/components/reader/MarkdownReader.tsx` — 接入 hook + 搜索条；外层加 `relative`；`useEffect` 注册 Cmd/Ctrl+F。
- `src/styles/markdown.css` — `.in-file-match` 黄底 + `.current` 橙底高亮。
- `src/i18n/locales/{en,zh}.json` — 新增 `inFileSearch.*` 命名空间。

## 验证方式（Verification）

- `npm run typecheck` — pass。
- 手测：
  1. 打开任意 Markdown，按 Cmd/Ctrl+F → 右上出现搜索条，输入光标已 focus。
  2. 输入关键词 → 全部匹配黄高亮，第 1 个橙高亮 + 滚动居中；右侧显示 `1 / N`。
  3. Enter 跳下一个、Shift+Enter 跳上一个，循环。
  4. 改输入 → 旧 mark 清理 + 重新匹配。
  5. Esc 或点 × → 搜索条关闭、所有 mark 被 unwrap、DOM 还原。
  6. 切换文档 → `contentKey`(currentContent) 变化触发重算。
  7. 与 entity-linking 共存：开启 entityLinking 后查找仍能命中 `.ig-entity` 内部文本，不会错位。

## 后续项（Follow-ups）

- 大小写敏感 / 全词匹配 / 正则 选项。
- 扩展到 CSV/XLSX（按 cell 高亮）和 PDF（pdfjs `findController`）。
- 与全局搜索（CommandPalette "Content Matches"）按钮联动：从全局结果跳到文件后自动用同一 query 触发当前文件搜索。
