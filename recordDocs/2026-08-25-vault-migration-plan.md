# 2026-08-25 · 计划：把底座从 SQLite 换成 Markdown Vault

> 这是一份**计划**，不是已完成改动的记录。阶段 1 的实现随本文档一起提交，
> 阶段 2–5 尚未开始。每个阶段落地时补一篇自己的 recordDoc。

## 一、核心约束

```text
Markdown 文件是唯一内容真相；SQLite 里的一切必须能从文件重新生成。
```

推论有三条，后面每个设计决策都回来对照它们：

1. **任何只存在于 SQLite 的用户意图都是 bug**——除非明确列入「可丢失」清单。
2. **任何无法从文件重建的派生数据都是 bug**——除非明确列入「可缓存但昂贵」清单。
3. **文件与数据库长期双向写入是不允许的**：写路径永远是「先落盘，再更新派生数据」。

## 二、现状核对

改造之前先把「提案假设的现状」和「代码里的现状」对齐。以下都是实测：

| 事实 | 位置 | 对改造的影响 |
|---|---|---|
| `documentService` 全部是**同步**函数（better-sqlite3） | `electron/services/documentService.ts:96` | `NoteRepository` 必须异步，**所有调用方都要改**，包括退出前的同步收尾路径 |
| 只有 5 个模块 import `documentService` | knowledgeService / insightGraphService / knowledgeBaseService / workspaceHandlers / libraryHandlers | 抽象层的爆炸半径比想象小，阶段 1 可控 |
| 知识索引直接扫 `pages` 表 | `electron/services/knowledgeService.ts:52` | 阶段 4 换成 `repository.listPages()` |
| 文件树支持拖拽排序，落在 `pages.position` | `src/components/filetree/PageTree.tsx:192` → `workspace:move-page` | **目录里的文件没有顺序**，见决策 D1 |
| 文件夹是 `pages` 里 `is_folder=1` 的行，带 `id` 和 `icon` | `documentService.ts:71` | 目录**没有 frontmatter**，装不下 UUID，见决策 D2 |
| PDF/XLSX：字节在 `assets/`，`pages.content` 存**渲染进程抽取的文本** | `src/store/workspaceStore.ts:199` | 抽取发生在 renderer（pdfjs），主进程**无法**在启动时重建，见决策 D3 |
| 标注带 `startOffset/endOffset`，存 `annotations` 表 | `electron/services/annotationStore.ts:37` | 偏移量绑正文，见决策 D4 |
| `dataLocation` 会整体搬迁 `userData`（含 `workspace.db`） | `electron/services/dataLocation.ts:20` | 目标架构把 db 放进 Vault，会和这个功能打架，见决策 D6 |
| `libraryService` 已有「挂载根目录 + 路径包含性校验」的成熟实现和测试 | `electron/services/libraryService.test.ts` | Vault 的路径安全校验**直接复用它的思路**，不要重写 |
| `libraryWatcher` 已有 chokidar + `awaitWriteFinish` + 去抖 | `electron/services/libraryWatcher.ts:39` | `VaultWatcher` 在它基础上加「忽略应用自身写入」即可 |

## 三、提案没有定的六件事（必须先定）

提案的方向我认同，直接采用。但它的数据职责表漏了几项，这几项恰恰是
「悄悄丢用户数据」的高发区。下面每条给出建议方案和理由。

### D1 · 同级排序（`position`）无处安放

目录里的文件天然无序，而现在文件树是可以拖拽排序的。三个选项：

| 方案 | 代价 |
|---|---|
| 放弃手工排序，按文件名 / 修改时间排 | 功能退化，用户会发现拖不动了 |
| 写进 frontmatter `position` | 每次拖一下就改一批文件的 mtime，污染 git diff 和外部工具 |
| **每个文件夹一个 `.prism/order.json` 侧车** | 顺序是应用私有状态，其他工具看不到 |

**建议第三种**，并且明确它是「**用户意图，但可丢失**」——侧车缺失时退化成按名
排序，不报错。这是本次唯一一处「用户意图不在 Markdown 里」的让步，理由是：
把排序写进文件，等于让「整理侧边栏」这个纯 UI 动作去改内容文件，
那才是真正会让用户不敢拖的设计。

