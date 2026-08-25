# 2026-08-25 · 阶段 2：Markdown Vault 存储后端

> 属于 [Vault 迁移计划](./2026-08-25-vault-migration-plan.md) 的第二阶段。
> 本阶段**只实现，不启用**：`repositoryFactory` 仍然默认返回 SQLite 后端，
> 切换要等阶段 3 的迁移工具与校验就位。

## 背景 / 问题

阶段 1 把存储收敛成了一个接口和一套 36 条契约断言。阶段 2 要做的是在这套契约
下面放第二个实现：正文是磁盘上真正的 Markdown 文件。

核心约束仍然是那一条：**文件是唯一内容真相，SQLite 里的一切都必须能从文件重建**。

## 设计决策

### 六个待定项按上一轮的建议落地

| | 决策 | 实现位置 |
|---|---|---|
| D1 | 排序进 `.prism/ui.json`，缺失则退化为按名排序 | `vaultSidecar.ts` |
| D2 | 文件夹 id = `dir:<相对路径>` | `vaultLayout.ts` |
| D3 | 二进制正文（抽取文本）留在 SQLite，懒重建 | 见「后续项」，本阶段只保证字节可取 |
| D4 | 标注走 `.prism/annotations/` 侧车 | 目录已在 layout 中约定，接线在阶段 4 |
| D5 | 文件名 stem 与 frontmatter `title` 都是别名 | `createPage` / `renamePage` 只在文件名表达不了标题时才写 `title` |
| D6 | db 暂留 `userData` | `repositoryFactory` 注入 db，不假设它在哪 |

### 为什么 frontmatter 不做 YAML 往返

最容易想到的做法是「解析成对象 → 改字段 → 序列化回去」。这在这里是**有损**的：
注释没了、键序变了、引号风格变了、我们不认识的结构被抹平。而 Vault 的意义正是
这份文件同时属于 Obsidian、git 和纯文本编辑器——一篇带着 `aliases`、`cssclass`
和一行注释进来的笔记，必须原样出去。

所以 `frontmatter.ts` **只按行做外科手术**：读取只认五个字段，写入只改自己那几行
键，其余字节一个不动。测试里专门有一条断言用 Obsidian 风格的 frontmatter 验证
这件事。

写入的字段只有 `id` / `title` / `created` / `updated`。`tags` **只读不写**——
那是作者手工维护的列表，替他重排是越权。

标量一律加双引号：标题里会出现 `:`、`#`、`[`、开头的数字，以及 `true` / `no` /
`2026-08-25` 这些在 YAML 里会变成别的类型的词。无条件加引号是**一条规则**，
而不加则是一张需要跟着 YAML 规范同步维护的例外清单。

### 为什么身份必须写进文件

在文件系统上，「重命名」只表现为「一个路径消失 + 另一个路径出现」。没有文件内部
的稳定 id，用户在 Finder 里拖一下笔记，应用只能理解成「删了一篇、来了一篇陌生的」
——反向链接、标注、树上的位置全部丢失，而现象是「笔记不见了，旁边多了个一样的」。

所以 `readIntoCatalog()` 在扫描时会给**没有 id 的文件补写一行 frontmatter**。
这确实是在改用户的文件，是一次自觉的取舍：写入是外科式的（一行，其余字节不变），
换来的是外部任何工具重组目录之后，笔记依然是那篇笔记。

`vaultWatcher.reconcilePaths()` 是这条设计的兑现处：它先把一批路径全部读完，
再把剩下的判定为删除，因此重命名的两个事件不论到达顺序如何都会被合并成一次
`moved`。测试里正反两种顺序都断言了。

### 原子写

`fs.writeFile` 是先截断再写。掉电、进程被杀、或者同步客户端在中途读走，
磁盘上就是**半篇笔记**，另一半永久消失。数据库里这个窗口叫事务，Vault 里
就叫 `atomicWrite.ts`：写同目录临时文件 → `fsync` → `rename` 覆盖。

两个容易漏的细节：

- 临时文件必须是**同目录兄弟**。跨设备 `rename` 不是原子的（Windows 上直接失败），
  而放在外置硬盘上的 Vault 正好会踩到。
- 不 `fsync` 就 `rename`，崩溃后可能留下一个**名字正确的空文件**——比半截文件更糟，
  因为它看起来完全正常。

### 排序为什么不进 frontmatter

把顺序写进笔记，意味着在侧边栏拖一下就要改内容文件、刷新 mtime、在 git 里产生
diff——于是人们不再整理侧边栏，而那正是这个功能存在的理由。所以顺序和图标进
`.prism/ui.json`，并且明确标记为**可丢失**：文件没了就退化成按名排序，图标消失，
没有任何一篇笔记受影响。测试里直接删掉 `ui.json` 验证了这条退化路径。

