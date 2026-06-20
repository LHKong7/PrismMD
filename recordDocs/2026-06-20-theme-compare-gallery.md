# Prism — Compare：设计画布式「三种阅读风格」对比

## 背景 / 问题（Context）

从 Claude Design 项目 `Prism` 导入并实现 `Prism - Compare.html`。该设计**不是**一个简单的并排网格，
而是一个 Figma 式**设计画布**（`prism/design-canvas.jsx`）：暖灰网格画布上，把同一个工作区以三种
「阅读风格」（**Parchment / Campfire / Newsprint**）渲染成可缩放的**画板（artboard）**，
可**拖拽平移对比**，并能把任一画板**全屏聚焦**（←/→/Esc）。副标题：「同一个工作区、同一篇文档，
三套温暖的阅读系统，拖拽对比、按 ⤢ 全屏打开」。

调研确认三套身份主题、四款阅读字体、`--font-*`/`--spectrum-*` 令牌、按 `[data-identity]` 作用域的
衬线正文与 Newsprint 社论签名（首字下沉 + `§`）都**早已存在**于 PrismMD。设计应用层唯一缺失的，是
`Compare.html` 所代表的**对比体验本身**。

> 迭代记录：第一版实现为「全屏不透明面板 + 三栏静态网格 + 点选应用」。用户反馈
> 「当前的 UI 和 UX 交互和 design 中不同」——设计的核心是**可平移缩放的画布 + 画板 + 全屏聚焦**，
> 而非静态网格。遂按 `design-canvas.jsx` 的真实交互模型重写（本文档描述重写后的版本）。

## 设计决策（Design）

**复用主题，自造画布。** 不重复造主题；从既有 13–14 套中筛出三套身份主题（`themes.filter(blurb)`），
复用 `applyTheme` / `settingsStore.themeId` 持久化。

**忠实还原设计画布的交互与外观**（数值取自 `design-canvas.jsx`）：

- **暖灰网格画布**：`#f0eee9` 底，120×120px 的 1px SVG 网格（`rgba(0,0,0,.06)`，data-URI 背景，
  随世界平移缩放）。
- **平移 / 缩放**：变换状态存于 `ref`（`tf={x,y,scale}`），通过 `applyTransform()` **命令式**写到
  world 的 `transform: translate3d(x,y,0) scale(s)`（**不**放进 React style prop，故重渲染不会冲掉它）。
  指针拖拽平移（`setPointerCapture`，背景或中键触发，按钮/标签用 `data-pc-nopan` 排除）；
  **原生非被动 wheel** 监听做缩放（鼠标滚轮 `exp(±0.18)`、触控板捏合 `exp(-Δy·0.01)`、双指平移），
  光标定点缩放（`k=next/scale; x=px-(px-x)*k`）；`minScale 0.1 / maxScale 8`；另配 +/−/适配 按钮。
- **画板（artboard）**：字面 1440×900 的卡片（圆角 3、双层投影），用内联 CSS 变量
  （`{...theme.colors}`）+ `data-identity` + `.prism-compare-tile` 作用域；内含 **WorkspaceFrame**
  ——标题栏 + 页面栏 + 阅读列（`--paper` 纸面卡片里渲染 `.markdown-body` 示例文档），使三种风格读起来
  像「同一工作区被重新调音」。活动风格的画板加 `#c96442` 选中描边。
- **画板标签**：位于卡片上方，**反向缩放**（`transform: scale(1/scale)`，绝对定位不参与回流）以保持屏幕
  恒定大小；文案为设计的「Parchment · warm daylight」式标签；活动项显示 ✓ Current，悬停露出
  「使用此风格」+ ⤢ 按钮。
- **全屏聚焦覆盖层**：`⤢` 打开，深色毛玻璃背板，单画板按
  `scale=max(.1, min((w-200)/W,(h-260)/H,2))` 适配视口；含 ←/→ 环形导航、分页圆点、箭头、
  标题/序号说明，以及按身份强调色着色的「使用此风格」应用按钮；Esc 关闭。
- **分区标题**：设计中标题在世界内并反向缩放，但那会引入「布局高度依赖缩放」的回流/适配循环依赖问题。
  取舍：将标题/副标题改为**屏幕固定**（恒定大小、暖灰底上始终清晰、平移时常驻可见），其余画布交互
  （网格/平移缩放/反缩放标签/全屏聚焦）保持与设计一致。
- **取消设计中的编辑器专属能力**（拖拽重排、删除、标签内联编辑、状态落盘、与宿主工具栏的 postMessage
  缩放同步）——这些是设计工具的创作功能，只读对比画廊不需要。

**单一根 + 焦点陷阱 + Esc 分层**：全屏聚焦层内嵌在画廊根节点内（非 portal），故同一个 `useFocusTrap`
即可覆盖；一个捕获阶段的 window keydown 统一处理：Esc 先收起聚焦层、否则关画廊；聚焦层打开时 ←/→ 导航。

**入口**：设置 → 主题「阅读风格」标题右侧「对比」按钮；命令面板「对比阅读风格」。

## 改动清单（Changes）

- `src/components/theme/ThemeCompare.tsx`（新增/重写）：设计画布式对比画廊。`SampleDoc`、`WorkspaceFrame`
  （1440×900 工作区 mock）、`ScopedArtboard`（作用域画板）、`Artboard`（行内槽 + 反缩放标签栏）、
  `FocusOverlay`（全屏聚焦 + ←/→/Esc + 圆点/箭头），`ThemeCompare`（画布 + 平移缩放 + 固定标题 + 行
  + 缩放控件 + 提示）。