### D2 · 文件夹的身份

目录装不下 frontmatter，所以文件夹**只能**用路径做 id。这看似违反
「不要用路径当永久 ID」，但对文件夹是可接受的，因为：

- 没有任何东西**链接**到文件夹（`[[...]]` 只解析笔记，见 `engine.ts` 的
  `note_titles` 只收非文件夹）；
- 文件夹 id 只用于「树展开状态」「拖拽目标」这类会话级用途。

**建议**：`folderId = 'dir:' + relativePath`，重命名文件夹即换 id，
展开状态随之失效（可接受）。文件夹的 `icon` 进 `.prism/folders.json`，
与 D1 同属「可丢失」。

### D3 · 二进制页面的抽取文本无法重建

这是提案里最硬的一处矛盾。现状：PDF 的文本由**渲染进程**的 pdfjs 抽取，
再 `savePage()` 写回 `pages.content`（`workspaceStore.ts:199`）。
主进程没有 pdfjs，启动时的对账**重建不出这段文本**。

**建议**：
- PDF/XLSX 本体作为真实文件留在 Vault 里（它本来就是「主数据」）；
- 抽取文本进 SQLite，归类为「**可重建但昂贵，且只能懒重建**」——
  这是「可重建」规则的一条**明写的例外**，不是漏洞；
- 「重建索引」对二进制页面只清空、不重抽；下次在阅读器里打开时自动补回，
  沿用现有的 `ensureExtractedText` 路径。

不写清楚这条，第一个点「重建索引」的用户就会发现 PDF 全部搜不到了。

### D4 · 标注放哪

放 frontmatter 会让「划一条高亮」变成「改一次内容文件」——和外部编辑器、
git 历史、以及未来的冲突检测全部打架。

**建议**：`.prism/annotations/<uuid>.json` 侧车，按笔记 UUID 命名。
属于「**主数据，不可丢**」，因此：Vault 备份必须包含 `.prism/annotations/`，
而 `.prism/prism.db` 不必。也就是说 `.prism` 内部还要再分一层
「主数据」和「派生数据」，不能整个目录都当缓存。

### D5 · 标题与文件名谁说了算

提案说「文件名默认决定标题，`title` 可覆盖」。但现在 wiki link 按标题解析，
于是 `title:` 和文件名不一致时，`[[某某]]` 到底指谁就有歧义。

**建议**：解析索引里**两个都收**——文件名 stem 和 frontmatter `title` 都作为
同一篇笔记的别名；显示用 `title ?? stem`。代价是极小的一段索引代码，
换来的是「在 Obsidian 里按文件名链接」和「在 PrismMD 里按标题链接」同时成立。
`note_titles` 已经是 `(page_id, norm_title)` 结构，改成一对多即可。

### D6 · `.prism/prism.db` 到底放哪

目标架构把 db 放进 Vault。但 `dataLocation` 服务的整个设计是「搬迁 userData」
（`dataLocation.ts:20` 那张 `DATA_ENTRIES` 表里就有 `workspace.db`）。
两者同时存在会出现「数据库被搬走了，但 Vault 没动」。

**建议**：**分两步**。阶段 2–4 期间 db 留在 `userData`，只有 Vault 内容进
Vault；等阶段 5 正文彻底不进 db 了，再把 db 挪进 `.prism/` 并把
`workspace.db` 从 `DATA_ENTRIES` 移除。把两件事捆在一起做，等于同时动
存储位置和存储格式——违反提案第九节自己的建议。

## 四、分阶段实施

### 阶段 1 · 存储抽象（本次提交）

```text
electron/repositories/
├── noteRepository.ts        接口 + 共享类型
├── sqliteNoteRepository.ts  包装现有 documentService，行为零变化
├── repositoryFactory.ts     单例 + 将来按 storageMode 选实现
└── contract.test.ts         对任意实现都成立的契约测试
```

关键设计（决定了后面三个阶段好不好做）：

- **接口全异步。** SQLite 实现里是 `async` 包同步调用，没有代价；
  但接口一开始就异步，阶段 2 才不用再翻一遍所有调用方。
