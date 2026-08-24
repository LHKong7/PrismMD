# 2026-08-24 · 从「Markdown 编辑器」到「个人知识库」：笔记索引与链接图

## 背景 / 问题

PrismMD 已经能写、能读、能让 AI 聊当前文档，但它**不是一个知识库**——
它是一个带 AI 的 Markdown 编辑器。差别在三件事上：

1. **笔记之间没有连接。** 只有文件树的父子关系。文件夹回答「我把它放哪了」，
   而知识库要回答「这篇和什么有关」。没有反向链接，就没有「我以前想过什么」。
2. **搜不到。** `workspace:search` 是 `content LIKE '%q%'`：没有排序、没有词形
   归一（搜 `retries` 找不到写着 `retry` 的笔记）、中文只能整句匹配。
3. **AI 读的是快照，不是笔记。** 旧的 “Knowledge Base”
   （`knowledgeBaseService.ts`，见 [2026-05-17-knowledge-base.md](./2026-05-17-knowledge-base.md)）
   在你手动「添加」时把文件**复制**到 `userData/knowledge/docs/`，然后
   `getContext()` 用 `terms.some(t => haystack.includes(t))` 在
   **标题 + 标签 + 摘要**（不含正文）上做子串匹配，取前 3 篇、每篇截断 2000 字。
   两个致命点：副本在你编辑笔记的那一刻就过时了；而且你不记得手动添加，
   它就什么都不知道。

本次改动的目标：把「实时的、全部笔记」变成检索与链接的唯一事实来源。

## 设计决策

### 为什么自己做分词，而不是交给 FTS5

SQLite 的 `unicode61` 把 CJK 表意文字当作普通字母，**连续中文之间没有词边界**，
整句 `机器学习的笔记` 会被索引成**一个 token**——只有把这句原样打回去才搜得到。
中文检索会静默地返回空结果，这是最坏的一种坏。

`trigram` 分词器能救中文，但会毁掉英文（无词边界、无前缀查询），而这个仓库
是双语的。所以在 TS 里归一化后，**喂给 FTS5 一份预分词、空格分隔的文档**：
拉丁文小写成词，CJK 切成重叠 bigram（`机器学习` → `机器 器学 学习`），
`unicode61` 只需要按我们插入的空格切分。查询走**同一个函数**，索引与查询
永远一致。BM25 排序照常可用。

同样的理由加了一个**很小的英文词干还原**（`retries`→`retry`、`indexing`→`index`）：
它不追求语言学正确，只追求两侧一致——不完美但两边都用的规则仍然能匹配上，
完美但只用在一侧的规则永远匹配不上。

### 为什么链接指向标题，而不是 page id

笔记存在 SQLite 里、主键是 UUID，最"自然"的做法是存 `target_page_id` 外键。
但知识库的用法是：**你在想到的那一刻就写下 `[[卡尔曼滤波]]`，笔记还不存在**。
所以 `note_links` 只存归一化后的标题，解析是**查询时的 join**
（`note_links.target_norm = note_titles.norm_title`）：

- 先写链接、后建笔记 → 建的那一刻自动接上；
- 改标题 → 下一次索引重新解析，不会留下悬空外键；
- 未解析的链接不是错误，而是**「你打算写但还没写的东西」**，值得展示成清单。

配套做了**重命名传播**（`propagateRename`）：改标题时改写所有指向它的
`[[...]]` 原文。改在**源文本**上而不是做 id 映射，磁盘上的内容仍然是真相，
在任何别的 Markdown 工具里也照样可读。一个「改个名字就把自己所有链接改断」
的知识库，等于在教你别改名字，也就是在教你别改进笔记。

### 为什么切块（chunk）而不是整篇打分

知识库是用**段落**回答问题的。按整篇排序时，一篇讲六个主题的四千字笔记会压过
一篇正好讲你所问的八十字笔记，而且引用只能指到「这篇里的某处」。
按标题切块之后，命中是**可寻址的**：`部署 > 回滚`。切分点取自标题而不是固定字数，
因为标题是作者自己已经划出的结构；纯按字数切会把一段论证拦腰截断。

