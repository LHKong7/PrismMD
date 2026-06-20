# 修复主题色错误 —— accent 背景上的文字硬编码 #fff

## Background / Context

用户反馈：「当前主题在不同地方颜色用错了，请修复」（"the current theme has some
wrong place for different color"）。在 PrismMD 的 14 套主题中切换时，部分 UI 元素
（主按钮、徽章、过滤标签、选中态等）的文字颜色显示不正确 —— 尤其在 **Campfire**
主题下，亮橙色的强调色按钮上的白色文字几乎不可读。

## 根因分析 / Root cause

主题系统（`src/lib/theme/themes.ts`）为「**强调色背景之上的文字**」专门定义了
`--accent-ink` token，但只有 3 套 Prism 身份主题定义它：

| 主题 | `--accent-color` | `--accent-ink` |
|------|------------------|----------------|
| parchment | `#b06a2c`（铜色） | `#faf6ee`（近白） |
| campfire  | `#e08a3c`（**亮橙**） | `#1a140e`（**近黑**）|
| newsprint | `#8c3a2b`（暗红） | `#f8f5ef`（近白） |
| 其余 11 套 | 各自的强调色 | **未定义** |

`themes.ts` 顶部注释明确要求：「Components must NEVER hardcode hex colors … they
should reference these tokens」。但代码里大量元素直接写死
`color: '#fff'`（或 `color="#fff"` / `color: white`）放在 `var(--accent-color)`
背景上。对 Campfire 而言，主题作者本意是用**深色墨水** `#1a140e` 压在亮橙底色上，
硬编码的白字直接破坏了这一设计，造成 ~2–4:1 的低对比度（不达 WCAG AA）。

**修复策略**：把这些位置统一改为 `color: 'var(--accent-ink, #fff)'`。
这是**对所有 14 套主题零回归**的安全改动 —— 未定义 `--accent-ink` 的 11 套主题
回退到 `#fff`（与现状完全一致），而 parchment/campfire/newsprint 拿到各自正确的墨水色。

## 设计取舍 / Design decisions

- **审计方式**：用多 agent workflow 扫描 22 个含硬编码颜色的组件 + 3 个 CSS 文件，
  对每个候选项做对抗式校验（确认其背景确实是 accent、且修复在 14 套主题下都安全），
  剔除误报。最终确认 18 处真实 bug，拒绝 4 处误报。
- **区分「该改」与「不该改」**：刻意**保留**以下硬编码色，它们是有意为之而非主题 bug：
  - 厂商品牌色 tab（OpenAI `#10a37f` / Google `#4285f4` 等）—— `SettingsPanel.tsx:726`
  - Horse Mode 品牌徽章 `#8b5cf6` —— `AgentSessionsPanel.tsx:183`
  - 分类调色板徽章（`cat.color`）—— `PromptLibrary.tsx:135,232`
  - 沙箱 iframe 的白色页面背景 —— `SandboxedCodeBlock.tsx:116` / `ExecutableBlock.tsx:229`
  - 错误头像图标白字（`AlertCircle` 压在 `--color-error` 上，无 `--color-error-ink`
    token，白字是既有约定）—— `ChatMessage.tsx:138`
- **刻意跳过** `markdown.css` 的 `.badge-purple`（硬编码 `#8b5cf6`）：将其改为
  `var(--accent-color)` 会把作者意图中的「紫色徽章」在多数主题里变成蓝/铜/绿，属于
  **改变语义**而非修对比度，故不在本次范围内（见 Follow-ups）。

## Changes（18 处，跨 16 个文件）

统一把 `'var(--accent-color)', color: '#fff'` → `'var(--accent-color)', color: 'var(--accent-ink, #fff)'`：

