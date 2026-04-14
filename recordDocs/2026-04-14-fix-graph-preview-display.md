# 2026-04-14 · 修复 Knowledge Graph 预览不显示

## 背景

用户通过 LeftSidebar 的 "Build Graph" 按钮对一个文件夹做 ingest，
`insightgraph:progress` 事件正常送达 `stage: 'completed'`，Neo4j 里也写入了
数据，但切到 Graph 预览后中心画布空白。

## 根因分析

追踪完 "完成事件 → Zustand 更新 → GraphView re-render → IPC 查询 → ForceGraph2D
渲染" 整条链路，发现以下几处断点：

1. **Document scope 的 fallback 不彻底**。`GraphView.tsx` 在 document scope
   下，当 `entitiesRes.ok && data.length > 0` 但 `buildSubgraphFromEntities`
   返回 `nodes: []` 时，`result` 被赋为一个空结果对象，不再走兜底
   `insightGraphGlobalGraph(60)`，UI 直接进入 empty 态。
2. **默认 scope 是 `'document'`**（`uiStore.ts`）。build 完整个文件夹通常
   没有任何打开文件，`currentFilePath` 为空 → `targetName` 为 `undefined`
   → `matched = storeReports[0]`，不一定是用户期望看到的报告；若该报告
   查询链失败就整个空白。
3. **Progress listener 挂载时机**。`ensureProgressListener()` 只在
   `ingestFile` 内部被调用，任何其它路径触发生成都会错过 `completed` 事件。
4. **非响应式 reports 读取**。Document 分支里用
   `useInsightGraphStore.getState().reports` 取快照，虽然 effect 依赖数组
   里有 `reports`，但写法脆弱且易误导后续维护。
5. **Canvas 尺寸 0×0 风险**。Effect 尚未 layout 时 ForceGraph2D 可能以 0
   尺寸渲染，画布看不见；需要防御性尺寸 guard。

## 改动清单

- `src/store/insightGraphStore.ts`
  - 把 progress listener 的注册从 `ingestFile` 内部移到 store 工厂顶部，
    带 `typeof window !== 'undefined' && window.electronAPI?.onInsightGraphProgress`
    guard，保证任何触发路径都能收到 `completed`。
- `src/components/graph/GraphView.tsx`
  - 新增 `ingestStage` 订阅 + `autoScopedRef` one-shot：ingest 完成后若
    还在 document scope 且当前文件无法匹配任何 report，自动切到
    `'global'`，之后用户手动切换不会再被覆盖。
  - Document 分支改用订阅的 `reports` 替换 `getState().reports`。
  - Document 分支在 `sub.ok && sub.data.nodes.length > 0` 时才接受子图，
    否则走 `insightGraphGlobalGraph(60)` fallback。
  - ForceGraph2D 渲染条件加上 `size.width > 0 && size.height > 0`。

## 验证方式

1. 清空 Neo4j（或换新数据库），启动应用。
2. 打开一个含 markdown 的文件夹，点击 LeftSidebar 中的 Database 图标
   触发 ingest。
3. 切到 Graph 视图：预期自动以 Global scope 显示刚构建的图。
4. 打开一个已 ingest 的文件，切 Document scope：渲染该文件的实体子图。
5. DevTools 核对：
   - `useInsightGraphStore.getState().reports` 非空
   - `useInsightGraphStore.getState().ingest.stage === 'completed'`
   - GraphView 内 `size.width > 0 && size.height > 0`
   - IPC `insightgraph:global-graph` 返回非空 `nodes`
6. 回归检查：
   - Entity scope 聚焦节点后 ego-graph 正常。
   - 手动切回 Document 不会被 one-shot 再次覆盖。
7. `npx tsc --noEmit -p tsconfig.web.json` 通过（仅有一条既有的 baseUrl
   deprecation，与本次改动无关）。

## 相关 commit

`7fa8e39` · `fix(graph): show freshly-built knowledge graph in preview`
