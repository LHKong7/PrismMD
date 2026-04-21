# 添加"新建文件"功能

## 背景 / 问题（Context）

PrismMD 能打开和编辑已有文件，但无法从零创建新文件。用户必须先在文件管理器中创建文件，再回到 PrismMD 打开。添加"新建文件"功能让编辑工作流自包含。

## 设计决策（Design）

使用系统原生 Save 对话框（`dialog.showSaveDialog`）让用户选择路径和文件名，创建空文件后立即进入编辑模式。最大限度复用已有基础设施：`fs:write-file` 写磁盘、`fileStore.openFile()` 加载、`editorStore.setEditing(true)` 进入编辑。

## 改动清单（Changes）

### 后端

- `electron/ipc/fileHandlers.ts` — 新增 `dialog:new-file` IPC handler，显示 Save 对话框（默认 .md，也支持 .json/.csv），创建空文件并返回路径
- `electron/preload.ts` — 新增 `newFileDialog(defaultDir?)` 方法
- `src/types/electron.d.ts` — 新增 `newFileDialog` 类型声明

### 前端

- `src/store/fileStore.ts` — 新增 `createNewFile(defaultDir?)` action，调用对话框 → 打开文件 → 进入编辑模式
- `src/components/reader/DocumentReader.tsx` — 欢迎页添加 "New File" 按钮（`FilePlus` 图标），作为首要操作
- `src/components/commandpalette/CommandPalette.tsx` — 命令面板添加 "New File" 命令
- `src/components/filetree/FileTreeNode.tsx` — 右键文件夹菜单添加 "New File" 选项，默认目录为当前文件夹；文件夹即使未开启 InsightGraph 也显示右键菜单
- `src/App.tsx` — 添加 `Cmd/Ctrl+N` 快捷键

### i18n

- `src/i18n/locales/en.json` — 添加 `app.welcome.newFile`、`commandPalette.newFile`、`filetree.newFile`
- `src/i18n/locales/zh.json` — 对应中文翻译

## 验证方式（Verification）

1. TypeScript 编译通过（`npx tsc --noEmit`）
2. 欢迎页 → 点击 "New File" → Save 对话框 → 选择路径 → 文件在编辑模式打开
3. 命令面板 → 搜索 "New File" → 执行 → 同上
4. 文件树 → 右键文件夹 → "New File" → 对话框默认目录为该文件夹
5. `Cmd/Ctrl+N` → 触发新建文件流程
6. 取消对话框 → 无副作用
7. 新建后输入内容 → `Cmd/Ctrl+S` 保存 → 内容写入磁盘