### 为什么用 RRF 融合，而不是一个综合分

信号之间不可比：BM25 是无界负数，链接邻接是布尔，标签命中是计数，
将来还要接向量相似度。硬归一到同一量纲就等于发明一组在下一个语料上必然错的
权重。RRF 只看每个信号的**排序**，加一个新信号不需要重调旧的。

当前四路信号：正文 BM25（1.0）、标题匹配（1.6）、标签匹配（1.2）、
链接邻居（0.5，需要传入「你正在看的那篇」）。

### 旧的快照库怎么办

没有删。`kb:*` 通道与 `knowledgeBaseService` 原样保留（那是**迁移前配置的
唯一记录**），但：

- **检索路径已经全部迁走**：`agentStore.sendMessage` 不再调 `kbGetContext`，
  改调 `knowledge:retrieve`；
- 文案改成诚实的说法：Settings 里它是「导入的快照」，不再自称知识库，
  文件树右键从「Add to Knowledge Base」改成「保存快照」。

## 改动清单

### 纯逻辑层（无 IO，可单测）—— `electron/knowledge/`

| 文件 | 作用 |
| --- | --- |
| `tokenize.ts` | 双语分词：拉丁词 + CJK bigram + 轻量词干还原；`toIndexDocument()` 产出喂给 FTS5 的预分词文档，`toMatchQuery()` 产出 OR 连接、逐词加引号的 MATCH 表达式 |
| `chunk.ts` | 按 ATX 标题切段（识别代码围栏），过短的段并入下一段，过长的段按空行切并留重叠；偏移量始终指回原文 |
| `links.ts` | `[[目标]]` / `[[目标\|别名]]` / `[[目标#标题]]`、`#标签` 的抽取；`maskCode()` 用等长空格屏蔽代码，保证偏移量不移位；`rewriteWikiLinks()` 支撑重命名传播 |
| `rank.ts` | RRF 融合、按命中密度取片段的 `buildSnippet()` |
| `schema.ts` | `note_chunks` / `note_chunks_fts` / `note_titles` / `note_links` / `note_tags` / `note_index_state`；FTS5 不可用时降级 |
| `engine.ts` | 索引、增量同步、搜索、反向链接、相关笔记、未解析链接、孤立笔记、统计、整表重建、给 AI 用的 `buildRetrievalContext()` |

`engine.ts` 的每个函数第一个参数都是 `Database`，因此整套引擎可以对内存
SQLite 做真实测试——FTS5 行为、bm25 排序、按标题 join 这三件事恰恰是 mock
一定会搞错、而线上一定会坏的部分。

### 主进程接线

- `electron/services/knowledgeService.ts` —— 绑定 `getDb()` 与 `documentService`，
  负责**调度**（何时索引）、**取数**（页面从哪来）、**通知**（`knowledge:updated`）。
  自动保存是逐字触发的，所以内容改动走 1.5s 防抖；新建/导入/重命名立即索引
  （新笔记的标题正是别处 `[[链接]]` 的解析依据，晚一秒半看起来就像链接坏了）。
- `electron/ipc/knowledgeHandlers.ts` —— `knowledge:*` 全部通道。
- `electron/ipc/workspaceHandlers.ts` —— 在 create / update / delete / restore /
  import 上挂索引；`workspace:search` 改为索引排序，`searchPages` 保留为兜底
  （`sched` 这类词首片段分词器给不出，但 LIKE 能给）。
- `electron/main.ts` —— 启动后 `setImmediate(initKnowledgeIndex)` 做一次对账；
  退出前 `flushPendingIndexing()`，否则本次会话最后一段直到下次启动才进索引。

### 渲染层

- `src/lib/markdown/remarkWikiLink.ts` —— 把 `[[...]]` 渲染成可点链接。
  **只标记、不解析**：存不存在交给组件问索引，在解析期定死答案会让链接一直
  显示成坏的，直到文档被重新解析。
- `src/components/knowledge/WikiLink.tsx` —— 已存在 → 打开；不存在 →
  **点击创建**。未解析是一等状态，不是错误。
