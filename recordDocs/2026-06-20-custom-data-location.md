# 自定义数据存储位置

## 背景 / 问题（Context）

PrismMD 的全部数据（`workspace.db` 页面/标注/摘要、`prismmd-settings.json` 设置含 API key、
`sessions/`、`memory/`、`knowledge/`、`plugins/`）都硬编码存放在 Electron 的 `userData` 目录下
（macOS `~/Library/Application Support/prismmd/`）。用户希望**能自定义存储位置**。

## 设计决策（Design）

**先有鸡还是先有蛋**：自定义路径的偏好本身不能存在 `userData` 里——因为我们要在解析 `userData`
之前就读到它。所以把它单独存进一个极小的 bootstrap 文件 `data-location.json`，**固定放在默认
`userData` 目录**，启动时读取。

**关键时序**：`electron-store`（设置）在 `settingsStore.ts` **import 时**就 `new Store()` 解析路径；
`workspaceDb.ts` 的 `DB_PATH` 也是 **模块顶层常量**、import 时解析。因此 `app.setPath('userData', …)`
必须在这些模块被 import **之前**执行。做法：新增 `electron/bootstrap.ts`，在其顶层
`app.setName()` + `applyDataLocation()`，并把它设为 `main.ts` 的**第一个 import**——ES module 按源码
顺序求值，确保它先于 `./ipc`（间接 import settingsStore/workspaceDb）运行。

**迁移**：切换位置时若勾选「迁移现有数据」，先 `closeDb()`（让 WAL/SHM 落盘一致），再用
`fs.cpSync(..., {recursive,force})` 把已知数据项复制到目标目录；写入/清除 bootstrap 记录；**重启应用**
生效（路径只在启动时解析）。重置为默认 = 目标为默认目录 + 清除 bootstrap。

## 改动清单（Changes）

- `electron/services/dataLocation.ts`（新增）：`applyDataLocation()`（boot 时捕获默认目录并按 bootstrap
  重定向 userData）、`getDataLocationInfo()`、`changeDataLocation(target, migrate)`（关库→复制→记录）、
  `revealDataDir()`、`relaunchApp()`。bootstrap 文件恒在默认目录。
- `electron/bootstrap.ts`（新增）：顶层 `app.setName(appConfig.name)` + `applyDataLocation()`。
- `electron/main.ts`：把 `import './bootstrap'` 提为**第一个 import**；删除原 `app.setName()`（移入 bootstrap）。
- `electron/ipc/dataLocationHandlers.ts`（新增）+ `electron/ipc/index.ts`：注册
  `data-location:get/choose/apply/reveal/relaunch`。
- `electron/preload.ts` + `src/types/electron.d.ts`：暴露 `dataLocationGet/Choose/Apply/Reveal/Relaunch`。
- `src/components/settings/SettingsPanel.tsx`：新增「Storage」标签页（`HardDrive` 图标）+ `StorageSettings`
  组件——显示当前位置、打开文件夹、更改位置（选目录→可勾选迁移→应用并重启）、自定义时可恢复默认。
- `src/i18n/locales/{en,zh}.json`：`settings.storage.*`，en/zh 对齐。

## 验证方式（Verification）

- 类型检查：web `tsc -p tsconfig.web.json` 总数 **43**（= baseline，新增 UI 代码 0 错）；
  electron `tsc -p tsconfig.node.json` 总数 **3**（= 既有 baseline：main.ts AppSettings cast ×2、
  insightGraphService neo4j 命名空间；**新增的 dataLocation/bootstrap/handlers/preload 0 错**）。
- JSON：en/zh 均解析通过。
- 手动（需重启 dev 进程，改动在 `electron/` 主进程）：设置 → Storage → 更改位置 → 选文件夹 →
  勾选「迁移现有数据」→ 应用并重启 → 重启后数据在新目录、`data-location.json` 记录于默认目录；
  恢复默认同理。

> 注：本功能改动 `electron/` 主进程，**必须重启 `npm run start`（dev）才生效**，热重载不覆盖主进程。

## 后续项（Follow-ups，可选）

- 迁移后旧目录的数据未自动删除（保守起见保留为备份）；可加「迁移成功后清理旧目录」选项。
- 切换/重启之间若渲染层仍在写库，可能在旧路径产生一次零散写入（已通过 apply 后立即 relaunch 收窄窗口）；
  如需更严可在 apply 前先让渲染层 flush + 暂停自动保存。
- 目标目录已有同名数据时当前为 `force` 覆盖（「迁移」语义=以当前数据为准）；如需「用目标已有数据」可加分支。