- `src/store/uiStore.ts`：`compareOpen` / `openCompare` / `closeCompare`。
- `src/App.tsx`：挂载 `<ThemeCompare/>`。
- `src/components/settings/SettingsPanel.tsx`：「阅读风格」标题行「对比」按钮 → `openCompare()`；
  Compare 打开时让渡自身焦点陷阱（`useFocusTrap(dialogRef, open && !compareOpen)`）。
- `src/components/commandpalette/CommandPalette.tsx`：命令「对比阅读风格」（`Palette` 图标）。
- `src/styles/markdown.css`：`.prism-compare-tile` 身份泄漏中和 + Newsprint 重新应用（沿用）。
- `src/i18n/locales/{en,zh}.json`：`themeCompare.*`（含 `labels.*` / `frame.*` / `hint` / `focus` /
  `prev` / `next` / `zoomIn` / `zoomOut` / `fit` / `apply` / `active` / `sample.*`），en/zh 对齐。

## 验证方式（Verification）

- 类型检查：`tsc -p tsconfig.web.json --noEmit` 总错误数 **45**（= 既有 baseline，本文件内 **0** 新错误）。
- JSON 校验：en/zh 均 `JSON.parse` 通过。
- 对抗式多 agent review（平移缩放 / React effect / 焦点键盘 a11y / 作用域 i18n 四维度，默认证伪核验）。
- 手动：设置→主题→「对比」或命令面板打开；暖灰网格画布上三块工作区画板并排，分别为暖铜 / 余烬深色 /
  社论暗红+首字下沉；拖拽平移、滚轮缩放、+/−/适配 可用；点画板 ⤢ 全屏聚焦，←/→ 环形切换、Esc 收起；
  「使用此风格」即时全局换肤并标 ✓；Esc 关闭画廊且不连带关闭其后的设置面板。

## 对抗式 review 修复

**第一轮（静态网格版）确认并修复 3 处**（修复在重写后仍保留）：死的背景点击关闭分支（删除）、
缺焦点陷阱且从设置进入时焦点被背后隐藏的设置面板抢走（加 `useFocusTrap`/`role=dialog`，并让设置在
Compare 打开时让渡自身陷阱）、`<pre><code>` 内边距/字号叠加（内层 `<code>` 内联复位）。

**第二轮（设计画布版）确认并修复 3 处**：

1. **（高·性能）每次滚轮缩放都全量重渲三棵画板树。** `zoomAt` 每个 wheel tick 调 `setScaleTick` 以更新
   反缩放标签，但 `scaleTick` 作为 `scale` 传入三个 `Artboard`，连带把三棵 1440×900 的
   `WorkspaceFrame`/`SampleDoc`（各含 `useTranslation` 与整篇 markdown）每格重渲一遍——正是 ref 式命令
   变换本要避免的开销（平移因无 setState 而流畅，反衬出缩放卡顿）。
   → 修复：标签反缩放改用 `applyTransform()` 已写到 `worldRef` 的 CSS 变量 `--pc-inv`
   （`transform: scale(var(--pc-inv))` + `margin-bottom: calc(8px * var(--pc-inv))`），彻底移除
   `scaleTick` 状态；**平移与缩放现均零重渲**。
2. **（高·a11y）全屏聚焦层打开不接管焦点、关闭丢焦点到 `body`。** 唯一的 `useFocusTrap(overlayRef, open)`
   只依赖 `open`、不依赖 `focusIndex`：聚焦层（z:10）打开后焦点仍停在其背后被遮挡的画板按钮上，Tab 会先
   走一遍隐藏按钮；关闭时被聚焦的按钮卸载，焦点落到 `document.body`。
   → 修复：把陷阱**让渡**给聚焦层——画廊陷阱改为 `useFocusTrap(overlayRef, open && focusIndex === null)`，
   `FocusOverlay` 自带 `useFocusTrap(rootRef, true)`（挂载即接管、卸载即归还，沿用设置面板同款握手）。
3. **（中·a11y）画廊打开时初始焦点落在 `opacity:0` 的按钮上、无焦点环。** 陷阱默认聚焦首个可聚焦后代
   （首块画板的「使用此风格」按钮，悬停前 `opacity:0`）。
   → 修复：CSS 增 `.pc-slot:focus-within .pc-btns { opacity:1 }` 与各画布按钮的 `:focus-visible` 描边
   （`2px solid #c96442`），聚焦即可见且有焦点环。

> 其余受审项经核验**非缺陷**：Esc 分层（捕获阶段 + `stopPropagation` 压过设置面板冒泡监听，不连带关设置）、
> 聚焦层 z 层级与可点性、三身份「使用此风格」按钮对比度（均显式定义 `--accent-ink`，Campfire 深墨压亮橙）、
> ←/→ 环形导航取模、命令式变换跨重渲持久（`transform` 不在 React style prop 中）。

## 后续项（Follow-ups，可选）

- 画板内容为**示例工作区 + 固定短文**（贴合设计「同一工作区、同一篇文档」），未渲染用户真实文档
  （需接入真实 markdown 渲染链路；且三实例独立换肤与单例 store 冲突，故用 mock）。
- 分区标题改为屏幕固定（非随画布平移），为规避反向缩放的回流/适配循环；如需严格还原可改用 CSS `zoom`
  并迭代适配数学。
- 未实现设计画布的创作能力（重排/删除/内联编辑/落盘/宿主缩放同步）——只读对比画廊无需。
