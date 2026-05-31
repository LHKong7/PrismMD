/**
 * AI Service — powered by the borderless-agent library.
 *
 * Uses AgentBuilder / AgentInstance from the local agent module (electron/agent)
 * for unified multi-provider support, context management (token budgeting,
 * history selection), tool execution with observation folding, and retry
 * with exponential backoff.
 *
 * Exports the same four functions the IPC handlers expect:
 *   sendMessage()    — streaming chat
 *   sendOneShot()    — non-streaming single-turn
 *   testConnection() — quick connectivity test
 *   stopGeneration() — abort in-flight stream
 */
import { app, BrowserWindow } from 'electron'
import { AgentBuilder } from '../agent'
import type { AgentInstance, ToolDefinition, StreamChunk } from '../agent'
import type { ProviderName } from '../agent/providers/base'
import { getActiveProvider, loadSettings } from './settingsStore'
import { callTool as callMcpTool, discoverAll as discoverAllMcpTools } from './mcpService'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface SendMessageRequest {
  messages: ChatMessage[]
  documentContext?: string
  memoryContext?: string
  graphContext?: string
}

interface McpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute: (args: Record<string, unknown>) => Promise<unknown>
}

// ─── Trace ─────────────────────────────────────────────────────────────────

type TraceType = 'request' | 'system-prompt' | 'messages' | 'tools' | 'response' | 'tool-call' | 'error'

let traceWindow: BrowserWindow | null = null

export function setTraceWindow(win: BrowserWindow) {
  traceWindow = win
}

function traceEvent(type: TraceType, label: string, data: unknown, durationMs?: number) {
  if (app.isPackaged) return
  if (!traceWindow || traceWindow.isDestroyed()) return
  traceWindow.webContents.send('agent:trace', {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    type,
    label,
    data,
    durationMs,
  })
}

// ─── Abort ──────────────────────────────────────────────────────────────────

let currentAbortController: AbortController | null = null

export function stopGeneration() {
  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }
}

// ─── MCP Tool Discovery ────────────────────────────────────────────────────

