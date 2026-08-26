# 2026-08-25 · 阶段 4：知识层切到 Vault，并跟随外部改动

> [Vault 迁移计划](./2026-08-25-vault-migration-plan.md) 的第四阶段。
> 计划里这一阶段的验收标准是六项功能在 Vault 模式下全部工作。

## 背景 / 问题

阶段 3 之后 Vault 模式可以启用了，但计划里写的「`knowledgeService` 已经走仓储，
所以索引本身不用改」——**这句话是错的**，而且错得很安静。

## 设计决策

### 索引仍然在 JOIN `pages`

写验收测试之前先查了一遍：`engine.ts` 有 **13 处** `JOIN pages`。

在 Vault 模式下这张表：

- **全新 Vault** → 是空的 → 每一次搜索、每一个反向链接、每一次 AI 检索
  **全部返回空数组**，不报任何错；
- **迁移过来的 Vault** → 是迁移前的只读存档 → 标题是旧的，
  而且迁移之后新建的笔记**一篇都看不见**。

这是本阶段真正的工作量。修法是让索引**自给自足**：所有查询改 JOIN 它自己的
`note_index_state`，并把笔记的 `updated_at` 也记进去（原本是从 `pages` 借的）。
索引本来就该是自足的——它知道的一切都是 `indexPage()` 告诉它的，
而不是从另一张表里现查的。

顺带发现第二个同源问题：所有知识表都声明了 `FOREIGN KEY ... REFERENCES pages(id)`。
Vault 模式下笔记 id 根本不在那张表里，**每一次 indexPage 都会被外键拒绝**。
SQLite 不能删约束，所以 `ensureKnowledgeSchema` 检测到旧结构就整表重建——
安全性来自同一条性质：索引是派生的，丢掉只花时间。

### 验收测试单独成套

`engine.test.ts` 证明索引对「递给它的页面」有效；
`markdownVaultRepository.test.ts` 证明 Vault 能读写文件。
**两者都没有证明这一对搭在一起能用**，而 bug 恰好住在缝里。

`knowledgeInVault.test.ts` 就是计划里那六条验收标准，跑在真实文件上：
双链、反向链接、中文搜索、相关笔记、带引用的 AI 检索、重命名传播。
外加外部改动（别的工具丢进来的笔记、在访达里移动过的笔记、外部编辑）。

变异测试确认了它的价值：把索引改回 JOIN `pages`，**14 条里红 8 条**。

### 标注进 Vault（D4 兑现）

`.prism/annotations/<pageId>.json`，一篇笔记一个文件。这是 `.prism/` 里
**第二份主数据**（第一份是 `binaries.json`）。理由很直接：
备份 Vault 文件夹的人，理所当然认为自己也备份了高亮。

不进 frontmatter：标注带的是正文里的字符偏移量，写进 frontmatter 就等于
**改动它所指向的那篇正文**，连带把它后面每一条标注的偏移量都改掉。
「划一条高亮」不能等于「编辑这段话」。

迁移**不是一个步骤**，而是**首次读取时惰性搬运**：在标注入 Vault 之前就迁移过的
用户，他们的高亮还在数据库里；第一次打开那篇笔记时自动搬进侧车。
这样就不存在「某个版本里高亮被搁在那儿，等着用户想起来去跑一次迁移」。
数据库里的行不删——不值钱，而且万一有人切回去，那是唯一的副本。

同时迁移工具也会**批量**导出一份，这样刚迁完的 Vault 从第一刻起就是完整的。

### 一个只在测试里才会暴露的错误

给迁移加标注导出时，我从 `options.db` 读 `annotations` 表——但那是**目标** catalog
数据库，不是**源** workspace 数据库。生产环境里两者恰好是同一个连接，所以
**永远不会出错**；测试里传的是一个内存库，立刻炸了。

改成显式分成 `db`（目标）和 `sourceDb`（源）。一个是来源一个是去处，
把去处当来源读是那种只在两者不同时才现形的错误。