- **实现不读 `app.getPath()`。** 根路径由工厂注入。这样
  `MarkdownVaultRepository` 可以在临时目录里被完整测试——
  这正是 `libraryService.test.ts` 已经证明可行的路子，
  而 `documentService` 因为直接绑 Electron，至今一行测试都没有。
- **契约测试与实现分离。** `contract.test.ts` 导出一个
  `describeNoteRepository(factory)`，阶段 2 的 Vault 实现直接复用同一套断言。
  两个实现对同一批断言全绿，是「换底座没换行为」的唯一可信证据。

**验收**：全部现有功能不变，`npm test` / `npm run typecheck` 全绿，
且契约测试对 SQLite 实现通过。

### 阶段 2 · Vault 实现

```text
electron/vault/
├── frontmatter.ts        YAML 读写，只用标准字段
├── fileName.ts           标题 → 安全文件名，重名加序号
├── atomicWrite.ts        tmp → fsync → rename
├── vaultCatalog.ts       note_catalog 表（路径缓存，不存正文）
├── vaultWatcher.ts       外部改动 → 增量对账
├── conflictResolver.ts   编辑中 + 外部改动的三选一
└── markdownVaultRepository.ts
```

**验收**：契约测试对 Vault 实现全绿（与阶段 1 同一套断言）；
外部在 Finder 里改名 / 移动 / 编辑文件后，应用在 2 秒内反映出来。

### 阶段 3 · 迁移工具

按提案的 13 步走，一步不省。补两条提案没写的：

- **迁移期间禁写**：迁移开始先 `flushPendingIndexing()` 并挂起自动保存，
  否则渲染进程的防抖保存会往正在导出的 db 里写。
- **校验失败就是失败**：校验项任意一条不过，**不切换 `storageMode`**，
  临时目录保留供排查，不自动删除。

**验收**：拿一份真实工作区跑迁移，页数 / 每篇 hash / 附件数 / 链接解析数 /
标签数全部一致；故意破坏一个文件后校验必须报错。

### 阶段 4 · 知识索引切源

`knowledgeService.allIndexablePages()`（`knowledgeService.ts:52`）从
直查 `pages` 表改成 `repository.listPages()`。引擎本身
（`electron/knowledge/*`）**一行不改**——它的每个函数第一个参数都是
`Database`，和正文从哪来无关，这是上一轮改造留下的红利。

**验收**：双链、反向链接、中文搜索、相关笔记、AI 引用、重命名传播，
六项在 Vault 模式下全部工作，且 `engine.test.ts` 40 条断言不动一行仍全绿。

### 阶段 5 · 弱化旧库

`pages.content` 停写 → 停读 → 保留一到两个版本的只读兼容 → 删列。
同时执行 D6 的第二步（db 挪进 `.prism/`）。

## 五、不做的事

沿用提案第九节，另加三条实测得出的：

- 不在阶段 1 引入任何文件 IO——抽象和实现分两次提交，出问题才分得清是谁的错。
- 不让 `NoteRepository` 保留同步方法「方便过渡」。留一个同步口子，
  退出前的收尾路径就会一直用它，阶段 2 再改就是在最危险的代码里改。
- 不把 `.prism/` 整个当缓存。里面既有可丢的（catalog、FTS、向量），
  也有不可丢的（标注侧车、order.json），备份策略必须区分。

## 六、阶段 1 的具体改动

见同一提交的代码。要点：

1. 新增 `electron/repositories/`，`SqliteNoteRepository` 逐个包装
   `documentService` 的导出，**不改任何一行 documentService**。
2. `workspaceHandlers` / `knowledgeService` / `insightGraphService` /
   `knowledgeBaseService` / `libraryHandlers` 改为经 `getNoteRepository()`。
3. `main.ts` 退出路径：`flushPendingIndexing()` 变成 `await`，
   并且必须在 `closeDb()` **之前** 完成——现在是同步调用，改异步后
   如果不 await，最后一次索引会写进一个已经关掉的数据库。
4. 契约测试 `describeNoteRepository()`，阶段 2 复用。
