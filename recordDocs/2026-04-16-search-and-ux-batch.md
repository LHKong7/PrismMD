# 2026-04-16 — 全文搜索 + UX 优化批次

## 背景 / 问题（Context）

仓库 `CommandPalette`（Cmd+P）只支持文件名搜索，**缺少跨文档的正文检索**——对一个 Markdown/PDF/CSV 知识库应用是关键缺口。同时调研发现若干高 ROI 的小问题：
- `useMarkdown` 把处理错误吞掉，UI 卡在 "Processing…"。
- `XlsxViewer` 解析失败静默 `return null`，画布空白无任何反馈。
- 渲染异常会让整个主视图崩溃，没有 ErrorBoundary 兜底。
- PDF 没有"跳转到指定页"输入框，只能 prev/next 翻页。
- `useEntityLinking` 每次切换文档都触发一次实体名 IPC + trie 遍历，没有缓存。

## 设计决策（Design）

1. **全文搜索**：选择 **MiniSearch + 懒加载内存索引**。首次打开 CommandPalette 触发 `build()`，`Promise.all` 批量 25 异步读取所有 `.md/.markdown/.mdx/.csv/.txt`。索引字段 `name`(boost 3) + `body`，开启 `prefix + fuzzy 0.2`。`lastBuildKey = openFolders[i].path:fileCount` 拼串，文件树变更时通过 fileStore 在 `openFolder/closeFolder/refreshFolder/refreshAllFolders` 末尾调用 `invalidate()`。
   - PDF/XLSX 内容抽取暂列 follow-up（需 `pdfjs.getTextContent` + `xlsx.utils.sheet_to_csv`）。
   - cmdk 默认按 value 模糊匹配过滤；为让我们预先排好序的命中通过，每个 `Command.Item.value` 拼上 `${search} ${path}` 让 cmdk 必然命中。
2. **错误反馈**：抽 `ErrorBanner` 共享组件统一 amber/red 样式；`ErrorBoundary` 包在 `AppShell` 主视图（同时覆盖 GraphView 与 DocumentReader），避免在多处重复包裹。
3. **PDF 跳页**：`<input type="number">` + 受控本地 state，仅在 Enter / blur 时 `clamp + setPageNumber`，`useEffect` 监听外部 `page` 变化回写。
4. **EntityLinking 缓存**：在 `insightGraphStore` 加 `entityNamesCache: Record<reportId|'__global__', string[]>` + `entityNamesCacheStamp`；ingest 完成 / `clearGraphCaches` 自增 stamp。`useEntityLinking` 用 `getState()` 读 cache（避免把 cache 自身放进 deps 引起循环），effect deps 改用 stamp 触发重取。

## 改动清单（Changes）

**新增**
- `src/lib/fileTree.ts` — `flattenFiles / fileName / fileExt` 工具，CommandPalette + searchIndexStore 共用。
- `src/store/searchIndexStore.ts` — MiniSearch 懒索引 store。
- `src/components/reader/components/ErrorBanner.tsx` — 共享 inline / fullPage 错误条。
- `src/components/ErrorBoundary.tsx` — 渲染异常兜底。
- `recordDocs/2026-04-16-search-and-ux-batch.md` — 本文档。

**修改**
- `package.json` — 新增 `minisearch ^7.1.0`。
- `src/store/fileStore.ts` — 4 处文件夹变更后调 `invalidateSearchIndex()`（懒 import 避免环依）。
- `src/components/commandpalette/CommandPalette.tsx` — 接 `searchIndexStore`，新增 "Content Matches" 组（含 indexing / 无匹配状态），删除内联 `flattenFiles / fileName`。
- `src/i18n/locales/{en,zh}.json` — 新 keys：`commandPalette.searchResults / indexing / noContentMatch`、`reader.markdown.errorTitle`、`reader.pageInputAria`、`reader.errorBoundaryTitle/Retry`。
- `src/hooks/useMarkdown.ts` — `UseMarkdownResult` 加 `error`，catch 内 setError。
- `src/components/reader/MarkdownReader.tsx` — `error` 时渲染 `ErrorBanner`。
- `src/components/reader/XlsxViewer.tsx` — `parseError` state，迁移失败 fallback 到 `ErrorBanner`。
- `src/components/reader/PdfViewer.tsx` — 新增 `PageInput` 子组件，工具栏页码改为输入框 + " / N"。
- `src/components/layout/AppShell.tsx` — `<ErrorBoundary>` 包 GraphView/DocumentReader 切换处。
- `src/store/insightGraphStore.ts` — `entityNamesCache + entityNamesCacheStamp + setEntityNames`，`ingestFile` 完成 + `clearGraphCaches` 自增 stamp。
- `src/hooks/useEntityLinking.ts` — 命中缓存则跳过 IPC，effect deps 用 stamp 触发重取。

## 验证方式（Verification）

- `npm run typecheck` — pass。
- 手测路径（建议一次性走一遍）：
  1. **全文搜索**：打开含多 `.md` 的文件夹，Cmd+P 输入正文中独有词 → "Content Matches" 出现匹配 + 摘要。新建/删除文件触发 watcher → 再次搜索看到更新。
  2. **Markdown 错误**：写一段会让 unified 抛错的 markdown（如非法 frontmatter）→ 显示红色 `ErrorBanner`，不再卡 "Processing…"。
  3. **XLSX 错误**：用一个损坏的 .xlsx → ErrorBanner 显示真实异常 message。
  4. **ErrorBoundary**：在 MarkdownReader 或 GraphView 内手动 `throw` → 不白屏，弹错误条 + Try again 按钮。
  5. **PDF 跳页**：100 页 PDF 输入 `42` + Enter → 跳 42；输入 `999` → clamp 100；prev/next 按钮值同步。
  6. **EntityLinking 缓存**：开启 entityLinking，DevTools Network/IPC 监控 `insightGraphEntitiesForReport` —— 文档 A 首开 1 次，切到 B 再回 A 不再触发；ingest 新文档后 stamp 自增 → 下次打开重 fetch。

## 后续项（Follow-ups）

- 全文索引扩展 PDF/XLSX 内容抽取。
- 考虑将索引 body 存到 Worker，避免主线程卡顿（当前文件量小可接受）。
- ErrorBoundary 可补一个上报 hook 给未来 telemetry。
- EntityLinking trie 自身可缓存（当前 cache 仅覆盖 IPC 取名字这一步，trie 构建仍每次跑）。
