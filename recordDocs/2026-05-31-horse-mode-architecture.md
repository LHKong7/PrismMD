# Horse Mode 实现解析

## 概述

Horse Mode 是 PrismMD 中的**自主写作 Agent**。用户提供一个写作任务描述，Horse Mode 自动生成完整的 Markdown 文档，并可通过多轮迭代（最多 5 轮）自我精炼，最终将结果写入文件并在阅读器中打开。

其核心理念是：**先快速出初稿，再逐轮打磨**——模拟人类"一气呵成 → 反复修改"的写作流程。

---

## 架构总览

```
┌─────────────────────────────────────────────────────────┐
│                    Renderer Process                      │
│                                                         │
│  HorseModeDialog.tsx ──▶ horseModeStore.ts              │
│    (用户输入 UI)          (状态机 + 编排逻辑)              │
│         │                     │                         │
│         │                     ├── promptConfigStore.ts   │
│         │                     │   (可定制的 system prompt) │
│         │                     │                         │
│         │                     ├── agentLogStore.ts       │
│         │                     │   (实时日志面板)           │
│         │                     │                         │
│         │                     └── electronAPI (IPC)      │
│         │                           │                   │
└─────────│───────────────────────────│───────────────────┘
          │                           │
          │                    IPC Bridge (preload.ts)
          │                           │
┌─────────│───────────────────────────│───────────────────┐
│         │              Main Process │                   │
│         │                           ▼                   │
│         │                    aiService.ts               │
│         │                    sendOneShot()               │
│         │                      │                        │
│         │              ┌───────┴───────┐                │
│         │              │               │                │
│         │        chatAnthropic()  chatOpenAI()           │
│         │              │               │                │
│         │              └───────┬───────┘                │
│         │                      │                        │
│         │               MCP Tool Loop                   │
│         │              (最多 8 轮工具调用)                 │
│         │                                               │
└─────────────────────────────────────────────────────────┘
```

---

## 一、用户界面层：HorseModeDialog

**文件**: `src/components/horsemode/HorseModeDialog.tsx`

HorseModeDialog 是一个 Portal 弹窗，负责采集用户的写作意图。它提供五个配置维度：

### 1. 文档上下文开关

```tsx
const hasDocument = !!currentFilePath
const documentContent = editing ? editorContent : currentContent
```

如果用户当前正在阅读或编辑一篇文档，可以勾选「使用当前文档作为参考」。这决定了后续使用哪个 system prompt：
- **无上下文** → `horse-mode` prompt（从零创作）
- **有上下文** → `horse-mode-with-context` prompt（基于文档改写/延伸）

### 2. 任务描述

自由文本输入，支持 `Cmd/Ctrl + Enter` 快捷提交。

### 3. 目标目录

默认取第一个已打开的文件夹，也支持手动选择。

### 4. 文件名

根据任务描述自动生成 slug（如"写一篇关于 React 的教程" → `写一篇关于-react-的教程.md`），也可手动修改。一旦手动编辑过，自动生成停止。

### 5. 迭代次数

滑块控制 1–5 轮。1 轮 = 只出初稿；多轮 = 初稿 + N-1 次精炼。

---

## 二、编排引擎：horseModeStore

**文件**: `src/store/horseModeStore.ts`

这是 Horse Mode 的核心——一个 Zustand store 封装的**有限状态机 + 异步编排器**。

### 状态机

```
idle ──▶ generating ──▶ writing ──▶ generating ──▶ writing ──▶ completed
  │         │               │                                      │
  │         └───────────────┴──────── failed ◀─────────────────────┘
  │                                     │
  └──────────────── idle ◀──────────────┘
```

阶段定义：
- `idle`: 无活动任务
- `generating`: AI 正在生成/精炼内容
- `writing`: 正在将结果写入磁盘
- `completed`: 全部迭代完成
- `failed`: 任一步骤出错

### 核心流程：`start()`

```typescript
start: async (task, targetDir, fileName, iterations = 1, documentContent?) => { ... }
```

#### 第一轮：初始生成

