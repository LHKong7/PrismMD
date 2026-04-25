# 文件树侧边栏 — 完整文件/文件夹操作

## 背景 / 问题（Context）

PrismMD 文件树只能打开文件和展开/折叠目录，缺少常见的文件管理操作（新建文件夹、重命名、删除、在系统资源管理器中显示、复制副本）。用户需要离开应用才能完成这些操作，打断工作流。

## 设计决策（Design）

按用户价值优先级实现五项操作：新建文件夹 > 重命名 > 删除 > 系统中显示 > 复制副本。

- **删除** 使用 `shell.trashItem()` 移至系统废纸篓而非永久删除，安全可恢复
- **重命名** 在文件树中内联编辑（input 替换 label），匹配 VS Code 行为（blur 时提交）
- **新建文件夹** 创建后自动进入内联重命名，体验与 VS Code 一致
- **右键菜单** 重构为使用已有的 `<ContextMenu>` 组件（portal + keyboard nav），所有节点（文件和文件夹）均有右键菜单
- **删除确认** 使用已有的 `<Dialog>` 组件，全局挂载一次

## 改动清单（Changes）

### 后端 IPC

- `electron/ipc/fileHandlers.ts` — 新增 6 个 handler：
  - `fs:create-directory` — `fs.mkdir`
  - `fs:rename` — `fs.rename` + suppressNextChange
  - `fs:trash` — `shell.trashItem`
  - `fs:duplicate-file` — `fs.copyFile`
  - `fs:show-in-folder` — `shell.showItemInFolder`
  - `fs:exists` — `fs.access` 检查路径是否存在

### Preload + 类型

- `electron/preload.ts` — 新增 6 个 bridge 方法
- `src/types/electron.d.ts` — `ElectronAPI` 接口新增 6 个签名

### Store

- `src/store/fileStore.ts` — 新增状态：`renamingPath`, `autoExpandPath`, `pendingDelete`；新增 action：`createFolder`, `renameItem`, `deleteItem`, `setPendingDelete`, `cancelDelete`, `duplicateFile`, `showInFolder`, `setRenamingPath`, `setAutoExpandPath`

### 文件树组件

- `src/components/filetree/FileTreeNode.tsx` — 重构为使用 `<ContextMenu>` 组件；实现内联重命名（input + Enter/Escape/blur）；F2 快捷键触发重命名；Delete/Backspace 触发删除确认；文件夹菜单：新建文件、新建文件夹、重命名、删除、在系统中显示、索引文件夹；文件菜单：重命名、复制、删除、在系统中显示、存入图谱
- `src/components/filetree/FileTree.tsx` — 监听 `autoExpandPath` 自动展开新建文件夹
- `src/components/filetree/DeleteConfirmDialog.tsx` — **新文件** — 使用 Dialog + Button 组件的删除确认对话框

### 布局

- `src/components/layout/LeftSidebar.tsx` — 侧边栏头部新增 `FolderPlus` 按钮
- `src/components/layout/AppShell.tsx` — 全局挂载 `DeleteConfirmDialog`

### 命令面板

- `src/components/commandpalette/CommandPalette.tsx` — 新增 5 个命令：新建文件夹、重命名文件、复制文件、删除文件、在 Finder 中显示

### i18n

- `src/i18n/locales/en.json` — filetree 命名空间 +12 个 key；commandPalette +5 个 key
- `src/i18n/locales/zh.json` — 对应中文翻译

## 验证方式（Verification）

1. TypeScript 编译通过（`npx tsc --noEmit`）
2. 右键文件夹 → 新建文件夹 → 内联重命名 → Enter 确认
3. 右键文件/文件夹 → 重命名 → 输入新名称 → Enter/blur 提交
4. F2 快捷键 → 触发重命名
5. 右键 → 删除 → 确认对话框 → 移至废纸篓
6. Delete/Backspace 键 → 触发删除确认
7. 右键 → 在 Finder/Explorer 中显示 → 系统文件管理器打开
8. 右键文件 → 复制 → 副本创建并打开
9. 侧边栏头部 FolderPlus 按钮 → 在第一个打开文件夹中新建子文件夹
10. 命令面板 → 搜索各新命令 → 正常执行
