# 2026-04-14 · 从 MD Reader 扩成「我的资料库」

## 背景

InsightGraph SDK 已经支持 PDF / CSV / JSON / XLSX / Markdown，但 PrismMD
的 UI 只允许打开 `.md`，摄入也只能一次一篇。目标是把 reader 变成多格式
资料库，并让"整个文件夹入图谱"成为一级动作。

## 设计决策

- **格式调度以扩展名为主**。共享辅助 `src/lib/fileFormat.ts` 同时给
  渲染器和主进程使用（主进程那份是 `SUPPORTED_EXTENSIONS`，值保持
  一致即可）。不做 MIME 嗅探——Electron 场景下扩展名已足够可靠。
- **Binary 路径独立于 text 路径**。`fs:read-file` 保留 UTF-8 文本用，
  新增 `fs:read-file-bytes` 直接返回 `ArrayBuffer`，给 pdfjs-dist /
  SheetJS 零拷贝使用。`fileStore` 的 `currentContent`（text）与
  `currentBytes`（binary）分别持有内容，避免 base64 往返。
- **文件监听器只发路径不发内容**。之前发 UTF-8 内容在二进制文件上会
  损坏字节流；改成发路径后由渲染器的 `openFile` 按格式决定如何重读。
- **Viewer 拆分而不是超级组件**。`DocumentReader` 作为 router，按
  `currentFormat` 分发到 `MarkdownReader` / `JsonViewer` / `CsvViewer`
  / `XlsxViewer` / `PdfViewer`。Markdown 原有的 TOC、实体联动、摘要
  banner 等重功能继续只在 MarkdownReader 里跑。
- **表格类复用 `VirtualTable`**。tanstack-table + tanstack-virtual，
  行虚拟化够用；列不虚拟化以避免大量列变换带来的 reflow，大多数 CSV /
  XLSX 都在百列以内，横向滚动 + 单元格 ellipsis 更经济。
- **PDF 用分页而非连续滚动**。内存恒定、HiDPI 下仍清晰。研究工作流
  （浏览 → 决定是否入图谱）用分页已够，以后再加连续滚动也不难。
- **批量摄入单独建 store 而不是 IPC 队列**。SDK 本身串行工作，队列
  逻辑放在主进程并不带来真并发收益，反而要新增一套 IPC；放在渲染器
  `batchIngestStore` 里以 `ingestFile` 为单位串行推进、协作式 cancel
  即可，代码更少。允许进行中再次 append 新路径到队列尾。

## 改动清单（5 个 commit）

1. `4b61bb7` — 后端与 fileStore 接入多格式
   - `electron/services/fileTree.ts`: 文件树过滤扩展到 md / pdf / csv /
     json / xlsx / xls
   - `electron/ipc/fileHandlers.ts`: open-file dialog 加 filters；新增
     `fs:read-file-bytes` 返回 ArrayBuffer
   - `electron/services/fileWatcher.ts` + `onFileChanged`: 仅发路径
   - `src/lib/fileFormat.ts`: `detectFormat` / `kindOfFormat` /
     `ALL_SUPPORTED_EXTS`
   - `src/store/fileStore.ts`: `currentFormat` + `currentBytes`；
     `openFile` 按 kind 走 text / binary
   - `src/hooks/useFileWatcher.ts`: 变更事件触发 `openFile` 重读
   - `src/components/filetree/FileTreeNode.tsx`: 按格式选 icon，
     `canIngest` 扩到所有支持格式
   - `src/components/layout/LeftSidebar.tsx`: "Build Graph" 收集
     所有 ingestable 文件，不只限 md

2. `9f83e32` — DocumentReader router + JsonViewer
   - 新增 `src/components/reader/DocumentReader.tsx`（router + welcome
     + drag-drop）
   - 新增 `src/components/reader/JsonViewer.tsx`（react-json-view，
     监听 `.dark` class 切换主题）
   - `MarkdownReader` 去掉 welcome + drag-drop，只负责渲染 markdown
   - `AppShell` 接入 `DocumentReader`
   - CSV / XLSX / PDF 先留 placeholder
   - i18n: `reader.*` + welcome 文案更新