1. **构建 system prompt**：根据是否有文档上下文，从 `promptConfigStore` 获取对应的 prompt 模板。

2. **构建 user prompt**：
   - 无上下文：直接使用任务描述
   - 有上下文：将文档内容（截断到 12,000 字符）和任务描述拼接

   ```typescript
   const prompt = hasDocContext
     ? `## Reference Document\n\n${documentContent.slice(0, 12000)}\n\n---\n\n## Task\n\n${task}`
     : task
   ```

3. **调用 AI**: 通过 `window.electronAPI.sendAgentOneShot()` 发送，这是一个**同步等待**的 one-shot 调用（非流式）。

4. **写入文件**: 将 AI 返回的文本写入目标路径。

#### 第 2–N 轮：精炼循环

每一轮精炼都遵循相同模式：

1. **重新读取文件**（获取最新版本的草稿）
2. **使用精炼专用 prompt**，将原始任务 + 当前草稿 + 迭代信息组合

   ```typescript
   const REFINE_SYSTEM_PROMPT = `You are a talented editor and rewriter...
   Rules:
   - Fix any weak openings, vague statements, or repetitive patterns.
   - Improve flow, transitions, and rhythm.
   - Strengthen the conclusion.
   - Keep the same language, format (markdown), and overall structure...
   - Output ONLY the improved document...`
   ```

3. **User prompt 包含完整上下文**：

   ```
   ## Original Task
   {用户的原始任务}
   ---
   ## Current Draft (Iteration {i-1} of {N})
   {上一轮的完整草稿，截断到 12,000 字符}
   ---
   This is refinement iteration {i} of {N}. Improve the draft above.
   ```

4. **写回文件**——覆盖上一轮内容。

#### 完成阶段

所有迭代结束后：
1. 重新读取最终文件内容
2. 在 PrismMD 中打开该文件（`useFileStore.openFile`）
3. 强制刷新 tab 内容（防止显示缓存的旧版本）
4. 弹出成功 Toast 通知
5. 5 秒后自动重置状态为 `idle`

### 取消机制

```typescript
cancel: () => {
  set({ cancelled: true })
  // 不立即重置——让循环检查 cancelled 标志后优雅退出
  setTimeout(() => {
    if (get().cancelled) {
      set({ active: false, stage: 'idle', cancelled: false })
    }
  }, 1000)
}
```

取消是**优雅的**：设置标志 → 当前轮次完成后检查 → 保留已有的草稿文件。不会中途中断 API 调用（one-shot 没有 AbortController）。

### 日志

每个关键节点都通过 `hlog()` 写入 `agentLogStore`，用户可在状态栏的 Agent Log 面板中实时查看进度。

---

## 三、Prompt 系统：promptConfigStore

**文件**: `src/store/promptConfigStore.ts`

Horse Mode 使用三个 prompt 模板：

### horse-mode（从零创作）

```
You are a talented, creative writer — not an explainer.
You write with voice, rhythm, and personality...

Your craft:
- Open with a hook — a bold claim, a vivid scene...
- Vary sentence length. Short punchy sentences for impact...
- Show, don't tell. Use concrete examples, analogies...
- Write with a clear point of view. Take a stance...
- Use transitions that feel natural, not mechanical.
- End strong — with a memorable line, a call to action...

Format as markdown. Write in the same language as the user's request.
Output ONLY the document.
```

### horse-mode-with-context（基于文档创作）

```
You are a talented, creative writer.
You have been given a reference document to work from.
Transform it — don't just reorganize it.