- `src/components/ui/Button.tsx:66` —— 全局主按钮（影响面最大）
- `src/components/settings/SettingsPanel.tsx:1378,1646` —— MCP 保存 / 「立即重启」
- `src/components/settings/PromptLibrary.tsx:172`、`PromptSettings.tsx:132`、`TemplateSettings.tsx:121` —— 各保存按钮
- `src/components/settings/AgentSessionsPanel.tsx:188` —— 「当前会话」徽章
- `src/components/layout/StatusBar.tsx:84,251` —— Deep Editing 按钮等
- `src/components/horsemode/HorseModeDialog.tsx:241` —— 开始按钮
- `src/plugins/flashcard/FlashCardPanel.tsx:114` —— 生成按钮

其余非标准写法的同类修复：

- `src/components/agent/AgentSidebar.tsx:244` —— 多行 style 的 `color: '#fff'`
- `src/components/agent/ChatMessage.tsx:140` —— 用户头像 `User` 图标：
  `color="#fff"` → `style={{ color: 'var(--accent-ink, #fff)' }}`（与同文件 `Bot` 图标写法一致）
- `src/components/editor/EditorAIBubble.tsx:295` —— hover 时 `e.currentTarget.style.color`
- `src/components/reader/XlsxViewer.tsx:146` —— 选中 sheet 标签三元式
- `src/plugins/workspace/TaskPanel.tsx:70` —— 选中过滤标签三元式
- `src/styles/index.css:189` —— `::selection`（选中文本）：`color: white` → `color: var(--accent-ink, white)`

附带修复（同类「不随主题变」的颜色）—— 圆形色板描边 `1px solid rgba(0,0,0,.12)`
（12% 黑边在 Campfire/Dracula/Nord/Dark/Solarized Dark 等深色主题上几乎不可见，
在浅色主题上又是一圈偏离主题的灰边，导致各处色板描边不一致）统一改为
`1px solid var(--border-color)`：

- `src/components/layout/TitleBar.tsx:231` —— 标题栏主题切换按钮的预览小圆点
- `src/components/settings/SettingsPanel.tsx:341` —— **主题预设卡片**（Reading identities /
  More presets）的色板小圆点。第一轮审计漏掉了这一处（被归到「预览色，勿动」的语境里），
  用户复查「更多预设」时发现此处颜色仍不对——本轮补修。
- `src/components/annotations/HighlightPopover.tsx:152` —— 高亮取色器的颜色圆点（同一模式的第三处）

> 经确认保留：`CommandPalette.tsx:91,102` 与 `HighlightPopover.tsx:126` 中的
> `rgba(0,0,0,…)` 均为 `var(--shadow-lg, …)` / `var(--accent-soft, …)` 的**回退值**
> （阴影、软色调本就偏暗），非主题 bug。

## Verification

- 审计 workflow：29 条确认（去重后 18 处）/ 4 条误报拒绝。
- `grep "'var(--accent-color)', color: '#fff'"` → **0** 处残留。
- `npx tsc -b --force`：本次改动文件**零新增类型错误**；`SettingsPanel.tsx`
  仅有的报错（873/939/968/984/1201）均为既有 InsightGraph/Neo4j 漂移，与本次无关。
- 安全性论证：11 套无 `--accent-ink` 的主题 `var(--accent-ink, #fff)` 回退到 `#fff`，
  视觉与改前完全一致；campfire 拿到 `#1a140e`（修复关键），parchment/newsprint 拿到
  近白墨水（与白几乎无差）。
- 手动验收：切到 Campfire 主题，主按钮 / 状态栏 / 徽章 / 选中文本的文字由白变深墨，
  对比度恢复正常；其余主题肉眼无变化。

## Follow-ups（本次未处理）

- **`Callout.tsx:46`** —— 图标 `color: 'var(--paper, #fff)'` 压在语义色
  （`--color-info/success/warning/error`）背景上。审计判定它在多套主题下确有对比度问题，
  但 `--accent-ink` 语义不匹配（那是给 accent 背景用的），且对 newsprint 的
  `--color-warning` 会引入回归。正确修法需为语义背景另设「ink」token 或统一 `--paper`，
  属独立改动。
- **`markdown.css:300` `.badge-purple`** —— 唯一未走语义 token 的徽章（硬编码紫色）。
  是否归一到 accent 取决于产品对该徽章语义的期望，另议。
