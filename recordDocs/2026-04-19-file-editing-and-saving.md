# File Editing & Saving

## 背景 / 问题（Context）

PrismMD 原本是一个只读 Markdown 阅读器，用户无法在应用内修改并保存本地文件。
用户希望能直接在应用内编辑文本格式文件（Markdown、JSON、CSV）并保存到磁盘。

## 根因分析 / 设计决策（Analysis / Design）

- **编辑器选型**：采用 CodeMirror 6，因其轻量、支持 Markdown/JSON 语法高亮、行号、
  撤销历史，且通过 `EditorView.theme()` 可读取 CSS 变量适配应用主题。
- **模式切换**：保留现有阅读体验，新增读/编辑双模式，通过 `Cmd/Ctrl+E` 或 TitleBar
  按钮切换。
- **状态管理**：新建独立 `editorStore`（Zustand），与 `fileStore` 职责分离——
  `fileStore` 是磁盘真相源，`editorStore` 是工作副本。
- **文件监听冲突**：主进程写入前调用 `suppressNextChange()` 抑制 chokidar 的下一次
  变更事件，避免保存后触发重新加载循环。
- **编辑范围**：仅支持文本格式（markdown, json, csv），二进制格式（pdf, xlsx）保持只读。

## 改动清单（Changes）

### 后端（Electron 主进程）

| 文件 | 改动 |
|------|------|
| `electron/ipc/fileHandlers.ts:69-72` | 新增 `fs:write-file` IPC handler，写入前调用 `suppressNextChange` |
| `electron/services/fileWatcher.ts` | 新增 `suppressedPaths` Set、`suppressNextChange()` 方法；修改 `watcher.on('change')` 检查抑制集合 |
| `electron/preload.ts:33-34` | 新增 `writeFile` bridge 方法 |

### 前端（React 渲染进程）

| 文件 | 改动 |
|------|------|
| `src/types/electron.d.ts:27` | `ElectronAPI` 接口新增 `writeFile` 类型声明 |
| `src/store/editorStore.ts` | **新建** — editing/editorContent/isDirty/savedContent 状态 + setEditing/toggleEditing/setEditorContent/saveFile/discardChanges/reset 动作 |
| `src/components/editor/CodeMirrorEditor.tsx` | **新建** — 通用 CodeMirror 6 编辑器组件，支持语言扩展和 CSS 变量主题 |
| `src/components/editor/MarkdownEditor.tsx` | **新建** — Markdown 专用编辑器包装 |
| `src/components/reader/DocumentReader.tsx` | 编辑模式时渲染编辑器组件替代阅读器 |
| `src/components/layout/TitleBar.tsx` | 新增 Pencil/BookOpen 编辑切换按钮 + `●` 脏标记 |
| `src/App.tsx` | 新增 Cmd+S（保存）、Cmd+E（切换编辑）快捷键 + beforeunload 未保存防护 |
| `src/hooks/useFileWatcher.ts` | 外部修改冲突时弹出确认对话框 |
| `src/store/fileStore.ts` | `openFile()` 中新增未保存编辑防护 + 切换文件后重置编辑器 |

### 依赖

新增 CodeMirror 6 系列包：`@codemirror/view`, `@codemirror/state`, `@codemirror/lang-markdown`, `@codemirror/lang-json`, `@codemirror/language`, `@codemirror/commands`, `@lezer/highlight`

## 验证方式（Verification）

1. `npx tsc --noEmit` — 零错误通过
2. `npx vite build --config vite.renderer.config.ts` — 构建成功
3. 功能验证：
   - 打开 .md 文件 → Cmd+E 进入编辑 → 修改内容 → Cmd+S 保存 → Cmd+E 切回阅读验证
   - 标题栏显示 `●` 脏标记，保存后消失
   - 切换文件/关闭窗口时弹出未保存确认
   - 外部修改文件时弹出冲突提示
   - JSON/CSV 文件同样可编辑保存

## 后续项（Follow-ups）

- 编辑器主题深度适配（暗色/亮色模式下的语法高亮颜色）
- 编辑模式下禁用 annotation 和 entity-linking（字符偏移会漂移）
- 保留 undo 历史跨模式切换（当前切换模式后丢失）
- StatusBar 在编辑模式下显示光标位置/行列号
