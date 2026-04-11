# PrismMD

A beautiful, cross-platform Markdown reader with built-in AI assistance. Read, explore, and understand your documents with an intelligent agent powered by [borderless-agent](https://www.npmjs.com/package/borderless-agent).

## Features

- **Markdown Rendering** — Full GFM support with syntax highlighting, KaTeX math, and Mermaid diagrams
- **AI Reading Assistant** — Chat with your documents using OpenAI, Anthropic, Google, or local Ollama models
- **RAG (Retrieval-Augmented Generation)** — Indexes your workspace so the AI can reference related documents
- **Conversation Memory** — The agent remembers past conversations per document for richer context
- **Privacy Mode** — Enforce local-only models (Ollama) so nothing leaves your machine
- **Knowledge Graph** — Visualize relationships between documents in your workspace
- **Ghost Text** — Real-time collaborative editing suggestions
- **Focus Mode** — Distraction-free reading experience
- **Command Palette** — Quick access to actions and files
- **Annotations** — Highlight and annotate passages directly in your documents
- **Table of Contents** — Auto-generated from document headings
- **File Tree** — Workspace explorer with file watching
- **Multi-Theme** — Light, dark, and system-based theme switching with vibrancy support
- **i18n** — English and Simplified Chinese

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [npm](https://www.npmjs.com/) >= 9
- (Optional) [Ollama](https://ollama.com/) for local LLM inference

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/LHKong7/PrismMD.git
cd PrismMD
```

### 2. Install dependencies

```bash
npm install
```

### 3. Run in development mode

```bash
npm run dev
```

This starts both the Vite dev server and the Electron app with hot reload.

### 4. Build for production

```bash
npm run build
```

This compiles TypeScript, bundles the renderer with Vite, and packages the Electron app via electron-builder. Output is written to the `release/` directory.

Supported targets:
- **macOS** — DMG, ZIP
- **Windows** — NSIS installer
- **Linux** — AppImage, DEB

## Project Structure

```
PrismMD/
├── electron/               # Electron main process
│   ├── main.ts             # App entry, window creation
│   ├── preload.ts          # Context bridge (IPC API)
│   ├── ipc/                # IPC handler registration
│   └── services/           # Backend services
│       ├── aiService.ts    # AI agent (borderless-agent)
│       ├── ragService.ts   # Workspace indexing & retrieval
│       ├── memoryService.ts# Conversation memory
│       └── settingsStore.ts# Persistent settings
├── src/                    # Renderer (React + Tailwind)
│   ├── components/         # UI components
│   │   ├── agent/          # AI chat sidebar
│   │   ├── reader/         # Markdown renderer
│   │   ├── filetree/       # File explorer
│   │   ├── knowledgegraph/ # Document relationship graph
│   │   ├── settings/       # Settings panel
│   │   └── ...
│   ├── store/              # Zustand state management
│   ├── i18n/               # Internationalization
│   └── lib/                # Shared utilities
├── vite.config.ts
├── electron-builder.yml
└── package.json
```

## Configuring AI Providers

Open **Settings > AI** in the app to configure one or more providers:

| Provider | What you need |
|----------|---------------|
| **OpenAI** | API key from [platform.openai.com](https://platform.openai.com/) |
| **Anthropic** | API key from [console.anthropic.com](https://console.anthropic.com/) |
| **Google** | API key from [aistudio.google.com](https://aistudio.google.com/) |
| **Ollama** | Local install — no API key required |

Select your active provider and model, then open the AI sidebar to start chatting with your documents.

### Privacy Mode

Enable **Privacy Mode** in Settings to restrict all AI traffic to local models only. When active, only the Ollama provider is available.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with Electron |
| `npm run build` | Production build and package |
| `npm run preview` | Preview the Vite build |
| `npm run typecheck` | Run TypeScript type checking |

## Tech Stack

- **Electron** — Cross-platform desktop shell
- **React 18** — UI framework
- **Vite** — Build tool and dev server
- **Tailwind CSS** — Utility-first styling
- **Zustand** — State management
- **unified / remark / rehype** — Markdown processing pipeline
- **borderless-agent** — Agentic AI framework for the reading assistant
- **i18next** — Internationalization

## License

MIT
