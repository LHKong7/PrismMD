# 工作区文件夹（Folder）概念

## 背景 / 问题（Context）

工作区原本是 Notion 式的「页面套页面」模型：`pages` 表里任意一个页面都可以通过
`parent_id` 成为另一页面的父节点，但**没有真正的「文件夹」实体**——没有一种纯粹用于
*分组* 的容器。表现为：

- 想把多个文件归到一组，只能新建一个空页面当父节点，但这个空页面本身仍是「文档」：
  点击它会打开一个空编辑器，能被导出、能进搜索、能加入知识库，语义很别扭。
- `importFolder` 导入目录时，就是用这种「空页面冒充文件夹」的办法分组的。

用户诉求：**新增一个文件夹概念，能把多个文件归并到一个分组里。**

## 设计决策（Design）

在已有 `pages` 表上增加一个布尔列 **`is_folder`**，把「文件夹」建模为
`is_folder = 1` 的页面行——一个**纯容器**：不可作为文档打开、不进搜索、不可导出、
不可加入知识库。这样做的权衡：

- **复用统一树**：文件夹与文件同处一棵有序兄弟列表，沿用现成的
  `parent_id` / `position` / `movePage` / `rename` / `icon` / 软删除 / 会话恢复 等全部机制，
  不引入第二套「文件夹表 + 两套排序」。相较「独立 folders 表」方案改动面最小、回归风险最低。
- **在源头设防**：与其在十几个消费方逐个打补丁，不如在**两个源头**收口——
  1. `openPage` 拿到页面后若 `isFolder` 则只展开、绝不建标签页；
  2. `searchPages` 的 SQL 直接 `is_folder = 0` 过滤。
  于是 Dashboard 最近列表、命令面板、相关栏、面包屑、各搜索框等都**自动**变得 folder-safe。
- **拖拽分组**：store 早有 `movePage`，但 UI 一直没有拖拽。要让「把已有文件归到一组」
  真正可用，给 `PageTree` 增加 HTML5 拖拽——把节点拖到文件夹上即移入；拖到空白区移回顶层；
  并阻止把文件夹拖进自己的子树（防环）。

### 迁移（关键）

`CREATE TABLE IF NOT EXISTS` 不会给**已存在**的 `pages` 表补列，因此用
`PRAGMA table_info(pages)` 判断后 `ALTER TABLE … ADD COLUMN is_folder INTEGER NOT NULL DEFAULT 0`
幂等补列（常量默认值 0 满足 SQLite 对 NOT NULL 新列的要求）。`getDb` 缓存连接，迁移每进程只跑一次。

## 改动清单（Changes）

**主进程 / 数据层**
- `electron/services/workspaceDb.ts`：建表加 `is_folder` 列；新增已存在库的 `ALTER TABLE` 迁移。
- `electron/services/documentService.ts`：
  - `Page` / `PageTreeNode` / `PageSummary` 加 `isFolder`；`rowToPage` 映射 `is_folder`。
  - `createPage(..., isFolder=false)`：INSERT/返回值带上 `is_folder`。
  - `updatePage`：允许字段加入 `isFolder`。
  - `getPageTree` / `getAncestors` / `searchPages` 的 SELECT 与构造都带 `is_folder`；
    `searchPages` 额外 `is_folder = 0` 把文件夹排除出搜索。
  - `importFolder`：导入的目录用 `createPage(..., true)` 标成真文件夹。
  - `exportMarkdown`：文件夹直接抛错（不可导出）。
- `electron/ipc/workspaceHandlers.ts`：新增 `workspace:create-folder`。
- `electron/preload.ts` + `src/types/electron.d.ts`：新增 `workspaceCreateFolder`；
  `WorkspacePage` / `PageTreeNode` / 祖先 / 搜索返回类型补 `isFolder`；`workspaceUpdatePage` 允许 `isFolder`。

**渲染层**
- `src/store/workspaceStore.ts`：
  - 新增 `createFolder`（建夹 → loadTree → 展开父与自身；不打开、不重命名，由调用方决定）。
  - 重写 `openPage`：先取页面，`isFolder` 则展开并返回（在动到编辑器状态、建标签页之前），
    使所有 `openPage` 调用方一律 folder-safe。
- `src/components/filetree/PageTree.tsx`：
  - 文件夹图标（`Folder`/`FolderOpen`）、点击=展开、chevron 对文件夹常显。
  - 上下文菜单按 `isFolder` 分支：文件夹=新建页面/新建文件夹/重命名/[移到顶层]/删除；
    页面保留导出 + 加入知识库；两者在有父节点时提供「移到顶层」。
  - **拖拽**：节点可拖；只有文件夹是放置目标（移入，带防环 `collectSubtreeIds`）；
    拖到树空白处移回顶层；拖拽中文件夹高亮（accent inset 边框）。
- `src/components/layout/LeftSidebar.tsx`：标题栏新增「新建文件夹」按钮（`FolderPlus`），建后进入内联重命名。
- `src/components/workspace/Dashboard.tsx`：`flattenPages` 过滤掉文件夹，「最近」只列文档。
- `src/components/layout/Breadcrumb.tsx`：`Crumb` 带 `isFolder`，文件夹祖先渲染为不可点的纯文本。
- `src/lib/workspace/diaryService.ts`：日记根「Diary」改用 `createFolder` 创建（容器而非空文档）。
- `src/i18n/locales/{en,zh}.json`：新增 `sidebar.newFolder` 与完整 `pagetree.*`（含此前仅靠英文兜底、
  中文缺失的菜单键），en/zh 同步。

## 验证方式（Verification）

- 类型检查：`tsc -p tsconfig.web.json` 与 `tsc -p tsconfig.node.json` 在**本次改动涉及的所有文件**
  上零报错（仓库其余 pre-existing 报错与本改动无关）。
- 手动：
  - 侧栏「新建文件夹」→ 出现文件夹（文件夹图标、可内联命名）。
  - 把已有文件拖到文件夹上 → 文件归入该文件夹（自动展开）；拖到空白处 → 移回顶层。
  - 点击文件夹 → 展开/收起，不再打开空编辑器；文件夹不出现在搜索/最近；右键无导出/加入知识库。
  - 文件夹拖进自己的子文件夹 → 被拒（防环）。
  - 重启后已存在的旧库正常补列、不崩溃。

## 后续项（Follow-ups，可选）

- 兄弟节点间的精细**重排序**（拖到某节点上/下方插入到指定 position）暂未做，当前拖拽只做
  「移入文件夹 / 移回顶层」，移入时追加到末尾。
- 既有用户的旧「Diary」页面仍是普通页面（迁移不会回填 `is_folder`）；仅新用户的 Diary 根是真文件夹。
- 文件夹的删除沿用页面软删除（级联子节点），未来可加二次确认文案区分「文件夹及其内容」。
