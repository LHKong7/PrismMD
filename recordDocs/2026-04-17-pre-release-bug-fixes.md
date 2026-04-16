# 2026-04-17 — 发版前的关键 Bug 收尾

## 背景 / 问题（Context）

计划发版。对近期落地的工作（全局全文搜索、文件内搜索、ErrorBanner 套件、EntityLinking 缓存）做了一轮定向审计，筛出 4 个会被用户直接撞到的 Bug。其余审计发现属于"理论上可能"或"仅 HMR 场景"，明确列为 follow-up，不在本次范围。

目标：RC 镜像里没有已知的视觉破损、过期状态、或静默失败。

## 设计决策（Design）

- **Bug 1 与 Bug 3 对称修：** 文件内搜索（`<mark class="in-file-match">`）和 EntityLinking（`<span class="ig-entity-wrap">`）都是对渲染后 DOM 做原地 TreeWalker 改写 —— 各自必须跳开对方和代码块，否则互相嵌套 / 清理不干净。两处的 skip 判定用同一组选择器 `pre, code, .ig-entity-wrap, mark.in-file-match`，任何一边未来再加 wrapper 都不会回归。
- **Bug 2 用 generation token 而非 AbortController：** `build()` 内部的 IPC 读取不支持取消 —— 真正要做的是"别让完成的 build 盖掉已 invalidate 的状态"，所以只在最终 `set(...)` 前比对一个模块级的 `buildGeneration` 即可。比改签整条读取链清爽很多。
- **Bug 4 的错误通道用 `openError` state 而非 toast：** 既然 `ErrorBanner` 已经是共享组件，把错误绑在 `fileStore` 上由 `DocumentReader` 渲染最直接；错误文案前缀文件路径，用户一眼能看出哪条路径失败。保留"不污染 recentFiles、不覆盖当前文档"的守则。

## 改动清单（Changes）

**修改**
- `src/hooks/useInFileSearch.ts:48-60` — TreeWalker `acceptNode` 跳过 `pre, code, .ig-entity-wrap, mark.in-file-match`。修掉"搜索命中代码块把 hljs 高亮 DOM 搅碎"的视觉 Bug。
- `src/store/searchIndexStore.ts` — 新增模块级 `let buildGeneration`；`build()` 入口 `++buildGeneration` 取 gen，`invalidate()` 也 `++`；最终成功/失败 `set` 前 `if (gen !== buildGeneration) return`。修掉"build 过程中换文件夹，旧索引覆盖新状态"的竞态。
- `src/lib/graph/entityHighlighter.ts:115-125` — `isSkippable` 新增 `tag === 'MARK' && classList.contains('in-file-match')`。修掉"ingest 触发 re-link 时嵌套包装到搜索 mark 内部"。
- `src/store/fileStore.ts` — `FileStore` 新增 `openError: string | null` + `clearOpenError`；`openFile` / `openFolder` / `refreshFolder` / `refreshAllFolders` 全部 try/catch 包住 IPC，失败时写 `openError`；`openFile` 失败不再污染 `currentFilePath` / `recentFiles` / `watchFile`。
- `src/components/reader/DocumentReader.tsx` — 订阅 `openError`，在欢迎页与正文上方渲染 inline `<ErrorBanner severity="error" fullPage={false} />`；外层改 `flex flex-col` 以便 banner 与主体共存不挤压。
- `src/i18n/locales/{en,zh}.json` — 新增 `reader.openError.title`。

## 验证方式（Verification）

- `npm run typecheck` — pass。
- 手测（按 CLAUDE.md 启 dev server 一轮）：
  1. **Bug 1**：含 ```` ```ts ```` 代码块的 md，Cmd+F 搜 `const` → 代码块视觉完好，仅正文 `const` 被黄高亮。
  2. **Bug 2**：打开文件夹 A → Cmd+P 触发 `build()`（status: building）→ 立即关掉 A 或新增 B → 等 build 返回 → 再打开 palette 输入 → 仅返回当前文件夹的命中，不会有 A 的残留。
  3. **Bug 3**：打开 KG + entityLinking → 打开已 ingest 文档 → Cmd+F 搜常用词 → 触发另一个文档 ingest（`entityNamesCacheStamp` bump）→ 关搜索 → `<mark>` 被 unwrap 干净，没有游离的 `ig-entity-wrap`。
  4. **Bug 4**：Finder 删掉某文件 → Recent Files 点击它 → `ErrorBanner` 显示 `路径: 错误信息`；阅读器仍停在前一个文档；Recent Files 不被"刷新"。

## 后续项（Follow-ups）

- `insightGraphStore` 的 `onInsightGraphProgress` 订阅没有 cleanup —— 单例 store 生命周期内只订阅一次，生产环境无感，HMR 开发时会累积。优先级低。
- `searchIndexStore` 的 `__bodies` 把全文再存一份用于生成 snippet，大仓库会双倍占内存。等到有真实用户反馈再优化成按需 re-read。
- 在非 Markdown 视图（PDF / XLSX / CSV / JSON）里按 Cmd/Ctrl+F 会被系统/浏览器 find 接管。文件内搜索扩到其他格式是独立的 v2 工作。