3. `163848a` — CsvViewer + XlsxViewer + VirtualTable
   - `src/components/reader/VirtualTable.tsx`: tanstack-table +
     tanstack-virtual，sticky 表头，ellipsis，空单元格 `—` 占位
   - CsvViewer: papaparse，警告内联展示，行×列摘要
   - XlsxViewer: SheetJS，sheet tab 切换，ragged row 对齐表头宽

4. `f8576a2` — PdfViewer (pdfjs-dist)
   - 分页渲染，scale = min(parentWidth / pageWidth, 2.5) × devicePixelRatio
   - Vite `?url` 注册 pdf.worker.min.mjs
   - cancel-on-unmount，切文件重置到第 1 页

5. (本次) — 批量摄入 + 文件夹右键
   - 新增 `src/store/batchIngestStore.ts`：队列 + 协作式 cancel +
     允许运行中 append
   - `FileTreeNode.tsx`: 文件夹右键 → "整个文件夹入图谱 (n)"，
     复用 `collectIngestableDescendants`
   - `LeftSidebar.tsx`: "Build Graph" 按钮改走 `batchIngestStore`
     （和右键走同一条队列）
   - `StatusBar.tsx`: 批量运行时显示进度条 + 取消；结束后显示
     成功/失败计数，可关闭
   - i18n: `filetree.ingestFolder` + `batchIngest.*`

## 依赖变更（`package.json`，需要 `npm install`）

dependencies:
- `@uiw/react-json-view` ^2.0.0-alpha.30  _(最初选了 `react-json-view@1.x`，
  但它 peerDeps 卡在 React 16/17，React 18 下会走到新 reconciler 的不兼容
  路径；改用 uiw 维护的分支，原生支持 React 18 + TS 类型随包发布)_
- `@tanstack/react-table` ^8.20.5
- `@tanstack/react-virtual` ^3.10.8
- `papaparse` ^5.4.1
- `xlsx` ^0.18.5
- `pdfjs-dist` ^4.10.38

devDependencies:
- `@types/papaparse` ^5.3.15

## 验证方式

1. `npm install` 安装新依赖。
2. 类型检查：`npx tsc --noEmit -p tsconfig.web.json` 应通过（只有一条
   既有的 baseUrl deprecation）。
3. 启动 app，打开一个混合文件夹（md + pdf + csv + json + xlsx）：
   - 文件树列出所有支持格式，图标随格式变化。
   - 点击 `.md` → MarkdownReader（原有功能全在）。
   - 点击 `.json` → JsonViewer 可折叠，畸形 JSON 有错误横幅 + 原文。
   - 点击 `.csv` → 虚拟滚动表格，表头 sticky，警告行内显示。
   - 点击 `.xlsx` → 顶部可切 sheet，空表有提示。
   - 点击 `.pdf` → 分页，prev/next 可用，HiDPI 下清晰。
4. 右键任意含支持文件的文件夹 → "整个文件夹入图谱 (n)"：StatusBar
   出现进度条；点 ✕ 能 cancel，当前文件完成后停止；结束后显示
   成功/失败计数，点 ✕ 关闭。
5. LeftSidebar 文件夹旁的 Database 按钮也走同一队列——在文件夹 A
   批量进行时点文件夹 B 的按钮应该追加到队列尾。
6. 回归：markdown 文件的 TOC / 实体联动 / 段落摘要不受影响；
   watch-file 变更时 md 文件会 live-update，pdf / xlsx 文件被修改时
   重新打开能看到新内容。

## 后续项

- pdfjs text layer（可选中文字、复制）未加，目前只 raster。
- CSV / XLSX 单元格点击跳转到图谱实体（需要 entity-linking hook 适配
  表格场景）。
- 批量摄入可加"真正的"后台 queue IPC + 多 worker 并发，当 SDK 允许
  并发写入时再做。
- 去重：批量里同名 / 同内容文件可做 skip hint。
