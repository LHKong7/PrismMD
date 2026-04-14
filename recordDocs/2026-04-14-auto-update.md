# 2026-04-14 · 自动更新：update-electron-app + GitHub Releases

## 背景

用户装一次就不该再手动跑来下 DMG / setup.exe。需要接入自动更新链路，
通过 GitHub Releases 作为分发源。

## 设计决策

### 为什么不用 `electron-updater`

用户最初问的是 `electron-updater + GitHub Releases`，但项目用的是
**electron-forge**（不是 electron-builder），forge 的 makers
（DMG / Squirrel / ZIP / Deb）**不产 `latest.yml` 系列元数据**，而
`electron-updater` 严格依赖这些 YAML。硬凑需要：
- 自写 forge `postMake` hook 生成 `latest-mac.yml` / `latest.yml` /
  `latest-linux.yml`，包含每个 artifact 的 sha512 + size + version
- Publisher 上传 YAML 到每个 Release
- 任何 maker 输出变动都要同步改 hook

维护成本远大于收益。经与用户确认，改走 **forge 官方推荐路径**：
`update-electron-app` 包 + Electron 内建 `autoUpdater` + Electron 官方
`update.electronjs.org` 反代（它直接读 GitHub Releases API 拿 assets，
自己合成 per-platform 更新描述，应用侧零 YAML 维护）。

### Publisher

`@electron-forge/publisher-github` 挂在 `forge.config.ts`，
`npm run publish` 时 Forge 自动调 GitHub API 创建 Release 并上传所有
maker 产出的 artifact。配 `draft: true` 避免误发——上传后是 draft，
在 GH 页面上手动 publish 才对外可见。

### 更新 UX

- **被动通道**：下载完成后 StatusBar 右侧出现一颗"Update ready"彩色
  按钮。点击即 `quitAndInstall`，Electron 自动重启。
- **主动通道**：Settings → About & Updates，显示当前版本 + 最近检查
  状态 + "Check now" / "Restart & install" 按钮。
- **不打扰原则**：`notifyUser: false` 关掉 `update-electron-app` 内建
  的系统弹窗——让我们自己的 in-app UI 来讲更新这件事。检查中 / 已是
  最新 两个状态不在 StatusBar 上显示（噪音），只在 About 页展示。
- **Dev / Linux 可见的降级**：`app.isPackaged === false` 或
  `process.platform === 'linux'` 时主进程直接 no-op，About 页显示
  "dev / unsupported" 灰色 banner，避免一个点不响应的按钮。

## 改动清单

- `package.json`
  - `repository` 字段加上（publisher 和 update-electron-app 都会读）
  - `scripts.publish` = `electron-forge publish`
  - 新增 dep `update-electron-app ^3.1.1`
  - 新增 devDep `@electron-forge/publisher-github ^7.11.1`
- `forge.config.ts`：注册 `PublisherGithub({ owner, name, draft: true })`
- `electron/services/updaterService.ts`（新）
  - `initAutoUpdater()`：dev / linux 直接跳过；否则调
    `updateElectronApp({ updateSource: ElectronPublicUpdateService,
    repo: 'lhkong7/prismmd', updateInterval: '1 hour', notifyUser: false })`
  - 订阅 `autoUpdater` 的 `checking-for-update` / `update-available` /
    `update-not-available` / `update-downloaded` / `error` 事件，统一
    `broadcast()` 成 `updater:event` IPC 送给渲染器
  - 暴露 `checkForUpdatesNow()` / `quitAndInstall()` / `getCurrentVersion()`
- `electron/ipc/updaterHandlers.ts`（新）：
  `updater:current-version` / `updater:last-error` / `updater:check-now` /
  `updater:quit-and-install`
- `electron/ipc/index.ts`：注册 handlers
- `electron/main.ts`：`whenReady` 里 `initAutoUpdater()`
- `electron/preload.ts`：暴露 `updaterCurrentVersion` / `updaterCheckNow`
  / `updaterQuitAndInstall` / `onUpdaterEvent`
- `src/types/electron.d.ts`：对应 TS 类型
- `src/store/updaterStore.ts`（新）：zustand store 存当前 kind + 版本
  + 错误 + 最近事件时间；提供 `checkNow` / `quitAndInstall` 包装
- `src/hooks/useUpdaterBridge.ts`（新）：订阅 IPC 事件 → 灌进 store
- `src/App.tsx`：`useUpdaterBridge()` 挂载
- `src/components/layout/StatusBar.tsx`：当 `kind === 'downloaded'`
  时右侧出现 "Update ready" 彩按钮
- `src/components/settings/SettingsPanel.tsx`：新增 About tab +
  `AboutSettings` 组件（版本、状态、Check now / Restart & install）
- i18n 新增 `statusBar.updater.*`、`settings.about.*` 两块（en / zh）

## 验证

### 代码 / 类型
- `npx tsc --noEmit -p tsconfig.web.json` ✅ clean（只有既有 baseUrl
  deprecation 警告）
- 主进程 TS 因为 node_modules 没装不能独立跑（全仓库通病），但
  逻辑已对齐 Electron / update-electron-app / `@electron-forge/
  publisher-github` 的官方类型。

### 运行时（需 `npm install`）
1. Dev 运行：应用启动无 updater 动作（`app.isPackaged=false`）。
   Settings → About 显示当前 version 和灰色 dev banner。
2. 首个 release 流程：
   ```bash
   # 改 version
   npm version patch
   export GITHUB_TOKEN=<a token with `repo` scope>
   npm run publish
   ```
   Forge 打包 + 上传 assets 到 `lhkong7/prismmd` 的 draft Release。
   在 GitHub 页面把 Release publish。
3. 老包用户：下一次 1 小时 interval（或打开 About → Check now）
   时，`update.electronjs.org` 会返回新版本元数据，Electron 内建
   `autoUpdater` 自动下载；完成后 StatusBar 出现 "Update ready"
   按钮，点一下 Electron 调 `quitAndInstall()` 自动重启到新版本。

### macOS 签名注意
`autoUpdater` 在 macOS 上要求 app 已代码签名 + notarized；未签名的
`.app` 会在 `checkForUpdates` 时报 "Could not get code signature for
running application"。Release 构建时需要配 Apple Developer 证书
+ `electron-osx-sign` 配置或 Forge 的 osx sign hook。

## 后续项

- **Windows signing**：Squirrel.Windows 更新不强制签名，但未签名
  安装包在首次下载时会被 SmartScreen 拦。
- **差分更新**：`update-electron-app` 默认跑全量包更新，对 200+ MB
  的 Electron 包是浪费；后续可升级到 `@electron/asar` + 差分方案。
- **Release notes UI**：当前 About 页只展示版本号，`releaseNotes`
  字段从 autoUpdater 事件里来过但没渲染，后续可加个"查看更新说明"
  drawer。
- **自动检查频率可配**：当前写死 1 小时；后续放到 settings.mcp 旁
  加 `settings.update.intervalMinutes` 即可。
- **灰度发布**：`prerelease: false` 把稳定版用户和 beta 隔开；
  后续可在 Settings 加 "Join beta channel" 开关走 `prerelease` 流。