- `src/components/editor/editorWikiLinkComplete.ts` —— `[[` 补全，候选来自侧边栏
  已有的页面树（每次按键走 IPC 会让弹窗追不上光标）。与 `/` 命令共用**同一个**
  `autocompletion()` 实例：两个实例会抢弹窗，且后注册的静默取胜。
- `src/store/knowledgeStore.ts` —— 索引读取走主进程；**链接解析在本地**用页面树
  回答：一篇四十个链接的文档否则会在每次重渲染时发四十次 IPC，而且答案晚一帧
  到达，链接会肉眼可见地从「坏」闪成「好」。
- `src/components/knowledge/KnowledgePanel.tsx` + 右侧栏新 tab —— 反向链接 /
  链出（含未写）/ 相关笔记 / 标签 / 索引统计与重建。
- `src/store/agentStore.ts` —— 检索改走 `knowledge:retrieve`，引用编号接在
  graph evidence 之后（两者共用同一个 `[n]` 命名空间，撞号会把引用指错源）。
- `src/components/agent/ChatMessage.tsx` —— 引用带 `pageId` 时先**打开那篇笔记**
  再滚动；否则会在当前文档里找一段根本不在这里的话，看起来像死链。
- `src/store/workspaceStore.ts` —— 新增 `syncExternalEdit()`：重命名传播会改写
  **别的**笔记的正文，如果那篇正开着，它的下一次自动保存会把改写原样覆盖回去。
  主进程把被改写的 id 随 `workspace:update-page` 一起返回，渲染端逐个刷新；
  沿用 `savePage` 的 `!isDirty` 守卫，正在打字的人的内容永远优先。
- i18n：`knowledge.*` 与 `settings.knowledge.*` 中英双语齐备。

## 验证方式

```bash
npm test        # 224 passed（新增 121：tokenize 19 / chunk 11 / links 20 /
                #   rank 11 / engine 40 / remarkWikiLink 18 + 20 parity）
npm run typecheck
```

`engine.test.ts` 针对内存 SQLite 跑真实查询，重点断言几个「静默失败」型问题：

- 中文查询能命中（换成 FTS5 原生分词这条会返回空数组）；
- 改内容后**旧的 FTS 行确实被删掉**了（否则索引会一直匹配一段已经不存在的文字）；
- 先写链接、后建笔记会自动解析；
- 重新索引未改动的笔记是 no-op（自动保存的前提）；
- 命中的 `startOffset/endOffset` 切回原文确实是那段话；
- 「重建索引」按钮走 `resetKnowledgeIndex()`（丢表重建）而非 force 重索引，
  因为它要修的恰恰是**索引自己都不知道的行**——比如在 `clearPageRows` 两次写
  之间崩溃留下的孤儿 FTS 行，它会一直匹配一段已经不存在的文字；
  测试里直接构造了这个孤儿行。

`remarkWikiLink.test.ts` 末尾的 parity 测试对同一批 Markdown 断言
**渲染器与索引解析出完全相同的链接**——两边各有一份正则、跑在两个进程里，
一旦分歧就是「显示成链接却不出现在反向链接里」这种无声故障。

## 后续项

- **向量检索**：`workspace.db` 里的 `note_embeddings` 表仍是空的。`engine.ts`
  的融合层已经按「再加一路信号」设计，接上 embedding provider 后
  只需多传一个 `FusionList`。当前是词法 + 结构，无网络依赖。
- **前缀查询**：`sched` 搜不到 `scheduler`（分词器不做前缀），目前靠标题 LIKE
  和 `searchPages` 兜底。上 FTS5 的 `term*` 需要按词位分别处理拉丁与 CJK。
- **图视图**：`GraphView` 仍然只画 InsightGraph/Neo4j 的实体图。本地链接图
  已经有数据（`note_links`），可以在不接 Neo4j 的前提下画出来。
- **未解析链接 / 孤立笔记面板**：IPC 与 store 已就绪（`knowledge:unresolved`、
  `knowledge:orphans`），尚未做成独立视图，目前只在 Settings 里露出计数。
- **快照库下线**：`kb:*` 通道已无检索职责，可在一次带迁移的改动里移除。
