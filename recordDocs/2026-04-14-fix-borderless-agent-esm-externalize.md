# 修复 borderless-agent ESM 在 Electron main 中的加载问题

## 背景 / 问题

`package.json` 将 `borderless-agent` 从本地 `file:../borderless_agent`
切换到发布版本 `0.0.1-alpha.6` 后，`npm start` 出现两类报错：

1. Vite watch 构建中持续打印：
   `[commonjs] Cannot read properties of undefined (reading 'resolved')`
2. 首次将该包加入 `vite.main.config.ts` 的 `external` 后，Electron 启动
   时抛出：
   `Error [ERR_REQUIRE_ESM]: require() of ES Module
   /.../borderless-agent/dist/index.js … not supported.`

## 根因分析

- `borderless-agent` 为纯 ESM 包（`"type": "module"`），并依赖
  `express` 等 CJS 子依赖。Vite 在 main（CJS 产物）构建时让
  `@rollup/plugin-commonjs` 处理这条依赖链，触发已知的 "resolved"
  undefined 异常。
- 简单地把 `borderless-agent` 标为 external 虽然跳过了打包，但
  `electron/main.js` 仍是 CJS，编译出的 `require('borderless-agent')`
  会被 Node 拒绝（ESM 不允许被 `require`）。
- 此外本地 `node_modules/borderless-agent` 还保留着旧的 symlink，
  指向工作目录外的 `../../borderless_agent`，没有跑 `npm install`，
  所以即使配置正确也会加载到旧路径。

## 改动清单

- `vite.main.config.ts:18` — 将 `borderless-agent` 加入
  `rollupOptions.external`，避免进入 rollup-commonjs 处理链。
- `electron/services/aiService.ts:1`、`:173` — 去掉顶层
  `import { AgentBuilder } from 'borderless-agent'`，改为类型导入
  + 懒加载 `await import('borderless-agent')`（Node 的 CJS→ESM
  动态导入桥是允许的），并缓存 Promise 避免重复解析。
- 重新执行 `npm install borderless-agent@0.0.1-alpha.6` 以替换
  node_modules 中遗留的本地 symlink。

## 验证方式

- `npx tsc --noEmit` 通过，类型检查无回归。
- `rm -rf .vite/build node_modules/.vite` 后重新 `npm start`，
  main 进程能成功加载 agent（之前会直接在启动阶段抛
  ERR_REQUIRE_ESM），且 Vite watch 输出不再出现
  `[commonjs] … 'resolved'` 告警。

## 后续项

- 若后续 main 进程里再接入其他 ESM-only 的 Node 包，沿用同一套
  "external + dynamic import" 模式即可，避免再次踩到 rollup-commonjs
  的这条已知 bug。