Format as markdown. Write in the same language as the user's request.
Output ONLY the document.
```

### REFINE_SYSTEM_PROMPT（精炼专用，硬编码）

```
You are a talented editor and rewriter...
Rules:
- Fix any weak openings, vague statements, or repetitive patterns.
- Improve flow, transitions, and rhythm.
- Strengthen the conclusion.
- Keep the same language, format (markdown), and overall structure...
- Output ONLY the improved document...
```

前两个模板**可由用户自定义**（Settings → Prompts），精炼 prompt 目前硬编码在 store 中。

---

## 四、AI 调用层：aiService.sendOneShot()

**文件**: `electron/services/aiService.ts`

Horse Mode 的所有 AI 交互都走 `sendOneShot()` 路径：

```
sendOneShot(request)
  ├── 读取当前激活的 AI Provider（Anthropic / OpenAI / Ollama / Google / Custom）
  ├── 构建 system prompt（拼接用户 systemPrompt + 可选的 JSON schema 约束）
  ├── 发现并附加 MCP 工具（如果启用）
  ├── 调用对应 SDK：
  │     ├── chatAnthropic() — Anthropic Messages API
  │     └── chatOpenAI()    — OpenAI Chat Completions API
  ├── 工具调用循环（最多 8 轮）
  │     ├── AI 返回 tool_use → 执行 MCP 工具 → 将结果推回消息历史 → 再次调用
  │     └── AI 返回纯文本 → 退出循环
  └── 返回 { provider, model, reply }
```

关键特性：
- **非流式**：整个响应一次返回，不像 `sendMessage` 那样逐 chunk 推送
- **支持 MCP 工具**：Horse Mode 可以调用外部工具获取信息
- **多 Provider 透明切换**：用户在 Settings 中切换 Provider，Horse Mode 自动适配

---

## 五、数据流时序图

```
用户点击 Start
    │
    ▼
HorseModeDialog.handleStart()
    │  task, targetDir, fileName, iterations, docContent
    ▼
horseModeStore.start()
    │
    ├── set({ stage: 'generating', currentIteration: 1 })
    │
    ├── promptConfigStore.getPrompt('horse-mode')  ──▶ systemPrompt
    │
    ├── electronAPI.sendAgentOneShot({ systemPrompt, prompt })
    │       │
    │       │  IPC: 'agent:one-shot'
    │       ▼
    │   agentHandlers.ts
    │       │
    │       ▼
    │   aiService.sendOneShot()
    │       │
    │       ├── discoverMcpTools()
    │       ├── chatAnthropic() / chatOpenAI()
    │       │       │
    │       │       ├── tool_use? ──▶ callMcpTool() ──▶ loop
    │       │       └── text reply ──▶ return
    │       │
    │       └── return { provider, model, reply }
    │
    ├── set({ stage: 'writing' })
    ├── electronAPI.writeFile(filePath, content)
    │
    ├── [iterations > 1? ── 精炼循环]
    │   │
    │   ├── electronAPI.readFile(filePath)  ──▶ previousDraft
    │   ├── sendAgentOneShot({ REFINE_SYSTEM_PROMPT, refinement prompt })
    │   └── electronAPI.writeFile(filePath, refinedContent)
    │
    ├── set({ stage: 'completed' })
    ├── fileStore.openFile(filePath)
    └── toastStore.show('success', ...)
```

---

## 六、设计决策与权衡

| 决策 | 原因 |
|------|------|
| **One-shot 而非 Streaming** | Horse Mode 生成完整文档后才写入文件；流式输出在这里无意义（用户不需要逐字看生成过程） |
| **每轮重新读取文件** | 确保精炼基于磁盘上的最新内容，而非内存中可能过时的副本 |
| **文档上下文截断到 12K 字符** | 平衡上下文完整性与 token 消耗；多数文档的核心内容在 12K 字符内 |
| **精炼 prompt 硬编码** | 精炼指令相对稳定，不需要用户频繁调整；未来可考虑开放 |
| **优雅取消** | 不中断正在进行的 API 调用——避免浪费已消耗的 token，且保留已有的部分成果 |
| **5 轮上限** | 实测超过 5 轮精炼收益递减，且 token 成本线性增长 |
| **Portal 弹窗** | Horse Mode 是独立于主编辑流的操作，弹窗形式明确了"这是一个独立任务"的心智模型 |

---

## 七、可观测性

- **Agent Log 面板**：实时显示每轮的状态、字数、Provider/Model 信息
- **Developer Trace 面板**（仅开发环境）：可查看每次 `sendOneShot` 的完整 system prompt、user prompt、AI 响应原文、耗时
- **Toast 通知**：成功/失败时弹出简短提示
