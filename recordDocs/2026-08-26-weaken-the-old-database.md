# 2026-08-26 · 阶段 5：弱化旧库，并把派生数据挪进 Vault

> [Vault 迁移计划](./2026-08-25-vault-migration-plan.md) 的第五阶段，
> 也是计划里 **D6 的第二步**。

## 背景 / 问题

计划里这一阶段写得很短：

> `pages.content` 停写 → 停读 → 保留一到两个版本的只读兼容 → 删列。
> 同时执行 D6 的第二步（db 挪进 `.prism/`）。

先查了一遍现状。**「停写」早就做完了**——Vault 模式下 `documentService`
根本不会被调用。真正的问题在旁边：**四张按笔记 id 建的表仍然声明了
`FOREIGN KEY ... REFERENCES pages(id)`**。

| 表 | Vault 模式下的后果 |
| --- | --- |
| `page_versions` | 「存档当前版本」「AI 改写前快照」**每一次都被外键拒绝** |
| `page_meta` | 状态 / 体裁 / 评分**存不进去**（还额外做了一次 `SELECT 1 FROM pages` 前置检查） |
| `doc_summaries` | AI 摘要生成完就丢 |
| `muse_cards` | 灵感卡片加不进去 |

这和阶段 4 索引 JOIN `pages` 是**同一个 bug 的第二次出现**：
「一篇笔记」和「`pages` 里的一行」在旧模型里是同义词，
Vault 模式下不再是了，而所有假设了这一点的代码都安静地失效。

写脚本验了一遍，不是推测：

```
version insert FAILED: FOREIGN KEY constraint failed
muse insert FAILED: FOREIGN KEY constraint failed
```

## 设计决策

### 外键删掉，但**行要保住**

外键换来的是「硬删除页面时级联清理」。而 `deletePage` 是软删除
（`is_deleted = 1`），代码里**没有任何一处** `DELETE FROM pages`——
这条级联在本应用的历史上从未触发过。

SQLite 不能 drop constraint，所以 `ensureSatelliteSchema` 检测到旧结构就
**整表重建**。和知识索引的处理不同：索引是派生的，直接 drop 重建；
这四张表里装的是用户做的东西，必须逐行搬过去。

重建时 `foreign_keys` 要先关再开——开着的话 `DROP TABLE` 会触发
**正要被删掉的那些级联**；而且 pragma 在事务里无效，只能在事务外设。

### db 挪进 `.prism/prism.db`（D6 第二步）

两个数据库，按**含义**分，不按内容分：

- `userData/workspace.db` 是**仓库**。SQLite 模式下装正文；迁移之后是只读存档。
- `<vault>/.prism/prism.db` 是**缓存**。目录、搜索索引、AI 缓存——
  都是从旁边那些文件推出来的答案。

放进 Vault 的理由：Vault 应该是**一个可以整个拎走的东西**。
索引留在 `userData` 的话，把文件夹拷到另一台机器就得全量重扫；
更糟的是指向第二个 Vault 时**两个 Vault 共用一份 catalog**——
一个 id 在这边有、在那边没有，会被读成「这篇笔记被删了」。

`workspace.db` **仍然**留在 `dataLocation` 的 `DATA_ENTRIES` 里，
因为它是没迁移过的用户的仓库。不再跟着搬的是 Vault 的索引——
这正是 D6 指出的那个冲突。

### 挪库带出的新问题：那四张表会被留在原地

这是做到一半才意识到的。db 在 `userData` 的时候，这四张表
**什么都不用做就继续工作**——页面 id 是原样搬过去的，谁也没被孤立。
把 db 挪进 Vault，新库是空的，**不复制就等于静默丢掉所有快照和摘要**。

于是迁移工具多了一步 `carryNoteScopedData()`。但复制到哪，得先回答一个问题。

### 三样东西不能进 `prism.db`

`prism.db` 被声明为「可丢」。那么**任何只存在于它里面的用户数据都是谎言**——
「重建索引」这个按钮承诺的是「只花时间」。

按这条尺子过一遍：

| 数据 | 判定 | 去处 |
| --- | --- | --- |
| 版本快照 | 用户做的，扫描重建不出来 | `.prism/versions/<id>/*.md` |
| 状态 / 体裁 / 评分 | 用户做的判断 | **笔记自己的 frontmatter** |
| 回收站的原路径 | `.trash/<uuid>/` 里没有这个信息 | `.trash/<uuid>/meta.json` |
| AI 摘要 / 灵感卡片 | 可重新生成（花钱） | `prism.db`，随迁移复制过去 |
| PDF 抽取文本 | D3 明写的例外 | `prism.db`，惰性重建 |

**快照写成 Markdown 而不是 JSON**：Vault 的意义是「拿个文本编辑器就能把东西捞回来」，
而一份旧稿子应该读起来就像一份旧稿子。文件名以时间戳开头（目录列表天然有序）、
带上快照 id（同一毫秒内的两次存档不会互相覆盖——Archive 恢复时
恰好会连着存两次，覆盖掉的正是「正要被回滚掉的那一版」）。

