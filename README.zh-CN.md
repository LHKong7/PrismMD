<div align="center">
  <img src="prismlogo.png" alt="PrismMD logo" width="160" />

  <h1>PrismMD</h1>

  <p>
    <strong>一款精美的、AI 原生的跨平台 Markdown 阅读器与编辑器。</strong>
  </p>

  <p>
    <a href="#许可证"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
    <a href="#环境要求"><img alt="Node" src="https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg"></a>
    <img alt="Platforms" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey">
    <img alt="Electron" src="https://img.shields.io/badge/electron-33-47848f">
    <img alt="TypeScript" src="https://img.shields.io/badge/typescript-5.6-3178c6">
    <a href="https://github.com/LHKong7/PrismMD/issues"><img alt="Issues" src="https://img.shields.io/badge/issues-welcome-orange.svg"></a>
  </p>

  <p>
    <a href="./README.md">English</a> | 简体中文
  </p>
</div>

---

PrismMD 是一款跨平台桌面应用，将 Markdown 视为一等思考媒介。它不仅能渲染 GFM、LaTeX 和 Mermaid 图表，还内置 AI 阅读助手，可以与当前文档对话、记忆历史对话，并可选地从你保存的每篇文档构建的本地知识图谱中检索上下文。

## 目录

- [核心功能](#核心功能)
- [环境要求](#环境要求)
- [快速上手](#快速上手)
- [配置说明](#配置说明)
  - [AI 服务商](#ai-服务商)
  - [知识图谱（可选）](#知识图谱可选)
  - [隐私模式](#隐私模式)
- [构建与打包](#构建与打包)
- [项目结构](#项目结构)
- [脚本命令](#脚本命令)
- [技术栈](#技术栈)
- [参与贡献](#参与贡献)
- [安全](#安全)
- [致谢](#致谢)
- [许可证](#许可证)

## 核心功能

### 阅读与渲染

- **Markdown 渲染** — 完整的 GitHub 风格 Markdown，支持代码语法高亮、KaTeX 数学公式、Mermaid 图表
- **多格式支持** — 除 Markdown 外，还支持预览 PDF、CSV、Excel (XLSX) 和 JSON 文件
- **目录导航** — 从文档标题自动提取，固定在侧边栏，点击即可跳转
- **专注模式** — 无干扰阅读体验，除正文外一切元素变暗
- **文件树 & 文件监听** — 工作区文件资源管理器，磁盘文件变更时自动热重载

### 编辑

- **内置编辑器** — 基于 CodeMirror 6 的 Markdown / JSON / CSV 文本编辑，支持语法高亮、行号、撤销/重做
- **阅读/编辑模式切换** — `Cmd/Ctrl+E` 一键切换阅读与编辑模式
- **保存快捷键** — `Cmd/Ctrl+S` 保存，标题栏脏标记（`●`）提示未保存修改
- **安全保护** — 切换文件、关闭窗口前检查未保存修改，外部修改冲突提示

### AI 阅读助手

- **多模型对话** — 使用 OpenAI、Anthropic、Google AI、本地 Ollama 或任何 OpenAI 兼容接口与文档对话
- **对话记忆** — 每个文件独立记忆历史对话，支持更丰富的追问
- **文档摘要** — 自动生成 2–3 句 TL;DR 摘要和 3 个推荐问题
- **选中文本 AI 气泡** — 选中文字后直接弹出上下文菜单，向 AI 提问
- **MCP 工具集成** — 支持 Model Context Protocol 工具服务器扩展 AI 能力

### 知识图谱

- **InsightGraph 集成** — 基于 Neo4j 的图谱 RAG（图检索增强生成）
- **实体链接** — Markdown 渲染中的实体名称可点击，直接跳转到知识图谱
- **多维度视图** — 支持文档级、全局合并、实体级三种图谱可视化范围
- **批量导入** — 右键文件夹一键将所有文档导入知识图谱
- **文档级优先** — 默认只展示当前文档的知识图谱，用户主动点击"全局"按钮才合并查看

### 标注与笔记

- **多色高亮** — 黄、绿、蓝、粉、紫五种高亮颜色
- **笔记管理** — 为高亮段落添加备注，弹出面板管理

### 通用功能

- **命令面板** — `Ctrl/Cmd+P` 快速跳转文件、切换主题、执行各种操作
- **全文搜索** — 基于 MiniSearch 的全文检索，支持 Markdown、CSV、TXT
- **主题切换** — 亮色 / 暗色 / 跟随系统，内置 Nord、Solarized 等多种预设主题
- **macOS 毛玻璃效果** — 原生 vibrancy 支持
- **隐私模式** — 一键阻断所有外部 API 调用，强制本地模型
- **国际化** — 内置英文和简体中文
- **插件系统** — 支持外部插件加载扩展

## 环境要求

- [Node.js](https://nodejs.org/) `>= 18`
- [npm](https://www.npmjs.com/) `>= 9`
- *（可选）* [Ollama](https://ollama.com/) — 本地 LLM 推理
- *（可选）* [Neo4j](https://neo4j.com/) `>= 5`（Bolt 协议可达）— 仅在开启知识图谱功能时需要

## 快速上手

```bash
# 1. 克隆仓库
git clone https://github.com/LHKong7/PrismMD.git
cd PrismMD

# 2. 安装依赖
npm install

# 3. 开发模式运行（Vite 开发服务器 + Electron 热重载）
npm run dev
```

首次启动后，打开 **设置**（`Ctrl/Cmd + ,`）配置 AI 服务商。

## 配置说明

所有配置均在应用内完成，无需修改任何文件。设置通过 [`electron-store`](https://github.com/sindresorhus/electron-store) 持久化到系统用户数据目录：

| 平台      | 存储路径                                          |
| --------- | ------------------------------------------------ |
| macOS     | `~/Library/Application Support/PrismMD`           |
| Windows   | `%APPDATA%/PrismMD`                               |
| Linux     | `~/.config/PrismMD`                               |

### AI 服务商

打开 **设置 → AI** 启用一个或多个服务商：

| 服务商        | 类型   | 所需配置                                                                        |
| ------------- | ------ | ------------------------------------------------------------------------------- |
| **OpenAI**    | 云端   | API Key — [platform.openai.com](https://platform.openai.com/)                   |
| **Anthropic** | 云端   | API Key — [console.anthropic.com](https://console.anthropic.com/)               |
| **Google AI** | 云端   | API Key — [aistudio.google.com](https://aistudio.google.com/)                   |
| **Ollama**    | 本地   | 安装 Ollama 并拉取模型即可，无需 API Key，默认 `localhost:11434`                    |
| **自定义**    | 任意   | 任何 OpenAI 兼容端点（vLLM、LM Studio、自建服务等）                                |

选择活跃的服务商和模型，点击 **激活**，然后打开 AI 侧边栏（`Ctrl/Cmd + /` 或点击机器人图标）即可开始与文档对话。

**支持的模型示例：**
- OpenAI: GPT-4o、GPT-4o-mini、GPT-4-turbo、GPT-3.5-turbo
- Anthropic: Claude Sonnet 4、Claude Haiku 4、Claude 3.5 Sonnet
- Google AI: Gemini 1.5 Pro/Flash、Gemini Pro
- Ollama: llama3、qwen2、mistral、codellama、gemma2 等

### 知识图谱（可选）

PrismMD 内嵌 [InsightGraph](https://www.npmjs.com/package/@insightgraph/sdk-embedded) 管道，可将每篇文档保存为知识图谱中的节点，实现跨文档问答。

1. 启动 Neo4j 实例，例如使用 Docker：
   ```bash
   docker run -p 7687:7687 -e NEO4J_AUTH=neo4j/mypassword neo4j:5
   ```
2. 在 **设置 → 知识图谱** 中输入 Bolt URI、用户名和密码，点击 **测试连接**。
3. 开启功能。InsightGraph 复用你的 **活跃 AI 服务商** 进行实体抽取——需要 OpenAI 兼容的服务商（OpenAI / Ollama / 自定义）。Anthropic 和 Google 暂不支持。
4. 通过命令面板（`保存文档到知识图谱`）、文档摘要卡中的图谱按钮或右键文件树中的文件将文档保存到图谱。
5. 默认只生成并展示**当前文档**的知识图谱。点击图谱视图中的 **Global** 按钮可查看所有已导入文档的合并图谱。
6. 正常对话即可——助手会自动从图谱和当前文档中检索答案。

### 隐私模式

开启 **设置 → 隐私 → 隐私模式** 可阻断所有外部 API 调用。开启后：

- 只能选择 **Ollama**（本地）作为 AI 服务商
- 知识图谱功能仅在 Ollama 活跃时才可运行
- 不发送任何遥测或远程请求

## 构建与打包

生产构建使用 [Electron Forge](https://www.electronforge.io/)，包含两个构建配置：轻量的 `dev` 配置用于本地开发迭代，完整的 `prod` 配置用于分发。活跃配置按 `APP_PROFILE` > `npm_lifecycle_event` > `NODE_ENV` 优先级自动选择。详见 [`build-config/profiles.ts`](build-config/profiles.ts)。

| 命令                   | 配置     | 输出目录          | 说明                                          |
| ---------------------- | -------- | ----------------- | --------------------------------------------- |
| `npm run dev`          | `dev`    | —                 | 热重载开发服务器                               |
| `npm run package`      | `prod`   | `out/dist`        | 打包应用（不含安装器）                          |
| `npm run make`         | `prod`   | `out/dist/make`   | 生成平台安装器（DMG / Squirrel / Deb / ZIP）    |
| `./scripts/build.sh`   | `prod`   | `out/dist`        | 封装脚本，含预检查                              |

### `scripts/build.sh`

封装脚本，依次执行：Node 版本检查 → `npm ci` → `tsc --noEmit` → `electron-forge make`（或 `package`）。

```bash
./scripts/build.sh                     # 当前平台安装器
./scripts/build.sh --package           # 仅打包，不生成安装器
./scripts/build.sh --platform darwin   # macOS
./scripts/build.sh --platform win32    # Windows
./scripts/build.sh --platform linux    # Linux
./scripts/build.sh --profile dev       # 强制使用 dev 配置
./scripts/build.sh --skip-typecheck    # 跳过类型检查，加速构建
./scripts/build.sh --skip-install      # 跳过 npm install
```

**支持的分发格式：**

- **macOS** — `.dmg`、`.zip`
- **Windows** — Squirrel 安装器 (`.exe`)
- **Linux** — `.deb`

## 项目结构

```
PrismMD/
├── electron/                      # Electron 主进程（Node.js）
│   ├── main.ts                    # 应用入口，窗口生命周期
│   ├── preload.ts                 # Context Bridge（类型化 IPC API）
│   ├── ipc/                       # IPC 处理器注册
│   │   ├── agentHandlers.ts       # AI 对话
│   │   ├── fileHandlers.ts        # 文件读写
│   │   ├── insightGraphHandlers.ts # 知识图谱
│   │   ├── settingsHandlers.ts    # 设置读写
│   │   └── ...                    # 标注、主题、插件、MCP 等
│   └── services/                  # 主进程服务
│       ├── aiService.ts           # AI Agent（borderless-agent）
│       ├── memoryService.ts       # 对话记忆
│       ├── insightGraphService.ts # 图谱 RAG（可选）
│       ├── fileWatcher.ts         # chokidar 文件监听
│       ├── settingsStore.ts       # 持久化设置
│       └── ...                    # 摘要、标注、插件、MCP 等
├── src/                           # 渲染进程（React 18 + Tailwind）
│   ├── components/                # UI 组件
│   │   ├── agent/                 # AI 聊天侧边栏
│   │   ├── reader/                # Markdown 渲染器 + 文档阅读
│   │   ├── editor/                # CodeMirror 编辑器
│   │   ├── graph/                 # 知识图谱可视化
│   │   ├── filetree/              # 文件资源管理器
│   │   ├── toc/                   # 目录导航
│   │   ├── annotations/           # 高亮标注
│   │   ├── settings/              # 设置面板
│   │   ├── commandpalette/        # 命令面板
│   │   ├── focusmode/             # 专注模式
│   │   ├── layout/                # AppShell、StatusBar、TitleBar
│   │   └── ui/                    # 通用 UI 组件库
│   ├── store/                     # Zustand 状态管理
│   │   ├── fileStore.ts           # 文件状态
│   │   ├── agentStore.ts          # AI 对话状态
│   │   ├── editorStore.ts         # 编辑器状态
│   │   ├── settingsStore.ts       # 设置状态
│   │   ├── insightGraphStore.ts   # 知识图谱状态
│   │   ├── uiStore.ts             # UI 状态
│   │   └── ...                    # 搜索、标注、批量导入等
│   ├── i18n/                      # 国际化
│   │   └── locales/               # en.json、zh.json
│   ├── hooks/                     # React Hooks
│   ├── lib/                       # 工具函数
│   ├── plugins/                   # 插件系统
│   ├── types/                     # TypeScript 类型定义
│   └── styles/                    # 样式文件
├── build-config/                  # Forge 构建配置（dev / prod）
├── scripts/build.sh               # 生产构建封装脚本
├── app.config.ts                  # 应用标识（名称、Bundle ID、图标）
├── forge.config.ts                # Electron Forge 配置
├── vite.main.config.ts            # Vite 配置 — 主进程
├── vite.preload.config.ts         # Vite 配置 — Preload
├── vite.renderer.config.ts        # Vite 配置 — 渲染进程
└── package.json
```

## 脚本命令

| 命令                | 说明                                     |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | 启动开发模式，支持热重载（等同于 `npm start`）|
| `npm start`         | 同 `npm run dev`                          |
| `npm run package`   | 打包应用（不含安装器）                      |
| `npm run make`      | 生成平台安装器                              |
| `npm run typecheck` | 全项目 TypeScript 类型检查（`tsc --noEmit`） |

## 技术栈

### 核心框架

| 技术 | 说明 |
| --- | --- |
| [Electron 33](https://www.electronjs.org/) | 跨平台桌面应用框架 |
| [Electron Forge](https://www.electronforge.io/) | 构建、打包与发布流水线 |
| [React 18](https://react.dev/) + [Vite 6](https://vitejs.dev/) | 渲染进程 UI 框架 |
| [TypeScript 5.6](https://www.typescriptlang.org/) | 类型安全开发 |
| [Tailwind CSS](https://tailwindcss.com/) | 原子化 CSS 框架 |
| [Zustand](https://github.com/pmndrs/zustand) | 轻量状态管理 |

### Markdown 处理

| 技术 | 说明 |
| --- | --- |
| [unified](https://unifiedjs.com/) / remark / rehype | AST 驱动的 Markdown 处理管线 |
| [KaTeX](https://katex.org/) | LaTeX 数学公式渲染 |
| [Mermaid](https://mermaid.js.org/) | 图表渲染 |
| [highlight.js](https://highlightjs.org/) | 代码语法高亮 |

### AI 与知识图谱

| 技术 | 说明 |
| --- | --- |
| [borderless-agent](https://www.npmjs.com/package/borderless-agent) | Agentic AI 框架 |
| [OpenAI SDK](https://www.npmjs.com/package/openai) / [Anthropic SDK](https://www.npmjs.com/package/@anthropic-ai/sdk) / [Google AI SDK](https://www.npmjs.com/package/@google/generative-ai) | 多服务商 LLM 接入 |
| [@insightgraph/sdk-embedded](https://www.npmjs.com/package/@insightgraph/sdk-embedded) | 嵌入式图谱 RAG |
| [neo4j-driver](https://www.npmjs.com/package/neo4j-driver) | Neo4j Bolt 客户端 |
| [react-force-graph-2d](https://www.npmjs.com/package/react-force-graph-2d) | 力导向图可视化 |
| [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) | MCP 协议实现 |

### 编辑器与数据格式

| 技术 | 说明 |
| --- | --- |
| [CodeMirror 6](https://codemirror.net/) | 代码编辑器 |
| [pdfjs-dist](https://www.npmjs.com/package/pdfjs-dist) | PDF 渲染 |
| [papaparse](https://www.npmjs.com/package/papaparse) | CSV 解析 |
| [xlsx](https://www.npmjs.com/package/xlsx) | Excel 读取 |

### 其他

| 技术 | 说明 |
| --- | --- |
| [i18next](https://www.i18next.com/) + [react-i18next](https://react.i18next.com/) | 国际化 |
| [MiniSearch](https://www.npmjs.com/package/minisearch) | 全文搜索引擎 |
| [chokidar](https://www.npmjs.com/package/chokidar) | 文件系统监听 |
| [electron-store](https://github.com/sindresorhus/electron-store) | 持久化设置 |
| [lucide-react](https://lucide.dev/) | 图标库 |
| [cmdk](https://cmdk.paco.me/) | 命令面板组件 |

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl/Cmd + P` | 打开命令面板 |
| `Ctrl/Cmd + /` | 打开/关闭 AI 侧边栏 |
| `Ctrl/Cmd + ,` | 打开设置 |
| `Ctrl/Cmd + E` | 切换阅读/编辑模式 |
| `Ctrl/Cmd + S` | 保存文件 |
| `Ctrl/Cmd + F` | 文档内搜索 |
| `Ctrl/Cmd + K` | 全文搜索 |

## 参与贡献

欢迎提交 Bug 报告、功能建议和代码贡献。

1. **大于 typo 的改动请先开 Issue** — 避免重复劳动，也方便对齐范围。
2. 从 `main` 分支 **Fork** 并创建描述性分支名（如 `feat/graph-export`、`fix/toc-scroll`）。
3. **完成修改**，保持 diff 集中。提交前运行 `npm run typecheck`。
4. **创建 Pull Request**，描述 *改了什么* 和 *为什么改*。如有对应 Issue 请引用。

### 开发提示

- 使用 `npm run dev` 并保持运行——Vite 热重载渲染进程，Electron 在主进程变更时自动重启。
- Preload 是主进程与渲染进程之间的唯一桥梁。添加新 IPC 通道时，需同时修改 [`electron/preload.ts`](electron/preload.ts) 和 [`electron/ipc/`](electron/ipc) 下的处理器。
- 渲染进程状态请放在 [`src/store/`](src/store) 下的 Zustand Store 中，参考已有 Store 的约定（加载/保存持久化、事件订阅等）。
- 添加用户可见字符串时，**必须同时**更新 [`src/i18n/locales/en.json`](src/i18n/locales/en.json) 和 [`src/i18n/locales/zh.json`](src/i18n/locales/zh.json)。
- Commit message 遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范（`feat:`、`fix:`、`build:`、`docs:`、`refactor:`、`chore:`）。

### 代码风格

- TypeScript 严格模式——优先使用显式类型而非 `any`。
- 函数式 React 组件 + Hooks，不使用 Class 组件。
- 使用 Tailwind 原子类样式；使用 CSS 变量（如 `var(--accent-color)`）实现主题感知颜色，确保暗色模式和自定义主题正常工作。

## 安全

**请勿以公开 Issue 方式报告安全漏洞。** 请邮件联系维护者或使用 GitHub 的[私有安全公告](https://github.com/LHKong7/PrismMD/security/advisories/new)。我们会在合理时间内确认并协调修复。

PrismMD 通过 `electron-store` 将所有 AI API Key 和 Neo4j 密码存储在本地——除了你配置的服务商端点，不会传输任何数据。隐私模式甚至会阻断这些请求。

## 致谢

PrismMD 站在众多开源项目的肩膀上，以下是其中一些：

- [Electron](https://www.electronjs.org/) 和 [Electron Forge](https://www.electronforge.io/)
- [Vite](https://vitejs.dev/) 和 [React](https://react.dev/)
- [unified](https://unifiedjs.com/)、[remark](https://github.com/remarkjs/remark)、[rehype](https://github.com/rehypejs/rehype)
- [KaTeX](https://katex.org/) 和 [Mermaid](https://mermaid.js.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Zustand](https://github.com/pmndrs/zustand)
- [CodeMirror](https://codemirror.net/)
- [lucide-react](https://lucide.dev/)
- [cmdk](https://cmdk.paco.me/)
- [Ollama](https://ollama.com/)
- [Neo4j](https://neo4j.com/) 和 [neo4j-driver](https://www.npmjs.com/package/neo4j-driver)
- [borderless-agent](https://www.npmjs.com/package/borderless-agent)
- [@insightgraph/sdk-embedded](https://www.npmjs.com/package/@insightgraph/sdk-embedded)

感谢所有开发和维护这些库的贡献者。

## 许可证

PrismMD 基于 [MIT License](LICENSE) 发布。Copyright © 2026 LHKong7.
