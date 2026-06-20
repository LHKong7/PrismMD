/**
 * AI Service — routes agent operations to the worker thread.
 *
 * All LLM calls run in a separate worker_threads Worker for main-thread
 * isolation. This file handles validation, trace events, MCP tool discovery,
 * and IPC forwarding — the heavy computation runs off-thread.
 *
 * Exports the same four functions the IPC handlers expect:
 *   sendMessage()    — streaming chat
 *   sendOneShot()    — non-streaming single-turn
 *   runTask()        — autonomous iteration loop
 *   testConnection() — quick connectivity test
 *   stopGeneration() — abort in-flight stream
 */
import { BrowserWindow } from 'electron'
import { getActiveProvider, loadSettings } from './settingsStore'
import { discoverAll as discoverAllMcpTools } from './mcpService'
import { agentWorker } from './agentWorkerManager'
import { traceEvent } from './agentTrace'

// Re-exported so IPC handlers can keep importing it from aiService.
export { setTraceWindow } from './agentTrace'

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
}

// ─── Abort ──────────────────────────────────────────────────────────────────

export function stopGeneration() {
  agentWorker.abort()
}

// ─── MCP Tool Discovery ────────────────────────────────────────────────────

async function discoverMcpToolDefs(): Promise<{
  toolDefs: Array<{ name: string; description: string; parameters?: Record<string, any>; required?: string[] }>
  warning?: string
}> {
  const settings = loadSettings()
  if (!settings.mcp.enabled) return { toolDefs: [] }

  try {
    const discovered = await discoverAllMcpTools()
    if (discovered.length === 0) return { toolDefs: [] }

    const toolDefs = discovered.map(({ tool, qualifiedName, serverId }) => {
      const schema = (tool.inputSchema ?? { type: 'object', properties: {} }) as Record<string, any>
      return {
        name: qualifiedName,
        description: tool.description ?? `MCP tool from server "${serverId}"`,
        parameters: schema.properties ?? {},
        required: schema.required ?? [],
      }
    })
    return { toolDefs }
  } catch (err) {
    return {
      toolDefs: [],
      warning: `MCP tool discovery failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
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

  // Build system prompt
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

  const { toolDefs, warning: mcpWarning } = await discoverMcpToolDefs()
  if (toolDefs.length > 0) {
    systemParts.push(
      `\nYou have access to ${toolDefs.length} MCP tool(s). Call them when ` +
      "the user asks for information you don't already have in the provided context.",
    )
  }
  if (mcpWarning) mainWindow.webContents.send('agent:mcp-warning', mcpWarning)

  systemParts.push('\nAnswer the user\'s questions based on the context above. Be concise and precise.')
  const systemPrompt = systemParts.join('\n')

  // Trace
  traceEvent('request', `Stream → ${provider}/${model}`, { provider, model, type: 'stream' })
  traceEvent('system-prompt', 'System prompt', { text: systemPrompt })
  if (toolDefs.length > 0) {
    traceEvent('tools', `${toolDefs.length} MCP tool(s) attached`, {
      count: toolDefs.length,
      tools: toolDefs.map((tool) => ({ name: tool.name, description: tool.description })),
    })
  }

  const history = request.messages.slice(0, -1)
  const lastMessage = request.messages[request.messages.length - 1]
  if (!lastMessage) throw new Error('No messages provided.')

  traceEvent('messages', `${history.length + 1} message(s) sent`, {
    messages: [...history, lastMessage].map((m) => ({ role: m.role, content: m.content })),
  })

  const startMs = Date.now()

  try {
    let fullReply = ''
    const agentHistory = history.filter((m) => m.role !== 'system').map((m) => ({
      role: m.role,
      content: m.content,
    }))

    // Stream via worker thread — main thread stays responsive
    await agentWorker.stream(
      { provider: active, systemPrompt, message: lastMessage.content, history: agentHistory },
      (delta) => {
        fullReply += delta
        mainWindow.webContents.send('agent:stream-chunk', delta)
      },
    )

    traceEvent('response', 'Stream complete', { reply: fullReply, length: fullReply.length }, Date.now() - startMs)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    traceEvent('error', 'Stream error', { error: message }, Date.now() - startMs)
    mainWindow.webContents.send('agent:stream-error', message)
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

  // Discover MCP tools — their definitions (no functions) are passed to worker
  const { toolDefs } = await discoverMcpToolDefs()

  traceEvent('request', `One-shot → ${provider}/${model}`, { provider, model, type: 'one-shot', hasJsonSchema: !!request.jsonSchema })
  if (request.systemPrompt || request.jsonSchema) {
    traceEvent('system-prompt', 'System prompt', { text: systemPrompt })
  }
  if (toolDefs.length > 0) {
    traceEvent('tools', `${toolDefs.length} MCP tool(s) attached`, {
      count: toolDefs.length,
      tools: toolDefs.map((tool) => ({ name: tool.name, description: tool.description })),
    })
  }
  traceEvent('messages', 'Prompt sent', { messages: [{ role: 'user', content: request.prompt }] })

  const startMs = Date.now()

  let reply: string
  try {
    const result = await agentWorker.chat({
      provider: active,
      systemPrompt,
      message: request.prompt,
      toolDefs: toolDefs.length > 0 ? toolDefs : undefined,
      maxToolRounds: 8,
    })
    reply = result.reply

    traceEvent('response', 'One-shot complete', { reply, length: reply.length }, Date.now() - startMs)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    traceEvent('error', 'One-shot error', { error: message }, Date.now() - startMs)
    throw err
  }

  let json: unknown | undefined
  if (request.jsonSchema) {
    const stripped = reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
    try {
      json = JSON.parse(stripped)
    } catch (err) {
      throw new Error(
        `Expected JSON reply but failed to parse: ${err instanceof Error ? err.message : String(err)}. Raw reply: ${reply.slice(0, 200)}`,
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

  // Attach MCP tools so the EXECUTE phase of the autonomous loop can actually
  // act (gather information / perform actions via tools), not just generate
  // text. The loop still plans first; tools are used during execution.
  const { toolDefs, warning: mcpWarning } = await discoverMcpToolDefs()
  if (mcpWarning) mainWindow.webContents.send('agent:mcp-warning', mcpWarning)

  traceEvent('request', `RunTask → ${provider}/${model}`, {
    provider, model, type: 'run-task',
    qualityThreshold: request.qualityThreshold ?? 7,
    maxIterations: request.maxIterations ?? 5,
  })
  if (toolDefs.length > 0) {
    traceEvent('tools', `${toolDefs.length} MCP tool(s) attached`, {
      count: toolDefs.length,
      tools: toolDefs.map((tool) => ({ name: tool.name, description: tool.description })),
    })
  }

  const startMs = Date.now()

  try {
    const taskResult = await agentWorker.runTask(
      {
        provider: active,
        systemPrompt,
        task: request.task,
        qualityThreshold: request.qualityThreshold ?? 7,
        maxIterations: request.maxIterations ?? 5,
        toolDefs,
      },
      (progress) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('agent:task-progress', progress)
        }
      },
    )

    traceEvent('response', 'RunTask complete', {
      resultLength: taskResult.result.length,
      iterations: taskResult.iterations,
      qualityScore: taskResult.qualityScore,
      thresholdMet: taskResult.thresholdMet,
    }, Date.now() - startMs)

    return { provider, model, ...taskResult }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    traceEvent('error', 'RunTask error', { error: message }, Date.now() - startMs)
    throw err
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
    return await agentWorker.test({ provider, model, apiKey, baseUrl })
  } catch {
    return false
  }
}