**编辑元数据进 frontmatter 而不是侧车**：`status: draft` 本来就是别的 Markdown
工具认的写法。在 Obsidian 里把一篇标成 done，这边书架上就变了。
代价是「打个标记」会改文件 mtime——对一次显式点击、一篇笔记来说可以接受，
对侧边栏拖拽排序就不行，所以那个仍然留在 `ui.json`。
`quality` 不加引号写（`quality: 4`），否则别的工具会按文本排序，10 排在 2 前面。

**回收站补一个 manifest**，`note_trash` 于是也变成缓存：`scan()` 时
`reconcileTrash()` 从磁盘上的 manifest 重建整张表。一次删除写一个文件，
而不是一篇笔记一个——删文件夹是整棵子树一次移动，
子孙没有自己的目录可以放文件，它们记在文件夹那份 manifest 里。

## 改动清单

### 新增

- `electron/services/indexDatabase.ts` —— 派生数据连接的唯一解析点
- `electron/services/satelliteSchema.ts` —— 四张按 id 建的表，无外键；
  检测到旧结构就带着数据重建
- `electron/vault/vaultVersions.ts` —— 快照侧车
- `electron/vault/vaultTrash.ts` —— 回收站 manifest

### 改造

- `electron/services/workspaceDb.ts` —— 只留仓库自己的表；
  四张表的定义交给 `satelliteSchema`（**定义一份**，否则会漂）
- `knowledgeService` / `docSummaryService` / `museService` —— `getDb()` → `indexDb()`
- `electron/services/versionService.ts` —— 按存储模式分派；全异步
- `electron/services/pageMetaService.ts` —— 改成仓储的门面
- `electron/repositories/noteRepository.ts` —— 加 `getNoteMeta` / `setNoteMeta` /
  `listNoteMeta`，以及两个后端共用的 `mergeMeta`
- `electron/vault/frontmatter.ts` —— 可写字段加 `status` / `genre` / `quality`
- `electron/vault/markdownVaultRepository.ts` —— 元数据读写 frontmatter；
  删除时写 manifest；`scan()` 时重建回收站表
- `electron/migration/sqliteToVault.ts` —— 去掉 `db` 参数（自己在 staging 里
  开 `prism.db`，rename 之前关掉）；`carryNoteScopedData()`
- `electron/main.ts` —— 退出时关掉 Vault 的索引库
- `README.md` —— 备份边界（阶段 4 的遗留项）

### 一处值得记的接口决定

`versionGet` / `versionDelete` 加了可选的 `pageId`。数据库靠版本 id 就能找到，
Vault 是按笔记分目录的。没传的时候退化成遍历有历史的笔记——**正确，只是慢**，
所以旧签名仍然成立，而知道笔记的调用方（Archive 面板）把它传上。

## 验证方式

```bash
npm test        # 532 passed（新增 54）
npm run typecheck
```

新增的验收测试里，两个是这一阶段的核心论证：

- **`electron/vault/vaultSelfContained.test.ts`** —— 破坏性的：
  建一个 Vault、把每个存「按笔记状态」的功能都用一遍、**把数据库删掉**、
  用一个空库重新打开，然后要求用户做的东西一样不少。
  里面还明写了唯一的例外（PDF 抽取文本，D3）——
  把「可重建，但只能惰性重建」钉成一条决定，而不是等着变成 bug 报告。
- **`electron/services/noteScopedStorage.test.ts`** —— 走**服务层**，
  不是各个零件。阶段 4 的 bug 就住在缝里；这一阶段有四条同样形状的缝。
  其中一条断言是「Vault 模式下把所有写路径跑一遍，`pages` 表仍然是空的」，
  也就是计划里那句「停写」的验收。

变异测试（每一条都单独跑过）：

| 变异 | 结果 |
| --- | --- |
| 重建时不搬旧行 | 1 条红 |
| `mergeMeta` 把 `undefined` 当成「清空」 | 2 条红 |
| 删除时不写 trash manifest | 2 条红 |
| 元数据不写进 frontmatter | 4 条红 |
| 快照文件名去掉 id | 6 条红 |
| 迁移不搬 versions / meta / summaries | 3 条红 |
| 把 `REFERENCES pages` 加回去 | 2 条红 |
| 版本历史永远走数据库 | 1 条红 |

## 后续项

- **`pages.content` 删列**仍未做，而且**故意**：计划说「保留一到两个版本的
  只读兼容」，而 Vault 模式还一个版本都没发出去。那张表现在是想切回去的人
  唯一的退路。
- **切回 SQLite** 仍未实现。
- **冲突 UI**：`classifyConflict()` 判得出 `conflict`，界面仍只是
  `!isDirty` 守卫「不覆盖」。安全，但没给用户三选一。
- **读放大**：`listPages()` / `listNoteMeta()` 每次读全部文件。
  `listNoteMeta()` 让这件事更明显了（每篇笔记读两遍）。
  几千篇以上应该用 catalog 的 hash 短路。
- **旧的快照式知识库**（`kb:*` 通道、`knowledgeBaseService`）还在，
  和真正的索引并行存在。退役它是产品决定，没在这一阶段做。
- `workspace:get-page-asset` 这个 IPC 通道**渲染进程没有任何调用方**，
  且在 Vault 模式下永远返回 null。
