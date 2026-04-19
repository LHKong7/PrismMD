# 知识图谱默认仅显示当前文档图

## 背景 / 问题（Context）

用户希望生成知识图谱时只展示**当前文档**的知识图谱，不自动合并到全局视图。
全局合并应该是用户主动点击"Global"按钮后才触发的行为。

此前的行为：
- ingest 完成后如果 Document scope 找不到匹配 report，会自动切换到 Global scope
- Document scope 查询失败时会 fallback 到 `insightGraphGlobalGraph(60)`
- Document scope 匹配时会 fallback 到 `reports[0]`（最近的 report），不一定是当前文件

## 设计决策（Design）

| 决策 | 理由 |
|------|------|
| 移除 auto-scope-to-global 逻辑 | 用户停留在 Document scope，不被自动切换 |
| 移除 document scope fallback 到 global graph | Document scope 只展示当前文档的图 |
| 移除 `reports[0]` 兜底匹配 | 严格按当前文件名匹配 report，避免显示其他文档的图 |
| 保留 Global scope 按钮 | 用户可主动点击查看合并后的全局图 |

## 改动清单（Changes）

- `src/components/graph/GraphView.tsx`
  - 移除 `autoScopedRef` / `autoScopeNotice` 状态和相关 useEffect（auto-scope-to-global）
  - 移除 auto-scope notice banner UI
  - 移除 `ingestStage` 订阅（不再需要）
  - Document scope 中移除 `|| reports[0]` fallback，严格匹配当前文件
  - Document scope 中移除 fallback 到 `insightGraphGlobalGraph(60)`
  - 更新组件 docstring 反映新的 scope 语义

## 验证方式（Verification）

1. TypeScript 编译通过 (`npx tsc --noEmit`)
2. 打开文件 → Build Graph → 完成后默认在 Document scope 查看当前文档的图
3. 切换到 Global 按钮 → 可以看到所有已 ingest 文档的合并图
4. 在 Document scope 下如果当前文件未 ingest，显示空状态而非 fallback 到全局图
