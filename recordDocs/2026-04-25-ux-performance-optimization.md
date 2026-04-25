# UX 与性能优化方案实现

## 背景 / 问题（Context）

PrismMD 作为 AI-native Markdown 阅读器已具备完整功能，但在日常使用体验上存在以下短板：
- **单文件模式**：只能打开一个文件，无法同时处理多个文档
- **固定侧边栏宽度**：左/右/Agent 侧边栏宽度硬编码，无法调整
- **布局不持久**：侧边栏开关/宽度状态在重启后丢失
- **性能隐患**：AI 会话历史无界增长、搜索索引保留完整文件内容、大文件无保护
- **操作反馈缺失**：保存/错误等关键操作无可视反馈
- **导航不足**：无文件路径层级展示
- **MCP 可靠性**：子进程崩溃后无法自动恢复

## 设计决策（Design）

分 4 个独立可发版的阶段，按影响力/成本比排序：

1. **Phase 1（性能护栏）**：零 UI 变更的安全修复
2. **Phase 2（可调侧边栏）**：ResizeHandle 组件 + 布局持久化
3. **Phase 3（多标签页）**：Tab 数据模型 + TabBar + 兼容层
4. **Phase 4（反馈增强）**：Toast 通知 + 面包屑 + MCP 存活检查

关键决策：多标签页采用兼容层模式——新增 `tabs[]` + `activeTabId` 作为数据源，保留 `currentFilePath`/`currentContent` 等字段自动同步，所有现有消费者无需修改。

## 改动清单（Changes）

### Phase 1: 性能安全护栏

| 文件 | 改动 |
|------|------|
| `electron/ipc/fileHandlers.ts:71-98` | 新增 `fs.stat()` 文件大小校验：文本 50MB / 二进制 200MB 上限 |
| `electron/ipc/fileHandlers.ts:100` | 目录树刷新深度 `Infinity` → `10` |
| `src/store/agentStore.ts:254-261` | AI 上下文限制为最近 40 条消息（UI 历史保持完整） |
| `src/store/searchIndexStore.ts:87-102` | 搜索索引 bodies 只保留前 500 字符截断版本 |

### Phase 2: 可调侧边栏 + 布局持久化

| 文件 | 改动 |
|------|------|
| `src/components/layout/ResizeHandle.tsx` | **新建**：4px 拖拽手柄组件，支持 left/right/agent 三侧，宽度 clamp [160, 500] |
| `src/store/uiStore.ts` | 新增 `leftSidebarWidth`/`rightSidebarWidth`/`agentSidebarWidth` 状态；`loadLayout()`/`saveLayout()` 持久化方法；侧边栏 toggle/pin 操作自动 debounce 300ms 保存 |
| `src/components/layout/AppShell.tsx` | 侧边栏宽度从 store 读取；三个侧边栏各插入 `<ResizeHandle />` |
| `src/App.tsx` | 初始化时调用 `loadLayout()` |

### Phase 3: 多标签页支持

| 文件 | 改动 |
|------|------|
| `src/store/fileStore.ts` | 新增 `Tab` 接口、`tabs[]`/`activeTabId` 状态、`syncFromActiveTab()` 兼容层；`openFile` 改为创建/切换标签；新增 `closeTab`/`switchTab`/`moveTab`/`closeOtherTabs`/`closeTabsToRight`/`reopenClosedTab` action；`deleteItem`/`renameItem` 同步更新所有受影响标签 |
| `src/components/layout/TabBar.tsx` | **新建**：标签栏组件——文件名+图标+关闭按钮+修改状态、拖拽排序、中键关闭、横向滚动、右键菜单 |
| `src/components/layout/AppShell.tsx` | 主内容区上方插入 `<TabBar />` |
| `src/App.tsx` | 新增快捷键：Cmd+W 关闭、Cmd+Shift+T 重开、Cmd+1~9 按序号切换、Ctrl+Tab 循环切换 |
| `src/hooks/useFileWatcher.ts` | 文件变更检测扩展到所有打开标签（非仅当前） |
| `src/i18n/locales/en.json` | 新增 `tabs.*` 翻译 key |
| `src/i18n/locales/zh.json` | 新增 `tabs.*` 翻译 key |

### Phase 4: 反馈与导航增强

| 文件 | 改动 |
|------|------|
| `src/store/toastStore.ts` | **新建**：全局 Toast store，`show(tone, message, duration)` + 自动 dismiss |
| `src/components/ui/Toast.tsx` | 复用已有 `ToastHost` 组件（无修改） |
| `src/App.tsx` | 挂载 `<ToastHost>` 到根组件 |
| `src/store/editorStore.ts` | 保存成功/失败时触发 toast |
| `src/store/fileStore.ts` | 打开文件失败时触发 toast |
| `src/components/layout/TabBar.tsx` | 复制路径时触发 toast |
| `src/components/layout/Breadcrumb.tsx` | **新建**：面包屑导航组件——相对于打开文件夹的路径段、点击展开文件树、复制路径 |
| `src/components/layout/AppShell.tsx` | TabBar 下方插入 `<Breadcrumb />` |
| `electron/services/mcpService.ts` | `ensureStarted()` 新增 `isAlive()` 检查死亡 subprocess 并自动重生；`callTool()` 新增传输错误单次重试 |

## 验证方式（Verification）

- `npm run typecheck` 通过 ✅
- `npm run dev` 构建成功并可启动 ✅
- 各阶段功能需手动验证：
  - Phase 1：尝试打开 >50MB 文件确认错误提示；发送 50+ 条 AI 消息确认不溢出；检查搜索索引内存
  - Phase 2：拖拽侧边栏宽度；重启确认恢复
  - Phase 3：多文件标签切换/关闭/重排/快捷键
  - Phase 4：保存文件确认 toast；面包屑点击展开；MCP 进程恢复

## 后续项（Follow-ups）

- 键盘快捷键速查表（`?` 弹窗或设置页 tab）
- 分屏模式（水平/垂直两个文件并排）
- 文件树中显示修改状态标记（badge）
- Tooltip 组件在所有 icon-only 按钮上统一使用
