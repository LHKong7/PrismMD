<div align="center">
  <img src="prismlogo.png" alt="PrismMD" width="128" />

  <h1>PrismMD</h1>

  <p>
    <strong>A beautiful, AI-native Markdown reader for macOS, Windows, and Linux.</strong>
  </p>

  <p>
    <a href="#license"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
    <a href="#prerequisites"><img alt="Node" src="https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg"></a>
    <img alt="Platforms" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey">
    <img alt="Electron" src="https://img.shields.io/badge/electron-33-47848f">
    <img alt="TypeScript" src="https://img.shields.io/badge/typescript-5.6-3178c6">
    <a href="https://github.com/LHKong7/PrismMD/issues"><img alt="Issues" src="https://img.shields.io/badge/issues-welcome-orange.svg"></a>
  </p>
</div>

---

PrismMD is a cross-platform desktop reader that treats Markdown as a first-class
thinking medium. Render GFM, LaTeX and Mermaid side-by-side with an AI reading
assistant that can chat over the current document, remember past conversations,
and — optionally — pull context from a local knowledge graph built from every
document you save.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
  - [AI Providers](#ai-providers)
  - [Knowledge Graph (optional)](#knowledge-graph-optional)
  - [Privacy Mode](#privacy-mode)
- [Build & Package](#build--package)
- [Project Structure](#project-structure)
- [Scripts](#scripts)
- [Tech Stack](#tech-stack)
- [Contributing](#contributing)
- [Security](#security)
- [Acknowledgements](#acknowledgements)
- [License](#license)

## Features

- **Markdown rendering** — full GitHub-flavored Markdown with syntax highlighting, KaTeX math and Mermaid diagrams
- **AI reading assistant** — chat with your documents using OpenAI, Anthropic, Google AI, local Ollama, or any OpenAI-compatible endpoint
- **Conversation memory** — the assistant remembers past discussions per file for richer follow-up answers
- **Knowledge graph (opt-in)** — save documents as nodes in your own [Neo4j](https://neo4j.com/) instance and ask questions across them via [InsightGraph](https://www.npmjs.com/package/@insightgraph/sdk-embedded) graph-RAG
- **Privacy mode** — one click to block every external API call and force local-only models
- **Annotations** — highlight and note passages directly in the document
- **Table of contents** — auto-extracted from document headings, pinned to the side
- **File tree & file watching** — workspace explorer that hot-reloads on disk changes
- **Command palette** — `Ctrl/Cmd+P` to jump to files, themes, settings and actions
- **Themes & vibrancy** — light/dark plus system appearance, with native macOS vibrancy
- **Focus mode** — distraction-free reading with everything but the page dimmed
- **i18n** — English and Simplified Chinese out of the box

## Prerequisites

- [Node.js](https://nodejs.org/) `>= 18`
- [npm](https://www.npmjs.com/) `>= 9`
- *(optional)* [Ollama](https://ollama.com/) for local LLM inference
- *(optional)* [Neo4j](https://neo4j.com/) `>= 5` reachable over Bolt — only required if you turn on the Knowledge Graph feature

## Quick Start

```bash
# 1. Clone
git clone https://github.com/LHKong7/PrismMD.git
cd PrismMD

# 2. Install
npm install

# 3. Run in development mode (Vite dev server + Electron with hot reload)
npm run dev
```

On first launch, open **Settings** (`Ctrl/Cmd + ,`) to wire up an AI provider.

## Configuration

All configuration happens inside the app — nothing is hard-coded. Settings are
persisted with [`electron-store`](https://github.com/sindresorhus/electron-store)
under your platform's per-user data directory.

### AI Providers

Open **Settings → AI** to enable one or more providers:

| Provider      | Type       | What you need                                                                 |
| ------------- | ---------- | ----------------------------------------------------------------------------- |
| **OpenAI**    | Cloud      | API key — [platform.openai.com](https://platform.openai.com/)                 |
| **Anthropic** | Cloud      | API key — [console.anthropic.com](https://console.anthropic.com/)             |
| **Google AI** | Cloud      | API key — [aistudio.google.com](https://aistudio.google.com/)                 |
| **Ollama**    | Local      | Install Ollama and pull a model. No API key. Default endpoint `localhost:11434` |
| **Custom**    | Any        | Any OpenAI-compatible endpoint (vLLM, LM Studio, self-hosted, …)              |

Pick an active provider and model, hit **Activate**, then open the AI sidebar
(`Ctrl/Cmd + /` or the robot icon) to start chatting about the document you
have open.

### Knowledge Graph (optional)

PrismMD can embed the [InsightGraph](https://www.npmjs.com/package/@insightgraph/sdk-embedded)
pipeline so every document you save becomes a node in a knowledge graph —
useful for cross-document Q&A.

1. Start a Neo4j instance, e.g. via Docker:
   ```bash
   docker run -p 7687:7687 -e NEO4J_AUTH=neo4j/mypassword neo4j:5
   ```
2. In **Settings → Knowledge Graph**, enter the Bolt URI, username and password, then **Test Connection**.
3. Enable the feature. InsightGraph reuses your **active AI provider** for entity extraction — it needs an OpenAI-compatible provider (OpenAI / Ollama / Custom). Anthropic and Google are flagged in the UI as unsupported.
4. Save a document to the graph via the command palette (`Save Document to Knowledge Graph`) or by right-clicking a `.md` file in the explorer.
5. Chat as usual — the assistant will transparently pull answers from the graph alongside the current document.

### Privacy Mode

Flip **Settings → Privacy → Privacy Mode** to block every external API call.
When active:

- Only **Ollama** (local) can be selected as an AI provider.
- The Knowledge Graph feature refuses to run unless Ollama is active.
- No telemetry or remote calls are made.

## Build & Package

Production builds use [Electron Forge](https://www.electronforge.io/) with two
build profiles — a lightweight `dev` profile for local iteration and a full
`prod` profile for distribution. The active profile is chosen automatically
from `APP_PROFILE` > `npm_lifecycle_event` > `NODE_ENV`. See
[`build-config/profiles.ts`](build-config/profiles.ts).

| Command              | Profile  | Output             | Notes                                     |
| -------------------- | -------- | ------------------ | ----------------------------------------- |
| `npm run dev`        | `dev`    | —                  | Hot-reload dev server                     |
| `npm run package`    | `prod`   | `out/dist`         | Packaged app, no installer                |
| `npm run make`       | `prod`   | `out/dist/make`    | Platform installers (DMG / Squirrel / Deb / ZIP) |
| `./scripts/build.sh` | `prod`   | `out/dist`         | Wrapper script with preflight checks      |

### `scripts/build.sh`

Wrapper that runs: Node version check → `npm ci` → `tsc --noEmit` →
`electron-forge make` (or `package`).

```bash
./scripts/build.sh                     # Installer for current platform
./scripts/build.sh --package           # Package without installer
./scripts/build.sh --platform darwin   # macOS
./scripts/build.sh --platform win32    # Windows
./scripts/build.sh --platform linux    # Linux
./scripts/build.sh --profile dev       # Force the dev profile
./scripts/build.sh --skip-typecheck    # Faster iteration
./scripts/build.sh --skip-install      # Faster iteration
```

Supported targets out of the box:

- **macOS** — `.dmg`, `.zip`
- **Windows** — Squirrel installer (`.exe`)
- **Linux** — `.deb`

## Project Structure

```
PrismMD/
├── electron/                      # Electron main process (Node)
│   ├── main.ts                    # App entry, window lifecycle
│   ├── preload.ts                 # Context bridge (typed IPC API)
│   ├── ipc/                       # IPC handler registration
│   └── services/                  # Main-process services
│       ├── aiService.ts           # AI agent (borderless-agent)
│       ├── memoryService.ts       # Conversation memory
│       ├── insightGraphService.ts # Graph-RAG (optional)
│       ├── fileWatcher.ts         # chokidar-based file watching
│       └── settingsStore.ts       # Persistent settings
├── src/                           # Renderer (React 18 + Tailwind)
│   ├── components/                # UI
│   │   ├── agent/                 # AI chat sidebar
│   │   ├── reader/                # Markdown renderer + pipeline
│   │   ├── filetree/              # Explorer with context menu
│   │   ├── settings/              # Settings panel (AI, Graph, Privacy)
│   │   └── layout/                # AppShell, StatusBar, TitleBar
│   ├── store/                     # Zustand stores
│   ├── i18n/                      # en.json, zh.json
│   └── lib/                       # Shared utilities
├── build-config/                  # Forge build profiles (dev / prod)
├── scripts/build.sh               # Production build wrapper
├── app.config.ts                  # App identity (name, bundle id, icon)
├── forge.config.ts                # Electron Forge config
├── vite.main.config.ts            # Vite config — main process
├── vite.preload.config.ts         # Vite config — preload
├── vite.renderer.config.ts        # Vite config — renderer
└── package.json
```

## Scripts

| Command              | Description                                              |
| -------------------- | -------------------------------------------------------- |
| `npm run dev`        | Start the app with hot reload (alias of `npm start`)     |
| `npm start`          | Same as `npm run dev`                                    |
| `npm run package`    | Package the app without creating an installer           |
| `npm run make`       | Build platform installers                                |
| `npm run typecheck`  | Run `tsc --noEmit` across the whole project              |

## Tech Stack

- **[Electron](https://www.electronjs.org/)** — cross-platform desktop shell
- **[Electron Forge](https://www.electronforge.io/)** — build, package and publish pipeline
- **[React 18](https://react.dev/) + [Vite](https://vitejs.dev/)** — renderer
- **[Tailwind CSS](https://tailwindcss.com/)** — styling
- **[Zustand](https://github.com/pmndrs/zustand)** — state management
- **[unified](https://unifiedjs.com/) / remark / rehype** — Markdown processing pipeline
- **[borderless-agent](https://www.npmjs.com/package/borderless-agent)** — agentic AI framework powering the chat
- **[@insightgraph/sdk-embedded](https://www.npmjs.com/package/@insightgraph/sdk-embedded)** — embedded graph-RAG (optional)
- **[neo4j-driver](https://www.npmjs.com/package/neo4j-driver)** — Bolt client for the optional knowledge graph
- **[i18next](https://www.i18next.com/) + [react-i18next](https://react.i18next.com/)** — i18n

## Contributing

Contributions, bug reports and feature ideas are welcome.

1. **Open an issue first** for anything larger than a typo — it helps avoid duplicated work and lets us agree on scope.
2. **Fork** and create a branch from `main` with a descriptive name (e.g. `feat/graph-export`, `fix/toc-scroll`).
3. **Make your change**, keeping the diff focused. Run `npm run typecheck` before submitting.
4. **Open a pull request** describing *what* changed and *why*. Reference the issue it fixes if any.

### Development tips

- Use `npm run dev` and keep it running — Vite hot-reloads the renderer and Electron auto-restarts on main-process changes.
- The preload is the only bridge between main and renderer. If you add a new IPC channel, wire it through both [`electron/preload.ts`](electron/preload.ts) and a handler under [`electron/ipc/`](electron/ipc).
- Renderer state belongs in a Zustand store under [`src/store/`](src/store). Read other stores for existing conventions (load/save persistence, event subscriptions, etc.).
- Add translation keys to **both** [`src/i18n/locales/en.json`](src/i18n/locales/en.json) and [`src/i18n/locales/zh.json`](src/i18n/locales/zh.json) whenever you add user-visible strings.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `build:`, `docs:`, `refactor:`, `chore:`).

### Code style

- TypeScript strict mode — prefer explicit types over `any`.
- Functional React components with hooks; no classes.
- Tailwind utility classes for styling; use CSS variables (`var(--accent-color)` etc.) for theme-aware colors so dark mode and custom themes keep working.

## Security

**Do not open a public issue for security vulnerabilities.** Instead, email
the maintainer or use GitHub's [private security advisories](https://github.com/LHKong7/PrismMD/security/advisories/new).
We'll acknowledge reports within a reasonable timeframe and coordinate a fix.

PrismMD stores every AI API key and the Neo4j password locally via
`electron-store` — nothing is transmitted except to the provider endpoints you
configure. Privacy Mode blocks even those.

## Acknowledgements

PrismMD stands on the shoulders of many open-source projects. A few of the
biggest ones:

- [Electron](https://www.electronjs.org/) and [Electron Forge](https://www.electronforge.io/)
- [Vite](https://vitejs.dev/) and [React](https://react.dev/)
- [unified](https://unifiedjs.com/), [remark](https://github.com/remarkjs/remark), [rehype](https://github.com/rehypejs/rehype)
- [KaTeX](https://katex.org/) and [Mermaid](https://mermaid.js.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Zustand](https://github.com/pmndrs/zustand)
- [lucide-react](https://lucide.dev/)
- [cmdk](https://cmdk.paco.me/)
- [Ollama](https://ollama.com/)
- [Neo4j](https://neo4j.com/) and [neo4j-driver](https://www.npmjs.com/package/neo4j-driver)
- [borderless-agent](https://www.npmjs.com/package/borderless-agent)
- [@insightgraph/sdk-embedded](https://www.npmjs.com/package/@insightgraph/sdk-embedded)

Thank you to everyone who ships and maintains these libraries.

## License

PrismMD is released under the [MIT License](LICENSE). Copyright © 2026 LHKong7.
