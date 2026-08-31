# 2026-08-25 · 阶段 1：NoteRepository 存储抽象

> 属于 [Vault 迁移计划](./2026-08-25-vault-migration-plan.md) 的第一阶段。
> 本次**不引入任何文件 IO**，行为零变化。

## 背景 / 问题

要把正文从 SQLite 列换成 Markdown 文件，直接改是行不通的：IPC 层、知识索引、
存储格式会在同一次改动里全部变形，一旦出问题分不清是三者中的哪一个。

而且现状里存储是**散着被引用**的——五个模块各自 `import` 了
`documentService`，其中 `knowledgeService` 干脆直接写了
`SELECT ... FROM pages`。没有一条缝可以换。

## 设计决策

### 为什么接口全异步

`documentService` 全是同步函数（better-sqlite3）。包一层同步接口更省事，
但那会留下一个同步逃生口，而**最先用上它的一定是退出前的收尾路径和索引循环**
——恰恰是将来换文件后最危险的两处。现在付掉 `async` 的成本，
阶段 2 的实现才是真正的 drop-in。

这条改动的连锁反应立刻就出现了：`flushPendingIndexing()` 变成异步后，
`main.ts` 的退出流程如果不 `await`，最后一次索引会落在一个**已经 close 掉的
数据库连接**上（`main.ts:390`）。症状是「本次会话最后一段搜不到」，
下次启动对账又自动修好——几乎不可能被复现出来。

### 为什么实现不许读 `app.getPath()`

根路径由工厂注入。这样阶段 2 的 `MarkdownVaultRepository` 可以在临时目录里
被完整测试，进程里连 Electron 都不需要——`libraryService.test.ts` 已经证明这条
路走得通，而 `documentService` 因为在模块顶层就绑死了 `app.getPath()`，
至今一行测试都没有。

### 契约测试才是这一阶段真正的交付物

接口只保证两个实现**方法名**相同，它不保证「重命名笔记会改写指向它的链接」
或者「删掉的笔记不再出现在索引的取数里」。而这些恰恰是两个后端最容易
**悄悄**产生分歧的地方，存储层的「悄悄分歧」就是丢笔记。

所以 `contract.ts` 导出 `describeNoteRepository(label, harness)`，
阶段 2 的 Vault 实现**复用同一批断言**，两边全绿是「换底座没换行为」的
唯一可信证据。文件名故意不叫 `.test.ts`，否则 vitest 会去收集一个还没有
实现供给它的空套件。

断言里**故意不测**的：`position` 的具体取值（目录本身没有顺序）、
时间戳精度、id 格式——这些是后端特性，不是契约。

### 重命名归谁管

原先重命名分散在两处：IPC handler 改标题，`knowledgeService.propagateRename()`
改链接。这次整体挪进 `SqliteNoteRepository.renamePage()`，因为**它们是一个操作
而不是两个**：两步之间工作区是不一致的，而在 Vault 实现里那个窗口是一次
多文件写入，需要 journal 才能扛住崩溃。把原子操作的一半放在 IPC handler 里，
阶段 2 就得再拆一次。

### 顺手修掉的一个真 bug

`propagateRename` 原本从 `note_links` 索引里找「谁链接了我」。但索引是
**1.5 秒防抖**写入的，于是：

```text
在笔记 B 里敲下 [[Foo]]
  → 1.5 秒内把 Foo 改名
  → B 里的链接不会被改写，静默断掉
```

没人会把这个现象归因到「索引延迟」。新实现改成**直接扫笔记正文**
（`LIKE '%[[%'` 预筛 + `extractWikiLinks` 精确判定），与索引新鲜度无关。
重命名是低频且用户主动触发的，一次扫描是负担得起的正确答案；
Vault 实现将来扫文件，形状完全一样。

契约测试里 `finds links that were written moments ago` 就是这条的回归守卫。

## 改动清单

### 新增 `electron/repositories/`

| 文件 | 作用 |
| --- | --- |
| `noteRepository.ts` | 接口 + 共享类型。`PageUpdates` **故意不含 `title`**——改标题是 `renamePage`，不是字段写入 |
| `sqliteNoteRepository.ts` | 包装 `documentService`（**该文件一行未改**），外加自带的 `findLinkSources` 扫描 |
| `repositoryFactory.ts` | 单例解析。将来 `storageMode` 只在这里读，别处不许读 |
| `contract.ts` | 36 条与实现无关的断言 |
| `sqliteNoteRepository.test.ts` | 把契约绑到 SQLite 实现；`vi.mock('electron')` + `vi.hoisted` 造临时 userData |

### 改造调用方（全部改为经 `getNoteRepository()`）

- `electron/ipc/workspaceHandlers.ts` —— 整个文件重写为仓储调用；
  `updates.title` 现在路由到 `renamePage`
- `electron/ipc/libraryHandlers.ts` —— 阅读器导入工作区那一条路径
- `electron/services/knowledgeService.ts` —— `allIndexablePages()` 从
  直查 `pages` 表改成 `repository.listPages()`；`searchPageSummaries()` 同理；
  `propagateRename()` 删除（已移入仓储）
- `electron/services/insightGraphService.ts`、`knowledgeBaseService.ts` —— `getPage`
- `electron/main.ts` —— 退出前 `await flushPendingIndexing()`；
  开窗前 `await ensureWelcomePage()`（见下）

### 顺带修正的时序

播种欢迎页原本在 handler 注册时同步执行。改异步后如果 fire-and-forget，
**首次启动**的新窗口可能在播种落地前就问到了页面树，看到一个空工作区。
现在挪到 `main.ts` 里 `createWindow()` 之前 `await`，把时序写死而不是碰运气。

## 验证方式

```bash
npm test        # 260 passed（新增 36 条契约断言）
npm run typecheck
```

契约套件不是「写完就绿」——对实现做了变异测试来确认断言真的会咬：

| 变异 | 结果 |
| --- | --- |
| `renamePage` 不再改写链接 | 4 条断言变红 |
| `listPages` 不再排除文件夹 | 1 条断言变红 |

另外验证了 `documentService` 现在**只**被 `repositories/` 引用：

```bash
grep -rn "from '.*documentService'" --include=*.ts electron | grep -v repositories/
# （无输出）
```

## 后续项

- **阶段 2**：`electron/vault/` 实现，复用 `contract.ts` 的同一批断言。
- 计划文档里的六个待定决策（排序、文件夹身份、二进制页面抽取文本、
  标注存放、标题与文件名、db 位置）在阶段 2 开工前需要拍板；
  阶段 1 对它们全部保持中立，任何一种选择都不需要回头改本次代码。
- `knowledgeBaseService`（旧快照库）也走了仓储，但它本身仍待下线。