### VaultWatcher 接线时抓到的第三个 bug

`reconcilePaths` 原本对每篇笔记调 `pathOfId(id)` 查「它原来在哪」。
但 `readFile()` 会**把文件归档进 catalog**——所以处理重命名的第二个路径时，
catalog 已经指向新路径了，`pathOfId` 回答「它一直在这儿」，
于是一次重命名被报成「新建 + 删除」。

后果正是给笔记加 UUID 要避免的那件事：反向链接、标注、树上的位置全丢，
用户看到的是笔记消失、旁边冒出一个陌生的。

改成在**读任何文件之前**把 catalog 快照下来（`knownPaths(): Map<id, path>`），
冻结的那份才代表「这批事件之前」。变异测试：改回实时查询，红 4 条。

### 编辑中遇到外部改动

`syncExternalEdit` 的 `!isDirty` 守卫保留：正在打字的人**永远**不会被替换掉。
本地版本赢，磁盘版本等下次干净打开时再取。
两边都改了却静默选一边就是丢数据，而能推迟的那一边是还留在磁盘上的那个。

## 改动清单

### 索引自给自足

- `electron/knowledge/schema.ts` —— `note_index_state.updated_at`；
  索引版本 1→2；检测并重建带旧外键的表
- `electron/knowledge/engine.ts` —— 13 处 JOIN 改为自己的表

### 新增

- `electron/vault/vaultAnnotations.ts` —— 标注侧车
- `electron/vault/knowledgeInVault.test.ts` —— 18 条验收断言

### 改造

- `electron/services/annotationStore.ts` —— 按存储模式分派，首次读取时惰性搬运
- `electron/services/storageService.ts` —— 启动 / 迁移后启动 watcher；
  把一批路径 reconcile 成笔记级改动并回灌索引
- `electron/vault/vaultWatcher.ts` —— 先快照 catalog 再读文件
- `electron/vault/markdownVaultRepository.ts` —— `reconcileContext()` / `forgetPath()` / `vaultRoot`
- `electron/migration/sqliteToVault.ts` —— 批量导出标注；`sourceDb` 与 `db` 分开
- `src/App.tsx` —— 收到 `vault:changed` 刷新打开中的标签页
- `electron/main.ts` —— 退出时先停 watcher 再 flush（否则事件会把索引写向
  一个即将关闭的数据库）

## 验证方式

```bash
npm test        # 478 passed（新增 26）
npm run typecheck
```

计划里的六条验收标准，全部在 Vault 模式下跑通：

| 标准 | 断言 |
| --- | --- |
| 双链 | `[[链接]]` 从文件里读出并按标题解析 |
| 反向链接 | 目标笔记看得到谁链接了它 |
| 中文搜索 | `全文检索` / `中文` 都能命中 |
| 相关笔记 | 链接优先于纯用词相似 |
| AI 引用 | 引用编号能解析回一篇真实存在的笔记 |
| 重命名传播 | 文件里的链接被改写，且反向链接不丢 |

变异测试：

| 变异 | 结果 |
| --- | --- |
| 索引改回 JOIN `pages` | **8 条红** |
| watcher 实时查 catalog 而非快照 | 4 条红 |
| 标注侧车不区分「没有」与「清空了」 | 1 条红 |

## 后续项

- **冲突 UI 还没做**：`classifyConflict()` 判定得出 `conflict`，但界面只是
  沿用 `!isDirty` 守卫「不覆盖」，没有让用户三选一的对话框。
- **`.prism/` 的备份边界要写进文档**：`ui.json` 可丢，
  `binaries.json` 和 `annotations/` 不可丢。README 里还没说。
- **切回 SQLite** 仍未实现。
- **读放大**：`listPages()` 每次读全部文件，watcher 每批也会重扫。
  几千篇以上应该用 catalog 的 hash 短路。
- **阶段 5**（弱化旧库）尚未开始：`pages.content` 仍在写，
  db 也还在 `userData` 而不是 `.prism/`。