`.prism/` 因此**不是**一个统一的缓存目录：`ui.json` 可丢，`annotations/` 不可丢。
备份策略必须区分，这一点写在 `vaultLayout.ts` 的文件头里而不是留给人推断。

### 删除不是 unlink

删除是移进 `.trash/<uuid>/`，并把原路径记在 `note_trash` 里。一个「删了就没了」
的知识库，人是不敢精简的，而不精简的知识库会慢慢失去用处。

`<uuid>` 这一层子目录是必要的：两篇同名笔记可以同时在回收站里而不互相覆盖。
恢复时如果原位置已经被新笔记占用，会落在旁边（`Shared 2.md`）而不是覆盖它。

## 改动清单

### 新增 `electron/vault/`

| 文件 | 作用 |
| --- | --- |
| `frontmatter.ts` | 按行外科手术式读写；未知字段、注释、键序原样保留 |
| `fileName.ts` | 标题 → 跨平台安全文件名；Windows 非法字符 / 保留名 / 尾部点空格 / 不可见字符 / 按**字节**截断 / 大小写不敏感去重 |
| `atomicWrite.ts` | tmp → fsync → rename；跨设备移动降级为 copy+rm；崩溃残留清扫 |
| `vaultLayout.ts` | 路径约定、忽略规则、路径包含性校验、文件夹 id |
| `vaultCatalog.ts` | `note_catalog`（id↔路径缓存，**不存正文**）与 `note_trash` |
| `vaultSidecar.ts` | `.prism/ui.json`：顺序与图标，可丢失 |
| `markdownVaultRepository.ts` | `NoteRepository` 的文件实现 |
| `vaultWatcher.ts` | 纯函数 `reconcilePaths()` + chokidar 适配器；自身写入不回声 |
| `conflictResolver.ts` | 三个布尔的状态空间，四种结论；「两边都改了」只允许发问 |

### 改造

- `repositories/noteRepository.ts` —— 新增 `readPageBytes()`。二进制文档也是笔记，
  它的字节必须走同一条缝；否则 PDF 阅读器会绕过仓储直接摸 `assetService`，
  而 Vault 模式下那里根本没有文件。
- `repositories/contract.ts` —— 相应新增 2 条断言（共 38 条）。
- `repositories/repositoryFactory.ts` —— 新增 `useVaultRepository()`，**但没有调用点**。
- `ipc/workspaceHandlers.ts` —— `workspace:get-page-bytes` 改走仓储。

## 验证方式

```bash
npm test        # 408 passed（新增 184：frontmatter 22 / fileName 18 /
                #   atomicWrite 11 / vaultLayout 15 / watcher 21 /
                #   vault repository 61 + SQLite 契约 38 - 重叠）
npm run typecheck
```

**两个实现跑同一套契约断言**，这是「换底座没换行为」的唯一可信证据：
`contract.ts` 一行没改，`MarkdownVaultRepository` 直接绿。

契约之外，Vault 自己还有 23 条针对「笔记是文件」才成立的断言，重点是几个
静默失败型问题：

- 外部工具丢进来的文件会被收编并补上 id；
- 在 Finder 里移动过的笔记仍然是同一篇（`parentId` 变了，`id` 没变）；
- Obsidian 的 frontmatter 字段在一次编辑后依然在；
- 删除的笔记在 `.trash` 里，原位被占用时恢复不覆盖；
- 扔掉 catalog 从零重建，内容一字不差；
- `ui.json` 损坏或缺失时不影响任何一篇笔记。

对实现做了变异测试确认断言真的会咬：

| 变异 | 结果 |
| --- | --- |
| 重命名不再改写链接 | 4 条红 |
| 删除改成 unlink | 4 条红 |
| 外部文件不补写 id | 1 条红 |
| 保存时丢弃已有 frontmatter | 6 条红 |

## 后续项

- **阶段 3（迁移）**：按计划的 13 步，外加计划里补的两条——迁移期间挂起自动保存，
  以及校验失败就不切 `storageMode` 且保留临时目录。
- **二进制抽取文本（D3）**：`readPageBytes()` 已经保证字节可取，但 PDF 的抽取文本
  仍在渲染进程产出。Vault 模式下它需要一张明确的「可重建但只能懒重建」缓存表，
  且「重建索引」对二进制页面只清空、不重抽。
- **frontmatter 不可见**：编辑器里看到的是 body，用户目前无法在 PrismMD 内编辑
  自己的 `tags:` / `aliases:`。保留优先于可编辑是本阶段的取舍，
  但这是一条真实的功能缺口。
- **读放大**：`listPages()` / `countPages()` / `searchPages()` 会读全部文件。
  正确但线性，几千篇笔记以上需要用 catalog 的 hash 做短路。
- **重命名 journal**：跨文件改写目前不是崩溃安全的。`rewriteWikiLinks` 是幂等的，
  所以恢复策略可以是「重跑一遍」，但 journal 本身还没写。