async function discoverMcpTools(): Promise<{ tools: McpTool[]; warning?: string }> {
  const settings = loadSettings()
  if (!settings.mcp.enabled) return { tools: [] }

  let discovered: Awaited<ReturnType<typeof discoverAllMcpTools>> = []
  try {
    discovered = await discoverAllMcpTools()
  } catch (err) {
    return {
      tools: [],
      warning: `MCP tool discovery failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  if (discovered.length === 0) return { tools: [] }

  const tools: McpTool[] = discovered.map(({ serverId, tool, qualifiedName }) => ({
    name: qualifiedName,
    description: tool.description ?? `MCP tool from server "${serverId}"`,
    inputSchema: (tool.inputSchema ?? { type: 'object', properties: {} }) as Record<string, unknown>,
    execute: async (args: Record<string, unknown>) => callMcpTool(serverId, tool.name, args ?? {}),
  }))

  return { tools }
}

// ─── Provider Mapping ──────────────────────────────────────────────────────

function mapProvider(active: {
  provider: string
  model: string
  apiKey: string
  baseUrl?: string
}): { providerName: ProviderName; config: { apiKey: string; model: string; baseUrl?: string } } {
  switch (active.provider) {
    case 'anthropic':
      return { providerName: 'anthropic', config: { apiKey: active.apiKey, model: active.model } }
    case 'google':
      return { providerName: 'google', config: { apiKey: active.apiKey, model: active.model } }
    case 'ollama':
      return {
        providerName: 'openai',
        config: {
          apiKey: 'ollama',
          model: active.model,
          baseUrl: `${active.baseUrl ?? 'http://localhost:11434'}/v1`,
        },
      }
    case 'custom':
      return {
        providerName: 'openai',
        config: { apiKey: active.apiKey, model: active.model, baseUrl: active.baseUrl },
      }
    case 'openai':
    default:
      return {
        providerName: 'openai',
        config: { apiKey: active.apiKey, model: active.model, baseUrl: active.baseUrl },
      }
  }
}

// ─── MCP → ToolDefinition Conversion ───────────────────────────────────────

function mcpToolsToToolDefs(mcpTools: McpTool[]): ToolDefinition[] {
  return mcpTools.map((t) => {
    const schema = t.inputSchema as { properties?: Record<string, any>; required?: string[] }
    return {
      name: t.name,
      description: t.description,
      parameters: schema.properties ?? {},
      required: schema.required ?? [],
      execute: async (args: Record<string, any>) => {
        const result = await t.execute(args)
        return typeof result === 'string' ? result : JSON.stringify(result)
      },
    }
  })
}

// ─── Agent Builder ─────────────────────────────────────────────────────────

function buildAgent(
  active: { provider: string; model: string; apiKey: string; baseUrl?: string },
  systemPrompt: string,
  options?: {
    mcpTools?: McpTool[]
    maxToolRounds?: number
  },
): AgentInstance {
  const { providerName, config } = mapProvider(active)
  const builder = new AgentBuilder()
    .setProvider(providerName, config)
    .setSystemPrompt(systemPrompt)
    .setIncludeBuiltinTools(false)
    .enableContext(true)
    .enableMemory(false)
    .setMaxToolRounds(options?.maxToolRounds ?? 8)

  if (options?.mcpTools?.length) {
    builder.addTools(mcpToolsToToolDefs(options.mcpTools))
  }

  return builder.build()
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function sendMessage(
  mainWindow: BrowserWindow,
  request: SendMessageRequest,
): Promise<{ provider: string; model: string }> {
  const settings = loadSettings()
  const active = getActiveProvider()
  if (!active) throw new Error('No AI provider configured. Please set up an API key in Settings.')
  if (settings.privacyMode && active.provider !== 'ollama') {
    throw new Error('Privacy Mode is enabled. Only local models (Ollama) are allowed.')
  }

  const { provider, model } = active

  // Build system prompt with structured context sections
  const systemParts: string[] = [
    'You are an intelligent reading assistant for PrismMD, a Markdown reader.',
    'You answer questions about the document the user is reading, using the context provided below.',
  ]
  if (request.memoryContext) systemParts.push(`\n## Previous Knowledge\n${request.memoryContext}`)
  if (request.documentContext) systemParts.push(`\n## Current Document\n${request.documentContext}`)
  if (request.graphContext) {
    systemParts.push(`\n## Knowledge Graph Insights\n${request.graphContext}`)
    systemParts.push(
      '\nWhenever you use information from the Knowledge Graph Insights section, ' +
      'cite it inline with the matching bracketed number(s), e.g. ' +
      '"revenue grew 30% year over year [2]". Cite each claim at most once, ' +
      'right after the sentence it supports, and never invent citation numbers ' +
      'that were not listed in the Evidence block.',
    )
  }

  // MCP tool hint (streaming path does not pass tools to the agent, only hints)
  const { tools: mcpTools, warning: mcpWarning } = await discoverMcpTools()
  if (mcpTools.length > 0) {
    systemParts.push(
      `\nYou have access to ${mcpTools.length} MCP tool(s). Call them when ` +
      "the user asks for information you don't already have in the provided context.",
    )
  }
  if (mcpWarning) mainWindow.webContents.send('agent:mcp-warning', mcpWarning)

  systemParts.push('\nAnswer the user\'s questions based on the context above. Be concise and precise.')
  const systemPrompt = systemParts.join('\n')

  // ── Trace: request start ──
  traceEvent('request', `Stream → ${provider}/${model}`, {
    provider, model, baseUrl: active.baseUrl, type: 'stream',
  })
  traceEvent('system-prompt', 'System prompt', { text: systemPrompt })

  if (mcpTools.length > 0) {
    traceEvent('tools', `${mcpTools.length} MCP tool(s) attached`, {
      tools: mcpTools.map((t) => t.name),
      count: mcpTools.length,
    })
  }

  const history = request.messages.slice(0, -1)
  const lastMessage = request.messages[request.messages.length - 1]
  if (!lastMessage) throw new Error('No messages provided.')

  traceEvent('messages', `${history.length + 1} message(s) sent`, {
    messages: [...history, lastMessage].map((m) => ({
      role: m.role,
      content: m.content,
    })),
  })

  // Build the agent — context management handles token budgeting and history trimming
  const agent = buildAgent(active, systemPrompt)

  currentAbortController = new AbortController()
  const signal = currentAbortController.signal
  const startMs = Date.now()

  try {
    let fullReply = ''
    const agentHistory = history.filter((m) => m.role !== 'system').map((m) => ({
      role: m.role,
      content: m.content,
    }))

    // Agent's stream() uses its internal context management:
    // - selectHistory() trims history based on token budget
    // - Token budgeting ensures system prompt + history + output fit in window
    const stream = agent.stream(lastMessage.content, agentHistory)

    for await (const chunk of stream) {
      if (signal.aborted) break
      if (chunk.delta) {
        fullReply += chunk.delta
        mainWindow.webContents.send('agent:stream-chunk', chunk.delta)
      }
    }

    traceEvent('response', 'Stream complete', {
      reply: fullReply,
      length: fullReply.length,
    }, Date.now() - startMs)
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      traceEvent('response', 'Stream aborted by user', { aborted: true }, Date.now() - startMs)
    } else {
      const message = err instanceof Error ? err.message : String(err)
      traceEvent('error', 'Stream error', { error: message }, Date.now() - startMs)
      mainWindow.webContents.send('agent:stream-error', message)
    }
  } finally {
    currentAbortController = null
    await agent.close()
  }

  return { provider, model }
}

export async function sendOneShot(request: {
  prompt: string
  systemPrompt?: string
  jsonSchema?: Record<string, unknown>
}): Promise<{ provider: string; model: string; reply: string; json?: unknown }> {
  const settings = loadSettings()
  const active = getActiveProvider()
  if (!active) throw new Error('No AI provider configured. Please set up an API key in Settings.')
  if (settings.privacyMode && active.provider !== 'ollama') {
    throw new Error('Privacy Mode is enabled. Only local models (Ollama) are allowed.')
  }

  const { provider, model } = active

  const systemParts: string[] = []
  if (request.systemPrompt) systemParts.push(request.systemPrompt)
  if (request.jsonSchema) {
    systemParts.push([
      'You MUST respond with a single valid JSON value and nothing else.',
      'Do not wrap the JSON in Markdown code fences. Do not add commentary.',
      'The response must conform to this shape:',
      JSON.stringify(request.jsonSchema, null, 2),
    ].join('\n'))
  }
  const systemPrompt = systemParts.length > 0 ? systemParts.join('\n\n') : 'You are a helpful assistant.'

  // Discover MCP tools for one-shot calls
  const { tools: mcpTools } = await discoverMcpTools()

  // ── Trace: one-shot request ──
  traceEvent('request', `One-shot → ${provider}/${model}`, {
    provider, model, baseUrl: active.baseUrl, type: 'one-shot',
    hasJsonSchema: !!request.jsonSchema,
  })
  if (systemPrompt) {
    traceEvent('system-prompt', 'System prompt (one-shot)', { text: systemPrompt })
  }
  traceEvent('messages', 'Prompt sent', {
    messages: [{
      role: 'user',
      content: request.prompt,
    }],
  })
  if (mcpTools.length > 0) {
    traceEvent('tools', `${mcpTools.length} MCP tool(s) attached`, {
      tools: mcpTools.map((t) => t.name),
      count: mcpTools.length,
    })
  }

  const startMs = Date.now()

  // Build agent WITH tools — agent's internal loop handles multi-round tool calls,
  // observation folding, and retry with exponential backoff
  const agent = buildAgent(active, systemPrompt, { mcpTools, maxToolRounds: 8 })

  let reply: string
  try {
    const result = await agent.chat(request.prompt)
    reply = result.reply

    traceEvent('response', 'One-shot complete', {
      reply,
      length: reply.length,
    }, Date.now() - startMs)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    traceEvent('error', 'One-shot error', { error: message }, Date.now() - startMs)
    throw err
  } finally {
    await agent.close()
  }

  let json: unknown | undefined
  if (request.jsonSchema) {
    const stripped = reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
    try {
      json = JSON.parse(stripped)
    } catch (err) {
      throw new Error(
        `Expected JSON reply but failed to parse: ${
          err instanceof Error ? err.message : String(err)
        }. Raw reply: ${reply.slice(0, 200)}`,
      )
    }
  }

  return { provider, model, reply, json }
}

export async function runTask(
  mainWindow: BrowserWindow,
  request: {
    task: string
    systemPrompt?: string
    qualityThreshold?: number
    maxIterations?: number
  },
): Promise<{
  provider: string
  model: string
  result: string
  iterations: number
  qualityScore: number
  thresholdMet: boolean
}> {
  const settings = loadSettings()
  const active = getActiveProvider()
  if (!active) throw new Error('No AI provider configured. Please set up an API key in Settings.')
  if (settings.privacyMode && active.provider !== 'ollama') {
    throw new Error('Privacy Mode is enabled. Only local models (Ollama) are allowed.')
  }

  const { provider, model } = active
  const systemPrompt = request.systemPrompt || 'You are a talented, creative writer. Format as markdown.'

  traceEvent('request', `RunTask → ${provider}/${model}`, {
    provider, model, type: 'run-task',
    qualityThreshold: request.qualityThreshold ?? 7,
    maxIterations: request.maxIterations ?? 5,
  })

  const agent = buildAgent(active, systemPrompt)
  const startMs = Date.now()

  try {
    const taskResult = await agent.runTask({
      task: request.task,
      qualityThreshold: request.qualityThreshold ?? 7,
      maxIterations: request.maxIterations ?? 5,
      onProgress: (progress) => {
        // Send progress events to renderer
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('agent:task-progress', {
            iteration: progress.iteration,
            phase: progress.phase,
            qualityScore: progress.qualityScore,
          })
        }
      },
    })

    traceEvent('response', 'RunTask complete', {
      resultLength: taskResult.result.length,
      iterations: taskResult.iterations,
      qualityScore: taskResult.qualityScore,
      thresholdMet: taskResult.thresholdMet,
    }, Date.now() - startMs)

    return {
      provider,
      model,
      result: taskResult.result,
      iterations: taskResult.iterations,
      qualityScore: taskResult.qualityScore,
      thresholdMet: taskResult.thresholdMet,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    traceEvent('error', 'RunTask error', { error: message }, Date.now() - startMs)
    throw err
  } finally {
    await agent.close()
  }
}

export async function testConnection(
  provider: string,
  apiKey: string,
  baseUrl?: string,
  userModel?: string,
): Promise<boolean> {
  try {
    const fallback = provider === 'ollama' ? 'llama3'
      : provider === 'anthropic' ? 'claude-haiku-4-20250414'
      : provider === 'google' ? 'gemini-1.5-flash'
      : 'gpt-4o-mini'
    const model = userModel || fallback

    const agent = buildAgent(
      { provider, model, apiKey, baseUrl },
      'You are a test assistant.',
    )
    try {
      const result = await agent.chat('hi')
      return !!result.reply
    } finally {
      await agent.close()
    }
  } catch {
    return false
  }
}
