# Fix: Horse Mode 结果未写入目标文档

## 背景 / 问题（Context）

Horse Mode（自主任务循环）跑完后，会把最终文档写入一个新建的工作区页面并打开它。
用户反馈：任务正常完成，但**打开的页面是空的** —— 生成的结果没有出现在目标文档里。

## 根因分析（Analysis）

Horse Mode 的写入链路（`src/store/horseModeStore.ts` `start()` 末段）：

```js
const pageId = await ws.createPage(pageTitle, null) // ① 新建页面，content=''，并 openPage 之
await ws.savePage(pageId, content)                  // ② 把正文写进 SQLite
await ws.loadTree()
...
await ws.openPage(pageId)                           // ③ 再次打开
```

三个调用叠加出 bug：

1. `createPage`（`workspaceStore.ts:211`）内部会调用 `openPage(res.page.id)`，
   所以建完页面后**该页已经是一个打开的 tab，tab.content = ''（初始空内容）**。
2. `savePage`（旧实现，`workspaceStore.ts:281`）只调用 `workspaceUpdatePage` 把正文写进
   SQLite，**完全没有更新内存里的 tab 内容**。
3. `openPage`（`workspaceStore.ts:230`）发现该页已有打开的 tab，直接走
   `switchTab` 短路返回，**不会从 SQLite 重新读取内容**。

结果：正文确实落库了（数据库行有内容），但**当前显示的 tab 仍是步骤 ① 的空内容**，
用户看到的就是一篇空文档。本质是「程序化保存只更新了 DB，没有同步打开中的视图」这一不变式被破坏。

## 设计决策（Design）

在 `savePage` 里补上「保存后同步打开中的 tab」这一步，而不是在 Horse Mode 里特判。
理由：这是 `savePage` 应当保证的通用不变式 —— 任何程序化保存都应让视图与 DB 一致，
任何未来的调用方都能受益。

- 加了一个 guard：只有当存在「pageId 匹配且内容不一致」的 tab 时才更新，
  避免 `setContent` 的防抖自动保存（此时 tab.content 已等于 content）触发多余的 set，
  也避免编辑器场景下的反馈回环。
- 同步后调用 `syncFromActiveTab` 刷新兼容层字段（`currentContent` 等），reader 随之重渲染。

## 改动清单（Changes）

- `src/store/workspaceStore.ts` `savePage`（约 `281`）：
  `workspaceUpdatePage` 成功后，对所有 `pageId` 匹配且内容不同的打开 tab 更新
  `content` 并重算兼容层字段。带 guard 短路，内容一致时为 no-op。

## 验证方式（Verification）

- `npx tsc --noEmit` 通过，无新增类型错误。
- 手动复现路径：触发 Horse Mode → 等待循环完成 → 自动新建并打开的页面
  现在显示生成的正文，而非空白。
- 回归检查：编辑器输入触发的防抖 `savePage`（content 已等于 tab.content）走 guard
  短路，不产生多余 re-render，行为不变。

## 后续项（Follow-ups，可选）

- 之前怀疑的 “LLM API error” 未在本次改动中观察到必现；若仍出现 provider 拒绝请求，
  另行排查 `max_tokens` 默认值（`agentInstance.ts` `_maxTokens = config.maxTokens ?? 8000`）
  对部分模型输出上限超限的问题。
